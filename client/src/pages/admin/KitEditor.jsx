// Состав комплекта: карточка-комплект (стул ANTILOP) собирается из карточек-деталей
// (сиденье, ножки, поднос). Раньше состав прописывали скриптом — здесь то же самое
// руками: поиск по каталогу, количество на комплект, удаление.
//
// Отсюда же заводят материнскую карточку — отдельный комплект, который соберёт
// выбранные детали в себе и посчитает по ним остаток и три цены.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminGetProducts, adminCreateProduct } from '../../api/index';
import { cloudinaryOpt } from '../../utils/drive';

const NO_PHOTO = '/logos/no-photo.png';

// Три прайса, которые складываются по деталям. Себестоимости здесь нет: её
// видит только владелец, и в состав комплекта она не входит.
const PRICE_TIERS = [
  { key: 'price',          label: 'Розница'   },
  { key: 'priceWholesale', label: 'Опт'       },
  { key: 'priceDealer',    label: 'Дилерская' },
];

const partId = part => String(part?.product?._id || part?.product || '');

// Деталь приходит то populate-объектом (при загрузке товара), то одним id
// (сразу после добавления) — карточке нужен объект, серверу id.
const partInfo = part => (typeof part?.product === 'object' && part.product ? part.product : null);

export default function KitEditor({ value, onChange, currentId, currency = 'сом', meta = {} }) {
  const { isKit = false, kitType = 'dependent', kitParts = [] } = value || {};
  const [picking, setPicking] = useState(false);
  const [query, setQuery]     = useState('');
  const [found, setFound]     = useState([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);
  const navigate = useNavigate();

  // Материнская карточка
  const [motherName, setMotherName] = useState('');
  const [spawning, setSpawning]     = useState(false);
  const [spawned, setSpawned]       = useState(null);
  const [spawnError, setSpawnError] = useState('');

  const chosen = useMemo(() => new Set(kitParts.map(partId)), [kitParts]);

  useEffect(() => {
    if (!picking) return;
    clearTimeout(timer.current);
    if (query.trim().length < 2) { setFound([]); return; }
    setLoading(true);
    timer.current = setTimeout(() => {
      adminGetProducts({ search: query.trim(), limit: 20, includePending: 'true' })
        .then(r => setFound(r.data.products || []))
        .catch(() => setFound([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer.current);
  }, [query, picking]);

  const set = patch => onChange({ isKit, kitType, kitParts, ...patch });

  const addPart = (p) => {
    if (String(p._id) === String(currentId) || chosen.has(String(p._id))) return;
    set({ kitParts: [...kitParts, { product: p, qty: 1 }] });
    setQuery('');
    setFound([]);
  };
  const setQty = (i, qty) => set({
    kitParts: kitParts.map((part, idx) => (idx === i ? { ...part, qty: Math.max(1, Number(qty) || 1) } : part)),
  });
  const dropPart = i => set({ kitParts: kitParts.filter((_, idx) => idx !== i) });

  // Сколько комплектов соберётся: по самой дефицитной детали. Для независимого
  // комплекта смысла не имеет — там детали живут сами по себе.
  const buildable = useMemo(() => {
    if (kitType === 'independent' || !kitParts.length) return null;
    const counts = kitParts.map(part => {
      const info = partInfo(part);
      if (!info) return null;
      return Math.floor((info.stock || 0) / (part.qty || 1));
    });
    return counts.some(c => c === null) ? null : Math.min(...counts);
  }, [kitParts, kitType]);

  // Сумма деталей по каждому прайсу: цена детали на её количество в комплекте.
  const partsSums = useMemo(() => Object.fromEntries(PRICE_TIERS.map(tier => [
    tier.key,
    kitParts.reduce((sum, part) => sum + ((partInfo(part)?.[tier.key]) || 0) * (part.qty || 1), 0),
  ])), [kitParts]);

  // Сколько деталей лежит на складе всего. Это справка, а не остаток комплекта:
  // комплектов соберётся столько, сколько даст самая дефицитная деталь.
  const partsStock = useMemo(
    () => kitParts.reduce((sum, part) => sum + ((partInfo(part)?.stock) || 0), 0),
    [kitParts],
  );

  // Материнская карточка — новый комплект из тех же деталей. Текущую карточку
  // не трогаем: пользователь сам решит, оставлять ли состав и здесь.
  const spawnMother = async () => {
    const name = motherName.trim();
    if (!name || !kitParts.length || spawning) return;
    setSpawning(true);
    setSpawnError('');
    try {
      const { data } = await adminCreateProduct({
        name,
        fullName: name,
        isKit: true,
        kitType,
        kitParts: kitParts.map(part => ({ product: partId(part), qty: Math.max(1, Number(part.qty) || 1) })),
        // Цены модель требует при создании, поэтому кладём посчитанные суммы
        // сразу — сервер всё равно пересчитает их по составу.
        ...partsSums,
        brand:    meta.brand    || '',
        set:      meta.set      || '',
        setLevel: meta.setLevel || '',
        category: meta.category || 'other',
        ...(meta.currency ? { currency: meta.currency } : {}),
      });
      setSpawned(data);
      setMotherName('');
    } catch (e) {
      setSpawnError(e.response?.data?.error || e.message || 'Не удалось создать карточку');
    } finally {
      setSpawning(false);
    }
  };

  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontSize: 14 }}>
        <input type="checkbox" checked={isKit} onChange={e => set({ isKit: e.target.checked })}
          style={{ width: 16, height: 16, cursor: 'pointer' }} />
        <span style={{ fontWeight: 600 }}>Это комплект из нескольких товаров</span>
      </label>

      {isKit && (
        <>
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            {[
              { key: 'dependent',   title: 'Зависимый',   note: 'Остаток — по самой дефицитной детали. Стол, стул, парта.' },
              { key: 'independent', title: 'Независимый', note: 'Детали продаются сами по себе, комплект — витрина. SKÅDIS, BOAXEL.' },
            ].map(opt => (
              <label key={opt.key}
                style={{
                  flex: '1 1 220px', display: 'flex', gap: 8, padding: '10px 12px', cursor: 'pointer',
                  border: `1.5px solid ${kitType === opt.key ? '#3463A3' : '#e3e7ec'}`,
                  background: kitType === opt.key ? '#f4f8ff' : '#fff', borderRadius: 8,
                }}>
                <input type="radio" name="kitType" checked={kitType === opt.key}
                  onChange={() => set({ kitType: opt.key })} style={{ marginTop: 3, cursor: 'pointer' }} />
                <span>
                  <span style={{ display: 'block', fontWeight: 700, fontSize: 13 }}>{opt.title}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: '#6b7684', lineHeight: 1.4 }}>{opt.note}</span>
                </span>
              </label>
            ))}
          </div>

          <div style={{ marginTop: 16 }}>
            {kitParts.length === 0 && (
              <div style={{ fontSize: 13, color: '#98a2af', padding: '10px 0' }}>
                Деталей пока нет — добавьте те товары, из которых собирается комплект.
              </div>
            )}

            {kitParts.map((part, i) => {
              const info = partInfo(part);
              return (
                <div key={partId(part) || i}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                           borderBottom: '1px solid #f0f2f5' }}>
                  <img src={cloudinaryOpt(info?.images?.[0] || NO_PHOTO, 80)} alt=""
                    style={{ width: 42, height: 42, objectFit: 'contain', background: '#f7f8fa', borderRadius: 6 }}
                    onError={e => { e.target.src = NO_PHOTO; }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111', overflow: 'hidden',
                                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {info?.name || info?.fullName || 'Деталь удалена из каталога'}
                    </div>
                    <div style={{ fontSize: 11, color: '#98a2af' }}>
                      {info?.sku || ''}{info ? ` · остаток ${info.stock || 0} шт` : ''}
                    </div>
                  </div>
                  <input type="number" min={1} value={part.qty || 1}
                    onChange={e => setQty(i, e.target.value)}
                    style={{ width: 58, padding: '5px 7px', border: '1.5px solid #e3e7ec',
                             borderRadius: 6, fontSize: 13, textAlign: 'center' }} />
                  <span style={{ fontSize: 12, color: '#6b7684' }}>шт</span>
                  <button type="button" onClick={() => dropPart(i)} title="Убрать деталь"
                    style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', flexShrink: 0,
                             background: '#fdecec', color: '#d64545', fontSize: 15, cursor: 'pointer' }}>×</button>
                </div>
              );
            })}

            {!picking ? (
              <button type="button" onClick={() => setPicking(true)}
                style={{ marginTop: 12, padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                         border: '1.5px dashed #b9c4d2', background: '#fff', color: '#3463A3',
                         fontWeight: 600, fontSize: 13 }}>
                + Добавить деталь
              </button>
            ) : (
              <div style={{ marginTop: 12, border: '1.5px solid #e3e7ec', borderRadius: 8, padding: 10 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
                    placeholder="Название или артикул детали"
                    style={{ flex: 1, padding: '7px 10px', border: '1.5px solid #e3e7ec',
                             borderRadius: 6, fontSize: 13 }} />
                  <button type="button" onClick={() => { setPicking(false); setQuery(''); setFound([]); }}
                    style={{ padding: '7px 12px', borderRadius: 6, border: '1.5px solid #e3e7ec',
                             background: '#fff', cursor: 'pointer', fontSize: 13 }}>Готово</button>
                </div>

                <div style={{ maxHeight: 260, overflowY: 'auto', marginTop: 8 }}>
                  {loading && <div style={{ fontSize: 12, color: '#98a2af', padding: 8 }}>Ищем…</div>}
                  {!loading && query.trim().length >= 2 && found.length === 0 && (
                    <div style={{ fontSize: 12, color: '#98a2af', padding: 8 }}>Ничего не нашлось</div>
                  )}
                  {found.map(p => {
                    const used = chosen.has(String(p._id)) || String(p._id) === String(currentId);
                    return (
                      <div key={p._id} onClick={() => addPart(p)}
                        style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 6px',
                                 borderRadius: 6, cursor: used ? 'default' : 'pointer', opacity: used ? 0.45 : 1 }}
                        onMouseEnter={e => { if (!used) e.currentTarget.style.background = '#f4f8ff'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                        <img src={cloudinaryOpt(p.images?.[0] || NO_PHOTO, 60)} alt=""
                          style={{ width: 32, height: 32, objectFit: 'contain', background: '#f7f8fa', borderRadius: 5 }}
                          onError={e => { e.target.src = NO_PHOTO; }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, color: '#111', overflow: 'hidden',
                                        textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                          <div style={{ fontSize: 10.5, color: '#98a2af' }}>{p.sku} · {p.stock || 0} шт</div>
                        </div>
                        {used && <span style={{ fontSize: 11, color: '#98a2af' }}>уже в составе</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {kitParts.length > 0 && (
            <div style={{ marginTop: 14, padding: '10px 12px', background: '#f7f8fa', borderRadius: 8,
                          fontSize: 12.5, color: '#3d4653', lineHeight: 1.7 }}>
              {/* У независимого комплекта ни остатка, ни цены по деталям не бывает:
                  доску и крючки покупают порознь, комплект — витрина. */}
              {kitType === 'dependent' ? (
                <>
                  <div>
                    Соберётся комплектов: <b>{buildable === null ? '—' : buildable}</b>
                    <span style={{ color: '#98a2af' }}> — по самой дефицитной детали, пересчитается при сохранении</span>
                  </div>
                  <div>
                    Всего деталей на складе: <b>{partsStock.toLocaleString('ru')} шт</b>
                  </div>

                  <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 6, paddingTop: 6,
                                borderTop: '1px solid #e6e9ee' }}>
                    {PRICE_TIERS.map(tier => (
                      <span key={tier.key}>
                        {tier.label}: <b>{partsSums[tier.key].toLocaleString('ru')} {currency}</b>
                      </span>
                    ))}
                  </div>
                  <div style={{ color: '#98a2af' }}>
                    Суммы деталей подставятся в цены комплекта при сохранении.
                    Нулевую сумму не подставляем — такую цену комплекта ставят руками.
                  </div>
                  <div style={{ color: '#98a2af' }}>
                    Детали пропадут из каталога: они продаются в составе комплекта, а не сами по себе.
                  </div>
                </>
              ) : (
                <div style={{ color: '#98a2af' }}>
                  Детали останутся в каталоге: у независимого комплекта их покупают и порознь.
                  Остаток и цена по ним не считаются.
                </div>
              )}
            </div>
          )}

          {kitParts.length > 0 && (
            <div style={{ marginTop: 12, border: '1.5px dashed #b9c4d2', borderRadius: 8, padding: 12 }}>
              {spawned ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#2f9e44' }}>
                    ✓ Материнская карточка «{spawned.name}» создана
                  </span>
                  <button type="button" onClick={() => navigate(`/admin/products/${spawned._id}/edit`)}
                    style={{ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                             background: '#3463A3', color: '#fff', fontWeight: 600, fontSize: 13 }}>
                    Открыть →
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>Материнская карточка</div>
                  <div style={{ fontSize: 11.5, color: '#6b7684', lineHeight: 1.5, marginBottom: 9 }}>
                    Отдельная карточка, которая соберёт эти детали в себе: остаток и три цены
                    посчитаются по ним. Текущую карточку она не меняет — состав останется и здесь.
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input value={motherName} onChange={e => setMotherName(e.target.value)}
                      placeholder="Название материнской карточки"
                      style={{ flex: '1 1 220px', minWidth: 0, padding: '7px 10px',
                               border: '1.5px solid #e3e7ec', borderRadius: 6, fontSize: 13 }} />
                    <button type="button" onClick={spawnMother} disabled={spawning || !motherName.trim()}
                      style={{ padding: '7px 14px', borderRadius: 8, cursor: motherName.trim() ? 'pointer' : 'default',
                               border: '1.5px solid #3463A3', background: '#fff', color: '#3463A3',
                               fontWeight: 600, fontSize: 13, opacity: spawning || !motherName.trim() ? 0.5 : 1 }}>
                      {spawning ? 'Создаём…' : '+ Создать из этих деталей'}
                    </button>
                  </div>
                  {spawnError && (
                    <div style={{ marginTop: 7, fontSize: 12, color: '#d64545' }}>{spawnError}</div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
