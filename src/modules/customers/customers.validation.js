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

const lawfirmSchema = z.object({
  query: z.object({ companies: jsonArray, rfID: z.coerce.number().int().optional() }),
});

const lendersSchema = z.object({ query: z.object({ companies: jsonArray }) });

const portfoliosSchema = z.object({
  query: z.object({
    tab_id: z.coerce.number().int().optional(),
    portfolio: jsonArray,
    limit: z.coerce.number().int().optional(),
    offset: z.coerce.number().int().optional(),
  }),
});

const groupIdsSchema = z.object({ body: z.object({ group_ids: jsonArray }) });

const transactionsQuerySchema = z.object({
  query: z.object({ companies: jsonArray, tabs: jsonArray, customers: jsonArray }),
});

const incorrectNamesSchema = z.object({
  query: z.object({ companies: jsonArray, id: z.coerce.number().int().optional() }),
});

const queueAddressSchema = z.object({
  body: z.object({
    group_ids: jsonArray,
    new_address: z.coerce.number().int().positive(),
    company_ids: jsonArray,
  }),
});

const queueNameSchema = z.object({
  body: z.object({ group_ids: jsonArray, new_name: z.string().optional(), company_ids: jsonArray }),
});

const layoutPartiesSchema = z.object({
  params: z.object({ layout: z.string() }),
  query: z.object({
    companies: jsonArray,
    tabs: jsonArray,
    t: z.coerce.number().int().optional(),
  }),
});

const layoutActivitiesSchema = z.object({
  params: z.object({ layout: z.string() }),
  query: z.object({ companies: jsonArray }),
});

const rfIdAssetsSchema = z.object({ params: z.object({ rf_id: z.coerce.number().int().positive() }) });

module.exports = {
  layoutPartiesSchema,
  layoutActivitiesSchema,
  rfIdAssetsSchema,
  assetTypesSchema,
  tabCompaniesSchema,
  companiesSchema,
  assignmentsSchema,
  rfIdSchema,
  assetsSchema,
  lawfirmSchema,
  lendersSchema,
  portfoliosSchema,
  groupIdsSchema,
  transactionsQuerySchema,
  incorrectNamesSchema,
  queueAddressSchema,
  queueNameSchema,
};
