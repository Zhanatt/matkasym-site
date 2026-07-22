import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactFlow, {
  Background, Controls, MiniMap, addEdge,
  useNodesState, useEdgesState, Handle, Position, MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { socialGetAccounts, socialGetFlows, socialCreateFlow, socialUpdateFlow, socialDeleteFlow } from '../../api';
import { POST_TYPES, platformMeta } from '../../config/socialPlatforms';

// Схема — это картинка потока публикации: «Источник → Контент → площадки».
// Площадка участвует, только если её узел соединён линией с узлом «Контент»:
// отсоединил — она выпала из схемы, но подключение к аккаунту осталось.

/* ── Узлы ─────────────────────────────────────────── */

function SourceNode({ data }) {
  return (
    <div style={{
      background: '#111', color: '#fff', borderRadius: 12, padding: '14px 22px',
      fontWeight: 800, fontSize: 13, minWidth: 170, textAlign: 'center', userSelect: 'none',
      boxShadow: '0 2px 12px rgba(0,0,0,.2)',
    }}>
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,.45)', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 5 }}>Источник</div>
      📦 {data.label || 'Товар или пост'}
      <Handle type="source" position={Position.Bottom} style={{ background: '#555', width: 9, height: 9, border: 'none' }} />
    </div>
  );
}

function ContentNode({ data }) {
  return (
    <div style={{
      background: '#fff', border: '2px solid #111', borderRadius: 12, padding: '14px 22px',
      minWidth: 200, textAlign: 'center', userSelect: 'none', boxShadow: '0 2px 12px rgba(0,0,0,.08)',
    }}>
      <Handle type="target" position={Position.Top} style={{ background: '#555', width: 9, height: 9, border: 'none' }} />
      <div style={{ fontSize: 9, color: '#aaa', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 5 }}>Контент</div>
      <div style={{ fontWeight: 800, fontSize: 13 }}>✍️ Текст и фото</div>
      <div style={{ fontSize: 11, color: '#8b98a5', marginTop: 3 }}>{data.hint || 'общий для всех площадок'}</div>
      <Handle type="source" position={Position.Bottom} style={{ background: '#555', width: 9, height: 9, border: 'none' }} />
    </div>
  );
}

function AccountNode({ data, selected }) {
  const meta = platformMeta(data.platform);
  const connected = data.connected;
  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: '12px 16px', minWidth: 180,
      border: `2px solid ${selected ? '#111' : connected ? meta.color : '#e0e0e0'}`,
      opacity: connected ? 1 : .5, userSelect: 'none',
      boxShadow: connected ? `0 2px 12px ${meta.color}22` : 'none',
    }}>
      <Handle type="target" position={Position.Top} style={{ background: meta.color, width: 9, height: 9, border: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18 }}>{meta.icon}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.title}</div>
          <div style={{ fontSize: 10, color: meta.color, fontWeight: 700, letterSpacing: .3 }}>
            {meta.label}
            {data.platform === 'instagram' && ` · ${POST_TYPES[data.postType]?.label || 'Пост'}`}
            {data.delayMinutes > 0 && ` · +${data.delayMinutes} мин`}
          </div>
        </div>
      </div>
      {data.captionTemplate ? (
        <div style={{ fontSize: 10, color: '#8b98a5', marginTop: 6 }}>✍️ свой шаблон</div>
      ) : null}
    </div>
  );
}

const nodeTypes = { source: SourceNode, content: ContentNode, account: AccountNode };

/* ── Сборка канваса ───────────────────────────────── */

