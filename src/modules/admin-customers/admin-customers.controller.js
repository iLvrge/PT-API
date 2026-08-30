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

const normaliseNames = asyncHandler(async (req, res) => {
  service.normaliseNames({
    organisationId: Number(req.params.id),
    representativeIds: req.params.representativeID
      ? parseList(req.params.representativeID, 'representativeID')
      : [],
    type: req.params.type,
    suggestions: req.query.suggestions,
    fixedIdenticals: req.query.fixed_identicals,
  });
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

const publishCompanies = asyncHandler(async (req, res) => {
  res.status(200).json(await service.publishCompanies(Number(req.params.organisation_id)));
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
  runReport, updateLogs, clearUpdateLogs, familyLogs, clearFamilyLogs,
  reclassifyLogs, clearReclassifyLogs, listSwitches, setSwitch,
  entityFile, entityFileByName, normaliseNames,
  runFlagUpdate, runMissingConveyance, findMissingInventors, stopMissingInventors,
  publishCompanies, publishAddresses, createTree,
  retrieveCitedPatents, retrieveCitedPatentDomains, retrieveCitedPatentLogos,
};
