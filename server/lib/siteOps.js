// «Правки сайта» — изменения в каталоге (товары, поставщики), которые предлагает Claude.
//
// Claude в базу не пишет: он кладёт список изменений в .site-change-ops.json, воркфлоу
// отдаёт его сайту, сайт проверяет (здесь) и показывает карточкой в чате. Применяются
// изменения только после «Утвердить» — через те же маршруты админки, что и ручная
// правка (история товара, новость о новинке, пересчёт комплектов работают как обычно).
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Brand = require('../models/Brand');
const Supplier = require('../models/Supplier');

// Что Claude может задавать товару. Остаток (stock) приходит из 1С, себестоимость видит
// только владелец, комплекты и значок производителя — отдельная логика: их нет в списке.
// Удаление товара — op 'delete', как и всё остальное, только после «Утвердить» владельцем.
const FIELDS = ['name', 'fullName', 'sku', 'brand', 'set', 'category', 'color', 'price', 'priceUndefined',
  'priceWholesale', 'priceDealer', 'description', 'specs', 'dimensions', 'unit', 'images', 'productStatus',
  'isSupplied', 'supplier', 'isOnOrder', 'hideInPdf'];
const LABELS = { name: 'Название', fullName: 'Полное название', sku: 'Артикул', brand: 'Бренд', set: 'Сет',
  category: 'Категория', color: 'Цвет', price: 'Цена', priceUndefined: 'Цена не определена', priceWholesale: 'Оптовая цена',
  priceDealer: 'Дилерская цена', description: 'Описание', specs: 'Характеристики', dimensions: 'Размеры', unit: 'Ед. изм.',
  images: 'Фото', productStatus: 'Статус', isSupplied: 'Привозной', supplier: 'Поставщик', isOnOrder: 'Под заказ', hideInPdf: 'Скрыть в PDF' };
const MAX_OPS = 100;

const pick = obj => Object.fromEntries(Object.entries(obj || {}).filter(([k]) => FIELDS.includes(k)));
const short = v => {
  if (v === undefined || v === null || v === '') return '—';
  if (Array.isArray(v)) return v.length ? (typeof v[0] === 'object' ? v.map(s => s?.key ? `${s.key}: ${s.value}` : JSON.stringify(s)).join('; ') : `${v.length} шт.`) : '—';
  if (typeof v === 'object') return Object.values(v).filter(Boolean).join(', ') || '—';
  if (typeof v === 'boolean') return v ? 'да' : 'нет';
  return String(v).slice(0, 200);
};

// Снимок каталога для Claude: найти товар, не завести дубль, взять правильный сет и категорию
async function catalogSnapshot() {
  const products = await Product.find({}, {
    sku: 1, name: 1, fullName: 1, brand: 1, set: 1, category: 1, color: 1, price: 1, priceWholesale: 1, priceDealer: 1,
    productStatus: 1, isSupplied: 1, 'supplier.company': 1, dimensions: 1, unit: 1, specs: 1, images: { $slice: 1 },
  }).lean();
  const brands = await Brand.find({}, { key: 1, label: 1, 'sets.key': 1, 'sets.label': 1 }).lean();
  const suppliers = await Supplier.find({}, { name: 1 }).lean();
  return { products, brands, suppliers: suppliers.map(s => s.name) };
}

// Новая категория — не ошибка, но владелец должен это увидеть до утверждения
async function categoryWarn(category, brand) {
  if (!category) return undefined;
  const known = await Product.exists({ category, ...(brand ? { brand } : {}) }) || await require('../models/CategorySpec').exists({ category });
  return known ? undefined : `новая категория «${category}» — такой ещё нет`;
}

