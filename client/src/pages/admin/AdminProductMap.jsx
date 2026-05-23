import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactFlow, {
  Background, Controls, MiniMap,
  useNodesState, useEdgesState, useReactFlow,
  MarkerType, Handle, Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { adminGetProducts } from '../../api/index';
import { CATEGORIES } from '../../config/categorySpecs';
import { cloudinaryOpt } from '../../utils/drive';

const categoryLabel = (value) =>
  CATEGORIES.find(c => c.value === value)?.label || value || '—';

/* ── Custom node components ─────────────────────────── */

function BrandNode({ data }) {
  return (
    <div style={{
      background: '#111', color: '#fff',
      borderRadius: 10, padding: '12px 20px',
      fontWeight: 800, fontSize: 13, letterSpacing: .5,
      minWidth: 160, textAlign: 'center',
      boxShadow: '0 2px 12px rgba(0,0,0,.2)',
      userSelect: 'none',
    }}>
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 5 }}>Бренд</div>
      {data.label}
      <Handle type="source" position={Position.Right} style={{ background: '#444', width: 8, height: 8, border: 'none' }} />
    </div>
  );
}

function SetNode({ data }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 8,
      borderLeft: `3px solid ${data.color}`,
      border: `1px solid #eee`,
      borderLeftWidth: 3,
      borderLeftColor: data.color,
      padding: '9px 14px',
      minWidth: 140,
      boxShadow: '0 1px 6px rgba(0,0,0,.06)',
      userSelect: 'none',
      opacity: data.allPlanned ? 0.4 : 1,
      transition: 'opacity .2s',
    }}>
      <Handle type="target" position={Position.Left} style={{ background: data.color, width: 7, height: 7, border: 'none' }} />
      <div style={{ fontSize: 9, color: data.color, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 3 }}>Сет</div>
      <div style={{ fontWeight: 800, fontSize: 12, color: '#111', letterSpacing: .3 }}>{data.label}</div>
      <div style={{ fontSize: 10, color: '#bbb', marginTop: 2 }}>
        {data.count} {data.count === 1 ? 'модель' : data.count < 5 ? 'модели' : 'моделей'}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: data.color, width: 7, height: 7, border: 'none' }} />
    </div>
  );
}

function ProductNode({ data, selected }) {
  const navigate = useNavigate();
  const isPlanned = data.productStatus === 'planned' || data.productStatus === 'discontinued';
  const hasVariants = data.hasVariants;

  return (
    <div
      onClick={() => data.onClick?.()}
      style={{
        background: '#fff',
        borderRadius: 8,
        border: selected ? '1.5px solid #111' : '1px solid #ebebeb',
        padding: '9px 12px',
        display: 'flex', alignItems: 'center', gap: 10,
        minWidth: 210, maxWidth: 250,
        cursor: 'pointer',
        boxShadow: selected ? '0 4px 20px rgba(0,0,0,.12)' : '0 1px 5px rgba(0,0,0,.05)',
        userSelect: 'none',
        opacity: isPlanned ? 0.4 : 1,
        transition: 'box-shadow .2s, opacity .2s',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: '#ddd', width: 7, height: 7, border: 'none' }} />
      {hasVariants && (
        <Handle type="source" position={Position.Right} style={{ background: '#ddd', width: 7, height: 7, border: 'none' }} />
      )}

      <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 6, overflow: 'hidden', background: '#f5f5f5' }}>
        {data.img
          ? <img src={data.img} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 2 }} />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: '#ccc' }}>□</div>
        }
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: '#111', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {data.name}
        </div>
        <div style={{ fontSize: 10, color: '#bbb', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {categoryLabel(data.category)}
        </div>
        {data.productStatus && data.productStatus !== 'ready' && (
          <div style={{
            display: 'inline-block', fontSize: 9, fontWeight: 700, marginTop: 4,
            padding: '1px 6px', borderRadius: 4,
            background: data.productStatus === 'planned' ? '#eef2ff' : '#fff8e6',
            color: data.productStatus === 'planned' ? '#3b5bdb' : '#c47a00',
          }}>
            {data.productStatus === 'planned' ? 'В плане' : 'На улучшении'}
          </div>
        )}
      </div>
    </div>
  );
}

