'use strict';

const asyncHandler = require('../../utils/async-handler');
const service = require('./profile.service');

const getProfile = asyncHandler(async (req, res) => {
  res.status(200).json(await service.getProfile(req.auth.userId));
});

module.exports = { getProfile };
