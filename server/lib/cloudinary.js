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

module.exports = cloudinary;
module.exports.uploadRawBuffer = uploadRawBuffer;
