'use strict';

const ApiError = require('../../utils/api-error');
const repository = require('./charts.repository');

const getChart = async (tenant, type) => {
  if (!repository.QUERIES[type]) throw ApiError.badRequest('Unknown chart type');
  const names = await repository.listRepresentativeNames(tenant);
  if (!names.length) return [];
  const rows = await repository.runChart(type, names);
  return rows || [];
};

module.exports = { getChart };
