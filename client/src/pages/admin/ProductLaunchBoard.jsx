import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  adminGetProductLaunches,
  adminGetProductLaunchRev,
  adminCreateProductLaunch,
  adminUpdateProductLaunch,
  adminDeleteProductLaunch,
  adminCreateLaunchOrderRequest,
  adminCreateLaunchProduct,
  adminGetLaunchDesigners,
  adminGetProducts,
} from '../../api';
import { useAuth } from '../../context/AuthContext';
import { cloudinaryOpt } from '../../utils/drive';

const CLOUD  = 'dnbg21ef8';
const PRESET = 'Matkasym';
const NO_PHOTO = '/logos/no-photo.png';

// Этапы запуска товара. Порядок = движение слева направо.
const STAGES = [
  { key: 'proposed',  label: 'Предложено',      icon: '💡', dot: '#db2777', bg: '#fdf2f8', line: '#fbcfe8',
    hint: 'Менеджеры скидывают товары, которые спрашивают клиенты' },
  { key: 'content',   label: 'Контент',         icon: '📸', dot: '#DC1E24', bg: '#fef2f2', line: '#fecaca',
    hint: 'Зайнагуль: фото, ссылка на источник, описание' },
  { key: 'design',    label: 'Дизайн',          icon: '🎨', dot: '#7c3aed', bg: '#faf5ff', line: '#e9d5ff',
    hint: 'Дизайнеры делают карточку товара и креативы' },
  { key: 'review',    label: 'Согласование',    icon: '👀', dot: '#0891b2', bg: '#ecfeff', line: '#a5f3fc',
    hint: 'Смотрим макеты: утвердить или вернуть на доработку' },
  { key: 'published', label: 'Опубликовано',    icon: '📣', dot: '#2563eb', bg: '#eff6ff', line: '#bfdbfe',
    hint: 'Пост вышел — идёт тестовая продажа' },
  { key: 'target',    label: 'Таргет',          icon: '🎯', dot: '#ea580c', bg: '#fff7ed', line: '#fed7aa',
    hint: 'Крутим рекламу — задача уходит Байэлу в Telegram' },
  { key: 'feedback',  label: 'Обратная связь',  icon: '📊', dot: '#22c55e', bg: '#f0fdf4', line: '#bbf7d0',
    hint: 'Отклик и заявки клиентов — есть спрос, заказываем партию' },
];
const DONE = { key: 'done', label: 'Итог', icon: '✓', dot: '#94a3b8', bg: '#f8fafc', line: '#e2e8f0', hint: 'Заказали партию или спроса нет' };
const ALL_STAGES = [...STAGES, DONE];
const ST = Object.fromEntries(ALL_STAGES.map(s => [s.key, s]));
const idxOf = k => ALL_STAGES.findIndex(s => s.key === k);

const METRICS = [
  { key: 'inquiries', label: 'Перешли по ссылке', icon: '🔗' },
  { key: 'reactions', label: 'Реакции',           icon: '❤️' },
  { key: 'comments',  label: 'Комментарии',       icon: '🗨' },
];

// Что дошло до Битрикса: сколько обратились и чем это кончилось
const BITRIX = { key: 'bitrix', label: 'Обратились в Битрикс', icon: '📇' };
const BITRIX_OUTCOME = [
  { key: 'ordered', label: 'Заказали',   icon: '✅' },
  { key: 'refused', label: 'Отказались', icon: '❌' },
];
const DAY_FIELDS = [...METRICS, BITRIX, ...BITRIX_OUTCOME];

// Откуда товар. У теста поставщик указан на самой карточке, а если товар уже завели
// в каталоге — берём из карточки товара, она первична.
const supplierOf = l => (l?.product?.supplier?.company || l?.supplier || '').trim();
const isIkea = l => supplierOf(l).toUpperCase() === 'IKEA';

// Логотип источника в углу фото — как в каталоге. Пока помечаем только IKEA:
// это отдельный поток закупа, и его карточки нужно отличать с одного взгляда.
function SupplierMark({ launch, size = 14 }) {
  if (!isIkea(launch)) return null;
  return (
    <img src="/logos/ikea.svg" alt="IKEA" title="Товар IKEA"
      style={{ position: 'absolute', left: 3, bottom: 3, height: size, borderRadius: 3,
        background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.25)' }} />
  );
}

const fmtDay = d => d ? new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
const num = v => (v === null || v === undefined || v === '') ? '—' : v;

const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10,
  border: '1.5px solid #e5e7eb', fontSize: 14, outline: 'none', fontFamily: 'inherit',
};
const labelStyle = { display: 'block', fontSize: 12.5, fontWeight: 700, color: '#374151', marginBottom: 6 };

async function uploadToCloudinary(file, folder = 'matkasym/product-launch') {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', PRESET);
  fd.append('folder', folder);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, { method: 'POST', body: fd });
  const data = await res.json();
  if (!data.secure_url) throw new Error(data.error?.message || 'Не удалось загрузить файл');
  return data.secure_url;
}

