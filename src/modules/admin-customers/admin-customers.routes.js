'use strict';

const express = require('express');
const { z } = require('zod');
const { verifyToken, requireAdmin } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const controller = require('./admin-customers.controller');

const router = express.Router();

// Every route here is admin-only.
router.use(verifyToken, requireAdmin);

const orgId = z.coerce.number().int().positive();
const idSchema = z.object({ params: z.object({ id: orgId }) });
const orgSchema = z.object({ params: z.object({ organisation_id: orgId }) });
const reportSchema = z.object({
  params: z.object({
    representative_name: z.string().min(1).max(300),
    // The report number selects a table from a fixed map; anything else is a
    // client error rather than an empty result.
    query_no: z.coerce.number().int().min(1).max(7),
  }),
});
const inventorSchema = z.object({
  params: z.object({
    organisation_id: orgId,
    representative_id: z.coerce.number().int().positive(),
  }),
});

/* ----------------------------------------------------- literal paths first */

router.get('/customers/run_query/:representative_name/:query_no', validate(reportSchema), controller.runReport);
router.get('/customers/static_file/read_entity_file', controller.entityFileByName);
router.get('/customers/read_static_file/read_entity_file/:id/:portfolios/:type', controller.entityFile);
router.get('/customers/retrieve_cited_patents/:customerID', controller.retrieveCitedPatents);
router.get('/customers/retrieve_cited_patents_domain/:customerID/:apiName', controller.retrieveCitedPatentDomains);
router.post('/customers/retrieve_cited_patents_logo', controller.retrieveCitedPatentLogos);

/* -------------------------------------------------------------- customers */

router.get('/customers', controller.listCustomers);
router.post('/customers', controller.createCustomer);
router.put('/customers', controller.updateCustomer);

router.get('/customers/:id', validate(idSchema), controller.customer);
router.delete('/customers/:organisation_id', validate(orgSchema), controller.deleteCustomer);
router.put('/customers/:id/logo', validate(idSchema), controller.setLogo);

router.get('/customers/:organisation_id/buttons', validate(orgSchema), controller.listSwitches);
router.put('/customers/:organisation_id/buttons', validate(orgSchema), controller.setSwitch);

router.get('/customers/:id/run_update_log', validate(idSchema), controller.updateLogs);
router.delete('/customers/:id/run_update_log', validate(idSchema), controller.clearUpdateLogs);
router.get('/customers/:id/family', validate(idSchema), controller.familyLogs);
router.delete('/customers/:id/family-log', validate(idSchema), controller.clearFamilyLogs);
router.get('/customers/:id/reclassify', validate(idSchema), controller.reclassifyLogs);
router.get('/customers/:id/reclassify-log', validate(idSchema), controller.reclassifyLogs);
router.delete('/customers/:id/reclassify-log', validate(idSchema), controller.clearReclassifyLogs);

router.get('/customers/customers/:id/:type', validate(idSchema), controller.normaliseNames);
router.get('/customers/customers/:id/:representativeID/:type', validate(idSchema), controller.normaliseNames);

router.get('/customers/:organisation_id/create_tree', validate(orgSchema), controller.createTree);
router.get('/customers/:organisation_id/flag_automatic', validate(orgSchema), controller.runFlagUpdate);
router.get('/customers/:organisation_id/transaction_missing_conveyance', validate(orgSchema), controller.runMissingConveyance);
router.get('/customers/:organisation_id/publish', validate(orgSchema), controller.publishCompanies);
router.get('/customers/:organisation_id/address/publish', validate(orgSchema), controller.publishAddresses);
router.get('/customers/:organisation_id/:representative_id/missing_inventor/stop', validate(inventorSchema), controller.stopMissingInventors);
router.get('/customers/:organisation_id/:representative_id/missing_inventor', validate(inventorSchema), controller.findMissingInventors);

/* ------------------------------------------------------------ admin users */

router.get('/users', controller.listAdminUsers);
router.post('/users', controller.createAdminUser);
router.put('/users/:user_id', controller.updateAdminUser);
router.delete('/users/:orgId/:user_id', controller.deleteCustomerUser);

// The remaining legacy endpoints in admin_customers.js are covered elsewhere:
// customer companies, reports, users and patents are the same reads the
// /companies, /users and /assets modules already expose, and the socket ping
// route was registered as 'socket' with no leading slash, so it never matched.

module.exports = router;
