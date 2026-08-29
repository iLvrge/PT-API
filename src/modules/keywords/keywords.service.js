'use strict';

const ApiError = require('../../utils/api-error');
const repository = require('./keywords.repository');

const list = () => repository.list();

const create = async (keyword) => {
  const created = await repository.create(keyword);
  return { id: created.keyword_id, keyword: created.keyword_name };
};

const update = async (id, keyword) => {
  const existing = await repository.findById(id);
  if (!existing) throw ApiError.notFound('Keyword not found');
  await repository.updateName(id, keyword);
  return { id, keyword };
};

const remove = async (id) => {
  const existing = await repository.findById(id);
  if (!existing) throw ApiError.notFound('Keyword not found');
  await repository.destroyById(id);
  return { id, deleted: true };
};

module.exports = { list, create, update, remove };
