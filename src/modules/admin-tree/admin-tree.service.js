'use strict';

/**
 * Corporate-tree upload. The admin uploads the HTML export of a corporate
 * structure; the API stores it and returns the markup for the client to parse.
 *
 * The legacy route wrote to a hardcoded /var/www path with the caller's own
 * filename and echoed the file back after re-reading it from disk. Here the
 * upload goes through the shared upload helper (which sanitises the filename
 * and honours local-disk vs S3), and the response is the buffer we already
 * hold rather than a second read.
 */

const ApiError = require('../../utils/api-error');
const { uploadFile } = require('../../utils/uploads');

const DIRECTORY = 'corporate-tree';

const isHtmlUpload = (file) => {
  const mimetype = (file.mimetype || '').toLowerCase();
  return mimetype.includes('html') || mimetype.includes('multipart');
};

const storeCorporateTree = async (file) => {
  if (!file) throw ApiError.badRequest('No file uploaded');
  if (!isHtmlUpload(file)) throw ApiError.badRequest('Invalid file format; expected HTML');

  const stored = await uploadFile(file.data, DIRECTORY, file.name, 'text/html');
  return { contents: file.data.toString('utf8'), location: stored.Location, key: stored.Key };
};

module.exports = { storeCorporateTree, isHtmlUpload, DIRECTORY };