export default function ProductLaunchBoard({ onCountChange }) {
  const { user } = useAuth();
  const isContentMgr = ['owner', 'editor'].includes(user?.role) || !!user?.canManageContent;
  const isDesigner   = user?.role === 'designer';
  const isAds        = !!user?.canRunAds;

  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail]   = useState(null);
  const [showDone, setShowDone] = useState(false);
  const [picker, setPicker]   = useState(false);

  // silent — фоновое обновление: без спиннера, доска просто перерисовывается
  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    return adminGetProductLaunches()
      .then(r => {
        const list = r.data.launches || [];
        setItems(list);
        onCountChange?.(r.data.activeCount ?? list.filter(x => x.stage !== 'done').length);
      })
      .catch(() => { if (!silent) { setItems([]); onCountChange?.(0); } })
      .finally(() => { if (!silent) setLoading(false); });
  }, [onCountChange]);

  useEffect(() => { load(); }, [load]);

  // ── Живая доска ────────────────────────────────────────────────────────────
  // Доску одновременно ведут несколько человек и передают карточки друг другу,
  // поэтому чужой перенос этапа должен появляться сам, без F5. Раз в 7 секунд
  // спрашиваем дешёвый «отпечаток» состояния и перечитываем доску, только когда
  // он изменился, — тянуть все карточки каждые семь секунд ни к чему.
  const revRef     = useRef(null);   // последний известный отпечаток
  const detailRef  = useRef(null);   // открыта ли карточка прямо сейчас
  const pendingRef = useRef(false);  // доска изменилась, пока карточка открыта
  detailRef.current = detail;

  useEffect(() => {
    let stopped = false;

    const tick = async () => {
      if (document.hidden) return;   // вкладка в фоне — сервер не дёргаем
      try {
        const { data } = await adminGetProductLaunchRev();
        if (stopped || !data?.rev || data.rev === revRef.current) return;
        const firstCheck = revRef.current === null;
        revRef.current = data.rev;
        if (firstCheck) return;      // это просто первый замер, доска уже свежая
        // Пока открыта карточка, обновление откладываем: перерисовка сбросила бы
        // текст, который человек в этот момент печатает в её полях.
        if (detailRef.current) pendingRef.current = true;
        else load(true);
      } catch { /* сеть моргнула — попробуем на следующем тике */ }
    };

    tick();
    const timer = setInterval(tick, 7000);
    const onVisible = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  // Карточку закрыли — догоняем то, что накопилось, пока она была открыта
  const closeDetail = useCallback(() => {
    setDetail(null);
    if (pendingRef.current) { pendingRef.current = false; load(true); }
  }, [load]);

  // Обновление карточки: держим открытую модалку в синхроне с сервером
  const patch = async (launch, data) => {
    const res = await adminUpdateProductLaunch(launch._id, data);
    setDetail(d => (d && d._id === launch._id) ? res.data : d);
    setItems(list => list.map(x => x._id === launch._id ? res.data : x));
    load();
    return res.data;
  };

  const move = async (launch, stage) => {
    try { await patch(launch, { stage }); }
    catch (e) { alert(e?.response?.data?.error || 'Не удалось перенести карточку'); }
  };

  // Дизайнер забирает карточку с «Контента»: становится исполнителем, карточка едет в «Дизайн»
  const take = async (launch) => {
    try { await patch(launch, { design: { assignee: 'me' } }); }
    catch (e) { alert(e?.response?.data?.error || 'Не удалось взять карточку'); }
  };

  const remove = async (id) => {
    if (!window.confirm('Убрать товар с доски тестовых продаж?')) return;
    try {
      await adminDeleteProductLaunch(id);
      setDetail(null);
      load();
    } catch (e) { alert(e?.response?.data?.error || 'Не удалось удалить'); }
  };

  const doneItems = useMemo(() => items.filter(x => x.stage === 'done'), [items]);
  const columns = showDone ? ALL_STAGES : STAGES;

  // Товар из каталога, попавший в «Предложено»: тестировать его нечего — он уже наш,
  // менеджер просит его заказать. Такие карточки собираем отдельно и уводим в закуп.
  const inCatalog = useMemo(
    () => items.filter(needsOrder).sort((a, b) => (b.number || 0) - (a.number || 0)),
    [items]);
  const maybeInCatalog = useMemo(
    () => items.filter(l => l.stage !== 'done' && catalogHint(l)),
    [items]);

  // Заявку создаём из карточки: если она выросла из заявки менеджера, вернётся именно та
  const toOrder = async (launch) => {
    const title = launch.productName || launch.name;
    if (!window.confirm(`«${title}» уже есть в каталоге.\nОтправить в «Заявки на заказ»?`)) return;
    try {
      const r = await adminCreateLaunchOrderRequest(launch._id, {});
      await load();
      alert(`Заявка №${r.data.request.number} — во вкладке «Заявки на заказ».`);
    } catch (e) { alert(e?.response?.data?.error || 'Не удалось создать заявку'); }
  };

  // Разбор накопившегося: по одной, чтобы номера заявок шли по порядку
  const [bulk, setBulk] = useState(false);
  const orderAll = async () => {
    if (!window.confirm(`Отправить в «Заявки на заказ» все карточки, товар которых уже есть в каталоге (${inCatalog.length} шт.)?`)) return;
    setBulk(true);
    let ok = 0; const failed = [];
    for (const l of inCatalog) {
      try { await adminCreateLaunchOrderRequest(l._id, {}); ok++; }
      catch (e) { failed.push(`№${l.number}: ${e?.response?.data?.error || 'ошибка'}`); }
    }
    setBulk(false);
    await load();
    alert(`Отправлено заявок: ${ok}${failed.length ? `\nНе получилось:\n${failed.join('\n')}` : ''}`);
  };

  return (
    <div>
      {/* Пояснение процесса */}
      <div style={{
        background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12,
        padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#475569',
      }}>
        🧪 <b>Тестовая продажа — первый этап.</b> Менеджеры предлагают товары, которые спрашивают клиенты →
        Зайнагуль берёт их в работу и собирает контент → дизайнеры делают карточку и креативы → согласовываем макеты →
        выходит пост, продаём по фото → на выбранные товары запускаем таргет → собираем заявки клиентов.
        Есть спрос — из карточки создаётся <b>заявка на заказ</b> первой партии.
      </div>

      {/* Сверка с каталогом: что из предложенного у нас уже есть */}
      {(inCatalog.length > 0 || maybeInCatalog.length > 0) && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12,
          padding: '12px 16px', marginBottom: 16 }}>
          {inCatalog.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                <b style={{ fontSize: 13.5, color: '#14532d' }}>
                  ✓ Уже есть в нашем каталоге — {inCatalog.length} шт.
                </b>
                <span style={{ fontSize: 12.5, color: '#3f6212' }}>
                  Этим товарам тестовая продажа не нужна: их место — «Заявки на заказ».
                </span>
                <span style={{ flex: 1 }} />
                {isContentMgr && (
                  <button onClick={orderAll} disabled={bulk}
                    style={{ padding: '7px 14px', fontSize: 12.5, fontWeight: 700, color: '#fff',
                      background: bulk ? '#86efac' : '#16a34a', border: 'none', borderRadius: 9,
                      cursor: bulk ? 'default' : 'pointer' }}>
                    {bulk ? 'Отправляю…' : `🛒 Отправить все (${inCatalog.length})`}
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {inCatalog.map(l => (
                  <button key={l._id} onClick={() => setDetail(l)}
                    title="Открыть карточку"
                    style={{ fontSize: 11.5, padding: '3px 9px', borderRadius: 20, cursor: 'pointer',
                      background: '#fff', border: '1px solid #bbf7d0', color: '#166534', fontWeight: 600 }}>
                    №{l.number} {l.productName || l.name}
                    {(l.sku || l.product?.sku) && <span style={{ color: '#94a3b8' }}> · {l.sku || l.product.sku}</span>}
                  </button>
                ))}
              </div>
            </>
          )}

          {maybeInCatalog.length > 0 && (
            <div style={{ marginTop: inCatalog.length ? 12 : 0, paddingTop: inCatalog.length ? 10 : 0,
              borderTop: inCatalog.length ? '1px dashed #bbf7d0' : 'none' }}>
              <b style={{ fontSize: 13.5, color: '#92400e' }}>
                ≈ Похоже, есть в каталоге — {maybeInCatalog.length} шт.
              </b>
              <span style={{ fontSize: 12.5, color: '#b45309', marginLeft: 8 }}>
                Совпало название или артикул — откройте карточку и привяжите товар.
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {maybeInCatalog.map(l => (
                  <button key={l._id} onClick={() => setDetail(l)} title="Открыть карточку"
                    style={{ fontSize: 11.5, padding: '3px 9px', borderRadius: 20, cursor: 'pointer',
                      background: '#fff', border: '1px solid #fde68a', color: '#92400e', fontWeight: 600 }}>
                    №{l.number} {l.name} → {l.catalogMatch.sku || l.catalogMatch.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Шкала этапов */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {STAGES.map((s, i) => {
          const n = items.filter(x => x.stage === s.key).length;
          return (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20,
                background: s.bg, border: `1px solid ${s.line}`, fontSize: 12.5, fontWeight: 700, color: '#334155',
              }}>
                <span>{s.icon}</span>{s.label}
                <span style={{ background: s.dot, color: '#fff', borderRadius: 20, padding: '0 7px', fontSize: 11.5 }}>{n}</span>
              </div>
              {i < STAGES.length - 1 && <span style={{ color: '#cbd5e1', fontSize: 13 }}>→</span>}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        {isContentMgr ? (
          <button onClick={() => setPicker('content')}
            style={{ flex: '1 1 220px', padding: '14px', fontSize: 15, fontWeight: 700, color: '#fff',
              background: 'linear-gradient(135deg, #DC1E24 0%, #b3161b 100%)', border: 'none',
              borderRadius: 12, cursor: 'pointer', boxShadow: '0 6px 18px rgba(220,30,36,.22)' }}>
            ＋ Новый товар на тест
          </button>
        ) : (
          // Менеджеру доступен только вход через «Предложено» — дальше решает тот, кто ведёт доску
          <button onClick={() => setPicker('proposed')}
            style={{ flex: '1 1 220px', padding: '14px', fontSize: 15, fontWeight: 700, color: '#fff',
              background: 'linear-gradient(135deg, #db2777 0%, #a81a5c 100%)', border: 'none',
              borderRadius: 12, cursor: 'pointer', boxShadow: '0 6px 18px rgba(219,39,119,.22)' }}>
            💡 Предложить товар
          </button>
        )}
        <button onClick={() => setShowDone(v => !v)}
          style={{ flex: '0 1 auto', padding: '14px 18px', fontSize: 14, fontWeight: 700, color: '#475569',
            background: showDone ? '#e2e8f0' : '#f1f5f9', border: 'none', borderRadius: 12, cursor: 'pointer' }}>
          ✓ Завершённые ({doneItems.length})
        </button>
      </div>

      {loading ? (
        <div style={{ color: '#aaa', textAlign: 'center', padding: 40 }}>Загрузка…</div>
      ) : (
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', overflowX: 'auto', paddingBottom: 12 }}>
          {columns.map(col => {
            const colItems = items.filter(x => (x.stage || 'content') === col.key);
            return (
              <div key={col.key} style={{ flex: '0 0 280px', minWidth: 280, background: col.bg,
                border: `1px solid ${col.line}`, borderRadius: 14, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, padding: '0 2px' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.dot }} />
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: '#111', textTransform: 'uppercase', letterSpacing: .3 }}>
                    {col.icon} {col.label}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: col.dot, borderRadius: 20, padding: '1px 8px' }}>
                    {colItems.length}
                  </span>
                  <span style={{ flex: 1 }} />
                  {/* Завести товар сразу в этой колонке */}
                  {(isContentMgr || col.key === 'proposed') && col.key !== 'done' && (
                    <button onClick={() => setPicker(col.key)} title={`Добавить в «${col.label}»`}
                      style={{ width: 24, height: 24, borderRadius: 8, border: 'none', background: col.dot,
                        color: '#fff', fontSize: 15, lineHeight: 1, cursor: 'pointer', flexShrink: 0 }}>＋</button>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10, padding: '0 2px' }}>{col.hint}</div>

                {colItems.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '22px 10px', color: '#b0b8c1', fontSize: 12.5 }}>Пусто</div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {colItems.map(l => (
                    <LaunchCard
                      key={l._id} launch={l} col={col}
                      canMove={isContentMgr || (isDesigner && l.stage === 'design') || (isAds && l.stage === 'target')}
                      canTake={isDesigner && l.stage === 'content'}
                      canOrder={isContentMgr && needsOrder(l)}
                      onOpen={() => setDetail(l)}
                      onMove={(stage) => move(l, stage)}
                      onTake={() => take(l)}
                      onOrder={() => toOrder(l)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {detail && createPortal(
        <LaunchDetail
          launch={detail}
          isContentMgr={isContentMgr}
          isDesigner={isDesigner}
          isAds={isAds}
          onClose={closeDetail}
          onPatch={(data) => patch(detail, data)}
          onDelete={() => remove(detail._id)}
          onCreateProduct={async () => {
            const r = await adminCreateLaunchProduct(detail._id);
            setDetail(r.data.launch);
            setItems(list => list.map(x => x._id === r.data.launch._id ? r.data.launch : x));
            load();
          }}
          onOrdered={async (quantity) => {
            const r = await adminCreateLaunchOrderRequest(detail._id, { quantity });
            setDetail(null);
            load();
            alert(`Заявка на заказ №${r.data.request.number} создана — она во вкладке «Заявки на заказ».`);
          }}
        />, document.body)}

      {picker && createPortal(
        <NewLaunchForm
          mode={picker}
          onClose={() => setPicker(false)}
          onCreate={async (data) => {
            await adminCreateProductLaunch({ ...data, stage: picker });
            setPicker(false);
            load();
          }}
        />, document.body)}
    </div>
  );
}

// Товар уже в каталоге — тестовая продажа ему не нужна, ему место в заявках на заказ.
// Карточка, заведённая под сам тест (test_sale) или под будущий товар, каталогом не
// считается: она создаётся здесь же, на доске, и заказывать по ней нечего.
const NOT_IN_CATALOG = ['test_sale', 'planned', 'in_development'];
const isInCatalog = l => !!l?.product && !NOT_IN_CATALOG.includes(l.product?.productStatus);
// Предложение менеджера по товару, который у нас уже есть: заявку по нему ещё не завели
const needsOrder = l => l?.stage === 'proposed' && isInCatalog(l) && !l?.request;
// Каталожного товара у карточки нет, но сервер нашёл похожий по названию/артикулу
const catalogHint = l => (!isInCatalog(l) && l?.catalogMatch) ? l.catalogMatch : null;

// Метка «есть в каталоге» — одинаково выглядит на карточке доски и в сводке над ней
function CatalogMark({ launch: l, compact = false }) {
  const hint = catalogHint(l);
  if (!isInCatalog(l) && !hint) return null;

  const inCat = isInCatalog(l);
  const text = inCat
    ? `✓ Уже есть в каталоге${l.sku || l.product?.sku ? ` · ${l.sku || l.product.sku}` : ''}`
    : `≈ Похоже, есть в каталоге: ${hint.name}${hint.sku ? ` · ${hint.sku}` : ''}`;

  return (
    <div style={{ marginTop: compact ? 0 : 8 }}>
      <span title={inCat ? 'Товар заведён в каталоге — его не тестируют, а заказывают'
                         : 'Совпадение по названию — откройте карточку и привяжите товар'}
        style={{
          display: 'inline-block', maxWidth: '100%', fontSize: 11, fontWeight: 700,
          padding: '3px 8px', borderRadius: 20, lineHeight: 1.35,
          background: inCat ? '#f0fdf4' : '#fffbeb',
          color:      inCat ? '#15803d' : '#b45309',
          border: `1px solid ${inCat ? '#bbf7d0' : '#fde68a'}`,
        }}>
        {text}
      </span>
    </div>
  );
}

// ── Карточка на доске ────────────────────────────────────────────────────────
function LaunchCard({ launch: l, col, canMove, canTake, canOrder, onOpen, onMove, onTake, onOrder }) {
  const i = idxOf(l.stage);
  const prev = i > 0 ? ALL_STAGES[i - 1] : null;
  const next = i < ALL_STAGES.length - 1 ? ALL_STAGES[i + 1] : null;
  const img = l.image || l.product?.images?.[0] || NO_PHOTO;
  const c = l.content || {};
  const ready = [!!c.photos?.length, !!c.sourceUrl, !!c.description];

  return (
    <div onClick={onOpen}
      style={{ background: '#fff', border: `1.5px solid ${col.line}`, borderRadius: 12, padding: 12,
        cursor: 'pointer', transition: 'box-shadow .15s, border-color .15s' }}
      onMouseOver={e => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,.08)'; e.currentTarget.style.borderColor = col.dot; }}
      onMouseOut={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = col.line; }}>

      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ position: 'relative', width: 64, height: 64, flexShrink: 0 }}>
          <img src={cloudinaryOpt(img, 160)} alt="" loading="lazy" onError={e => { e.target.src = NO_PHOTO; }}
            style={{ width: '100%', height: '100%', borderRadius: 10, objectFit: 'cover', background: '#f1f5f9' }} />
          <SupplierMark launch={l} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10.5, color: '#b0b8c1' }}>
            №{l.number}
            {l.fromRequestNumber ? <span style={{ marginLeft: 6 }}>· из заявки №{l.fromRequestNumber}</span> : null}
          </div>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: '#111', margin: '2px 0 3px' }}>
            {l.name || l.productName}
          </div>
          <div style={{ fontSize: 11.5, color: '#94a3b8' }}>
            {l.sku || l.product?.sku || 'ещё нет в каталоге'}
          </div>
        </div>
      </div>

      {/* Есть ли товар у нас — видно прямо на доске, не открывая карточку */}
      <CatalogMark launch={l} />

      {/* Этап «Контент» — видно, чего ещё не хватает */}
      {l.stage === 'content' && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          {[['📷 Фото', ready[0]], ['🔗 Ссылка', ready[1]], ['📝 Описание', ready[2]]].map(([t, ok]) => (
            <span key={t} style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
              background: ok ? '#f0fdf4' : '#f8fafc', color: ok ? '#15803d' : '#94a3b8',
              border: `1px solid ${ok ? '#bbf7d0' : '#e2e8f0'}` }}>
              {ok ? '✓' : '○'} {t}
            </span>
          ))}
        </div>
      )}

      {(l.stage === 'design' || l.stage === 'review') && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', fontSize: 11.5 }}>
          <span style={{ fontWeight: 700, color: '#7c3aed', background: '#faf5ff', border: '1px solid #e9d5ff',
            borderRadius: 8, padding: '2px 8px' }}>
            🎨 {l.design?.assigneeName || 'без исполнителя'}
          </span>
          {l.design?.files?.length > 0 && (
            <span style={{ color: '#64748b' }}>📎 {l.design.files.length}</span>
          )}
        </div>
      )}

      {(l.stage === 'published' || l.stage === 'target' || l.stage === 'feedback' || l.stage === 'done') && (
        <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11.5 }}>
          {l.publish?.publishedAt && (
            <span style={{ fontWeight: 700, color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe',
              borderRadius: 8, padding: '2px 8px' }}>📣 {fmtDay(l.publish.publishedAt)}</span>
          )}
          {l.publish?.links?.length > 0 && <span style={{ color: '#64748b' }}>🔗 {l.publish.links.length}</span>}
        </div>
      )}

      {(l.stage === 'target' || l.stage === 'feedback' || l.stage === 'done') && (
        <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: `repeat(${METRICS.length + 1}, 1fr)`, gap: 6 }}>
          {[...METRICS, BITRIX_OUTCOME[0]].map(m => {
            const rows = l.results || [];
            const has = rows.some(r => r[m.key] !== null && r[m.key] !== undefined);
            const sum = rows.reduce((acc, r) => acc + (r[m.key] || 0), 0);
            return (
              <div key={m.key} style={{ textAlign: 'center', background: '#f8fafc', borderRadius: 8, padding: '5px 2px' }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#111' }}>{has ? sum : '—'}</div>
                <div style={{ fontSize: 9.5, color: '#94a3b8' }}>{m.icon}</div>
              </div>
            );
          })}
        </div>
      )}

      {canOrder && (
        <button onClick={e => { e.stopPropagation(); onOrder(); }}
          title="Товар уже в каталоге — тест не нужен, заявка уйдёт закупщику"
          style={{ width: '100%', marginTop: 10, padding: '9px', fontSize: 13, fontWeight: 700, color: '#fff',
            background: '#16a34a', border: 'none', borderRadius: 9, cursor: 'pointer' }}>
          🛒 В заявки на заказ
        </button>
      )}

      {canTake && (
        <button onClick={e => { e.stopPropagation(); onTake(); }}
          title="Взять в работу: карточка уйдёт в «Дизайн», исполнителем станете вы"
          style={{ width: '100%', marginTop: 10, padding: '9px', fontSize: 13, fontWeight: 700, color: '#fff',
            background: '#7c3aed', border: 'none', borderRadius: 9, cursor: 'pointer' }}>
          🎨 Беру в работу
        </button>
      )}

      {canMove && (prev || next) && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, justifyContent: 'flex-end' }}>
          {prev && (
            <button onClick={e => { e.stopPropagation(); onMove(prev.key); }} title={`← ${prev.label}`}
              style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${col.line}`, background: '#fff',
                color: '#64748b', fontSize: 13, cursor: 'pointer' }}>◀</button>
          )}
          {next && (
            <button onClick={e => { e.stopPropagation(); onMove(next.key); }} title={`${next.label} →`}
              style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: next.dot,
                color: '#fff', fontSize: 13, cursor: 'pointer' }}>▶</button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Источник товара ──────────────────────────────────────────────────────────
// Название и ссылку присылают как есть, поэтому IKEA сама себя опознаёт не всегда —
// отмечаем вручную одной кнопкой. Когда товар уже заведён в каталоге, поставщик
// приходит оттуда и правится в карточке товара, а не здесь.
function SupplierPicker({ launch: l, canEdit, busy, onSave }) {
  const fromProduct = (l.product?.supplier?.company || '').trim();
  const chip = (text, extra = {}) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700,
      padding: '3px 10px', borderRadius: 20, ...extra }}>{text}</span>
  );

  if (fromProduct) {
    return chip(
      <>
        {fromProduct.toUpperCase() === 'IKEA'
          ? <img src="/logos/ikea.svg" alt="IKEA" style={{ height: 13, borderRadius: 2 }} />
          : <span>📦 {fromProduct}</span>}
        <span style={{ color: '#94a3b8', fontWeight: 600 }}>из карточки товара</span>
      </>,
      { background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569' },
    );
  }

  if (!canEdit) {
    return isIkea(l)
      ? chip(<img src="/logos/ikea.svg" alt="IKEA" style={{ height: 13, borderRadius: 2 }} />,
          { background: '#eaf3fb', border: '1px solid #cfe2f3' })
      : null;
  }

  const on = isIkea(l);
  return (
    <button onClick={() => onSave({ supplier: on ? '' : 'IKEA' }, 'supplier')} disabled={!!busy}
      title={on ? 'Убрать отметку IKEA' : 'Отметить как товар IKEA'}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700,
        padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
        background: on ? '#eaf3fb' : '#fff', color: on ? '#0058A3' : '#94a3b8',
        border: `1.5px solid ${on ? '#0058A3' : '#e2e8f0'}` }}>
      <img src="/logos/ikea.svg" alt="" style={{ height: 12, borderRadius: 2, opacity: on ? 1 : 0.45 }} />
      {on ? 'IKEA' : 'не IKEA'}
    </button>
  );
}

// ── Карточка целиком: контент, дизайн, публикация, результат ─────────────────
function LaunchDetail({ launch: l, isContentMgr, isDesigner, isAds, onClose, onPatch, onDelete, onOrdered, onCreateProduct }) {
  const st = ST[l.stage] || ST.content;
  const i = idxOf(l.stage);
  const prev = i > 0 ? ALL_STAGES[i - 1] : null;
  const next = i < ALL_STAGES.length - 1 ? ALL_STAGES[i + 1] : null;
  const canMove = isContentMgr || (isDesigner && l.stage === 'design') || (isAds && l.stage === 'target');
  // Блок этапа показываем, только когда до него дошли
  const reached = (key) => idxOf(l.stage) >= idxOf(key);

  const [busy, setBusy] = useState('');
  const save = async (data, tag) => {
    setBusy(tag);
    try { await onPatch(data); }
    catch (e) { alert(e?.response?.data?.error || 'Не удалось сохранить'); }
    finally { setBusy(''); }
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1600 }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 1601, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 20, pointerEvents: 'none' }}>
        <div style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 620, maxHeight: '92vh',
          overflow: 'auto', padding: 22, pointerEvents: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
            <div style={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }}>
              <img src={cloudinaryOpt(l.image || l.product?.images?.[0] || NO_PHOTO, 200)} alt=""
                onError={e => { e.target.src = NO_PHOTO; }}
                style={{ width: '100%', height: '100%', borderRadius: 12, objectFit: 'cover', background: '#f1f5f9' }} />
              <SupplierMark launch={l} size={16} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, color: '#b0b8c1' }}>
                Тест №{l.number}
                {l.fromRequestNumber ? <span> · предложен заявкой №{l.fromRequestNumber}</span> : null}
                {l.createdByName ? <span> · {l.createdByName}</span> : null}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#111', margin: '2px 0 4px' }}>
                {l.name || l.productName}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#334155', background: st.bg,
                  border: `1px solid ${st.line}`, padding: '3px 10px', borderRadius: 20 }}>
                  {st.icon} {st.label}
                </span>
                <SupplierPicker launch={l} canEdit={isContentMgr || isDesigner} busy={busy} onSave={save} />
              </div>
            </div>
            <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 10, background: '#f5f5f5',
              border: 'none', fontSize: 17, cursor: 'pointer', flexShrink: 0 }}>✕</button>
          </div>

          {/* Дизайнер забирает карточку прямо с «Контента» */}
          {isDesigner && l.stage === 'content' && (
            <button onClick={() => save({ design: { assignee: 'me' } }, 'take')} disabled={!!busy}
              style={{ width: '100%', padding: '12px', fontSize: 14.5, fontWeight: 700, color: '#fff',
                background: '#7c3aed', border: 'none', borderRadius: 10, cursor: 'pointer', marginBottom: 18 }}>
              {busy === 'take' ? 'Беру…' : '🎨 Беру в работу'}
            </button>
          )}

          {/* Перенос по этапам */}
          {canMove && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
              {prev && (
                <button onClick={() => save({ stage: prev.key }, 'stage')} disabled={!!busy}
                  style={{ flex: '1 1 140px', padding: '11px', fontSize: 13.5, fontWeight: 700, color: '#64748b',
                    background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 10, cursor: 'pointer' }}>
                  ◀ {prev.label}
                </button>
              )}
              {next && (
                <button onClick={() => save({ stage: next.key }, 'stage')} disabled={!!busy}
                  style={{ flex: '1 1 140px', padding: '11px', fontSize: 13.5, fontWeight: 700, color: '#fff',
                    background: next.dot, border: 'none', borderRadius: 10, cursor: 'pointer' }}>
                  {next.label} ▶
                </button>
              )}
              {/* Таргет нужен не каждому товару — можно сразу к отклику */}
              {l.stage === 'published' && isContentMgr && (
                <button onClick={() => save({ stage: 'feedback' }, 'stage')} disabled={!!busy}
                  style={{ flex: '1 1 140px', padding: '11px', fontSize: 13.5, fontWeight: 700, color: '#64748b',
                    background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 10, cursor: 'pointer' }}>
                  Без таргета ▶
                </button>
              )}
            </div>
          )}

          {/* До «Дизайна» карточку каталога привязывать негде, а сверка нужна именно
              здесь: предложение менеджера часто про товар, который у нас уже есть */}
          {!reached('design') && (
            <CatalogBlock launch={l} canEdit={isContentMgr} busy={busy} onSave={save} onOrdered={onOrdered} />
          )}

          <ContentBlock launch={l} canEdit={isContentMgr} busy={busy} onSave={save} />
          {reached('design') && (
            <DesignBlock  launch={l} canEdit={isContentMgr || isDesigner} isDesigner={isDesigner}
                          isContentMgr={isContentMgr} busy={busy} onSave={save}
                          onCreateProduct={onCreateProduct} />
          )}
          {(reached('review') || l.review?.note) &&
            <ReviewBlock  launch={l} canEdit={isContentMgr} busy={busy} onSave={save} />}
          {reached('published') && <PublishBlock launch={l} canEdit={isContentMgr || isDesigner} busy={busy} onSave={save} />}
          {reached('target')    && <TargetBlock  launch={l} canEdit={isContentMgr || isAds} busy={busy} onSave={save} />}
          {reached('target')    && <ResultBlock  launch={l} canEdit={isContentMgr || isAds} busy={busy} onSave={save} />}
          {reached('feedback')  && <OutcomeBlock launch={l} canEdit={isContentMgr} busy={busy} onSave={save} onOrdered={onOrdered} />}

          {isContentMgr && (
            <button onClick={onDelete}
              style={{ width: '100%', padding: '12px', fontSize: 14, fontWeight: 700, color: '#c0392b',
                background: '#fdecea', border: 'none', borderRadius: 12, cursor: 'pointer', marginTop: 6 }}>
              🗑 Убрать с доски
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// Сверка с каталогом на ранних этапах: привязать товар и, если он у нас уже есть,
// увести карточку в закуп, не гоняя её через тестовую продажу.
function CatalogBlock({ launch: l, canEdit, busy, onSave, onOrdered }) {
  const [linking, setLinking] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const hint = catalogHint(l);
  const inCat = isInCatalog(l);

  const order = async () => {
    if (!window.confirm(`«${l.productName || l.name}» уже есть в каталоге.\nОтправить в «Заявки на заказ»?`)) return;
    setOrdering(true);
    try { await onOrdered(null); }
    catch (e) { alert(e?.response?.data?.error || 'Не удалось создать заявку'); }
    finally { setOrdering(false); }
  };

  return (
    <Section title="Товар в каталоге" accent={inCat ? '#15803d' : '#64748b'}
      bg={inCat ? '#f0fdf4' : '#f8fafc'} line={inCat ? '#bbf7d0' : '#e2e8f0'}>

      <div style={{ fontSize: 13.5, color: '#334155', marginBottom: 10 }}>
        {inCat
          ? <>Карточка есть: <b>{l.productName}</b>{l.sku ? <span style={{ color: '#94a3b8' }}> · {l.sku}</span> : null}</>
          : l.product
          ? <>Привязана карточка самого теста — <b>{l.productName}</b>{l.sku ? <span style={{ color: '#94a3b8' }}> · {l.sku}</span> : null}
              . В каталоге такого товара ещё нет{hint ? ', но похож на:' : '.'}
              {hint ? <> <b>{hint.name}</b>{hint.sku ? <span style={{ color: '#94a3b8' }}> · {hint.sku}</span> : null}</> : null}</>
          : hint
            ? <>Похоже, это <b>{hint.name}</b>{hint.sku ? <span style={{ color: '#94a3b8' }}> · {hint.sku}</span> : null}
                {hint.exact ? ' (совпал артикул)' : ' (совпало название)'} — проверьте и привяжите.</>
            : 'Товара с таким названием в каталоге не нашли — это новинка, ведём через тестовую продажу.'}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {canEdit && hint && (
          <button onClick={() => onSave({ product: hint._id }, 'link')} disabled={!!busy}
            style={{ padding: '8px 14px', fontSize: 13, fontWeight: 700, color: '#fff', background: '#16a34a',
              border: 'none', borderRadius: 9, cursor: 'pointer' }}>
            ✓ Привязать {hint.sku || 'найденный товар'}
          </button>
        )}
        {canEdit && (
          <button onClick={() => setLinking(true)} disabled={!!busy}
            style={{ padding: '8px 14px', fontSize: 13, fontWeight: 700, color: '#334155', background: '#fff',
              border: '1.5px solid #e2e8f0', borderRadius: 9, cursor: 'pointer' }}>
            {inCat ? 'Заменить товар' : 'Выбрать из каталога'}
          </button>
        )}
        {canEdit && inCat && !l.request && (
          <button onClick={order} disabled={!!busy || ordering}
            title="Товар уже наш — тест не нужен, заявка уйдёт закупщику"
            style={{ padding: '8px 14px', fontSize: 13, fontWeight: 700, color: '#fff', background: '#16a34a',
              border: 'none', borderRadius: 9, cursor: 'pointer' }}>
            {ordering ? 'Отправляю…' : '🛒 В заявки на заказ'}
          </button>
        )}
        {l.product && (
          <a href={`/admin/products/${l.product?._id || l.product}`} target="_blank" rel="noreferrer"
            style={{ alignSelf: 'center', fontSize: 12.5, fontWeight: 700, color: '#2563eb', textDecoration: 'none' }}>
            Открыть карточку ↗
          </a>
        )}
      </div>

      {linking && createPortal(
        <ProductPicker
          onClose={() => setLinking(false)}
          onPick={async (p) => { await onSave({ product: p._id }, 'link'); setLinking(false); }}
        />, document.body)}
    </Section>
  );
}

function Section({ title, accent, bg, line, children }) {
  return (
    <div style={{ background: bg, border: `1px solid ${line}`, borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: accent, textTransform: 'uppercase',
        letterSpacing: .4, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

// Три поля от Зайнагуль
function ContentBlock({ launch: l, canEdit, busy, onSave }) {
  const [photos, setPhotos] = useState(l.content?.photos || []);
  const [sourceUrl, setSourceUrl] = useState(l.content?.sourceUrl || '');
  const [description, setDescription] = useState(l.content?.description || '');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setPhotos(l.content?.photos || []);
    setSourceUrl(l.content?.sourceUrl || '');
    setDescription(l.content?.description || '');
  }, [l._id, JSON.stringify(l.content)]);

  const upload = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    setUploading(true);
    for (const f of files) {
      try { const url = await uploadToCloudinary(f); setPhotos(p => [...p, url]); }
      catch (err) { alert(err.message); }
    }
    setUploading(false);
  };

  const dirty = JSON.stringify(photos) !== JSON.stringify(l.content?.photos || [])
    || sourceUrl !== (l.content?.sourceUrl || '')
    || description !== (l.content?.description || '');

  return (
    <Section title="📸 Контент — Зайнагуль" accent="#b3161b" bg="#fef2f2" line="#fecaca">
      {!canEdit && !photos.length && !sourceUrl && !description && (
        <div style={{ fontSize: 13, color: '#9aa5b1' }}>Контент ещё не собран.</div>
      )}

      <div style={labelStyle}>Фото {photos.length > 0 && <span style={{ color: '#94a3b8', fontWeight: 400 }}>({photos.length})</span>}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {photos.map((p, i) => (
          <div key={p + i} style={{ position: 'relative', width: 74, height: 74, borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
            <a href={p} target="_blank" rel="noreferrer">
              <img src={cloudinaryOpt(p, 200)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </a>
            {canEdit && (
              <button onClick={() => setPhotos(list => list.filter((_, j) => j !== i))} title="Убрать"
                style={{ position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: 6, border: 'none',
                  background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 11, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            )}
          </div>
        ))}
        {canEdit && (
          <label style={{ width: 74, height: 74, borderRadius: 10, border: '1.5px dashed #cbd5e1', display: 'flex',
            alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#94a3b8', fontSize: 20, background: '#fff' }}>
            {uploading ? '…' : '＋'}
            <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={upload} />
          </label>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={labelStyle}>Ссылка на источник</div>
        {canEdit ? (
          <input value={sourceUrl} onChange={e => setSourceUrl(e.target.value)}
            placeholder="https://…" style={inputStyle} />
        ) : sourceUrl ? (
          <a href={sourceUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13.5, color: '#2563eb', wordBreak: 'break-all' }}>{sourceUrl}</a>
        ) : <div style={{ fontSize: 13, color: '#9aa5b1' }}>—</div>}
      </div>

      <div style={{ marginBottom: canEdit ? 12 : 0 }}>
        <div style={labelStyle}>Описание</div>
        {canEdit ? (
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4}
            placeholder="Что за товар, чем хорош, для кого…" style={{ ...inputStyle, resize: 'vertical' }} />
        ) : (
          <div style={{ fontSize: 13.5, color: description ? '#334155' : '#9aa5b1', whiteSpace: 'pre-wrap' }}>{description || '—'}</div>
        )}
      </div>

      {canEdit && dirty && (
        <button onClick={() => onSave({ content: { photos, sourceUrl, description } }, 'content')} disabled={!!busy || uploading}
          style={{ width: '100%', padding: '11px', fontSize: 14, fontWeight: 700, color: '#fff',
            background: '#DC1E24', border: 'none', borderRadius: 10, cursor: 'pointer' }}>
          {busy === 'content' ? 'Сохраняю…' : 'Сохранить контент'}
        </button>
      )}

      {l.content?.filledByName && (
        <div style={{ fontSize: 11.5, color: '#9aa5b1', marginTop: 8 }}>
          👤 {l.content.filledByName} · {fmtDay(l.content.filledAt)}
        </div>
      )}
    </Section>
  );
}

function DesignBlock({ launch: l, canEdit, isDesigner, isContentMgr, busy, onSave, onCreateProduct }) {
  const [files, setFiles] = useState(l.design?.files || []);
  const [note, setNote]   = useState(l.design?.note || '');
  const [uploading, setUploading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [adding, setAdding]   = useState(false);
  const [picking, setPicking] = useState(false);
  const [designers, setDesigners] = useState([]);
  const [pick, setPick]       = useState('');

  // Список дизайнеров тянем только когда реально назначают
  useEffect(() => {
    if (!picking || designers.length) return;
    adminGetLaunchDesigners()
      .then(r => setDesigners(r.data.designers || []))
      .catch(() => setDesigners([]));
  }, [picking, designers.length]);

  const assign = async () => {
    if (!pick) return;
    await onSave({ design: { assignee: pick } }, 'assign');
    setPicking(false); setPick('');
  };

  // Дизайнер заводит карточку товара прямо отсюда: имя, фото и описание берутся из теста,
  // остальное (цена, сет, характеристики) дозаполняется в самой карточке.
  const addProduct = async () => {
    setAdding(true);
    try { await onCreateProduct(); }
    catch (e) { alert(e?.response?.data?.error || 'Не удалось создать товар'); }
    finally { setAdding(false); }
  };

  useEffect(() => {
    setFiles(l.design?.files || []);
    setNote(l.design?.note || '');
  }, [l._id, JSON.stringify(l.design)]);

  const upload = async (e) => {
    const list = [...(e.target.files || [])];
    e.target.value = '';
    if (!list.length) return;
    setUploading(true);
    for (const f of list) {
      try { const url = await uploadToCloudinary(f, 'matkasym/product-launch/design'); setFiles(p => [...p, url]); }
      catch (err) { alert(err.message); }
    }
    setUploading(false);
  };

  const dirty = JSON.stringify(files) !== JSON.stringify(l.design?.files || []) || note !== (l.design?.note || '');

  return (
    <Section title="🎨 Дизайн" accent="#7c3aed" bg="#faf5ff" line="#e9d5ff">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: '#5b6572' }}>
          Исполнитель: <b style={{ color: '#111' }}>{l.design?.assigneeName || '—'}</b>
        </span>
        {/* Назначить дизайнера может тот, кто ведёт доску; дизайнер берёт карточку сам */}
        {isContentMgr && !picking && (
          <button onClick={() => setPicking(true)} disabled={!!busy}
            style={{ padding: '6px 12px', fontSize: 12.5, fontWeight: 700, color: '#7c3aed', background: '#fff',
              border: '1.5px solid #e9d5ff', borderRadius: 8, cursor: 'pointer' }}>
            {l.design?.assignee ? 'Сменить' : 'Назначить'}
          </button>
        )}
        {isContentMgr && picking && (
          <>
            <select autoFocus value={pick} onChange={e => setPick(e.target.value)}
              style={{ ...inputStyle, width: 'auto', minWidth: 170, padding: '7px 10px', fontSize: 13, cursor: 'pointer' }}>
              <option value="">{designers.length ? 'Выберите дизайнера…' : 'Загрузка…'}</option>
              {designers.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
            <button onClick={assign} disabled={!!busy || !pick}
              style={{ padding: '7px 12px', fontSize: 12.5, fontWeight: 700, color: '#fff',
                background: pick ? '#7c3aed' : '#cbd5e1', border: 'none', borderRadius: 8,
                cursor: pick ? 'pointer' : 'default' }}>
              Назначить
            </button>
            <button onClick={() => { setPicking(false); setPick(''); }} disabled={!!busy}
              style={{ padding: '7px 10px', fontSize: 12.5, fontWeight: 700, color: '#555',
                background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
              Отмена
            </button>
          </>
        )}
        {isDesigner && (
          <button onClick={() => onSave({ design: { assignee: 'me' } }, 'assign')} disabled={!!busy}
            title="Карточка сразу перейдёт на этап «Дизайн»"
            style={{ padding: '6px 12px', fontSize: 12.5, fontWeight: 700, color: '#7c3aed', background: '#fff',
              border: '1.5px solid #e9d5ff', borderRadius: 8, cursor: 'pointer' }}>
            Беру на себя
          </button>
        )}
        {isContentMgr && l.design?.assignee && (
          <button onClick={() => onSave({ design: { assignee: null } }, 'unassign')} disabled={!!busy}
            style={{ padding: '6px 10px', fontSize: 12.5, fontWeight: 700, color: '#c0392b', background: '#fdecea',
              border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            Убрать
          </button>
        )}
      </div>

      {/* Карточка в каталоге: заводим новую из данных теста или привязываем существующую */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: '#5b6572' }}>
          Карточка в каталоге: <b style={{ color: '#111' }}>{l.productName || 'не заведена'}</b>
          {l.sku ? <span style={{ color: '#94a3b8' }}> · {l.sku}</span> : null}
        </span>
        {canEdit && !l.product && (
          <button onClick={addProduct} disabled={!!busy || adding}
            title="Создать товар в каталоге по названию, фото и описанию из теста"
            style={{ padding: '6px 12px', fontSize: 12.5, fontWeight: 700, color: '#fff', background: '#7c3aed',
              border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            {adding ? 'Добавляю…' : '＋ Добавить товар'}
          </button>
        )}
        {canEdit && (
          <button onClick={() => setLinking(true)} disabled={!!busy || adding}
            style={{ padding: '6px 12px', fontSize: 12.5, fontWeight: 700, color: '#7c3aed', background: '#fff',
              border: '1.5px solid #e9d5ff', borderRadius: 8, cursor: 'pointer' }}>
            {l.product ? 'Заменить' : 'Привязать товар'}
          </button>
        )}
        {l.product && (
          <a href={`/admin/products/${l.product?._id || l.product}`} target="_blank" rel="noreferrer"
            style={{ fontSize: 12.5, fontWeight: 700, color: '#2563eb', textDecoration: 'none' }}>
            Открыть карточку ↗
          </a>
        )}
        {canEdit && l.product && (
          <button onClick={() => onSave({ product: null }, 'unlink')} disabled={!!busy}
            style={{ padding: '6px 10px', fontSize: 12.5, fontWeight: 700, color: '#c0392b', background: '#fdecea',
              border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            Отвязать
          </button>
        )}
      </div>

      {linking && createPortal(
        <ProductPicker
          onClose={() => setLinking(false)}
          onPick={async (p) => { await onSave({ product: p._id }, 'link'); setLinking(false); }}
        />, document.body)}

      <div style={labelStyle}>Готовые макеты</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {files.map((p, i) => (
          <div key={p + i} style={{ position: 'relative', width: 74, height: 74, borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
            <a href={p} target="_blank" rel="noreferrer">
              <img src={cloudinaryOpt(p, 200)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </a>
            {canEdit && (
              <button onClick={() => setFiles(list => list.filter((_, j) => j !== i))} title="Убрать"
                style={{ position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: 6, border: 'none',
                  background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 11, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            )}
          </div>
        ))}
        {canEdit && (
          <label style={{ width: 74, height: 74, borderRadius: 10, border: '1.5px dashed #cbd5e1', display: 'flex',
            alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#94a3b8', fontSize: 20, background: '#fff' }}>
            {uploading ? '…' : '＋'}
            <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={upload} />
          </label>
        )}
        {!canEdit && !files.length && <div style={{ fontSize: 13, color: '#9aa5b1' }}>Макетов пока нет.</div>}
      </div>

      <div style={{ marginBottom: canEdit ? 12 : 0 }}>
        <div style={labelStyle}>Заметка дизайнера</div>
        {canEdit ? (
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
            placeholder="Что сделано, что уточнить…" style={{ ...inputStyle, resize: 'vertical' }} />
        ) : (
          <div style={{ fontSize: 13.5, color: note ? '#334155' : '#9aa5b1', whiteSpace: 'pre-wrap' }}>{note || '—'}</div>
        )}
      </div>

      {canEdit && dirty && (
        <button onClick={() => onSave({ design: { files, note } }, 'design')} disabled={!!busy || uploading}
          style={{ width: '100%', padding: '11px', fontSize: 14, fontWeight: 700, color: '#fff',
            background: '#7c3aed', border: 'none', borderRadius: 10, cursor: 'pointer' }}>
          {busy === 'design' ? 'Сохраняю…' : 'Сохранить дизайн'}
        </button>
      )}

      {l.design?.doneByName && (
        <div style={{ fontSize: 11.5, color: '#9aa5b1', marginTop: 8 }}>
          ✅ Передал в публикацию: {l.design.doneByName} · {fmtDay(l.design.doneAt)}
        </div>
      )}
    </Section>
  );
}

// Согласование: две кнопки — «Доработать» (с замечаниями, карточка едет обратно
// к дизайнеру, ему уходит Telegram) и «Утвердить» (следующий этап).
function ReviewBlock({ launch: l, canEdit, busy, onSave }) {
  const [rework, setRework] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => { setRework(false); setNote(''); }, [l._id, l.stage]);

  const onReview = l.stage === 'review';
  const approved = !!l.review?.approvedByName;

  const sendRework = async () => {
    if (!note.trim()) { alert('Напишите, что нужно поправить'); return; }
    await onSave({ review: { note }, stage: 'design' }, 'rework');
  };

  return (
    <Section title="👀 Согласование дизайна" accent="#0e7490" bg="#ecfeff" line="#a5f3fc">
      {approved && (
        <div style={{ fontSize: 13, color: '#5b6572', marginBottom: 10 }}>
          ✅ Утвердил: <b style={{ color: '#111' }}>{l.review.approvedByName}</b> · {fmtDay(l.review.approvedAt)}
        </div>
      )}

      {/* Замечания с прошлого круга — их видит и дизайнер, когда карточка вернулась к нему */}
      {l.review?.note && !rework && (
        <div style={{ fontSize: 13.5, color: '#334155', background: '#fff', border: '1px solid #a5f3fc',
          borderRadius: 10, padding: 12, marginBottom: 12, whiteSpace: 'pre-wrap' }}>
          💬 {l.review.note}
        </div>
      )}

      {onReview && canEdit && !rework && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setRework(true)} disabled={!!busy}
            style={{ flex: '1 1 150px', padding: '12px', fontSize: 14, fontWeight: 700, color: '#b45309',
              background: '#fff', border: '1.5px solid #fde68a', borderRadius: 10, cursor: 'pointer' }}>
            ↩️ Доработать
          </button>
          <button onClick={() => onSave({ stage: 'published' }, 'approve')} disabled={!!busy}
            style={{ flex: '1 1 150px', padding: '12px', fontSize: 14, fontWeight: 700, color: '#fff',
              background: '#0891b2', border: 'none', borderRadius: 10, cursor: 'pointer' }}>
            {busy === 'approve' ? 'Утверждаю…' : '✓ Утвердить'}
          </button>
        </div>
      )}

      {onReview && canEdit && rework && (
        <>
          <div style={labelStyle}>Что поправить</div>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} autoFocus
            placeholder="Например: логотип мелкий, поменять фон…"
            style={{ ...inputStyle, resize: 'vertical', marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => { setRework(false); setNote(''); }} disabled={!!busy}
              style={{ flex: '0 0 auto', padding: '12px 16px', fontSize: 14, fontWeight: 600, color: '#555',
                background: '#f1f5f9', border: 'none', borderRadius: 10, cursor: 'pointer' }}>
              Отмена
            </button>
            <button onClick={sendRework} disabled={!!busy}
              style={{ flex: 1, padding: '12px', fontSize: 14, fontWeight: 700, color: '#fff',
                background: '#b45309', border: 'none', borderRadius: 10, cursor: 'pointer' }}>
              {busy === 'rework' ? 'Отправляю…' : 'Сохранить и вернуть дизайнеру'}
            </button>
          </div>
        </>
      )}

      {onReview && !canEdit && (
        <div style={{ fontSize: 12.5, color: '#0e7490' }}>Макеты ждут решения согласующего.</div>
      )}
    </Section>
  );
}

function PublishBlock({ launch: l, canEdit, busy, onSave }) {
  const [links, setLinks] = useState(l.publish?.links?.length ? l.publish.links : []);
  const [note, setNote]   = useState(l.publish?.note || '');
  const [date, setDate]   = useState(l.publish?.publishedAt ? l.publish.publishedAt.slice(0, 10) : '');

  useEffect(() => {
    setLinks(l.publish?.links || []);
    setNote(l.publish?.note || '');
    setDate(l.publish?.publishedAt ? String(l.publish.publishedAt).slice(0, 10) : '');
  }, [l._id, JSON.stringify(l.publish)]);

  const dirty = JSON.stringify(links) !== JSON.stringify(l.publish?.links || [])
    || note !== (l.publish?.note || '')
    || date !== (l.publish?.publishedAt ? String(l.publish.publishedAt).slice(0, 10) : '');

  return (
    <Section title="📣 Публикация" accent="#1d4ed8" bg="#eff6ff" line="#bfdbfe">
      <div style={{ marginBottom: 12 }}>
        <div style={labelStyle}>Дата выхода поста</div>
        {canEdit ? (
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
        ) : (
          <div style={{ fontSize: 13.5, color: '#334155' }}>{fmtDay(l.publish?.publishedAt) || '—'}</div>
        )}
      </div>

      <div style={labelStyle}>Ссылки на посты</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        {links.map((link, i) => (
          <div key={i} style={{ display: 'flex', gap: 6 }}>
            {canEdit ? (
              <>
                <input value={link.platform} placeholder="Telegram / Instagram"
                  onChange={e => setLinks(list => list.map((x, j) => j === i ? { ...x, platform: e.target.value } : x))}
                  style={{ ...inputStyle, flex: '0 0 42%' }} />
                <input value={link.url} placeholder="https://…"
                  onChange={e => setLinks(list => list.map((x, j) => j === i ? { ...x, url: e.target.value } : x))}
                  style={{ ...inputStyle, flex: 1 }} />
                <button onClick={() => setLinks(list => list.filter((_, j) => j !== i))}
                  style={{ flexShrink: 0, width: 34, borderRadius: 8, border: 'none', background: '#fdecea',
                    color: '#c0392b', fontSize: 14, cursor: 'pointer' }}>✕</button>
              </>
            ) : (
              <a href={link.url} target="_blank" rel="noreferrer" style={{ fontSize: 13.5, color: '#2563eb', wordBreak: 'break-all' }}>
                {link.platform ? `${link.platform}: ` : ''}{link.url}
              </a>
            )}
          </div>
        ))}
        {canEdit && (
          <button onClick={() => setLinks(list => [...list, { platform: '', url: '' }])}
            style={{ padding: '9px', borderRadius: 9, border: '1.5px dashed #bfdbfe', background: '#fff',
              color: '#1d4ed8', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            ＋ Ссылка
          </button>
        )}
        {!canEdit && !links.length && <div style={{ fontSize: 13, color: '#9aa5b1' }}>Ссылок нет.</div>}
      </div>

      <div style={{ marginBottom: canEdit ? 12 : 0 }}>
        <div style={labelStyle}>Заметка</div>
        {canEdit ? (
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Где и как вышел пост" style={inputStyle} />
        ) : (
          <div style={{ fontSize: 13.5, color: note ? '#334155' : '#9aa5b1' }}>{note || '—'}</div>
        )}
      </div>

      {canEdit && dirty && (
        <button onClick={() => onSave({ publish: { links, note, publishedAt: date || null } }, 'publish')} disabled={!!busy}
          style={{ width: '100%', padding: '11px', fontSize: 14, fontWeight: 700, color: '#fff',
            background: '#2563eb', border: 'none', borderRadius: 10, cursor: 'pointer' }}>
          {busy === 'publish' ? 'Сохраняю…' : 'Сохранить публикацию'}
        </button>
      )}
    </Section>
  );
}

// Таргет: задача Байэлу. Заметка видна ему в Telegram, если заполнить её до перевода.
function TargetBlock({ launch: l, canEdit, busy, onSave }) {
  const [note, setNote] = useState(l.target?.note || '');
  useEffect(() => { setNote(l.target?.note || ''); }, [l._id, JSON.stringify(l.target)]);

  const dirty = note !== (l.target?.note || '');

  return (
    <Section title="🎯 Таргет" accent="#c2410c" bg="#fff7ed" line="#fed7aa">
      {l.stage === 'target' && (
        <div style={{ fontSize: 12.5, color: '#9a3412', marginBottom: 10 }}>
          Задача ушла Байэлу в Telegram. Он открутит рекламу и заполнит результат ниже.
        </div>
      )}
      {l.target?.startedAt && (
        <div style={{ fontSize: 13, color: '#5b6572', marginBottom: 10 }}>
          Отправлен в таргет: <b style={{ color: '#111' }}>{fmtDay(l.target.startedAt)}</b>
          {l.target?.byName ? ` · ${l.target.byName}` : ''}
        </div>
      )}
      <div style={{ marginBottom: canEdit ? 12 : 0 }}>
        <div style={labelStyle}>Заметка по рекламе</div>
        {canEdit ? (
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
            placeholder="Бюджет, аудитория, что крутили…" style={{ ...inputStyle, resize: 'vertical' }} />
        ) : (
          <div style={{ fontSize: 13.5, color: note ? '#334155' : '#9aa5b1', whiteSpace: 'pre-wrap' }}>{note || '—'}</div>
        )}
      </div>
      {canEdit && dirty && (
        <button onClick={() => onSave({ target: { note } }, 'target')} disabled={!!busy}
          style={{ width: '100%', padding: '11px', fontSize: 14, fontWeight: 700, color: '#fff',
            background: '#ea580c', border: 'none', borderRadius: 10, cursor: 'pointer' }}>
          {busy === 'target' ? 'Сохраняю…' : 'Сохранить заметку'}
        </button>
      )}
    </Section>
  );
}

// Результат по дням: карточка на каждый день, «＋» добавляет следующий
function ResultBlock({ launch: l, canEdit, busy, onSave }) {
  const rows = l.results || [];
  const today = new Date().toISOString().slice(0, 10);
  const [drafts, setDrafts] = useState([]);   // новые дни, ещё не сохранённые
  const [note, setNote] = useState(l.result?.note || '');

  useEffect(() => { setNote(l.result?.note || ''); }, [l._id, l.result?.note]);
  // Сохранённый день перестаёт быть черновиком
  useEffect(() => {
    setDrafts(ds => ds.filter(d => !rows.some(r => String(r.date).slice(0, 10) === d.date)));
  }, [JSON.stringify(rows.map(r => r.date))]);

  const usedDates = new Set([...rows.map(r => String(r.date).slice(0, 10)), ...drafts.map(d => d.date)]);
  const freeDate = () => {
    const d = new Date();
    for (let i = 0; i < 60; i++) {
      const iso = new Date(d.getTime() - i * 86400000).toISOString().slice(0, 10);
      if (!usedDates.has(iso)) return iso;
    }
    return today;
  };

  const addDraft = () => setDrafts(ds => [...ds, { key: Date.now(), date: freeDate() }]);
  const dirtyNote = note !== (l.result?.note || '');

  return (
    <Section title="📊 Результат поста" accent="#15803d" bg="#f0fdf4" line="#bbf7d0">
      {rows.length === 0 && drafts.length === 0 && (
        <div style={{ fontSize: 13, color: '#9aa5b1', marginBottom: 12 }}>
          {canEdit ? 'Замеров пока нет — добавьте первый день.' : 'Замеров пока нет.'}
        </div>
      )}

      {rows.map(r => (
        <DayCard key={String(r.date)} row={r} canEdit={canEdit} busy={busy} onSave={onSave} />
      ))}

      {drafts.map(d => (
        <DayCard key={d.key} draftDate={d.date} canEdit={canEdit} busy={busy} onSave={onSave}
          onCancel={() => setDrafts(ds => ds.filter(x => x.key !== d.key))} />
      ))}

      {canEdit && (
        <button onClick={addDraft} disabled={!!busy}
          style={{ width: '100%', padding: '11px', fontSize: 14, fontWeight: 700, color: '#15803d',
            background: '#fff', border: '1.5px dashed #86efac', borderRadius: 10, cursor: 'pointer',
            marginBottom: 14 }}>
          ＋ Ещё день
        </button>
      )}

      <div style={{ marginBottom: canEdit ? 12 : 0 }}>
        <div style={labelStyle}>Общий вывод</div>
        {canEdit ? (
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
            placeholder="Что спрашивали, брать ли партию…" style={{ ...inputStyle, resize: 'vertical' }} />
        ) : (
          <div style={{ fontSize: 13.5, color: note ? '#334155' : '#9aa5b1', whiteSpace: 'pre-wrap' }}>{note || '—'}</div>
        )}
      </div>

      {canEdit && dirtyNote && (
        <button onClick={() => onSave({ result: { note } }, 'result')} disabled={!!busy}
          style={{ width: '100%', padding: '11px', fontSize: 14, fontWeight: 700, color: '#fff',
            background: '#15803d', border: 'none', borderRadius: 10, cursor: 'pointer' }}>
          {busy === 'result' ? 'Сохраняю…' : 'Сохранить вывод'}
        </button>
      )}

      {l.result?.updatedByName && (
        <div style={{ fontSize: 11.5, color: '#9aa5b1', marginTop: 8 }}>
          👤 {l.result.updatedByName} · {fmtDay(l.result.updatedAt)}
        </div>
      )}
    </Section>
  );
}

// Один день: дата, три показателя, заметка
function DayCard({ row, draftDate, canEdit, busy, onSave, onCancel }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(row ? String(row.date).slice(0, 10) : draftDate || today);
  const [vals, setVals] = useState(() => Object.fromEntries(DAY_FIELDS.map(m => [m.key, row?.[m.key] ?? ''])));
  const [note, setNote] = useState(row?.note || '');

  useEffect(() => {
    if (!row) return;
    setDate(String(row.date).slice(0, 10));
    setVals(Object.fromEntries(DAY_FIELDS.map(m => [m.key, row[m.key] ?? ''])));
    setNote(row.note || '');
  }, [JSON.stringify(row)]);

  const dirty = !row
    || date !== String(row.date).slice(0, 10)
    || note !== (row.note || '')
    || DAY_FIELDS.some(m => String(vals[m.key] ?? '') !== String(row[m.key] ?? ''));

  const save = () => {
    if (!date) { alert('Выберите дату'); return; }
    if (DAY_FIELDS.every(m => String(vals[m.key] ?? '') === '') && !note.trim()) {
      alert('Заполните хотя бы одно поле');
      return;
    }
    onSave({ dayResult: { date, ...vals, note } }, 'day');
  };

  const remove = () => {
    if (!window.confirm(`Удалить результат за ${fmtDay(row.date)}?`)) return;
    onSave({ removeResultDate: String(row.date).slice(0, 10) }, 'day');
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #bbf7d0', borderRadius: 12, padding: 12, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#374151' }}>Результат за день</span>
        {canEdit ? (
          <input type="date" value={date} max={today} onChange={e => setDate(e.target.value)}
            style={{ ...inputStyle, width: 'auto', padding: '7px 10px', fontSize: 13 }} />
        ) : (
          <b style={{ fontSize: 13 }}>{fmtDay(date)}</b>
        )}
        <span style={{ flex: 1 }} />
        {canEdit && row && (
          <button onClick={remove} disabled={!!busy} title="Удалить день"
            style={{ width: 26, height: 26, borderRadius: 8, border: 'none', background: '#fdecea',
              color: '#c0392b', fontSize: 13, cursor: 'pointer' }}>✕</button>
        )}
        {canEdit && !row && onCancel && (
          <button onClick={onCancel} disabled={!!busy} title="Убрать"
            style={{ width: 26, height: 26, borderRadius: 8, border: 'none', background: '#f1f5f9',
              color: '#64748b', fontSize: 13, cursor: 'pointer' }}>✕</button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 10 }}>
        {METRICS.map(m => (
          <div key={m.key}>
            <div style={{ ...labelStyle, fontSize: 11.5 }}>{m.icon} {m.label}</div>
            {canEdit ? (
              <input inputMode="numeric" value={vals[m.key] ?? ''}
                onChange={e => setVals(v => ({ ...v, [m.key]: e.target.value.replace(/[^\d]/g, '') }))}
                placeholder="—" style={{ ...inputStyle, textAlign: 'center', fontSize: 17, fontWeight: 800, padding: '8px' }} />
            ) : (
              <div style={{ textAlign: 'center', fontSize: 18, fontWeight: 800, color: '#111',
                background: '#f8fafc', borderRadius: 10, padding: '8px' }}>{num(row?.[m.key])}</div>
            )}
          </div>
        ))}
      </div>

      {/* Обратились в Битрикс, и что из этого вышло */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ ...labelStyle, fontSize: 11.5, marginBottom: 0, flex: '1 1 120px' }}>{BITRIX.icon} {BITRIX.label}</div>
          {canEdit ? (
            <input inputMode="numeric" value={vals[BITRIX.key] ?? ''}
              onChange={e => setVals(v => ({ ...v, [BITRIX.key]: e.target.value.replace(/[^\d]/g, '') }))}
              placeholder="—" style={{ ...inputStyle, width: 90, textAlign: 'center', fontSize: 17, fontWeight: 800, padding: '7px' }} />
          ) : (
            <div style={{ width: 90, textAlign: 'center', fontSize: 17, fontWeight: 800, color: '#111',
              background: '#fff', borderRadius: 10, padding: '7px' }}>{num(row?.[BITRIX.key])}</div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10,
          marginTop: 10, paddingLeft: 12, borderLeft: '2px solid #e2e8f0' }}>
          {BITRIX_OUTCOME.map(m => (
            <div key={m.key}>
              <div style={{ ...labelStyle, fontSize: 11.5 }}>{m.icon} {m.label}</div>
              {canEdit ? (
                <input inputMode="numeric" value={vals[m.key] ?? ''}
                  onChange={e => setVals(v => ({ ...v, [m.key]: e.target.value.replace(/[^\d]/g, '') }))}
                  placeholder="—" style={{ ...inputStyle, textAlign: 'center', fontSize: 16, fontWeight: 800, padding: '7px' }} />
              ) : (
                <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 800, color: '#111',
                  background: '#fff', borderRadius: 10, padding: '7px' }}>{num(row?.[m.key])}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {canEdit ? (
        <input value={note} onChange={e => setNote(e.target.value)}
          placeholder="Заметка за день (необязательно)" style={{ ...inputStyle, marginBottom: dirty ? 10 : 0 }} />
      ) : note ? (
        <div style={{ fontSize: 12.5, color: '#64748b' }}>💬 {note}</div>
      ) : null}

      {canEdit && dirty && (
        <button onClick={save} disabled={!!busy}
          style={{ width: '100%', padding: '11px', fontSize: 14, fontWeight: 700, color: '#fff',
            background: '#22c55e', border: 'none', borderRadius: 10, cursor: 'pointer' }}>
          {busy === 'day' ? 'Сохраняю…' : `Сохранить за ${fmtDay(date)}`}
        </button>
      )}

      {row?.byName && !dirty && (
        <div style={{ fontSize: 11, color: '#9aa5b1', marginTop: 8 }}>👤 {row.byName}</div>
      )}
    </div>
  );
}

// ── Итог теста: заказываем партию или закрываем без спроса ───────────────────
function OutcomeBlock({ launch: l, canEdit, busy, onSave, onOrdered }) {
  const [qty, setQty] = useState('');
  const [sending, setSending] = useState(false);

  const order = async () => {
    if (!window.confirm('Создать заявку на заказ первой партии? Карточка теста закроется.')) return;
    setSending(true);
    try { await onOrdered(qty ? Number(qty) : undefined); }
    catch (e) { alert(e?.response?.data?.error || 'Не удалось создать заявку'); }
    finally { setSending(false); }
  };

  if (l.outcome === 'ordered') {
    return (
      <Section title="✅ Итог теста" accent="#b45309" bg="#fffbeb" line="#fde68a">
        <div style={{ fontSize: 13.5, color: '#334155' }}>
          Спрос подтвердился — создана заявка на заказ
          {l.request?.number ? <b> №{l.request.number}</b> : null}. Дальше она идёт по вкладке «Заявки на заказ».
        </div>
      </Section>
    );
  }

  if (l.outcome === 'rejected') {
    return (
      <Section title="✖️ Итог теста" accent="#64748b" bg="#f8fafc" line="#e2e8f0">
        <div style={{ fontSize: 13.5, color: '#334155' }}>Спроса не нашлось — товар не заказываем.</div>
        {canEdit && (
          <button onClick={() => onSave({ outcome: '', stage: 'feedback' }, 'outcome')} disabled={!!busy}
            style={{ marginTop: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, color: '#475569',
              background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 9, cursor: 'pointer' }}>
            Вернуть в работу
          </button>
        )}
      </Section>
    );
  }

  if (!canEdit) return null;

  return (
    <Section title="🛒 Есть спрос — заказываем партию" accent="#b45309" bg="#fffbeb" line="#fde68a">
      <div style={{ fontSize: 12.5, color: '#92400e', marginBottom: 10 }}>
        Заявка уйдёт во вкладку «Заявки на заказ» с фото, названием и числом заявок от клиентов.
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 150px' }}>
          <div style={labelStyle}>Сколько заказываем, шт</div>
          <input inputMode="numeric" value={qty} onChange={e => setQty(e.target.value.replace(/[^\d]/g, ''))}
            placeholder="необязательно" style={inputStyle} />
        </div>
        <button onClick={order} disabled={sending || !!busy}
          style={{ flex: '1 1 200px', padding: '12px', fontSize: 14.5, fontWeight: 700, color: '#fff',
            background: sending ? '#cbd5e1' : '#b45309', border: 'none', borderRadius: 10, cursor: 'pointer' }}>
          {sending ? 'Создаю…' : '📥 Создать заявку на заказ'}
        </button>
      </div>
      <button onClick={() => onSave({ outcome: 'rejected', stage: 'done' }, 'outcome')} disabled={!!busy}
        style={{ width: '100%', marginTop: 10, padding: '10px', fontSize: 13.5, fontWeight: 700, color: '#64748b',
          background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10, cursor: 'pointer' }}>
        ✖️ Спроса нет — не берём
      </button>
    </Section>
  );
}

// ── Новый товар на тест: то, что Зайнагуль нашла в интернете ─────────────────
// mode: 'content' — контент-менеджер заводит товар на тест;
//       'proposed' — менеджер предлагает товар, карточка уходит на рассмотрение.
function NewLaunchForm({ onClose, onCreate, mode = 'content' }) {
  const proposing = mode === 'proposed';
  const [name, setName] = useState('');
  const [photos, setPhotos] = useState([]);
  const [sourceUrl, setSourceUrl] = useState('');
  const [description, setDescription] = useState('');
  const [ikea, setIkea] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const upload = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    setUploading(true);
    for (const f of files) {
      try { const url = await uploadToCloudinary(f); setPhotos(p => [...p, url]); }
      catch (err) { setError(err.message); }
    }
    setUploading(false);
  };

  const submit = async () => {
    if (!name.trim()) return setError('Укажите название товара');
    setSaving(true); setError('');
    try { await onCreate({ name, photos, sourceUrl, description, supplier: ikea ? 'IKEA' : '' }); }
    catch (e) { setError(e?.response?.data?.error || 'Не удалось создать'); setSaving(false); }
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1700 }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 1701, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 20, pointerEvents: 'none' }}>
        <div style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 540, maxHeight: '92vh',
          overflow: 'auto', padding: 22, pointerEvents: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>
              {proposing ? '💡 Предложить товар'
                : mode === 'content' ? '🧪 Новый товар на тест'
                : `${ST[mode]?.icon || ''} Новый товар — этап «${ST[mode]?.label || mode}»`}
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 9, background: '#f5f5f5',
              border: 'none', fontSize: 16, cursor: 'pointer' }}>✕</button>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={labelStyle}>Название товара <span style={{ color: '#DC1E24' }}>*</span></div>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="Например: Складной табурет" style={inputStyle} />
          </div>

          <div style={labelStyle}>Фото {photos.length > 0 && <span style={{ color: '#94a3b8', fontWeight: 400 }}>({photos.length})</span>}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {photos.map((p, i) => (
              <div key={p + i} style={{ position: 'relative', width: 74, height: 74, borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                <img src={cloudinaryOpt(p, 200)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button onClick={() => setPhotos(list => list.filter((_, j) => j !== i))} title="Убрать"
                  style={{ position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: 6, border: 'none',
                    background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 11, cursor: 'pointer', lineHeight: 1 }}>✕</button>
              </div>
            ))}
            <label style={{ width: 74, height: 74, borderRadius: 10, border: '1.5px dashed #cbd5e1', display: 'flex',
              alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#94a3b8', fontSize: 20 }}>
              {uploading ? '…' : '＋'}
              <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={upload} />
            </label>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={labelStyle}>Ссылка на источник</div>
            <input value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="https://…" style={inputStyle} />
          </div>

          {/* Товары IKEA закупаются отдельно — отметка сразу видна на доске логотипом */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={ikea} onChange={e => setIkea(e.target.checked)}
              style={{ width: 17, height: 17, accentColor: '#0058A3', cursor: 'pointer' }} />
            <img src="/logos/ikea.svg" alt="" style={{ height: 14, borderRadius: 2, opacity: ikea ? 1 : 0.5 }} />
            <span style={{ fontSize: 13.5, fontWeight: 600, color: ikea ? '#0058A3' : '#64748b' }}>Товар из IKEA</span>
          </label>

          <div style={{ marginBottom: 16 }}>
            <div style={labelStyle}>{proposing ? 'Почему стоит попробовать' : 'Описание'}</div>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4}
              placeholder={proposing ? 'Кто спрашивает, как часто, за сколько готовы брать…' : 'Что за товар, чем хорош, для кого…'}
              style={{ ...inputStyle, resize: 'vertical' }} />
          </div>

          {error && <div style={{ color: '#c00', fontSize: 13, marginBottom: 12 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose}
              style={{ flex: '0 0 auto', padding: '13px 18px', fontSize: 15, fontWeight: 600, color: '#555',
                background: '#f1f5f9', border: 'none', borderRadius: 12, cursor: 'pointer' }}>Отмена</button>
            <button onClick={submit} disabled={saving || uploading}
              style={{ flex: 1, padding: '13px', fontSize: 15, fontWeight: 700, color: '#fff',
                background: saving ? '#9aa5b1' : (proposing ? '#db2777' : '#DC1E24'), border: 'none', borderRadius: 12, cursor: 'pointer' }}>
              {saving ? 'Отправляю…'
                : proposing ? 'Отправить на рассмотрение'
                : mode === 'content' ? 'На доску теста'
                : `Добавить в «${ST[mode]?.label || mode}»`}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Выбор товара из каталога ─────────────────────────────────────────────────
function ProductPicker({ onClose, onPick }) {
  const [list, setList]   = useState([]);
  const [q, setQ]         = useState('');
  const [loading, setLoad] = useState(true);
  const [testOnly, setTestOnly] = useState(true);

  useEffect(() => {
    adminGetProducts({ limit: 2000, sort: 'newest' })
      .then(r => setList(r.data.products || []))
      .catch(() => setList([]))
      .finally(() => setLoad(false));
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return list.filter(p => {
      if (testOnly && p.productStatus !== 'test_sale') return false;
      if (!s) return true;
      return `${p.fullName || ''} ${p.name || ''} ${p.sku || ''}`.toLowerCase().includes(s);
    }).slice(0, 200);
  }, [list, q, testOnly]);

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1700 }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 1701, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 20, pointerEvents: 'none' }}>
        <div style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 540, maxHeight: '90vh',
          overflow: 'auto', padding: 20, pointerEvents: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>🚀 Товар на доску запуска</div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 9, background: '#f5f5f5',
              border: 'none', fontSize: 16, cursor: 'pointer' }}>✕</button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {[[true, '🧪 Только тестовые'], [false, 'Все товары']].map(([v, label]) => (
              <div key={String(v)} onClick={() => setTestOnly(v)} style={{
                flex: 1, textAlign: 'center', padding: '8px 10px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', border: `1.5px solid ${testOnly === v ? '#DC1E24' : '#e2e8f0'}`,
                background: testOnly === v ? '#fef2f2' : '#fff', color: testOnly === v ? '#b3161b' : '#475569',
              }}>{label}</div>
            ))}
          </div>

          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск по названию или артикулу…"
            style={{ ...inputStyle, marginBottom: 10 }} />

          {loading ? (
            <div style={{ color: '#aaa', textAlign: 'center', padding: 30 }}>Загрузка каталога…</div>
          ) : filtered.length === 0 ? (
            <div style={{ color: '#bbb', textAlign: 'center', padding: 30, fontSize: 14 }}>Ничего не найдено</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map(p => (
                <div key={p._id} onClick={() => onPick(p)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 8, borderRadius: 10,
                    border: '1px solid #eceff3', cursor: 'pointer' }}
                  onMouseOver={e => e.currentTarget.style.borderColor = '#DC1E24'}
                  onMouseOut={e => e.currentTarget.style.borderColor = '#eceff3'}>
                  <img src={cloudinaryOpt(p.images?.[0] || NO_PHOTO, 100)} alt="" loading="lazy"
                    onError={e => { e.target.src = NO_PHOTO; }}
                    style={{ width: 46, height: 46, borderRadius: 8, objectFit: 'cover', background: '#f1f5f9', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#111', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.fullName || p.name}</div>
                    <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>
                      {p.sku}{typeof p.stock === 'number' ? ` · остаток: ${p.stock}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
