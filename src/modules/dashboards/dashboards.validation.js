'use strict';

/**
 * Dashboard request schemas.
 *
 * The dashboard client posts arrays as JSON *strings* in form fields
 * (`selectedCompanies: "[1,2]"`), so the schemas accept strings here and the
 * controller parses them once, in one place, with a 400 on malformed JSON.
 */

const { z } = require('zod');

const jsonArray = z.string().optional();
const optionalText = z.string().optional();

const tilesSchema = z.object({ query: z.object({ companies: jsonArray }) });

const collateralSchema = z.object({
  body: z.object({ selectedCompanies: jsonArray, assignor_id: jsonArray }),
});

const assignorPartiesSchema = z.object({
  body: z.object({
    selectedCompanies: jsonArray,
    search: optionalText,
    type: optionalText,
  }),
});

const inventorSchema = z.object({
  params: z.object({ inventorID: z.coerce.number().int().nonnegative() }),
});

const partiesSchema = z.object({
  body: z.object({
    selectedCompanies: jsonArray,
    search: optionalText,
    layout: optionalText,
    type: optionalText,
    list: jsonArray,
    total: z.coerce.number().int().nonnegative().optional(),
  }),
});

const companiesOnlySchema = z.object({
  body: z.object({ selectedCompanies: jsonArray }),
});

const timelineSchema = z.object({
  body: z.object({
    selectedCompanies: jsonArray,
    customers: jsonArray,
    type: z.coerce.number().int(),
  }),
});

const countSchema = z.object({
  body: z.object({
    selectedCompanies: jsonArray,
    customers: jsonArray,
    type: jsonArray,
    format_type: optionalText,
  }),
});

const metricSchema = z.object({
  body: z.object({
    selectedCompanies: jsonArray,
    customers: jsonArray,
    assignments: jsonArray,
    type: z.coerce.number().int(),
    data_format: z.coerce.number().int().optional(),
    format_type: optionalText,
    company: optionalText,
  }),
});

const tempSchema = z.object({
  body: z.object({
    list: optionalText,
    type: z.coerce.number().int(),
    format_type: optionalText,
    selectedCompanies: jsonArray,
    tabs: jsonArray,
    customers: jsonArray,
    assignments: jsonArray,
  }),
});

const shareSchema = z.object({
  body: z.object({
    selectedCompanies: jsonArray,
    tabs: jsonArray,
    customers: jsonArray,
    share_button: z.union([z.string(), z.number()]).optional(),
  }),
});

module.exports = {
  tilesSchema,
  collateralSchema,
  assignorPartiesSchema,
  inventorSchema,
  partiesSchema,
  companiesOnlySchema,
  timelineSchema,
  countSchema,
  metricSchema,
  tempSchema,
  shareSchema,
};
