'use strict';

const asyncHandler = require('../../utils/async-handler');
const service = require('./auth.service');

const signin = asyncHandler(async (req, res) => {
  const result = await service.signin(req.body);
  res.status(200).json(result);
});

const adminSignin = asyncHandler(async (req, res) => {
  const result = await service.adminSignin(req.body);
  res.status(200).json(result);
});

const refresh = asyncHandler(async (req, res) => {
  const token = req.headers['x-auth-token'] || (req.body && req.body.token);
  const result = await service.refresh(token);
  res.status(200).json(result);
});

module.exports = { signin, adminSignin, refresh };
