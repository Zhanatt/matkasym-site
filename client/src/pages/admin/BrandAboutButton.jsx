import { useState } from 'react';
import { createPortal } from 'react-dom';
import { adminGetProducts } from '../../api/index';

/**
 * Кнопка «О направлении»: собирает по живым данным матрицы текст-презентацию
 * направления — чем занимается, что производит, какие сеты внутри.
 * Текст нужен для быстрых ответов новым сотрудникам, партнёрам и клиентам,
 * поэтому он пишется человеческим языком и копируется одной кнопкой.
 */

// Описания направлений правятся здесь: цифры и списки подставляются из базы,
// а вот чем направление живёт — знание не из матрицы, его держим текстом.
const BRAND_ABOUT = {
  'matkasym-home': {
    name: 'MATKASYM HOME',
    lead: 'HOME — направление товаров для дома.',
    body: [
      'Делаем металлические изделия для повседневного быта: уход за одеждой, хранение вещей, кухня, ванная, уборка, прихожая.',
      'Покупатель — обычная семья, поэтому решение принимается по фото и цене: направление живёт розницей, маркетплейсами и продажами через канал MATKASYM_HOME.',
    ],
    audience: 'Розничный покупатель, магазины бытовых товаров, маркетплейсы.',
  },
  'matkasym-shaar': {
    name: 'MATKASYM SHAAR',
    lead: 'SHAAR (кырг. «город») — направление городской и уличной среды.',
    body: [
      'Делаем то, что стоит вне квартиры: урны и контейнеры, уличная мебель и освещение, электрощиты, фасадные корзины и кронштейны для кондиционеров, стеллажи и мебель для школ, офисов и производств.',
      'Покупатель здесь другой — застройщики, госзаказ и тендеры, управляющие компании, бизнес. Продажа идёт объёмами и под объект, а не поштучно, поэтому направление работает от заявки и сметы, а не от витрины.',
    ],
    audience: 'Застройщики, госзакупки и тендеры, УК и муниципалитет, бизнес (B2B).',
  },
  'matkasym-kyzmat': {
    name: 'MATKASYM KYZMAT',
    lead: 'KYZMAT (кырг. «услуга») — направление услуг собственного производства.',
    body: [
      'Продаём мощности своего цеха как услугу: лазерная резка, гибка, сварка, труборез, порошковая покраска, трубопрокат.',
      'Клиент приходит со своим чертежом или заготовкой — мы даём оборудование, людей и сроки. Считается не «товар», а работа: метры реза, гибы, квадратура покраски.',
    ],
    audience: 'Мастерские, мебельщики, строители, частные заказчики со своими чертежами.',
  },
};

const SET_EXPLAINER = [
  'Сет — это линейка товаров внутри направления, собранная под одну задачу или одного покупателя.',
  'Матрица делится не по складским категориям, а по сетам: так продают, снимают контент и планируют закуп.',
  'За каждым сетом закреплены свои люди — фронтмен на канале продаж и дизайнер, который ведёт визуал линейки.',
];

const COMPANY = 'MATKASYM — кыргызский производитель изделий из металла. Компания разделена на три направления: HOME (товары для дома), SHAAR (город и улица), KYZMAT (услуги производства).';

const num = n => Number(n || 0).toLocaleString('ru-RU');
const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
};

// Детали комплектов — служебные позиции, в рассказе о продукте им не место.
const isRealProduct = p => p.productStatus !== 'kit_part' && p.category !== 'kit-part';

