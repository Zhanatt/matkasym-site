const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Excel-исходник загрузки кладём рядом с логами: из журнала остатков и цен
// можно открыть тот самый файл, по которому проехали изменения.
function uploadRawBuffer(buffer, folder, filename) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'raw', public_id: filename, overwrite: true },
      (err, result) => (err ? reject(err) : resolve(result.secure_url)),
    );
    stream.end(buffer);
  });
}

// public_id из URL доставки. Папку (matkasym/shaar/...) отрезать НЕЛЬЗЯ — она часть
// public_id, без неё destroy молча не находит ассет, а api.resource врёт «нет такого».
function publicIdFromUrl(url) {
  const after = String(url || '').split('/upload/')[1];
  if (!after) return null;
  const parts = after.split('/');
  while (parts.length > 1 && /[,=]/.test(parts[0])) parts.shift();  // блок трансформаций
  if (/^v\d+$/.test(parts[0])) parts.shift();                        // версия
  return parts.join('/').replace(/\.[a-z0-9]+$/i, '') || null;
}

module.exports = cloudinary;
module.exports.uploadRawBuffer  = uploadRawBuffer;
module.exports.publicIdFromUrl  = publicIdFromUrl;
