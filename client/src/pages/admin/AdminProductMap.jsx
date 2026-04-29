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
      background: '#000', color: '#fff',
      borderRadius: 12, padding: '14px 24px',
      fontWeight: 800, fontSize: 15, letterSpacing: 1,
      minWidth: 180, textAlign: 'center',
      boxShadow: '0 4px 20px rgba(0,0,0,.3)',
      userSelect: 'none',
    }}>
      <div style={{ fontSize: 10, color: '#e10523', fontWeight: 700, letterSpacing: 2, marginBottom: 4 }}>БРЕНД</div>
      {data.label}
      <Handle type="source" position={Position.Right} style={{ background: '#e10523' }} />
    </div>
  );
}

function SetNode({ data }) {
  return (
    <div style={{
      background: data.color, color: '#fff',
      borderRadius: 10, padding: '10px 18px',
      fontWeight: 700, fontSize: 13,
      minWidth: 160, textAlign: 'center',
      boxShadow: '0 3px 12px rgba(0,0,0,.15)',
      userSelect: 'none',
      opacity: data.allPlanned ? 0.45 : 1,
      transition: 'opacity .2s',
    }}>
      <Handle type="target" position={Position.Left} style={{ background: 'rgba(255,255,255,.5)' }} />
      <div style={{ fontSize: 9, opacity: .75, fontWeight: 600, letterSpacing: 1.5, marginBottom: 3 }}>СЕТ</div>
      {data.label}
      <div style={{ fontSize: 11, opacity: .8, marginTop: 3 }}>{data.count} товар{data.count === 1 ? '' : data.count < 5 ? 'а' : 'ов'}</div>
      <Handle type="source" position={Position.Right} style={{ background: 'rgba(255,255,255,.5)' }} />
    </div>
  );
}

function ProductNode({ data, selected }) {
  const isPlanned = data.productStatus === 'planned';
  return (
    <div
      onClick={data.onClick}
      style={{
        background: '#fff',
        borderRadius: 8,
        border: selected ? '2px solid #e10523' : '1.5px solid #e8e8e8',
        padding: '8px 10px',
        display: 'flex', alignItems: 'center', gap: 10,
        minWidth: 220, maxWidth: 260,
        cursor: 'pointer',
        boxShadow: selected ? '0 0 0 3px rgba(225,5,35,.15)' : '0 2px 8px rgba(0,0,0,.07)',
        userSelect: 'none',
        opacity: isPlanned ? 0.45 : 1,
        transition: 'box-shadow .15s, opacity .2s',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: '#ccc' }} />
      {data.img ? (
        <img src={data.img} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
      ) : (
        <div style={{ width: 36, height: 36, borderRadius: 6, background: '#f0f0f0', flexShrink: 0 }} />
      )}
      <div style={{ overflow: 'hidden' }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: '#000', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 175 }}>
          {data.name}
        </div>
        <div style={{ fontSize: 11, color: '#7d96a0', marginTop: 2 }}>{categoryLabel(data.category)}</div>
        {data.price > 0 && (
          <div style={{ fontSize: 11, color: '#e10523', fontWeight: 700, marginTop: 1 }}>
            {data.price.toLocaleString()} сом
          </div>
        )}
        {data.productStatus && data.productStatus !== 'ready' && (
          <div style={{
            fontSize: 10, fontWeight: 700, marginTop: 2,
            color: data.productStatus === 'planned' ? '#3b5bdb' : '#c47a00',
          }}>
            {data.productStatus === 'planned' ? '📋 В плане' : '🔧 На улучшении'}
          </div>
        )}
      </div>
    </div>
  );
}

const nodeTypes = { brand: BrandNode, set: SetNode, product: ProductNode };

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

      prods.forEach(p => {
        const pid = `prod__${p._id}`;
        nodes.push({
          id: pid, type: 'product',
          position: { x: PROD_X, y: globalY },
          data: {
            name: p.name,
            category: p.category || '',
            price: p.price || 0,
            img: p.images?.[0] || '',
            productStatus: p.productStatus || 'ready',
            onClick: () => navigate(`/admin/products/${p._id}`),
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
      nodes.push({
        id: setId, type: 'set',
        position: { x: SET_X, y: setMidY },
        data: { label: setLabel, count: prods.length, color, allPlanned },
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
