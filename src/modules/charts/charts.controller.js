'use strict';

const asyncHandler = require('../../utils/async-handler');
const service = require('./charts.service');

const getChart = asyncHandler(async (req, res) => {
  res.status(200).json(await service.getChart(req.tenant, req.params.type));
});

module.exports = { getChart };
