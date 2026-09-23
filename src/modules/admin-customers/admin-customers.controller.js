'use strict';

const asyncHandler = require('../../utils/async-handler');
const ApiError = require('../../utils/api-error');
const service = require('./admin-customers.service');

const parseList = (raw, label) => {
  if (raw === undefined || raw === null || raw === '') return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (_err) {
    throw ApiError.badRequest(`${label} must be a JSON array`);
  }
};

/* ------------------------------------------------------------- customers */

const listCustomers = asyncHandler(async (req, res) => {
  res.status(200).json(await service.listCustomers());
});

const customer = asyncHandler(async (req, res) => {
  res.status(200).json(await service.customer(Number(req.params.id)));
});

const createCustomer = asyncHandler(async (req, res) => {
  res.status(201).json(
    await service.createCustomer({
      companyName: req.body.company_name,
      organisationType: req.body.organisation_type,
    })
  );
});

const updateCustomer = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.updateCustomer({
      organisationId: Number(req.body.organisation_id),
      companyName: req.body.company_name,
      organisationType: req.body.organisation_type,
      subscription: req.body.subscribtion,
    })
  );
});

const deleteCustomer = asyncHandler(async (req, res) => {
  res.status(200).json(await service.deleteCustomer(Number(req.params.organisation_id)));
});

const setLogo = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.setLogo({
      organisationId: Number(req.params.id),
      dataUrl: req.body.url_customer_logo,
    })
  );
});

/* ----------------------------------------------------------- admin users */

const listAdminUsers = asyncHandler(async (req, res) => {
  res.status(200).json(await service.listAdminUsers());
});

const createAdminUser = asyncHandler(async (req, res) => {
  res.status(201).json(
    await service.createAdminUser({
      firstName: req.body.first_name,
      lastName: req.body.last_name,
      username: req.body.username,
      password: req.body.password,
    })
  );
});

const updateAdminUser = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.updateAdminUser({
      userId: Number(req.params.user_id),
      firstName: req.body.first_name,
      password: req.body.password,
    })
  );
});

const deleteCustomerUser = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.deleteCustomerUser({
      organisationId: Number(req.params.orgId),
      userId: Number(req.params.user_id),
    })
  );
});

/* --------------------------------------------------------------- reports */

const runReport = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.runReport({
      representativeName: req.params.representative_name,
      queryNo: Number(req.params.query_no),
      companyId: req.query.company_id,
      organisationId: req.query.organisation_id,
    })
  );
});

/* -------------------------------------------------- manual inventor flag */

const flagInventors = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.flagInventors({
      organisationId: req.params.id,
      partyIds: parseList(req.body.inventors, 'inventors'),
      flag: req.body.flag,
    })
  );
});

/* ------------------------------------------------------- asset lookup */

const assetIllustration = asyncHandler(async (req, res) => {
  const raw = req.query.flag;
  const body = await service.assetIllustration({
    asset: req.params.asset,
    flag: raw === undefined || raw === '' ? undefined : Number(raw),
    orgId: req.auth.orgId,
    userId: req.auth.userId,
  });
  res.status(200).send(body);
});

/* -------------------------------------------- customer company list */

const customerCompanies = asyncHandler(async (req, res) => {
  res.status(200).json(await service.customerCompanies(req.params.id));
});

const customerPatents = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.customerPatents({
      organisationId: req.params.id,
      representativeIds: parseList(req.query.representativeID, 'representativeID'),
      direction: req.query.direction,
    })
  );
});

/* ------------------------------------------------- dashboard totals, bulk */

const customerReports = asyncHandler(async (req, res) => {
  const ids = parseList(req.query.ids, 'ids').map(Number).filter(Boolean);
  res.status(200).json(await service.customerReports(ids));
});

/* ------------------------------------------------------ customer reports */

const customerReport = asyncHandler(async (req, res) => {
  res.status(200).json(await service.customerReport(req.params.id));
});

/* ------------------------------------------------------------------ logs */

const companiesFrom = (req) => parseList(req.query.companies, 'companies');

const updateLogs = asyncHandler(async (req, res) => {
  res.status(200).json(await service.updateLogs(companiesFrom(req)));
});

const clearUpdateLogs = asyncHandler(async (req, res) => {
  res.status(200).json(await service.clearUpdateLogs(companiesFrom(req)));
});

const familyLogs = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.familyLogs({
      organisationId: Number(req.params.id), companyIds: companiesFrom(req),
    })
  );
});

const clearFamilyLogs = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.clearFamilyLogs({
      organisationId: Number(req.params.id), companyIds: companiesFrom(req),
    })
  );
});

const reclassifyLogs = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.reclassifyLogs({
      organisationId: Number(req.params.id), companyIds: companiesFrom(req),
    })
  );
});

const clearReclassifyLogs = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.clearReclassifyLogs({
      organisationId: Number(req.params.id), companyIds: companiesFrom(req),
    })
  );
});

/* ------------------------------------------------------- account switches */

