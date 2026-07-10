// Справочники заявок на техлист. Держим в одном месте — используют форма, канбан и карточка.

export const LEGAL_STATUSES = [
  { key: 'individual', label: 'Физическое лицо', short: 'Физ. лицо', needsCompany: false },
  { key: 'ip',         label: 'ИП',              short: 'ИП',        needsCompany: false },
  { key: 'ooo',        label: 'ОсОО',            short: 'ОсОО',      needsCompany: true  },
  { key: 'oao',        label: 'ОАО / ЗАО',       short: 'ОАО',       needsCompany: true  },
  { key: 'gov',        label: 'Гос. организация', short: 'Гос.',     needsCompany: true  },
  { key: 'other',      label: 'Другое юр. лицо', short: 'Юр. лицо',  needsCompany: true  },
];

export const legalStatus = (key) => LEGAL_STATUSES.find(s => s.key === key) || LEGAL_STATUSES[0];
export const needsCompany = (key) => !!LEGAL_STATUSES.find(s => s.key === key)?.needsCompany;

export const SYMBOL_TYPES = [
  { key: 'logo',      label: 'Логотип',   icon: '🏷' },
  { key: 'sticker',   label: 'Наклейка',  icon: '🔖' },
  { key: 'cutout',    label: 'Вырез',     icon: '✂️' },
  { key: 'engraving', label: 'Гравировка', icon: '🖊' },
  { key: 'print',     label: 'Печать',    icon: '🖨' },
  { key: 'other',     label: 'Другое',    icon: '✳️' },
];

export const symbolType = (key) => SYMBOL_TYPES.find(s => s.key === key) || SYMBOL_TYPES[5];

export const PRIORITIES = {
  low:    { label: 'Низкий',   color: '#666',     bg: '#f5f5f5' },
  medium: { label: 'Средний',  color: '#f57c00',  bg: '#fff3e0' },
  high:   { label: 'Высокий',  color: '#d32f2f',  bg: '#ffebee' },
};

export const COLUMNS = [
  { key: 'new',         label: 'Новые',           color: '#1976d2', bg: '#e3f2fd', icon: '📥' },
  { key: 'in_progress', label: 'В работе',        color: '#f57c00', bg: '#fff3e0', icon: '⚡' },
  { key: 'review',      label: 'На согласовании', color: '#9c27b0', bg: '#f3e5f5', icon: '👀' },
  { key: 'done',        label: 'Готово',          color: '#388e3c', bg: '#e8f5e9', icon: '✅' },
];

export const STATUS_LABELS = {
  new:         'Новая',
  in_progress: 'В работе',
  review:      'На согласовании',
  done:        'Готово',
  rejected:    'Отклонена',
};
