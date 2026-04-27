// Convert Google Drive file ID to a thumbnail URL (works for publicly shared files)
export const driveThumb = (fileId, size = 500) =>
  fileId ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w${size}` : '';

// Full view URL
export const driveView = (fileId) =>
  fileId ? `https://drive.google.com/file/d/${fileId}/view` : '';

// Cloudinary — add auto format + quality + width transforms to URL
// Input:  https://res.cloudinary.com/cloud/image/upload/v123/file.jpg
// Output: https://res.cloudinary.com/cloud/image/upload/f_auto,q_auto,w_600/v123/file.jpg
export const cloudinaryOpt = (url, width = 600) => {
  if (!url || !url.includes('cloudinary.com')) return url;
  return url.replace('/upload/', `/upload/f_auto,q_auto,w_${width}/`);
};
