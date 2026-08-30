'use strict';

const asyncHandler = require('../../utils/async-handler');
const ApiError = require('../../utils/api-error');
const service = require('./event-icons.service');

const all = asyncHandler(async (req, res) => {
  res.status(200).json(service.all());
});

const byId = asyncHandler(async (req, res) => {
  const svg = service.byId(req.params.eventId);
  if (svg === null) throw ApiError.notFound('No icon for that event');
  res.status(200).type('image/svg+xml').send(svg);
});

module.exports = { all, byId };