// Проверить список от Claude. Возвращает карточки для чата: что будет сделано, было → стало, ошибки.
async function validateOps(raw) {
  const list = Array.isArray(raw?.ops) ? raw.ops : Array.isArray(raw) ? raw : [];
  const brands = await Brand.find({}, { key: 1, 'sets.key': 1 }).lean();
  const setOk = (brand, set) => !set || brands.some(b => (!brand || b.key === brand) && (b.sets || []).some(s => s.key === set));
  const out = [];
  for (const op of list.slice(0, MAX_OPS)) {
    const note = String(op?.note || '').slice(0, 300);
    try {
      if (op?.op === 'create') {
        const data = pick(op.product);
        if (!data.name) throw new Error('нет названия');
        data.fullName ||= data.name;
        if (data.brand && !brands.some(b => b.key === data.brand)) throw new Error(`нет бренда ${data.brand}`);
        if (!setOk(data.brand, data.set)) throw new Error(`нет сета ${data.set}`);
        if (data.price === undefined) { data.price = 0; data.priceUndefined = true; }
        // Привозной без isOnOrder каталог прячет как «нет в наличии» (Грабли)
        if (data.isSupplied && data.isOnOrder === undefined) data.isOnOrder = true;
        if (data.sku && await Product.exists({ sku: data.sku })) throw new Error(`артикул ${data.sku} уже есть`);
        const changes = Object.entries(data).map(([k, v]) => ({ field: LABELS[k] || k, to: short(v) }));
        out.push({ op: 'create', data, label: `➕ Новый товар «${data.fullName}»`, changes, note, warn: await categoryWarn(data.category, data.brand) });
      } else if (op?.op === 'update') {
        const target = op.id && mongoose.isValidObjectId(op.id) ? await Product.findById(op.id).lean()
          : op.sku ? await Product.findOne({ sku: op.sku }).lean() : null;
        if (!target) throw new Error(`товар не найден (${op.id || op.sku || '?'})`);
        const data = pick(op.set);
        if (!Object.keys(data).length) throw new Error('нечего менять');
        if (data.set !== undefined && !setOk(data.brand || target.brand, data.set)) throw new Error(`нет сета ${data.set}`);
        const changes = Object.entries(data)
          .filter(([k, v]) => JSON.stringify(target[k] ?? null) !== JSON.stringify(v ?? null))
          .map(([k, v]) => ({ field: LABELS[k] || k, from: short(target[k]), to: short(v) }));
        if (!changes.length) throw new Error('значения уже такие');
        out.push({ op: 'update', warn: data.category !== undefined ? await categoryWarn(data.category, data.brand || target.brand) : undefined, id: String(target._id), data, label: `✏️ ${target.sku ? target.sku + ' · ' : ''}${target.fullName || target.name}`, changes, note });
      } else if (op?.op === 'delete') {
        // Удаление — по _id или артикулу; товар-деталь комплекта не удаляем, иначе комплект сломается
        const target = op.id && mongoose.isValidObjectId(op.id) ? await Product.findById(op.id, { sku: 1, name: 1, fullName: 1, productStatus: 1 }).lean()
          : op.sku ? await Product.findOne({ sku: op.sku }, { sku: 1, name: 1, fullName: 1, productStatus: 1 }).lean() : null;
        if (!target) throw new Error(`товар не найден (${op.id || op.sku || '?'})`);
        const kit = await Product.findOne({ 'kitParts.product': target._id }, { sku: 1, fullName: 1, name: 1 }).lean();
        if (kit) throw new Error(`входит в комплект «${kit.fullName || kit.name}» — сначала убрать из комплекта`);
        if (out.some(o => o.op === 'delete' && o.id === String(target._id))) throw new Error('уже в списке на удаление');
        out.push({ op: 'delete', id: String(target._id), data: { sku: target.sku }, label: `🗑 ${target.sku ? target.sku + ' · ' : ''}${target.fullName || target.name}`, changes: [{ field: 'Товар', to: 'удалить навсегда' }], note });
      } else if (op?.op === 'supplier') {
        const name = String(op.name || '').trim();
        if (!name) throw new Error('нет названия поставщика');
        if (await Supplier.exists({ name })) throw new Error(`поставщик «${name}» уже есть`);
        const data = { name, phone: op.phone || '', instagram: op.instagram || '', notes: op.notes || '' };
        out.push({ op: 'supplier', data, label: `🏭 Новый поставщик «${name}»`, changes: [], note });
      } else {
        throw new Error(`неизвестное действие ${op?.op}`);
      }
    } catch (e) {
      out.push({ op: op?.op || '?', label: `⚠️ ${op?.product?.name || op?.sku || op?.name || 'изменение'}`, error: e.message, changes: [], note });
    }
  }
  return out;
}

