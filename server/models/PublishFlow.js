const mongoose = require('mongoose');

// Схема публикации, собранная на канвасе (как в n8n): узлы «Источник» → «Контент» → площадки.
// Хранится ровно в том виде, в котором её рисует reactflow, плюс разбор рёбер на бэке:
// площадка участвует в схеме, если её узел соединён с узлом контента.
//
// Схема — это ПРЕСЕТ, а не жёсткое правило: на странице публикации выбранные ею площадки
// можно доснять галочками перед отправкой.
const flowSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  isDefault: { type: Boolean, default: false },

  // reactflow-узлы. data.kind: 'source' | 'content' | 'account'
  // у 'account' — data.accountId, data.postType ('feed'|'story'), data.delayMinutes, data.captionTemplate
  nodes: { type: Array, default: [] },
  edges: { type: Array, default: [] },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Площадки, реально подключённые в схеме: узлы-аккаунты, до которых есть ребро от контента.
// Отдаёт [{ accountId, postType, delayMinutes, captionTemplate }].
flowSchema.methods.targets = function () {
  const nodes = this.nodes || [];
  const edges = this.edges || [];
  const content = nodes.find(n => n?.data?.kind === 'content');
  if (!content) return [];

  const connected = new Set(edges.filter(e => e.source === content.id).map(e => e.target));
  return nodes
    .filter(n => n?.data?.kind === 'account' && connected.has(n.id) && n.data.accountId)
    .map(n => ({
      accountId:       String(n.data.accountId),
      postType:        n.data.postType || 'feed',
      delayMinutes:    Number(n.data.delayMinutes) || 0,
      captionTemplate: n.data.captionTemplate || '',
    }));
};

module.exports = mongoose.model('PublishFlow', flowSchema);