function ColorNode({ data }) {
  const { setNodes } = useReactFlow();
  const swatch = COLOR_SWATCHES[data.color?.toLowerCase()] || '#bbb';
  const isLight = ['white', 'grey', 'gray', 'silver', 'beige'].includes(data.color?.toLowerCase());

  const handleClick = () => {
    if (data.productNodeId && data.img) {
      setNodes(nodes => nodes.map(n =>
        n.id === data.productNodeId
          ? { ...n, data: { ...n.data, img: data.img } }
          : n
      ));
    }
  };

  return (
    <div
      onClick={handleClick}
      title={data.color || ''}
      style={{
        width: 30, height: 30,
        borderRadius: '50%',
        background: swatch,
        border: isLight ? '1.5px solid #d0d0d0' : '1.5px solid rgba(0,0,0,.08)',
        boxShadow: '0 2px 8px rgba(0,0,0,.12)',
        cursor: 'pointer',
        transition: 'transform .15s, box-shadow .15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.15)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,.2)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,.12)'; }}
    >
      <Handle type="target" position={Position.Left} style={{ background: 'transparent', border: 'none', width: 6, height: 6 }} />
    </div>
  );
}

const nodeTypes = { brand: BrandNode, set: SetNode, product: ProductNode, color: ColorNode };

/* ── Color swatches ─────────────────────────────────── */
const COLOR_SWATCHES = {
  white:  '#f0f0f0',
  black:  '#222',
  grey:   '#999',
  gray:   '#999',
  brown:  '#8B6914',
  red:    '#e10523',
  blue:   '#1a6fb5',
  green:  '#2d7a3a',
  gold:   '#c8a500',
  silver: '#aaa',
};

/* ── Set colors ──────────────────────────────────────── */
const SET_COLORS = [
  '#e10523','#2d7a3a','#1a6fb5','#7b3fa0','#c47a00',
  '#0d7377','#b55a00','#5a6e00','#00607a','#a0003e',
  '#3d3d9e','#006b4f',
];

const COLOR_SUFFIX_RE = /\s*\((бел[ыьа][йяе]?|чёрн[ыьа][йяе]?|сер[ыьа][йяе]?|коричнев[ыьа][йяе]?|бежев[ыьа][йяе]?|красн[ыьа][йяе]?|синий|синяя|зелён[ыьа][йяе]?|золот[ыьа][йяе]?|серебрист[ыьа][йяе]?|white|black|grey|gray|brown|beige|red|blue|green|gold|silver)\)\s*$/i;
function cleanName(name = '') {
  return name.replace(COLOR_SUFFIX_RE, '').replace(/__.*$/, '').trim();
}