const listSwitches = asyncHandler(async (req, res) => {
  res.status(200).json(await service.listSwitches(Number(req.params.organisation_id)));
});

const setSwitch = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.setSwitch({
      organisationId: Number(req.params.organisation_id),
      buttonId: Number(req.body.button_id),
      status: Number(req.body.status),
    })
  );
});

/* ---------------------------------------------------------- entity files */

const entityFile = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.entityFile({
      organisationId: Number(req.params.id),
      type: req.params.type,
      portfolios: parseList(req.params.portfolios, 'portfolios'),
    })
  );
});

const entityFileByName = asyncHandler(async (req, res) => {
  res.status(200).json(await service.entityFileByName(req.query.fileName));
});

/* -------------------------------------------------------- pipeline jobs */

/*
 * Two things share this route, as they did in the legacy handler: the console's
 * Entities list (type 3, no flags) is answered from the database; a request
 * carrying `suggestions` or `fixed_identicals` starts the normalisation script
 * instead and is acknowledged with a 202. The port ran the script for both,
 * so neither the Entities nor the Inventors button ever showed a list.
 */
const INVENTORS = '1';
const ENTITIES = '3';

const normaliseNames = asyncHandler(async (req, res) => {
  const input = {
    organisationId: Number(req.params.id),
    representativeIds: req.params.representativeID
      ? parseList(req.params.representativeID, 'representativeID')
      : [],
    type: req.params.type,
    suggestions: req.query.suggestions,
    fixedIdenticals: req.query.fixed_identicals,
  };
  const wantsList = input.suggestions === undefined && input.fixedIdenticals === undefined;
  if (wantsList && String(input.type) === ENTITIES) {
    res.status(200).json(await service.entitiesForCustomer(input));
    return;
  }
  if (wantsList && String(input.type) === INVENTORS) {
    res.status(200).json(await service.inventorsForCustomer(input));
    return;
  }
  service.normaliseNames(input);
  res.status(202).json({ message: 'Normalisation started' });
});

const runFlagUpdate = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.runFlagUpdate({
      organisationId: Number(req.params.organisation_id),
      companyIds: parseList(req.query.representative_id, 'representative_id'),
    })
  );
});

const runMissingConveyance = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.runMissingConveyance({
      organisationId: Number(req.params.organisation_id),
      companyId: req.query.representative_id,
    })
  );
});

const findMissingInventors = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.findMissingInventors({
      organisationId: Number(req.params.organisation_id),
      representativeId: Number(req.params.representative_id),
    })
  );
});

const stopMissingInventors = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.stopMissingInventors({
      organisationId: Number(req.params.organisation_id),
      representativeId: Number(req.params.representative_id),
    })
  );
});

/*
 * The console sends `?company_id=<JSON array>` — the portfolio rows the user
 * ticked before pressing Update. The port ignored it and rebuilt nothing at
 * all, because it also named a script that does not exist.
 */
const publishCompanies = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.publishCompanies(
      Number(req.params.organisation_id),
      parseList(req.query.company_id, 'company_id')
    )
  );
});

const publishAddresses = asyncHandler(async (req, res) => {
  res.status(200).json(await service.publishAddresses(Number(req.params.organisation_id)));
});

const createTree = asyncHandler(async (req, res) => {
  res.status(202).json(await service.createTree(Number(req.params.organisation_id)));
});

const retrieveCitedPatents = asyncHandler(async (req, res) => {
  res.status(202).json(
    await service.retrieveCitedPatents({
      customerId: Number(req.params.customerID),
      companies: req.query.companies,
      type: req.query.type,
    })
  );
});

const retrieveCitedPatentDomains = asyncHandler(async (req, res) => {
  res.status(202).json(
    await service.retrieveCitedPatentDomains({
      customerId: Number(req.params.customerID),
      apiName: req.params.apiName,
      assignees: req.query.assignees,
    })
  );
});

const retrieveCitedPatentLogos = asyncHandler(async (req, res) => {
  res.status(202).json(
    await service.retrieveCitedPatentLogos({
      clientId: req.body.client_id,
      apiName: req.body.api_name,
      assignees: req.body.assignees,
      all: req.body.all,
      companyId: req.body.company_id,
      type: req.body.type,
      sourceData: req.body.source_data,
    })
  );
});

module.exports = {
  listCustomers, customer, createCustomer, updateCustomer, deleteCustomer, setLogo,
  listAdminUsers, createAdminUser, updateAdminUser, deleteCustomerUser,
  runReport, customerReport, customerReports, customerCompanies, customerPatents, flagInventors,
  assetIllustration, updateLogs, clearUpdateLogs, familyLogs, clearFamilyLogs,
  reclassifyLogs, clearReclassifyLogs, listSwitches, setSwitch,
  entityFile, entityFileByName, normaliseNames,
  runFlagUpdate, runMissingConveyance, findMissingInventors, stopMissingInventors,
  publishCompanies, publishAddresses, createTree,
  retrieveCitedPatents, retrieveCitedPatentDomains, retrieveCitedPatentLogos,
};