// Применить утверждённые изменения от имени утвердившего — через обычные маршруты админки
async function applyOps(ops, user) {
  const token = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const base = `http://127.0.0.1:${process.env.PORT}/api/admin`;
  const call = async (method, path, body) => {
    const r = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || j.message || `ошибка ${r.status}`);
    return j;
  };
  const results = [];
  // Поставщики — первыми: товар привязывается к уже существующему (правило проекта)
  const ordered = [...ops.filter(o => o.op === 'supplier'), ...ops.filter(o => o.op !== 'supplier')];
  for (const o of ordered) {
    if (o.error) continue;
    try {
      if (o.op === 'supplier') await call('POST', '/suppliers', o.data);
      else if (o.op === 'create') {
        const p = await call('POST', '/products', o.data);
        o.id = String(p._id);
        // Привязать к поставщику (у Supplier свой список товаров)
        if (o.data.isSupplied && o.data.supplier?.company) {
          await Supplier.updateOne({ name: o.data.supplier.company }, { $addToSet: { products: p._id } }).catch(() => {});
        }
      } else if (o.op === 'update') await call('PATCH', `/products/${o.id}`, o.data);
      else if (o.op === 'delete') await call('DELETE', `/products/${o.id}`);
      o.applied = true;
      results.push({ label: o.label, ok: true });
    } catch (e) {
      o.applyError = e.message;
      results.push({ label: o.label, ok: false, error: e.message });
    }
  }
  return results;
}

// Ссылка «Посмотреть на сайте» на карточки товаров в их сете (страница подсветит все и пролистает по очереди).
// Товары из разных сетов — ссылка на сет, где их больше
async function productLink(ids) {
  const list = (Array.isArray(ids) ? ids : [ids]).filter(id => id && mongoose.isValidObjectId(id));
  const prods = await Product.find({ _id: { $in: list } }, { brand: 1, set: 1 }).lean();
  if (!prods.length) return null;
  const bySet = {};
  for (const p of prods) (bySet[`${p.brand}|${p.set || ''}`] ||= []).push(p);
  const [key, group] = Object.entries(bySet).sort((a, b) => b[1].length - a[1].length)[0];
  const [brand, set] = key.split('|');
  if (!set) return `/admin/products/${group[0]._id}`;
  return `/admin/sets?brand=${encodeURIComponent(brand)}&set=${encodeURIComponent(set)}&focus=${group.map(p => p._id).join(',')}`;
}

// Адрес от Claude → рабочий адрес сайта. «/admin/sets/<сет>» такого маршрута нет (уводит на дашборд):
// переводим в /admin/sets?brand=…&set=…, бренд — по сету
async function normalizeViewPath(path) {
  const v = String(path || '').trim();
  const m = v.match(/^\/admin\/sets\/([^/?#]+)\/?(?:[?#].*)?$/);
  if (!m || m[1] === 'frontmen') return v;
  const set = decodeURIComponent(m[1]);
  const b = await Brand.findOne({ 'sets.key': set }, { key: 1 }).lean();
  const p = b ? null : await Product.findOne({ set }, { brand: 1 }).lean();
  const brand = b?.key || p?.brand;
  return brand ? `/admin/sets?brand=${encodeURIComponent(brand)}&set=${encodeURIComponent(set)}` : '/admin/sets';
}

module.exports = { catalogSnapshot, validateOps, applyOps, productLink, normalizeViewPath, FIELDS };
