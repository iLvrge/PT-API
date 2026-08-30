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

const assignmentsSchema = z.object({
  query: z.object({
    companies: jsonArray,
    tabs: jsonArray,
    customers: jsonArray,
    layout: z.string().optional(),
  }),
});

const rfIdSchema = z.object({
  params: z.object({ rfID: z.coerce.number().int().positive() }),
  query: z.object({ layout: z.string().optional() }),
});

const assetsSchema = z.object({
  query: z.object({
    companies: jsonArray,
    tabs: jsonArray,
    customers: jsonArray,
    assignments: jsonArray,
    limit: z.coerce.number().int().optional(),
    offset: z.coerce.number().int().optional(),
  }),
});

module.exports = {
  assetTypesSchema,
  tabCompaniesSchema,
  companiesSchema,
  assignmentsSchema,
  rfIdSchema,
  assetsSchema,
};
