'use strict';

const express = require('express');
const { z } = require('zod');
const { verifyToken, requireAdmin } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const controller = require('./admin-company-search.controller');

const router = express.Router();

// Every route here is admin-only.
router.use(verifyToken, requireAdmin);

const id = z.coerce.number().int().positive();
const idSchema = z.object({ params: z.object({ id }) });
const entitySchema = z.object({ params: z.object({ ID: id }) });

/* ------------------------------------------------------ company requests */

router.get('/company/request', controller.companyRequests);
router.put('/company/request', controller.resolveCompanyRequests);

/* -------------------------------------------------------------- searching */
// Literal segments before the parameterised ones so /company/search/:search
// cannot swallow /company/search/all or /company/search/address/... .

router.get('/company/search/all/', controller.searchAll);
router.put('/company/search/all/', controller.normaliseCompanies);
router.get('/company/search/address/:address', controller.searchByAddress);
router.get('/company/search/country/:name', controller.searchByCountry);
router.get('/company/search/:search', controller.searchCompanies);
router.get('/company/representative/search/:name', controller.searchRepresentatives);
router.get('/company/account/search/:name', controller.searchAccounts);

router.get('/lawfirm/:ID/search/address', validate(entitySchema), controller.lawFirmAddresses);
router.post('/lawfirm/:ID/search/address/all', validate(entitySchema), controller.searchLawFirmAddresses);
router.get('/company/:ID/search/address/:type', validate(entitySchema), controller.partyAddresses);
router.post('/company/:ID/search/address/all/:type', validate(entitySchema), controller.searchCompanyAddresses);
router.get('/company/:ID/search/address_with_transactions/:type', validate(entitySchema), controller.addressesWithTransactions);
router.put('/company/:ID/search/address_with_transactions/:type', validate(entitySchema), controller.rememberAddress);

/* ------------------------------------------------------------- law firms */

router.get('/company/law_firms', controller.lawFirms);
router.put('/company/law_firms', controller.normaliseLawFirms);
router.get('/company/law_firms/:id/companies', validate(idSchema), controller.lawFirmCompanies);
router.get('/company/law_firms/:id', validate(idSchema), controller.lawyersForFirm);
router.get('/company/:companyID/law_firms', controller.companyLawFirms);
router.get('/company/:id/companies', validate(idSchema), controller.normalisationCandidates);
router.put('/company/:id/company_selection', validate(idSchema), controller.setCompanySelection);

/* --------------------------------------------------------------- lawyers */

router.get('/company/lawyers', controller.lawyers);
router.put('/company/lawyers', controller.normaliseLawyers);
router.get('/company/lawyers/:id', validate(idSchema), controller.lawyersForFirm);

/* ----------------------------------------------------------- assignments */

router.get('/company/assignments', controller.recentTransactions);
router.put('/company/assignments', controller.updateAssignment);
router.get('/company/assignments/:id', validate(idSchema), controller.correspondence);
router.get('/company/raw/assignments/:id', validate(idSchema), controller.rawCorrespondence);
router.put('/company/raw/assignments/:id', validate(idSchema), controller.updateAssignment);
router.get('/company/transactions/:id', controller.transactions);
router.get('/company/transactions/:id/:representativeID', controller.transactions);
router.put('/company/transactions/:customerID', controller.retypeTransaction);
router.get('/company/lenders/:id/companies', controller.lenderCompanies);
router.get('/company/recent_transactions', controller.recentTransactions);
router.get('/all/transactions/:conveyanceType', controller.transactionsByConveyance);

/* ------------------------------------------------------------ assets */

router.get('/company/assets/:entityID', controller.partyAssets);
router.get('/company/:representativeID/event_maintainence', controller.companyMaintenance);

/* ------------------------------------------------------------- cited */

router.get('/company/auth_token', controller.googleAuthToken);
router.get('/company/report', controller.representativeReports);
router.get('/company/lender', controller.searchLenders);
router.get('/company/law_firms/:id/normalize_lawfirms', validate(idSchema), controller.lawFirmNormalisationCandidates);
router.get('/company/family/:id', validate(idSchema), controller.runFamilyAssets);
router.get('/company/family/:id/:representativeID', validate(idSchema), controller.runFamilyAssets);
router.get('/company/get_counter_cited_organisations_and_logo', controller.citedCounters);
router.get('/company/parties/all/:id', validate(idSchema), controller.parties);
router.get('/company/saved_logo/parties/all/:id', validate(idSchema), controller.savedLogoParties);
router.get('/company/parties/:id', validate(idSchema), controller.parties);
router.get('/company/cited/:id', validate(idSchema), controller.citedOrganisations);
router.get('/company/owned/cited/:id', validate(idSchema), controller.citedOrganisations);
router.put('/company/cited/:id', validate(idSchema), controller.assignCitedToOrganisation);
router.put('/company/assignees/query_name', controller.updateCitedAssignee);
router.put('/company/assignees/logos', controller.assigneeLogos);

// Still not ported from admin_company_search.js:
//
// - POST /company/:id/add_bulk_companies is the same tenant company creation
//   as POST /companies, which is already ported;
// - POST /company/cited/:id/export and the cited create/delete pair drive a
//   Google Sheet, so they belong with the reporting tier that is still pending;
// - POST /company/report_dashboard:id/ was registered without a slash before
//   its parameter, so it only ever matched paths like
//   /company/report_dashboard5/ — no client can have been calling it.
//
// The lender, family, report, normalisation and law-firm-normalisation reads
// were previously listed here as duplicates of /companies, /customers and
// /dashboards. They are not: the admin console calls these exact paths and got
// a 404 on every one, so they are ported above.

module.exports = router;