function countBy(list, keyFn) {
  const map = new Map();
  list.forEach(p => {
    const k = keyFn(p);
    if (!k) return;
    map.set(k, (map.get(k) || 0) + 1);
  });
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function buildText({ brandKey, brandLabel, sets, products, stockStats }) {
  const meta  = BRAND_ABOUT[brandKey];
  const items = products.filter(isRealProduct);
  const cats  = countBy(items, p => p.category);

  const bySet = new Map();
  items.forEach(p => {
    const k = p.set || '__none__';
    if (!bySet.has(k)) bySet.set(k, []);
    bySet.get(k).push(p);
  });

  const L = [];
  L.push(`${meta?.name || brandLabel} — направление MATKASYM`);
  L.push('');
  L.push(COMPANY);
  L.push('');

  L.push('ЧТО ЭТО ЗА НАПРАВЛЕНИЕ');
  if (meta) {
    L.push(meta.lead);
    meta.body.forEach(t => L.push(t));
    L.push(`Кому продаём: ${meta.audience}`);
  } else {
    L.push(`${brandLabel} — одно из направлений MATKASYM.`);
  }
  L.push('');

  L.push('В ЦИФРАХ');
  L.push(`• Товаров в матрице: ${num(items.length)}`);
  L.push(`• Сетов (линеек): ${num(sets.length)}`);
  L.push(`• Категорий продукции: ${num(cats.length)}`);
  if (stockStats && (stockStats.inMod || stockStats.outMod)) {
    L.push(`• В наличии: ${num(stockStats.inMod)} ${plural(stockStats.inMod, 'позиция', 'позиции', 'позиций')} · ${num(stockStats.inUnits)} шт`);
    L.push(`• Нет в наличии: ${num(stockStats.outMod)} ${plural(stockStats.outMod, 'позиция', 'позиции', 'позиций')}`);
  }
  L.push('');

  if (cats.length) {
    L.push('ЧТО ПРОИЗВОДИМ');
    cats.forEach(([cat, n]) => L.push(`• ${cat} — ${num(n)} ${plural(n, 'модель', 'модели', 'моделей')}`));
    L.push('');
  }

  L.push('ЧТО ТАКОЕ СЕТ');
  SET_EXPLAINER.forEach(t => L.push(t));
  L.push('');

  if (sets.length) {
    L.push(`СЕТЫ НАПРАВЛЕНИЯ ${brandLabel.toUpperCase()} (${sets.length})`);
    sets.forEach((s, i) => {
      const list = bySet.get(s.key) || [];
      const label = s.label || s.key;
      if (!list.length) {
        L.push(`${i + 1}. ${label} — пока без позиций в матрице`);
        return;
      }
      const top = countBy(list, p => p.category).slice(0, 4).map(([c]) => c.toLowerCase());
      const tail = top.length ? ` · ${top.join(', ')}` : '';
      L.push(`${i + 1}. ${label} — ${num(list.length)} ${plural(list.length, 'модель', 'модели', 'моделей')}${tail}`);
    });
    const noSet = bySet.get('__none__') || [];
    if (noSet.length) {
      L.push('');
      L.push(`Вне сетов: ${num(noSet.length)} ${plural(noSet.length, 'позиция', 'позиции', 'позиций')} — ждут разбора по линейкам.`);
    }
  }

  return L.join('\n');
}

export default function BrandAboutButton({ brandKey, brandLabel = '', sets = [], stockStats = null, country = 'KG' }) {
  const [loading, setLoading] = useState(false);
  const [text,    setText]    = useState('');
  const [open,    setOpen]    = useState(false);
  const [copied,  setCopied]  = useState(false);

  async function handleClick() {
    if (loading) return;
    setLoading(true);
    setCopied(false);
    try {
      const res = await adminGetProducts({ brand: brandKey, limit: 5000, brief: 1, country });
      setText(buildText({
        brandKey, brandLabel,
        sets: [...sets].sort((a, b) => (a.order ?? 999) - (b.order ?? 999)),
        products: res.data.products || [],
        stockStats,
      }));
      setOpen(true);
    } catch (e) {
      console.error('Brand about error:', e);
      alert('Не удалось собрать описание направления');
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      alert('Браузер не дал скопировать — выделите текст вручную');
    }
  }

  const modal = open && createPortal(
    <div
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
        background: 'rgba(15,23,42,.45)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 14, width: '100%', maxWidth: 760,
          maxHeight: '86vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,.28)', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #eef0f3',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#111' }}>
              О направлении {brandLabel}
            </div>
            <div style={{ fontSize: 12, color: '#8a94a2', marginTop: 2 }}>
              Текст собран по матрице — можно править прямо здесь перед отправкой
            </div>
          </div>
          <button onClick={() => setOpen(false)} style={{ border: 'none', background: 'transparent',
            fontSize: 22, lineHeight: 1, cursor: 'pointer', color: '#98a2b3' }}>×</button>
        </div>

        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          spellCheck={false}
          style={{
            flex: 1, minHeight: 320, margin: 0, padding: '16px 20px', border: 'none',
            outline: 'none', resize: 'none', fontSize: 13.5, lineHeight: 1.65,
            color: '#1f2937', fontFamily: 'inherit', whiteSpace: 'pre-wrap',
          }}
        />

        <div style={{ padding: '12px 20px', borderTop: '1px solid #eef0f3',
          display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={() => setOpen(false)} style={{ padding: '7px 14px', borderRadius: 6,
            border: 'none', background: '#f5f5f5', color: '#333', fontSize: 13, cursor: 'pointer' }}>
            Закрыть
          </button>
          <button onClick={handleCopy} style={{ padding: '7px 16px', borderRadius: 6, border: 'none',
            background: copied ? '#16a34a' : '#1a73e8', color: '#fff', fontWeight: 700,
            fontSize: 13, cursor: 'pointer' }}>
            {copied ? '✓ Скопировано' : '📋 Копировать'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );

  return (
    <>
      <button
        onClick={handleClick}
        disabled={loading}
        title="Собрать текст: что за направление, что производит, какие сеты"
        style={{
          padding: '5px 14px', borderRadius: 6, border: 'none',
          cursor: loading ? 'wait' : 'pointer', background: '#f2f4f7', color: '#333',
          fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap',
        }}
      >
        {loading ? '⏳ Собираю…' : '📝 О направлении'}
      </button>
      {modal}
    </>
  );
}