/* ── Layout builder ─────────────────────────────────── */
function buildGraph(products, navigate) {
  const nodes = [];
  const edges = [];

  // Group: brand → set → products
  const brandMap = {};
  products.forEach(p => {
    const b = p.brand || 'matkasym-home';
    const s = p.set || '__none__';
    if (!brandMap[b]) brandMap[b] = {};
    if (!brandMap[b][s]) brandMap[b][s] = [];
    brandMap[b][s].push(p);
  });

  const BRAND_X   = 0;
  const SET_X     = 260;
  const PROD_X    = 500;
  const COLOR_X   = 790;
  const COLOR_SIZE = 30;
  const COLOR_GAP  = 38;
  const PROD_H    = 64;
  const SET_GAP   = 24;
  const BRAND_GAP = 60;

  let globalY = 0;
  let colorIdx = 0;

  Object.entries(brandMap).forEach(([brand, sets]) => {
    const brandStartY = globalY;
    const brandId = `brand__${brand}`;

    Object.entries(sets).forEach(([setKey, prods]) => {
      const setStartY = globalY;
      const setId = `set__${brand}__${setKey}`;
      const color = SET_COLORS[colorIdx % SET_COLORS.length];
      colorIdx++;

      // Group variants by cleanName + category
      const nameGroups = {};
      prods.forEach(p => {
        const key = `${cleanName(p.name)}__${p.category || ''}`;
        if (!nameGroups[key]) nameGroups[key] = [];
        nameGroups[key].push(p);
      });

      Object.entries(nameGroups).forEach(([name, variants]) => {
        const primary = variants[0];
        const pid = `prod__${setKey}__${name.replace(/\s+/g, '_')}`;
        const allVariantsPlanned = variants.every(v => (v.productStatus || 'ready') === 'planned');
        const anyImprovement = variants.some(v => v.productStatus === 'improvement');
        const status = allVariantsPlanned ? 'planned' : anyImprovement ? 'improvement' : 'ready';
        const multiColor = variants.length > 1;

        // Group height: enough space for color nodes if multiple variants
        const groupH = multiColor
          ? Math.max(PROD_H, variants.length * COLOR_GAP + 8)
          : PROD_H;

        const groupCenterY = globalY + groupH / 2;
        const prodY = groupCenterY - 30; // center 60px card

        nodes.push({
          id: pid, type: 'product',
          position: { x: PROD_X, y: prodY },
          data: {
            name: cleanName(primary.name),
            category: primary.category || '',
            price: primary.price || 0,
            img: cloudinaryOpt(primary.images?.[0] || '', 80),
            productStatus: status,
            hasVariants: multiColor,
            onClick: () => navigate(`/admin/products/${primary._id}`),
          },
        });
        edges.push({
          id: `e__${setId}__${pid}`,
          source: setId, target: pid,
          type: 'smoothstep',
          style: { stroke: color, strokeWidth: 1.5, opacity: .5 },
          markerEnd: { type: MarkerType.Arrow, color },
        });

        // Color variant nodes branching to the right
        if (multiColor) {
          const totalH = (variants.length - 1) * COLOR_GAP;
          const colorStartY = groupCenterY - totalH / 2 - COLOR_SIZE / 2;

          variants.forEach((v, i) => {
            const cid = `color__${v._id}`;
            nodes.push({
              id: cid, type: 'color',
              position: { x: COLOR_X, y: colorStartY + i * COLOR_GAP },
              data: { color: v.color, id: v._id, img: cloudinaryOpt(v.images?.[0] || '', 80), productNodeId: pid },
            });
            edges.push({
              id: `e__${pid}__${cid}`,
              source: pid, target: cid,
              type: 'smoothstep',
              style: { stroke: '#e0e0e0', strokeWidth: 1.5 },
            });
          });
        }

        globalY += groupH + 8;
      });

      const setMidY = (setStartY + globalY) / 2 - 36;
      const SET_LABELS_RU = {
        'nelikvid':       'Неликвид',
        'samples':        'Образцы',
        'small-batch':    'Малая партия',
        'misc':           'Разное',
        'equipment':      'Оборудование',
        'other':          'Прочее',
        'achyk-asman':    'Ачык Асман',
        'den-sooluk':     'Ден Соолук',
        'zhashyl-ömür':   'Жашыл Өмүр',
        'kosh-keliniz':   'Кош Келиңиз',
        'sanarip-tv':     'Санарип ТВ',
        'taza-kiym':      'Таза Кийим',
        'jenil-ashkana':  'Жеңил Ашкана',
        'onoi-sakta':     'Оңой Сакта',
        'baary-oorunda':  'Баары Ордунда',
        'bilim-kelechek': 'Билим Келечек',
        'uzak-koldon':    'Узак Колдон',
        'bekem-fasad':    'Бекем Фасад',
        '0-tashtandy':    '0-Таштанды',
        'konok-keldi':    'Конок Келди',
        'korkom-aiym':    'Коркөм Айым',
        'shirin-balalyk': 'Ширин Балалык',
        'uydo-ishtoo':    'Үйдө Иштөө',
        'mazza-seiyl':    'Мазза Сейил',
        'kooz-koopsuzduk':'Көз Коопсуздук',
        'dayar-tütük':    'Даяр Түтүк',
        'önügüü-set':     'Өнүгүү Сет',
      };
      const setLabel = setKey === '__none__' ? 'Без сета'
        : (SET_LABELS_RU[setKey] || setKey);
      const allPlanned = prods.length > 0 && prods.every(p => (p.productStatus || 'ready') === 'planned');
      const uniqueCount = Object.keys(nameGroups).length;
      nodes.push({
        id: setId, type: 'set',
        position: { x: SET_X, y: setMidY },
        data: { label: setLabel, count: uniqueCount, color, allPlanned },
      });
      edges.push({
        id: `e__${brandId}__${setId}`,
        source: brandId, target: setId,
        type: 'smoothstep',
        style: { stroke: color, strokeWidth: 2 },
        markerEnd: { type: MarkerType.Arrow, color },
      });
      globalY += SET_GAP;
    });

    const brandMidY = (brandStartY + globalY) / 2 - 30;
    const brandLabel = brand === 'matkasym-home' ? 'MATKASYM HOME' : brand.toUpperCase().replace(/-/g, ' ');
    nodes.push({
      id: brandId, type: 'brand',
      position: { x: BRAND_X, y: brandMidY },
      data: { label: brandLabel },
    });
    globalY += BRAND_GAP;
  });

  return { nodes, edges };
}

