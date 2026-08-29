'use strict';

const { connections } = require('../../db');
const q = require('../../db/query');
const Keyword = require('../../db/models/keyword.model');

// reads (raw SQL)
const list = () =>
  q.selectAll(
    connections.resources,
    `SELECT keyword_id AS id, keyword_name AS keyword FROM keyword ORDER BY keyword_name`
  );

const findById = (id) =>
  q.selectOne(
    connections.resources,
    `SELECT keyword_id AS id, keyword_name AS keyword FROM keyword WHERE keyword_id = :id LIMIT 1`,
    { id }
  );

// writes (Sequelize)
const create = (keywordName) => Keyword.create({ keyword_name: keywordName });

const updateName = (id, keywordName) =>
  Keyword.update({ keyword_name: keywordName }, { where: { keyword_id: id } });

const destroyById = (id) => Keyword.destroy({ where: { keyword_id: id } });

module.exports = { list, findById, create, updateName, destroyById };
