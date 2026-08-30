'use strict';

const asyncHandler = require('../../utils/async-handler');
const service = require('./updates.service');

const counters = asyncHandler(async (req, res) => {
  res.status(200).json(await service.counters(req.tenant, req.auth.orgId, req.params.companyName));
});

module.exports = { counters };