// Строит узлы: каркас (источник + контент) всегда есть, дальше по узлу на каждую площадку.
// Сохранённая схема задаёт позиции и настройки; новые площадки просто добавляются справа
// неподключёнными — так подключение аккаунта не ломает уже нарисованные схемы.
function buildNodes(accounts, flow) {
  const saved = Object.fromEntries((flow?.nodes || []).map(n => [n.id, n]));

  const nodes = [
    { id: 'source',  type: 'source',  position: saved.source?.position  || { x: 260, y: 0 },
      data: { kind: 'source',  label: saved.source?.data?.label } },
    { id: 'content', type: 'content', position: saved.content?.position || { x: 245, y: 140 },
      data: { kind: 'content' } },
  ];

  accounts.forEach((a, i) => {
    const id = `acc-${a._id}`;
    const s  = saved[id];
    nodes.push({
      id,
      type: 'account',
      position: s?.position || { x: 40 + (i % 4) * 210, y: 320 + Math.floor(i / 4) * 130 },
      data: {
        kind: 'account',
        accountId: a._id,
        title: a.title,
        platform: a.platform,
        postType: s?.data?.postType || (a.postTypes?.[0] || 'feed'),
        delayMinutes: s?.data?.delayMinutes || 0,
        captionTemplate: s?.data?.captionTemplate || '',
        connected: false, // проставляется ниже по рёбрам
      },
    });
  });

  return nodes;
}

