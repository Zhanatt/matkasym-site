// Знания о проекте для Claude дизайнеров («Правки сайта»): копия заметок из Obsidian
// («Память Claude») в docs/knowledge/. Берём ТОЛЬКО заметки о самом сайте (решение владельца 23.11.2026) —
// в хранилище есть личное (финансы, пароли, свадьбы, переписка), оно сюда не попадает.
// Почты и id из базы вырезаются.
//
//   node scripts/sync-knowledge.js            — обновить docs/knowledge/
//   OBSIDIAN_MEMORY=/путь node scripts/...    — другая папка заметок
//
// Добавил новую заметку про сайт — допиши её в NOTES и запусти скрипт, потом коммит.
const fs = require('fs');
const path = require('path');

const SRC = process.env.OBSIDIAN_MEMORY ||
  path.join(process.env.HOME, 'Library/Mobile Documents/iCloud~md~obsidian/Documents/Zhanar/Память Claude');
const OUT = path.join(__dirname, '..', '..', 'docs', 'knowledge');

// файл → раздел в оглавлении
const NOTES = {
  'project_matkasym_site': 'Сайт: стек, структура, модели, роли',
  'project_matkasym_site_changes': 'Раздел «Правки сайта»',
  'project_matkasym_catalog_pdf': 'PDF-каталоги сайта',
  'feedback_kit_types': 'Комплекты на сайте: зависимые и независимые',
  'feedback_kit_errors': 'Комплекты на сайте: типичные ошибки',
  'feedback_modal_positioning': 'Модальные окна',
  'feedback_showcase_price_base': 'Цена витрины по бренду',
  'Грабли': 'Грабли сайта: ошибки, которые уже совершали',
};
// Из «Граблей» — только разделы про сайт (остальное — печать на маке, внешние источники и т.п.)
const GRABLI_SECTIONS = /^## (Каталог, карточки, комплекты|Интерфейс|PDF из headless Chrome|Каталог с сайта)/;


const clean = text => text
  .replace(/^---\n[\s\S]*?\n---\n/, m => {               // frontmatter: оставить name/description
    const keep = m.split('\n').filter(l => /^(---|name:|description:)/.test(l));
    return keep.join('\n') + '\n';
  })
  .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<почта>')
  .replace(/\b[0-9a-f]{24}\b/g, '<id>')
  .replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (_, name, __, label) => label || name);

if (!fs.existsSync(SRC)) { console.error('Нет папки заметок:', SRC); process.exit(1); }
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const index = [];
for (const [file, title] of Object.entries(NOTES)) {
  const src = path.join(SRC, `${file}.md`);
  if (!fs.existsSync(src)) { console.log('  нет:', file); continue; }
  let text = fs.readFileSync(src, 'utf8');
  if (file === 'Грабли') {
    const parts = text.split(/^(?=## )/m);
    text = parts[0].replace(/\n# Грабли[\s\S]*$/, '\n# Грабли сайта\n') + parts.slice(1).filter(p => GRABLI_SECTIONS.test(p)).join('');
  }
  fs.writeFileSync(path.join(OUT, `${file}.md`), clean(text));
  index.push(`- [${title}](${file}.md)`);
}

fs.writeFileSync(path.join(OUT, 'README.md'), `# Знания о проекте MATKASYM

Копия рабочих заметок владельца о сайте (из Obsidian, обновляется скриптом
\`server/scripts/sync-knowledge.js\`). Перед правкой прочитай то, что относится к задаче:
здесь договорённости, устройство данных и ошибки, которые уже совершали.
Не редактируй эти файлы — они перезаписываются.

${index.join('\n')}

Обновлено: ${new Date().toISOString().slice(0, 10)}
`);
console.log(`✓ docs/knowledge: ${index.length} заметок`);
