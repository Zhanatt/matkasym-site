import { useEffect, useMemo, useState } from 'react';
import { adminGetProducts, adminGetBrands, adminGetFacets, adminUpdateProduct } from '../../api/index';
import AdminProductModal from './AdminProductModal';
import { cloudinaryOpt } from '../../utils/drive';

const NO_PHOTO = '/logos/no-photo.png';

const BRAND_LABEL = {
  'matkasym-home':   'HOME',
  'matkasym-shaar':  'SHAAR',
  'matkasym-kyzmat': 'KYZMAT',
};

// Свалочные категории: товар в них формально разложен, а на деле нет.
// Тот же список на сервере (routes/admin.js, MISC_CATEGORIES).
const MISC_CATEGORIES = new Set(['other', 'Прочее', 'Другое', '']);
const isMiscCat = c => !c || MISC_CATEGORIES.has(c);

// Одновременных запросов на сохранение: пачка бывает под две сотни товаров,
// по одному это минуты ожидания, а всё разом положит и браузер, и Atlas.
const BATCH = 5;

// Разбор потерянных товаров.
//
// Раньше сюда вёл общий каталог с фильтром: список видно, а разложить нельзя —
// в каждую карточку надо было зайти, найти поле, выбрать, сохранить, вернуться.
// На сотню товаров это несколько часов.
//
// Здесь наоборот: сет и категория выбираются один раз сверху, товары
// отмечаются галочками и уезжают туда одной кнопкой. Товары из 1С приходят
// партиями («Краска RAL...» — полсотни штук подряд), поэтому поиск + «выбрать
// все» + «Изменить» и есть основной способ работы, а не разбор по одному.
//
// Сет и категория живут на одной странице, потому что теряется товар обычно по
// обеим причинам сразу: пришёл из 1С — ни сета, ни категории. Ходить за ними на
// две страницы значит дважды пролистать один и тот же список.
export default function AdminNoSet() {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [brandSets, setBrandSets] = useState({});
  const [brandCats, setBrandCats] = useState({});  // категории, уже живущие в бренде
  const [brand,   setBrand]   = useState('matkasym-home');   // куда кладём, а не фильтр
  const [target,  setTarget]  = useState('');      // сет, куда кладём
  const [cat,     setCat]     = useState('');      // категория, которую проставляем
  const [newCat,  setNewCat]  = useState('');      // своя категория, если в списке нет
  const [tab,     setTab]     = useState('all');   // all | no-set | no-cat
  const [picked,  setPicked]  = useState(() => new Set()); // отмеченные галочками
  const [progress, setProgress] = useState(null);  // { done, total } пока идёт запись
  const [undo,    setUndo]    = useState(null);    // { products: [...] } — как было до «Изменить»
  const [detail,  setDetail]  = useState(null);
  const [search,  setSearch]  = useState('');

  useEffect(() => {
    Promise.all([
      // unsorted — и без сета, и в «Прочем» одним списком.
      adminGetProducts({ unsorted: '1', limit: 1000, brief: '1' }),
      adminGetBrands(),
    ])
      .then(([p, b]) => {
        setItems(p.data.products || []);
        const map = {};
        (b.data || []).forEach(x => {
          // Берём label — имя сета как оно есть («ACHYK ASMAN»). labelRu не трогаем:
          // это перевод для витрины, а сет — имя собственное; в служебном списке
          // «Открытое небо» вперемешку с «TAZA KIYM» только путает.
          map[x.key] = (x.sets || []).map(s => ({ key: s.key, label: s.label || s.key }));
        });
        setBrandSets(map);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  // Категории берём те, что уже есть в бренде: придумывать новое имя рядом с
  // существующим «Коврики» — это ещё одна группа из одного товара на витрине.
  useEffect(() => {
    if (brandCats[brand]) return;
    adminGetFacets({ brand })
      .then(r => {
        const list = (r.data.categories || []).filter(c => !isMiscCat(c))
          .sort((a, b) => a.localeCompare(b, 'ru'));
        setBrandCats(prev => ({ ...prev, [brand]: list }));
      })
      .catch(() => setBrandCats(prev => ({ ...prev, [brand]: [] })));
  }, [brand, brandCats]);

  // Сет и категория принадлежат бренду: показывать чужие — тот же способ потерять товар.
  useEffect(() => { setTarget(''); setCat(''); setNewCat(''); }, [brand]);

  // Список по бренду не режем: разобрать надо все, а бренд наверху — это куда
  // кладём. Товар может уехать в другой бренд, если его туда и заводили.
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(p => {
      if (tab === 'no-set' && p.set) return false;
      if (tab === 'no-cat' && !isMiscCat(p.category)) return false;
      if (!q) return true;
      return (p.fullName || p.name || '').toLowerCase().includes(q)
          || (p.sku || '').toLowerCase().includes(q);
    });
  }, [items, search, tab]);

  const counts = useMemo(() => ({
    all:    items.length,
    noSet:  items.filter(p => !p.set).length,
    noCat:  items.filter(p => isMiscCat(p.category)).length,
  }), [items]);

  const catValue = cat === '__new__' ? newCat.trim() : cat;
  const busy = !!progress;

  // Отмечено в том, что сейчас на экране: кнопка «выбрать все» работает по
  // видимому списку, поэтому и счётчик у неё должен быть по нему же.
  const shownPicked = useMemo(
    () => shown.reduce((n, p) => n + (picked.has(p._id) ? 1 : 0), 0),
    [shown, picked],
  );
  const allShownPicked = shown.length > 0 && shownPicked === shown.length;

  const toggle = (id) => {
    if (busy) return;
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // «Выбрать все» — это все, кто сейчас в списке: после поиска «Краска» им
  // отмечают полсотни позиций разом, и трогать отфильтрованное нельзя.
  const pickAllShown = () => {
    if (busy) return;
    setPicked(prev => {
      const next = new Set(prev);
      shown.forEach(p => next.add(p._id));
      return next;
    });
  };
  const clearPicked = () => { if (!busy) setPicked(new Set()); };

  const patchFor = () => {
    // Проставляем только то, что выбрано: если сверху указана одна категория,
    // товар не должен заодно переехать в случайный сет.
    const patch = {};
    // Бренд пишем вместе с сетом: сет принадлежит бренду, и товар, оставшийся
    // в прежнем, снова выпал бы из каталога — уже по другой причине.
    if (target)   { patch.brand = brand; patch.set = target; }
    if (catValue) patch.category = catValue;
    return patch;
  };

  const apply = async () => {
    if (busy) return;
    const patch = patchFor();
    const list = items.filter(p => picked.has(p._id));
    if (!list.length || !Object.keys(patch).length) return;

    // Пачка необратима визуально: список схлопнется, и что именно уехало —
    // уже не видно. Поэтому спрашиваем прямо, с числами и куда.
    const what = [
      target   ? `сет → ${(brandSets[brand] || []).find(s => s.key === target)?.label || target} (${BRAND_LABEL[brand]})` : null,
      catValue ? `категория → ${catValue}` : null,
    ].filter(Boolean).join(', ');
    if (!window.confirm(`Изменить ${list.length} товар(ов): ${what}?`)) return;

    setProgress({ done: 0, total: list.length });
    const before = [];
    const failed = [];
    for (let i = 0; i < list.length; i += BATCH) {
      const chunk = list.slice(i, i + BATCH);
      await Promise.all(chunk.map(async (p) => {
        try {
          await adminUpdateProduct(p._id, patch);
          before.push(p);
          const next = { ...p, ...patch };
          // Из списка убираем, только когда разобрано и то и другое: иначе товар
          // с проставленным сетом молча остался бы в «Прочем».
          const done = !!next.set && !isMiscCat(next.category);
          setItems(prev => done
            ? prev.filter(x => x._id !== p._id)
            : prev.map(x => (x._id === p._id ? next : x)));
          setPicked(prev => { const s = new Set(prev); s.delete(p._id); return s; });
        } catch (e) {
          failed.push((p.fullName || p.name) + ': ' + (e.response?.data?.error || e.message));
        }
      }));
      setProgress({ done: Math.min(i + BATCH, list.length), total: list.length });
    }
    setProgress(null);
    if (before.length) setUndo({ products: before });
    if (failed.length) alert(`Не сохранилось: ${failed.length}\n\n` + failed.slice(0, 10).join('\n'));
  };

  // Промах стоит дёшево, только если его можно отменить — тем более на пачке.
  const undoLast = async () => {
    if (!undo || busy) return;
    const list = undo.products;
    setUndo(null);
    setProgress({ done: 0, total: list.length });
    for (let i = 0; i < list.length; i += BATCH) {
      const chunk = list.slice(i, i + BATCH);
      await Promise.all(chunk.map(async (p) => {
        try {
          await adminUpdateProduct(p._id, { brand: p.brand, set: p.set || '', category: p.category || 'other' });
          setItems(prev => (prev.some(x => x._id === p._id)
            ? prev.map(x => (x._id === p._id ? p : x))
            : [p, ...prev]));
        } catch { /* вернём при следующей загрузке */ }
      }));
      setProgress({ done: Math.min(i + BATCH, list.length), total: list.length });
    }
    setProgress(null);
  };

  const sets = brandSets[brand] || [];
  const cats = brandCats[brand] || [];

  const TABS = [
    { key: 'all',    label: `Все (${counts.all})` },
    { key: 'no-set', label: `Без сета (${counts.noSet})` },
    { key: 'no-cat', label: `В «Прочем» (${counts.noCat})` },
  ];

  const canApply = picked.size > 0 && (target || catValue) && !busy;

  return (
    <div style={{ paddingBottom: 90 }}>
      <h1 className="admin-page-title">Товары без сета и категории</h1>
      <div style={{ fontSize: 13, color: 'var(--admin-muted)', marginBottom: 16 }}>
        Без сета товар не попадает в каталог по сетам — его не видно ни в выгрузках, ни на витрине.
        С категорией «Прочее» он попадает, но падает в общую кучу внизу страницы, где его не ищут.
        Выберите бренд, сет и категорию, отметьте товары галочками и нажмите «Изменить».
        Проставляется только то, что выбрано. Если сет чужого бренда, товар переедет и в него.
      </div>

      {/* Панель липкая: на телефоне список длинный, а выбор сета нужен всё время */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5, background: 'var(--admin-bg, #f6f7f9)',
        padding: '10px 0', marginBottom: 10,
      }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#8b98a5' }}>Куда кладём:</span>
          {Object.keys(BRAND_LABEL).map(b => (
            <button key={b} onClick={() => setBrand(b)} disabled={busy} style={{
              padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              border: `1.5px solid ${brand === b ? '#3463A3' : '#e0e0e0'}`,
              background: brand === b ? '#eef2f7' : '#fff',
              color: brand === b ? '#3463A3' : '#555',
            }}>{BRAND_LABEL[b]}</button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <select value={target} onChange={e => setTarget(e.target.value)} disabled={busy}
            style={{
              flex: '1 1 200px', padding: '12px 14px', borderRadius: 10, fontSize: 15, fontWeight: 700,
              border: `2px solid ${target ? '#2d7a3a' : '#e0e0e0'}`,
              background: target ? '#f0faf2' : '#fff',
            }}>
            <option value="">— сет: не менять —</option>
            {sets.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>

          <select value={cat} onChange={e => setCat(e.target.value)} disabled={busy}
            style={{
              flex: '1 1 200px', padding: '12px 14px', borderRadius: 10, fontSize: 15, fontWeight: 700,
              border: `2px solid ${catValue ? '#2d7a3a' : '#e0e0e0'}`,
              background: catValue ? '#f0faf2' : '#fff',
            }}>
            <option value="">— категория: не менять —</option>
            {cats.map(c => <option key={c} value={c}>{c}</option>)}
            <option value="__new__">➕ своя категория…</option>
          </select>
        </div>

        {cat === '__new__' && (
          <input value={newCat} onChange={e => setNewCat(e.target.value)}
            placeholder="Название новой категории, например «Настенные вешалки»"
            style={{
              width: '100%', marginTop: 8, padding: '12px 14px', borderRadius: 10, fontSize: 14,
              border: `2px solid ${newCat.trim() ? '#2d7a3a' : '#f0a0a0'}`, outline: 'none',
            }} />
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} disabled={busy} style={{
              padding: '7px 12px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
              border: `1.5px solid ${tab === t.key ? '#3463A3' : '#e0e0e0'}`,
              background: tab === t.key ? '#eef2f7' : '#fff',
              color: tab === t.key ? '#3463A3' : '#555',
            }}>{t.label}</button>
          ))}
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по названию или артикулу"
            style={{
              flex: '1 1 180px', padding: '9px 14px', borderRadius: 10, fontSize: 14,
              border: '1.5px solid #e0e0e0', outline: 'none',
            }} />
        </div>

        {/* Выделение — отдельной строкой под фильтрами: «выбрать все» берёт
            ровно то, что осталось на экране после поиска и вкладки. */}
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={allShownPicked ? clearPicked : pickAllShown} disabled={busy || !shown.length}
            style={{
              padding: '7px 12px', borderRadius: 9, fontSize: 12.5, fontWeight: 700,
              cursor: shown.length ? 'pointer' : 'default',
              border: '1.5px solid #3463A3', background: '#fff', color: '#3463A3',
              opacity: shown.length ? 1 : .5,
            }}>
            {allShownPicked ? '☐ Снять все' : `☑ Выбрать все (${shown.length})`}
          </button>
          {picked.size > 0 && (
            <button onClick={clearPicked} disabled={busy} style={{
              padding: '7px 12px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
              border: '1.5px solid #e0e0e0', background: '#fff', color: '#555',
            }}>Снять выделение ({picked.size})</button>
          )}
          <span style={{ fontSize: 12, color: '#8b98a5' }}>
            {picked.size
              ? `отмечено ${picked.size}${shownPicked !== picked.size ? ` (на экране ${shownPicked})` : ''}`
              : 'ничего не отмечено'}
          </span>
        </div>
      </div>

      {loading ? (
        <div style={{ color: '#999', fontSize: 14 }}>Загрузка…</div>
      ) : !shown.length ? (
        <div style={{
          background: '#f0faf2', border: '1.5px solid #b7e0c2', borderRadius: 12,
          padding: '18px 20px', fontSize: 14, color: '#2d7a3a', fontWeight: 600,
        }}>
          {items.length ? 'В этом отборе разбирать нечего.' : 'Все товары разложены по сетам и категориям.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shown.map(p => {
            const on = picked.has(p._id);
            return (
              <div key={p._id}
                onClick={() => toggle(p._id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: on ? '#f0faf2' : '#fff',
                  border: `1px solid ${on ? '#8fc9a0' : '#eceff3'}`, borderRadius: 12,
                  padding: 10, cursor: busy ? 'wait' : 'pointer',
                }}>
                {/* Галочка крупная: список разбирают с телефона, а промах по
                    чекбоксу 16px — это отмеченный не тот товар. */}
                <input type="checkbox" checked={on} readOnly disabled={busy}
                  onClick={e => { e.stopPropagation(); toggle(p._id); }}
                  style={{ width: 22, height: 22, flexShrink: 0, accentColor: '#2d7a3a', cursor: 'pointer' }} />

                <img
                  src={cloudinaryOpt(p.images?.[0] || NO_PHOTO, 120)}
                  alt=""
                  onError={e => { e.target.src = NO_PHOTO; }}
                  style={{
                    width: 56, height: 56, borderRadius: 10, objectFit: 'contain',
                    background: '#f6f7f9', flexShrink: 0,
                  }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111', lineHeight: 1.3 }}>
                    {p.fullName || p.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#aab3bd', marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span>{p.sku || 'без артикула'} · {p.stock > 0 ? `${p.stock} ${p.unit || 'шт'}.` : 'нет остатка'}</span>
                    {/* Чего именно не хватает — видно до нажатия: у половины списка
                        сет на месте, и трогать его не надо. */}
                    {!p.set && (
                      <span style={{ color: '#c0392b', fontWeight: 700 }}>нет сета</span>
                    )}
                    {isMiscCat(p.category) && (
                      <span style={{ color: '#b45309', fontWeight: 700 }}>
                        категория: {p.category || 'нет'}
                      </span>
                    )}
                    {/* Сейчас товар в этом бренде. Если кладём в другой — он туда
                        и переедет, и это должно быть видно до нажатия. */}
                    {target && p.brand !== brand && (
                      <span style={{ color: '#b45309', fontWeight: 700 }}>
                        {BRAND_LABEL[p.brand] || p.brand} → {BRAND_LABEL[brand]}
                      </span>
                    )}
                  </div>
                </div>

                {/* Подробности — отдельной кнопкой: нажатие по строке уже занято
                    галочкой, и открывать карточку им нельзя. */}
                <button
                  onClick={e => { e.stopPropagation(); setDetail(p); }}
                  title="Подробнее о товаре"
                  style={{
                    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                    border: '1.5px solid #e0e0e0', background: '#fff',
                    fontSize: 15, cursor: 'pointer',
                  }}>ⓘ</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Итог, «Изменить» и отмена — внизу, под большим пальцем */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 6,
        background: '#fff', borderTop: '1px solid #eceff3',
        padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>
          Осталось: {counts.all}
        </span>
        <span style={{ fontSize: 12, color: '#8b98a5' }}>
          без сета {counts.noSet} · в «Прочем» {counts.noCat}
        </span>
        {picked.size > 0 && !target && !catValue && (
          <span style={{ fontSize: 12, color: '#c0392b' }}>выберите сет или категорию</span>
        )}

        <button onClick={apply} disabled={!canApply} style={{
          marginLeft: 'auto', padding: '10px 20px', borderRadius: 10, border: 'none',
          background: '#2d7a3a', color: '#fff', fontSize: 14, fontWeight: 700,
          cursor: canApply ? 'pointer' : 'default', opacity: canApply ? 1 : .45,
        }}>
          {busy ? `Меняю… ${progress.done}/${progress.total}` : `Изменить${picked.size ? ` (${picked.size})` : ''}`}
        </button>

        {undo && !busy && (
          <button onClick={undoLast} style={{
            padding: '10px 16px', borderRadius: 10,
            border: '1.5px solid #e0e0e0', background: '#fff',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>↩ Вернуть {undo.products.length} шт.</button>
        )}
      </div>

      {detail && (
        <AdminProductModal
          product={detail}
          onClose={() => setDetail(null)}
          onDeleted={id => { setItems(prev => prev.filter(x => x._id !== id)); setDetail(null); }}
        />
      )}
    </div>
  );
}
