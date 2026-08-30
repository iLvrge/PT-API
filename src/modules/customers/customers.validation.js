'use strict';

const { z } = require('zod');

const jsonArray = z.string().optional();

const assetTypesSchema = z.object({ query: z.object({ companies: jsonArray }) });

const tabCompaniesSchema = z.object({
  params: z.object({ tab_id: z.coerce.number().int() }),
  query: z.object({ companies: jsonArray, layout: z.string().optional() }),
});

const companiesSchema = z.object({
  query: z.object({
    companies: jsonArray,
    tabs: jsonArray,
    limit: z.coerce.number().int().optional(),
    offset: z.coerce.number().int().optional(),
  }),
});

module.exports = { assetTypesSchema, tabCompaniesSchema, companiesSchema };
