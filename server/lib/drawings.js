/**
 * Чертежи PDF в Cloudinary — общая часть для бота (lib/drawingBot.js) и сайта
 * (routes/drawings.js).
 *
 * Файл кладём как raw: картинкой Cloudinary не отдаёт PDF по ссылке без
 * отдельной настройки аккаунта, а raw открывается в браузере как есть.
 *
 * Ссылка постоянная — без номера версии (…/raw/upload/matkasym/drawings/X.pdf).
 * Замена: текущий файл переименовываем в архивное имя (…_v1.pdf), новый кладём
 * под прежним publicId с invalidate — через несколько секунд та же ссылка
 * отдаёт новый файл (проверено 10.11.2026).
 */
const Drawing    = require('../models/Drawing');
const cloudinary = require('./cloudinary');

const FOLDER = 'matkasym/drawings';
const MAX_BYTES = 20 * 1024 * 1024;

// Кириллицу переводим в латиницу: иначе ссылка превращается в %D0%A1%D1%82…
const TR = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',
  ң:'n',о:'o',ө:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ү:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',
  ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
const translit = t => String(t).replace(/[а-яёңөү]/gi, ch => {
  const r = TR[ch.toLowerCase()] ?? '';
  return ch === ch.toLowerCase() ? r : r.charAt(0).toUpperCase() + r.slice(1);
});

// Имя в Cloudinary: исходное + метка времени — одноимённые чертежи не затирают друг друга.
// У raw расширение — часть public_id, без него ссылка была бы без .pdf.
function newPublicId(fileName) {
  const base = translit(String(fileName || 'drawing').replace(/\.pdf$/i, ''))
    .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'drawing';
  const stamp = new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 19).replace(/[-:T]/g, '');
  return `${FOLDER}/${base}_${stamp}.pdf`;
}

function stableUrl(publicId) {
  const cloud = cloudinary.config().cloud_name;
  if (!cloud) throw new Error('CLOUDINARY_CLOUD_NAME не задан');   // иначе в ссылку попадёт «undefined»
  return `https://res.cloudinary.com/${cloud}/raw/upload/${publicId}`;
}

const isPdfBuffer = buf => buf && buf.length > 4 && buf.slice(0, 5).toString() === '%PDF-';

function uploadRaw(buffer, publicId) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { public_id: publicId, resource_type: 'raw', overwrite: true, invalidate: true },
      (err, res) => (err ? reject(err) : resolve(res)),
    ).end(buffer);
  });
}

function checkFile(buffer) {
  if (!isPdfBuffer(buffer)) throw Object.assign(new Error('Это не PDF-файл'), { status: 400 });
  if (buffer.length > MAX_BYTES) throw Object.assign(new Error('Файл больше 20 МБ'), { status: 400 });
}

/** Новый чертёж. fields: title, code, caption, author, source, chatId, user */
async function createDrawing(buffer, fileName, fields) {
  checkFile(buffer);
  const publicId = newPublicId(fileName);
  await uploadRaw(buffer, publicId);
  return Drawing.create({
    ...fields, fileName: fileName || 'drawing.pdf', size: buffer.length,
    publicId, url: stableUrl(publicId), fileUpdatedAt: new Date(),
  });
}

/** Новый файл под той же ссылкой; прежний — в архив версий. */
async function replaceDrawingFile(drawing, buffer, fileName, author) {
  checkFile(buffer);
  const n = (drawing.versions?.length || 0) + 1;
  const archiveId = drawing.publicId.replace(/\.pdf$/i, '') + `_v${n}.pdf`;
  const arch = await cloudinary.uploader.rename(drawing.publicId, archiveId,
    { resource_type: 'raw', overwrite: true, invalidate: true });
  drawing.versions.push({
    url: arch.secure_url, publicId: archiveId, fileName: drawing.fileName, size: drawing.size,
    author: drawing.lastAuthor || drawing.author,
    uploadedAt: drawing.fileUpdatedAt || drawing.createdAt,
  });
  try {
    await uploadRaw(buffer, drawing.publicId);
  } catch (e) {
    // Новый файл не лёг — возвращаем прежний на место, ссылка не должна сломаться
    await cloudinary.uploader.rename(archiveId, drawing.publicId, { resource_type: 'raw', overwrite: true, invalidate: true }).catch(() => {});
    throw e;
  }
  drawing.fileName = fileName || drawing.fileName;
  drawing.size = buffer.length;
  drawing.fileUpdatedAt = new Date();
  drawing.lastAuthor = author;
  await drawing.save();
  return drawing;
}

/** Удаляет чертёж со всеми версиями. Восстановить нельзя — бэкап в Cloudinary выключен. */
async function deleteDrawing(drawing) {
  const ids = [drawing.publicId, ...(drawing.versions || []).map(v => v.publicId)];
  for (const id of ids) {
    const r = await cloudinary.uploader.destroy(id, { resource_type: 'raw', invalidate: true });
    if (r.result !== 'ok' && r.result !== 'not found') throw new Error(`Cloudinary: ${r.result}`);
  }
  await drawing.deleteOne();
}

module.exports = { createDrawing, replaceDrawingFile, deleteDrawing, stableUrl, MAX_BYTES, FOLDER };
