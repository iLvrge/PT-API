'use strict';

const asyncHandler = require('../../utils/async-handler');
const service = require('./health.service');

const liveness = (req, res) => {
  res.status(200).json(service.getLiveness());
};

const readiness = asyncHandler(async (req, res) => {
  const { ready, status, databases } = await service.getReadiness();
  res.status(ready ? 200 : 503).json({ status, databases });
});

module.exports = { liveness, readiness };
