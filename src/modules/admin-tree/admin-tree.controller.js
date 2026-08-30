'use strict';

const asyncHandler = require('../../utils/async-handler');
const service = require('./admin-tree.service');

const uploadCorporateTree = asyncHandler(async (req, res) => {
  const { contents } = await service.storeCorporateTree(req.files && req.files.file);
  // The client parses the markup itself, so it is returned verbatim.
  res.status(200).type('text/html').send(contents);
});

module.exports = { uploadCorporateTree };
