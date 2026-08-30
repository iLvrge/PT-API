'use strict';

const asyncHandler = require('../../utils/async-handler');
const service = require('./entities.service');

const search = asyncHandler(async (req, res) => {
  res.status(200).json(await service.search(req.params.search_string, Number(req.params.type)));
});

module.exports = { search };