const formatBrandLabel = (b) =>
  b === 'matkasym-home' ? 'MATKASYM HOME' : b.toUpperCase().replace(/-/g, ' ');

/* ── Main component ─────────────────────────────────── */
export default function AdminProductMap() {
  const navigate = useNavigate();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);
  const [allProducts, setAllProducts] = useState([]);
  const [brands, setBrands] = useState([]);
  const [selectedBrand, setSelectedBrand] = useState(null);

  useEffect(() => {
    adminGetProducts({ limit: 500 }).then(r => {
      const products = r.data.products || r.data;
      setAllProducts(products);
      const uniqueBrands = [...new Set(products.map(p => p.brand || 'matkasym-home'))];
      setBrands(uniqueBrands);
      setSelectedBrand(uniqueBrands[0] || null);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedBrand || allProducts.length === 0) return;
    const filtered = allProducts.filter(p => (p.brand || 'matkasym-home') === selectedBrand);
    const { nodes: n, edges: e } = buildGraph(filtered, navigate);
    setNodes(n);
    setEdges(e);
  }, [selectedBrand, allProducts]);

  if (loading) return <div className="admin-empty">Строим карту...</div>;

  const filteredCount = allProducts.filter(p => (p.brand || 'matkasym-home') === selectedBrand).length;

  return (
    <div>
      <div className="admin-page-header" style={{ marginBottom: 12 }}>
        <div>
          <h1 className="admin-page-title">Product Map</h1>
          <p style={{ color: 'var(--slate)', fontSize: 13, margin: '2px 0 0' }}>
            {filteredCount} товаров · Scroll для зума · Drag для перемещения · Click на товар — открыть
          </p>
        </div>
      </div>

      {/* Brand tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {brands.map(b => (
          <button
            key={b}
            onClick={() => setSelectedBrand(b)}
            style={{
              padding: '7px 18px',
              borderRadius: 8,
              border: '1.5px solid',
              borderColor: selectedBrand === b ? '#111' : '#e0e0e0',
              background: selectedBrand === b ? '#111' : '#fff',
              color: selectedBrand === b ? '#fff' : '#444',
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: .5,
              cursor: 'pointer',
              transition: 'all .15s',
            }}
          >
            {formatBrandLabel(b)}
          </button>
        ))}
      </div>

      <div style={{ height: 'calc(100vh - 190px)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--gray-200)', background: '#fafafa' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.05}
          maxZoom={2}
          defaultEdgeOptions={{ animated: false }}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#e8e8e8" gap={24} />
          <Controls />
          <MiniMap
            nodeColor={n => {
              if (n.type === 'brand') return '#000';
              if (n.type === 'set') return n.data.color || '#888';
              return '#e8e8e8';
            }}
            style={{ background: '#fff', border: '1px solid #e8e8e8' }}
          />
        </ReactFlow>
      </div>
    </div>
  );
}
