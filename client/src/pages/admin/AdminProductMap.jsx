import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactFlow, {
  Background, Controls, MiniMap,
  useNodesState, useEdgesState,
  MarkerType, Handle, Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { adminGetProducts } from '../../api/index';
import { CATEGORIES } from '../../config/categorySpecs';

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
  const [activeIdx, setActiveIdx] = useState(0);
  const isPlanned = data.productStatus === 'planned';

  const variants = data.variants || [];
  const activeVariant = variants[activeIdx] || null;
  const displayImg = activeVariant?.img || data.img;
  const activeId   = activeVariant?.id  || null;

  const handleCardClick = () => {
    if (activeId) navigate(`/admin/products/${activeId}`);
    else data.onClick?.();
  };

  const handleDotClick = (e, idx) => {
    e.stopPropagation();
    setActiveIdx(idx);
  };

  return (
    <div
      onClick={handleCardClick}
      style={{
        background: '#fff',
        borderRadius: 8,
        border: selected ? '1.5px solid #111' : '1px solid #ebebeb',
        padding: '9px 12px',
        display: 'flex', alignItems: 'center', gap: 10,
        minWidth: 210, maxWidth: 250,
        cursor: 'pointer',
        boxShadow: selected
          ? '0 4px 20px rgba(0,0,0,.12)'
          : '0 1px 5px rgba(0,0,0,.05)',
        userSelect: 'none',
        opacity: isPlanned ? 0.4 : 1,
        transition: 'box-shadow .2s, opacity .2s, border-color .2s',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: '#ddd', width: 7, height: 7, border: 'none' }} />

      {/* Image */}
      <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 6, overflow: 'hidden', background: '#f5f5f5' }}>
        {displayImg
          ? <img src={displayImg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'opacity .18s' }} />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: '#ccc' }}>□</div>
        }
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: '#111', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {data.name}
        </div>
        <div style={{ fontSize: 10, color: '#bbb', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {categoryLabel(data.category)}
        </div>

        {/* Color dots */}
        {variants.length > 1 && (
          <div style={{ display: 'flex', gap: 4, marginTop: 5 }}>
            {variants.map((v, idx) => {
              const swatch = COLOR_SWATCHES[v.color?.toLowerCase()] || '#bbb';
              const isActive = idx === activeIdx;
              return (
                <div
                  key={v.id}
                  title={v.color || ''}
                  onClick={e => handleDotClick(e, idx)}
                  style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: swatch,
                    boxShadow: isActive ? `0 0 0 2px #fff, 0 0 0 3.5px ${swatch}` : '0 0 0 1px rgba(0,0,0,.12)',
                    flexShrink: 0, cursor: 'pointer',
                    transition: 'box-shadow .15s, transform .12s',
                    transform: isActive ? 'scale(1.15)' : 'scale(1)',
                  }}
                />
              );
            })}
          </div>
        )}

        {/* Status badge */}
        {data.productStatus && data.productStatus !== 'ready' && (
          <div style={{
            display: 'inline-block',
            fontSize: 9, fontWeight: 700, marginTop: 4,
            padding: '1px 6px', borderRadius: 4,
            background: data.productStatus === 'planned' ? '#eef2ff' : '#fff8e6',
            color: data.productStatus === 'planned' ? '#3b5bdb' : '#c47a00',
            letterSpacing: .3,
          }}>
            {data.productStatus === 'planned' ? 'В плане' : 'На улучшении'}
          </div>
        )}
      </div>
    </div>
  );
}

const nodeTypes = { brand: BrandNode, set: SetNode, product: ProductNode };

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

  const BRAND_X  = 0;
  const SET_X    = 260;
  const PROD_X   = 500;
  const PROD_H   = 60;
  const SET_GAP  = 24;
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

      // Group variants by product name
      const nameGroups = {};
      prods.forEach(p => {
        if (!nameGroups[p.name]) nameGroups[p.name] = [];
        nameGroups[p.name].push(p);
      });

      Object.entries(nameGroups).forEach(([name, variants]) => {
        const primary = variants[0];
        const pid = `prod__${setKey}__${name.replace(/\s+/g, '_')}`;
        const allVariantsPlanned = variants.every(v => (v.productStatus || 'ready') === 'planned');
        const anyImprovement = variants.some(v => v.productStatus === 'improvement');
        const status = allVariantsPlanned ? 'planned' : anyImprovement ? 'improvement' : 'ready';

        nodes.push({
          id: pid, type: 'product',
          position: { x: PROD_X, y: globalY },
          data: {
            name,
            category: primary.category || '',
            price: primary.price || 0,
            img: primary.images?.[0] || '',
            productStatus: status,
            variants: variants.map(v => ({ color: v.color, id: v._id, img: v.images?.[0] || '' })),
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
        globalY += PROD_H;
      });

      const setMidY = (setStartY + globalY) / 2 - 36;
      const setLabel = setKey === '__none__' ? 'Без сета' : setKey.toUpperCase().replace(/-/g, ' ');
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

/* ── Main component ─────────────────────────────────── */
export default function AdminProductMap() {
  const navigate = useNavigate();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    adminGetProducts({ limit: 500 }).then(r => {
      const products = r.data.products || r.data;
      setTotal(products.length);
      const { nodes: n, edges: e } = buildGraph(products, navigate);
      setNodes(n);
      setEdges(e);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="admin-empty">Строим карту...</div>;

  return (
    <div>
      <div className="admin-page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="admin-page-title">Product Map</h1>
          <p style={{ color: 'var(--slate)', fontSize: 13, margin: '2px 0 0' }}>
            {total} товаров · Scroll для зума · Drag для перемещения · Click на товар — открыть
          </p>
        </div>
      </div>

      <div style={{ height: 'calc(100vh - 140px)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--gray-200)', background: '#fafafa' }}>
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
