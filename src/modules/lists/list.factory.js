'use strict';

/**
 * Factory for the admin "simple list" resources that share one shape — an id and
 * a single name column, full CRUD, admin-only, in db_uspto. The legacy code
 * duplicated this for keywords, super_keywords, state and company_keywords; here
 * it is one tested implementation configured per table.
 *
 * The public API field is `keyword` and responses are { id, keyword }, matching
 * the existing client contract (legacy GET aliased the columns to id/keyword),
 * regardless of the underlying column name.
 *
 *   makeListModule({ table, idColumn, nameColumn, basePath })
 *     → { router, service, repository }
 */

const express = require('express');
const { DataTypes } = require('sequelize');
const { z } = require('zod');
const { connections } = require('../../db');
const q = require('../../db/query');
const ApiError = require('../../utils/api-error');
const asyncHandler = require('../../utils/async-handler');
const validate = require('../../middleware/validate');
const { verifyToken, requireAdmin } = require('../../middleware/auth');

const makeListModule = ({ table, idColumn, nameColumn, basePath }) => {
  const Model = connections.resources.define(
    table,
    {
      [idColumn]: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      [nameColumn]: { type: DataTypes.STRING, allowNull: false },
    },
    { tableName: table, freezeTableName: true, underscored: true, timestamps: false }
  );

  const repository = {
    list: () =>
      q.selectAll(
        connections.resources,
        `SELECT ${idColumn} AS id, ${nameColumn} AS keyword FROM ${table} ORDER BY ${nameColumn}`
      ),
    findById: (id) =>
      q.selectOne(
        connections.resources,
        `SELECT ${idColumn} AS id, ${nameColumn} AS keyword FROM ${table} WHERE ${idColumn} = :id LIMIT 1`,
        { id }
      ),
    create: (value) => Model.create({ [nameColumn]: value }),
    updateName: (id, value) => Model.update({ [nameColumn]: value }, { where: { [idColumn]: id } }),
    destroyById: (id) => Model.destroy({ where: { [idColumn]: id } }),
  };

  const service = {
    list: () => repository.list(),
    create: async (value) => {
      const created = await repository.create(value);
      return { id: created[idColumn], keyword: created[nameColumn] };
    },
    update: async (id, value) => {
      if (!(await repository.findById(id))) throw ApiError.notFound('Record not found');
      await repository.updateName(id, value);
      return { id, keyword: value };
    },
    remove: async (id) => {
      if (!(await repository.findById(id))) throw ApiError.notFound('Record not found');
      await repository.destroyById(id);
      return { id, deleted: true };
    },
  };

  // controller — the only layer that touches req/res; it calls the service.
  const controller = {
    list: asyncHandler(async (req, res) => {
      res.status(200).json(await service.list());
    }),
    create: asyncHandler(async (req, res) => {
      res.status(201).json(await service.create(req.body.keyword));
    }),
    update: asyncHandler(async (req, res) => {
      res.status(200).json(await service.update(req.params.id, req.body.keyword));
    }),
    remove: asyncHandler(async (req, res) => {
      res.status(200).json(await service.remove(req.params.id));
    }),
  };

  const idParam = z.coerce.number().int().positive();
  const keywordBody = z.object({ keyword: z.string().trim().min(1, 'keyword is required') });
  const createSchema = z.object({ body: keywordBody });
  const updateSchema = z.object({ params: z.object({ id: idParam }), body: keywordBody });
  const idSchema = z.object({ params: z.object({ id: idParam }) });

  // routes — wiring only: path + middleware + controller.
  const router = express.Router();
  router.use(verifyToken, requireAdmin);
  router.get(basePath, controller.list);
  router.post(basePath, validate(createSchema), controller.create);
  router.put(`${basePath}/:id`, validate(updateSchema), controller.update);
  router.delete(`${basePath}/:id`, validate(idSchema), controller.remove);

  return { router, controller, service, repository };
};

module.exports = makeListModule;
