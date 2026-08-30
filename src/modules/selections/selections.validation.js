'use strict';

const { z } = require('zod');

// representative_id arrives as a JSON-encoded array string (legacy form post).
const companySchema = z.object({ body: z.object({ representative_id: z.string().optional() }) });
const activitySchema = z.object({ body: z.object({ activity_id: z.coerce.number().int() }) });

module.exports = { companySchema, activitySchema };