const EDGE_STYLE = {
  animated: true,
  style: { stroke: '#111', strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#111' },
};

// Рёбра из сохранённой схемы + обязательное «источник → контент».
function buildEdges(flow, nodeIds) {
  const saved = (flow?.edges || []).filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
  const has = saved.some(e => e.source === 'source' && e.target === 'content');
  const base = has ? [] : [{ id: 'e-source-content', source: 'source', target: 'content' }];
  return [...base, ...saved].map(e => ({ ...e, ...EDGE_STYLE }));
}

export default function AdminPublishFlow() {
  const navigate = useNavigate();

  const [accounts, setAccounts] = useState([]);
  const [flows,    setFlows]    = useState([]);
  const [flowId,   setFlowId]   = useState('');
  const [name,     setName]     = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(true);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Загружает площадки и схемы, открывает схему по умолчанию (или новую).
  useEffect(() => {
    Promise.all([socialGetAccounts(), socialGetFlows()])
      .then(([ar, fr]) => {
        const accs  = ar.data.accounts || [];
        const list  = fr.data.flows || [];
        setAccounts(accs);
        setFlows(list);
        const initial = list.find(f => f.isDefault) || list[0] || null;
        openFlow(initial, accs);
      })
      .catch(e => setError(e.response?.data?.message || 'Не удалось загрузить данные'))
      .finally(() => setLoading(false));
  }, []);

  const openFlow = (flow, accs = accounts) => {
    const built = buildNodes(accs, flow);
    const ids   = new Set(built.map(n => n.id));
    const e     = buildEdges(flow, ids);
    const connected = new Set(e.filter(x => x.source === 'content').map(x => x.target));
    setNodes(built.map(n => n.data.kind === 'account'
      ? { ...n, data: { ...n.data, connected: connected.has(n.id) } } : n));
    setEdges(e);
    setFlowId(flow?._id || '');
    setName(flow?.name || 'Новая схема');
    setIsDefault(!!flow?.isDefault);
    setSelectedId(null);
    setSaved(false);
  };

  // Признак «подключена» на узлах держим в синхроне с рёбрами — от него зависит и вид узла,
  // и то, какие площадки схема отдаст форме публикации.
  const syncConnected = useCallback((nextEdges) => {
    const connected = new Set(nextEdges.filter(e => e.source === 'content').map(e => e.target));
    setNodes(ns => ns.map(n => n.data?.kind === 'account'
      ? { ...n, data: { ...n.data, connected: connected.has(n.id) } } : n));
  }, [setNodes]);

  const onConnect = useCallback((params) => {
    setEdges(eds => {
      const next = addEdge({ ...params, ...EDGE_STYLE }, eds);
      syncConnected(next);
      return next;
    });
    setSaved(false);
  }, [setEdges, syncConnected]);

  const onEdgesDelete = useCallback((deleted) => {
    setEdges(eds => {
      const next = eds.filter(e => !deleted.some(d => d.id === e.id));
      syncConnected(next);
      return next;
    });
  }, [setEdges, syncConnected]);

  // Клик по узлу площадки — подключить/отключить одним движением (линию можно тянуть и вручную).
  const toggleAccount = (nodeId) => {
    setEdges(eds => {
      const exists = eds.find(e => e.source === 'content' && e.target === nodeId);
      const next = exists
        ? eds.filter(e => e !== exists)
        : [...eds, { id: `e-content-${nodeId}`, source: 'content', target: nodeId, ...EDGE_STYLE }];
      syncConnected(next);
      return next;
    });
    setSaved(false);
  };

  const selected = useMemo(() => nodes.find(n => n.id === selectedId), [nodes, selectedId]);

  const patchSelected = (patch) => {
    setNodes(ns => ns.map(n => n.id === selectedId ? { ...n, data: { ...n.data, ...patch } } : n));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true); setError('');
    // connected — производная от рёбер, в базе её хранить незачем.
    const payload = {
      name,
      isDefault,
      nodes: nodes.map(({ id, type, position, data }) => ({
        id, type, position, data: { ...data, connected: undefined },
      })),
      edges: edges.map(({ id, source, target }) => ({ id, source, target })),
    };
    try {
      const r = flowId ? await socialUpdateFlow(flowId, payload) : await socialCreateFlow(payload);
      const flow = r.data.flow;
      setFlowId(flow._id);
      const list = (await socialGetFlows()).data.flows || [];
      setFlows(list);
      setSaved(true);
    } catch (e) {
      setError(e.response?.data?.message || 'Ошибка сохранения схемы');
    }
    setSaving(false);
  };

  const removeFlow = async () => {
    if (!flowId || !confirm(`Удалить схему «${name}»?`)) return;
    await socialDeleteFlow(flowId);
    const list = (await socialGetFlows()).data.flows || [];
    setFlows(list);
    openFlow(list[0] || null);
  };

  const connectedAccounts = nodes.filter(n => n.data?.kind === 'account' && n.data.connected);

  return (
    <div style={{ padding: '24px 0 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/admin/publish')} style={{
          background: 'none', border: '1.5px solid #e0e0e0', borderRadius: 8,
          padding: '6px 14px', fontSize: 13, cursor: 'pointer', color: '#555', fontWeight: 600,
        }}>← К публикации</button>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>🧩 Схема публикации</h1>

        <select value={flowId} onChange={e => openFlow(flows.find(f => f._id === e.target.value) || null)}
          style={{ padding: '7px 12px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 13, marginLeft: 'auto' }}>
          {!flowId && <option value="">Новая схема</option>}
          {flows.map(f => <option key={f._id} value={f._id}>{f.name}{f.isDefault ? ' ★' : ''}</option>)}
        </select>
        <button onClick={() => openFlow(null)} style={{
          padding: '7px 14px', borderRadius: 8, border: '1.5px solid #e0e0e0',
          background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#555',
        }}>+ Новая</button>
      </div>

      {error && <div style={{ fontSize: 13, color: '#c0392b', background: '#fdf0ef', padding: '10px 14px', borderRadius: 8, marginBottom: 14 }}>{error}</div>}

      {!loading && !accounts.length && (
        <div style={{ fontSize: 13, color: '#8a6d00', background: '#fff8e1', border: '1px solid #ffe08a', padding: '12px 16px', borderRadius: 10, marginBottom: 14 }}>
          Нет ни одной подключённой площадки. <a href="/admin/publish/accounts" style={{ color: '#8a6d00', fontWeight: 700 }}>Подключить →</a>
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Канвас */}
        <div style={{
          flex: '1 1 560px', minWidth: 300, height: 560, background: '#fafbfc',
          borderRadius: 14, border: '1px solid #e8eaed', overflow: 'hidden',
        }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onEdgesDelete={onEdgesDelete}
            onConnect={onConnect}
            onNodeClick={(_, n) => {
              setSelectedId(n.id);
              if (n.data?.kind === 'account') toggleAccount(n.id);
            }}
            nodeTypes={nodeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={18} color="#e3e6ea" />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable style={{ background: '#fff' }} />
          </ReactFlow>
        </div>

        {/* Панель настроек */}
        <div style={{ flex: '0 1 320px', minWidth: 260 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 1px 6px rgba(0,0,0,.07)', marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#666', display: 'block', marginBottom: 6 }}>Название схемы</label>
            <input value={name} onChange={e => { setName(e.target.value); setSaved(false); }}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #e0e0e0', fontSize: 13, boxSizing: 'border-box', outline: 'none' }} />

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#444', margin: '14px 0' }}>
              <input type="checkbox" checked={isDefault} onChange={e => { setIsDefault(e.target.checked); setSaved(false); }} />
              Схема по умолчанию
            </label>

            <div style={{ fontSize: 12, color: '#8b98a5', lineHeight: 1.6, marginBottom: 14 }}>
              Подключено площадок: <b style={{ color: '#111' }}>{connectedAccounts.length}</b>
              {connectedAccounts.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  {connectedAccounts.map(n => (
                    <div key={n.id}>{platformMeta(n.data.platform).icon} {n.data.title}</div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={save} disabled={saving} style={{
                flex: 1, padding: '10px', borderRadius: 9, border: 'none',
                background: saved ? '#1e7c3a' : '#111', color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: saving ? 'wait' : 'pointer',
              }}>{saving ? 'Сохранение...' : saved ? '✓ Сохранено' : 'Сохранить схему'}</button>
              {flowId && (
                <button onClick={removeFlow} style={{
                  padding: '10px 14px', borderRadius: 9, border: '1.5px solid #e0e0e0',
                  background: '#fff', color: '#c0392b', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}>Удалить</button>
              )}
            </div>
          </div>

          {/* Настройки выбранного узла */}
          {selected?.data?.kind === 'account' ? (
            <NodeSettings node={selected} accounts={accounts} onChange={patchSelected} />
          ) : (
            <div style={{ background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 1px 6px rgba(0,0,0,.07)', fontSize: 12, color: '#8b98a5', lineHeight: 1.7 }}>
              <b style={{ color: '#111', fontSize: 13, display: 'block', marginBottom: 8 }}>Как это работает</b>
              Клик по площадке — подключить или отключить её в схеме.<br />
              Линию можно и протянуть вручную от нижней точки «Контента».<br />
              Выбранная площадка открывает свои настройки здесь: вид поста, задержка, свой текст.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NodeSettings({ node, accounts, onChange }) {
  const meta    = platformMeta(node.data.platform);
  const account = accounts.find(a => a._id === node.data.accountId);
  const allowed = account?.postTypes?.length ? account.postTypes : ['feed'];
  const L = { fontSize: 12, fontWeight: 700, color: '#666', display: 'block', marginBottom: 6 };

  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 1px 6px rgba(0,0,0,.07)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 18 }}>{meta.icon}</span>
        <b style={{ fontSize: 14 }}>{node.data.title}</b>
      </div>

      {node.data.platform === 'instagram' && (
        <div style={{ marginBottom: 16 }}>
          <label style={L}>Вид поста</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {allowed.map(t => (
              <button key={t} onClick={() => onChange({ postType: t })} style={{
                flex: 1, padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: node.data.postType === t ? `2px solid ${meta.color}` : '1.5px solid #e0e0e0',
                background: node.data.postType === t ? '#fdf0f7' : '#fff', color: '#333',
              }}>{POST_TYPES[t]?.icon} {POST_TYPES[t]?.label || t}</button>
            ))}
          </div>
        </div>
      )}

      <label style={L}>Задержка, минут <span style={{ color: '#bbb', fontWeight: 400 }}>(0 = сразу)</span></label>
      <input type="number" min={0} value={node.data.delayMinutes || 0}
        onChange={e => onChange({ delayMinutes: Number(e.target.value) || 0 })}
        style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #e0e0e0', fontSize: 13, boxSizing: 'border-box', outline: 'none', marginBottom: 16 }} />

      <label style={L}>Свой текст для этой площадки</label>
      <textarea value={node.data.captionTemplate || ''}
        onChange={e => onChange({ captionTemplate: e.target.value })}
        rows={5}
        placeholder={'Пусто = общий текст.\nПлейсхолдеры: {name} {price} {specs} {sku} {text}'}
        style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #e0e0e0', fontSize: 12, boxSizing: 'border-box', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
    </div>
  );
}
