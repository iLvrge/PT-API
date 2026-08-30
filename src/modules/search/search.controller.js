'use strict';

const asyncHandler = require('../../utils/async-handler');
const service = require('./search.service');

const transactions = asyncHandler(async (req, res) => {
  res.status(200).json(await service.transactions(req.params.search_string));
});

module.exports = { transactions };
