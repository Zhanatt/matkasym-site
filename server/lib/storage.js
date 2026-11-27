// Хранилище файлов Cloudflare R2 (S3-совместимое) — замена Cloudinary.
// Публичные ссылки — через свой домен (R2_PUBLIC_URL, например https://media.matkasym.com),
// поэтому ссылка не зависит от хранилища: однажды отданную в цех или в техлист ссылку не придётся менять.
//
// Переменные (Render и server/.env):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL
const { S3Client, PutObjectCommand, CopyObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

const env = () => ({
  account: process.env.R2_ACCOUNT_ID, key: process.env.R2_ACCESS_KEY_ID, secret: process.env.R2_SECRET_ACCESS_KEY,
  bucket: process.env.R2_BUCKET, publicUrl: (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, ''),
});
const isConfigured = () => { const e = env(); return !!(e.account && e.key && e.secret && e.bucket && e.publicUrl); };

let client;
function s3() {
  if (!isConfigured()) throw new Error('Хранилище R2 не настроено (R2_* в переменных окружения)');
  const e = env();
  client ||= new S3Client({
    region: 'auto', endpoint: `https://${e.account}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: e.key, secretAccessKey: e.secret },
  });
  return client;
}

const publicUrl = key => `${env().publicUrl}/${key.split('/').map(encodeURIComponent).join('/')}`;
const isOurUrl = url => !!env().publicUrl && String(url || '').startsWith(env().publicUrl + '/');
const keyFromUrl = url => isOurUrl(url) ? decodeURIComponent(String(url).slice(env().publicUrl.length + 1).split('?')[0]) : null;

// noCache — для файлов, которые заменяются под той же ссылкой (чертежи): браузер и CDN каждый раз сверяются
async function put(key, buffer, contentType, { noCache = false, fileName } = {}) {
  await s3().send(new PutObjectCommand({
    Bucket: env().bucket, Key: key, Body: buffer, ContentType: contentType,
    CacheControl: noCache ? 'no-cache' : 'public, max-age=31536000, immutable',
    ...(fileName ? { ContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(fileName)}` } : {}),
  }));
  return publicUrl(key);
}

async function copy(fromKey, toKey) {
  await s3().send(new CopyObjectCommand({ Bucket: env().bucket, CopySource: `${env().bucket}/${encodeURIComponent(fromKey)}`, Key: toKey }));
  return publicUrl(toKey);
}

// Ссылка для загрузки прямо из браузера (PUT) — большие файлы не идут через сервер:
// на Render всего 512 МБ памяти. Нужен CORS у бакета (PUT с домена сайта).
async function signPut(key, contentType, expiresIn = 3600) {
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  const uploadUrl = await getSignedUrl(s3(), new PutObjectCommand({ Bucket: env().bucket, Key: key, ContentType: contentType }), { expiresIn });
  return { uploadUrl, url: publicUrl(key) };
}

const head = key => s3().send(new HeadObjectCommand({ Bucket: env().bucket, Key: key }));
const remove = key => s3().send(new DeleteObjectCommand({ Bucket: env().bucket, Key: key }));
const exists = key => s3().send(new HeadObjectCommand({ Bucket: env().bucket, Key: key })).then(() => true, () => false);

module.exports = { isConfigured, put, signPut, head, copy, remove, exists, publicUrl, isOurUrl, keyFromUrl };
