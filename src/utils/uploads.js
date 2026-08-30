'use strict';

/**
 * File upload service — port of helpers/uploadHelper.js (post-b67533c, with the
 * ASCII filename sanitisation that fixed the latin1 3988 error). Local-disk or
 * S3 depending on SAVE_TO_LOCAL, one sanitised basename for both disk path and
 * stored URL.
 */

const fs = require('fs');
const path = require('path');

const MAX_BASENAME = 120;

const sanitizeFilename = (filename) => {
  const clean = (part) =>
    part
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^A-Za-z0-9._-]/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '');

  const base = path.basename(String(filename));
  const rawExt = path.extname(base);
  const ext = rawExt ? `.${clean(rawExt.slice(1)).slice(0, 10)}` : '';
  const stem = (clean(base.slice(0, base.length - rawExt.length)) || 'file').slice(0, MAX_BASENAME - ext.length);
  const safe = `${stem}${ext}`;
  return /^\.+$/.test(safe) ? 'file' : safe;
};

const contentTypeFor = (filename) => {
  const ext = String(filename).split('.').pop().toLowerCase();
  if (ext.includes('jpg') || ext.includes('jpeg')) return 'image/jpeg';
  if (ext.includes('svg')) return 'image/svg+xml';
  if (ext.includes('bmp')) return 'image/bmp';
  if (ext.includes('pdf')) return 'application/pdf';
  return 'image/png';
};

const bucketConfig = () => ({
  bucketName: process.env.BUCKET_NAME,
  dirName: process.env.BUCKET_PHOTO_DIR,
  region: process.env.BUCKET_REGION,
  accessKeyId: process.env.BUCKET_ACCESS_KEY,
  secretAccessKey: process.env.BUCKET_SECRET_KEY,
  documentDir: process.env.BUCKET_DOCUMENT_DIR,
  figuresDir: process.env.BUCKET_FIGURES_DIR,
});

const uploadFile = (fileData, directory, filename, contentType = 'application/octet-stream') =>
  new Promise((resolve, reject) => {
    const safeName = sanitizeFilename(filename);

    if (process.env.SAVE_TO_LOCAL === 'true') {
      const targetDir = path.join(process.env.STATIC_FILE_DISC_PATH, directory);
      try {
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      } catch (dirErr) {
        return reject(dirErr);
      }
      fs.writeFile(path.join(targetDir, safeName), fileData, (err) => {
        if (err) return reject(err);
        resolve({
          Key: `${directory}/${safeName}`,
          Location: `${process.env.STATIC_FILES_URL}${directory}/${safeName}`,
        });
      });
      return;
    }

    // Lazy-require so environments without the SDK (tests) never load it.
    const AWS = require('aws-sdk');
    const cfg = bucketConfig();
    const s3 = new AWS.S3({
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      region: cfg.region,
    });
    s3.upload(
      {
        Key: `${directory}/${safeName}`,
        Bucket: cfg.bucketName,
        Body: fileData,
        ACL: 'public-read',
        ContentType: contentType,
        ContentDisposition: 'inline',
      },
      (err, data) => (err ? reject(err) : resolve(data))
    );
  });

module.exports = { uploadFile, sanitizeFilename, contentTypeFor, bucketConfig };
