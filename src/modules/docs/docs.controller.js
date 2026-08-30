'use strict';

const openapi = require('../../docs/openapi');

// No service/db layer: the spec is static configuration, not domain data.
const getSpec = (req, res) => {
  res.status(200).json(openapi);
};

module.exports = { getSpec };
