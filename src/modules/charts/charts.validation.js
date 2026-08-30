'use strict';

const { z } = require('zod');

const chartSchema = z.object({ params: z.object({ type: z.coerce.number().int().min(1).max(5) }) });

module.exports = { chartSchema };
