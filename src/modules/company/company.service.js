'use strict';

const ApiError = require('../../utils/api-error');
const repository = require('./company.repository');
const { runPhpScript, runPhpScriptBackground } = require('../../utils/php-jobs');

const DEFAULT_YEAR = () => new Date().getFullYear() - 24;

// POST /companies/request — find-or-create an import request.
const addRequest = async (orgId, name) => {
  if (!name) throw ApiError.badRequest('Invalid inputs');
  const existing = await repository.findRequestByName(name);
  if (existing) return existing;
  const created = await repository.createRequest({
    name,
    status: 0,
    organisation_id: orgId,
    request_date: new Date().toISOString().slice(0, 10),
  });
  return created.toJSON ? created.toJSON() : created;
};

const listRequests = (orgId) => repository.listRequests(orgId);

// GET /companies — parent companies with their children.
const companiesWithChildren = (tenant) => repository.companiesWithChildren(tenant);

// PUT /companies/:companyID — rename (type 1 groups) or re-parent.
const updateCompany = async (tenant, companyId, { name, parent_id }) => {
  const company = await repository.findRepresentative(tenant, companyId);
  if (!company) throw ApiError.badRequest('Bad request.');

  let item = null;
  if (name !== undefined && name !== '' && name !== null && company.type === 1) {
    item = { original_name: name, representative_name: name };
  } else if (parent_id !== undefined && parent_id !== null && parent_id >= 0) {
    item = { parent_id };
    if (parent_id === 0 && company.child === 1) item.child = 0;
    else if (parent_id > 0 && company.child === 0) item.child = 1;
  }
  if (!item) throw ApiError.badRequest('Bad request.');

  await repository.updateRepresentative(tenant, companyId, item);
  if (parent_id !== undefined && parent_id !== null && parent_id > 0) {
    await repository.updateRepresentative(tenant, parent_id, { status: 1 });
  }
  if (company.parent_id > 0) {
    await repository.countChildren(tenant, company.parent_id); // legacy computed, then always set status 1
    await repository.updateRepresentative(tenant, company.parent_id, { status: 1 });
  }
  return repository.companiesWithChildren(tenant);
};

// GET /companies/summary
const summary = async (tenant, orgId) => {
  const report = await repository.orgSummary(orgId);

  let reportActive = [];
  const top = await repository.representativesWhere(tenant, 'type = 0 AND parent_id = 0 AND status = 1', {}, 'representative_id');
  const companies = top.map((r) => r.representative_id);

  const groups = await repository.representativesWhere(tenant, 'type = 1 AND parent_id = 0 AND status = 1', {}, 'representative_id');
  if (groups.length) {
    const children = await repository.representativesWhere(
      tenant,
      'type = 0 AND child = 1 AND parent_id IN (:parents) AND status = 1',
      { parents: groups.map((g) => g.representative_id) },
      'representative_id'
    );
    companies.push(...children.map((c) => c.representative_id));
  }
  if (companies.length) {
    reportActive = await repository.activeRights(orgId, companies);
  }
  return { report, reportActive };
};

// shared report-merging used by both list endpoints
const reportName = (r) => (r.representative_name !== '' && r.representative_name != null ? r.representative_name : r.original_name);

const mergeReports = (name, findReports, findAdminReports) => {
  const out = { no_of_assets: 0, no_of_transactions: 0, no_of_parties: 0, no_of_inventor: 0, no_of_activities: 0, product: 0 };
  const rep = findReports.find((r) => r.representative_name === name);
  if (rep) {
    out.no_of_assets = rep.no_of_assets;
    out.no_of_transactions = rep.no_of_transactions;
    out.no_of_parties = rep.no_of_parties;
    out.no_of_inventor = rep.no_of_inventor;
    out.no_of_activities = rep.no_of_activities;
  }
  const admin = findAdminReports.find((r) => r.representative_name === name);
  if (admin) out.product = admin.no_of_parties - admin.no_of_transactions;
  else out.product = out.no_of_parties - out.no_of_transactions;
  return out;
};

// GET /companies/:companyID/list — children of a company with report counters.
const companyChildren = async (tenant, companyId) => {
  const whereSql = '(parent_id = :companyId AND child = 0) OR (parent_id = :companyId AND child = 1)';
  const repl = { companyId };
  const total_records = await repository.countRepresentativesWhere(tenant, whereSql, repl);
  const list = await repository.representativesWhere(
    tenant, whereSql, repl,
    'type ASC, status DESC, original_name ASC, representative_name ASC'
  );
  if (!list.length) return { list: [], total_records };

  const names = list.map((r) => r.representative_name);
  const [findReports, findAdminReports] = await Promise.all([
    repository.representativeReports(names),
    repository.adminRepresentativeReports(names),
  ]);

  const companiesList = list.map((representative) => {
    const row = { ...representative };
    if (row.company_id > 0) row.representative_id = row.company_id;
    delete row.company_id;
    delete row.parent_id;
    delete row.child;
    return { ...row, ...mergeReports(representative.representative_name, findReports, findAdminReports) };
  });
  return { list: companiesList, total_records };
};

// GET /companies/list — the top-level company list with groups, reports and
// share-code filtering. Faithful port of the legacy assembly.
const companyList = async (tenant, auth, { column, direction }) => {
  const whereSql = 'parent_id = 0';
  const total_records = await repository.countRepresentativesWhere(tenant, whereSql, {});

  let orderSql = 'type ASC, status DESC, original_name ASC, representative_name ASC';
  if (column !== undefined && direction !== undefined) {
    const col = ['original_name', 'representative_name', 'type', 'status'].includes(column) ? column : 'original_name';
    const dir = String(direction).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    orderSql = `type ASC, status DESC, ${col} ${dir}${col === 'original_name' ? ', representative_name ASC' : ''}`;
  }
  const list = await repository.representativesWhere(tenant, whereSql, {}, orderSql);
  if (!list.length) return { list: [], total_records };

  let representativeNames = list.filter((r) => r.company_id > 0).map(reportName);
  const groupParentIds = list.filter((r) => r.company_id === 0).map((r) => r.representative_id);

  let findChild = [];
  if (groupParentIds.length) {
    findChild = await repository.representativesWhere(
      tenant,
      'parent_id IN (:parents) AND child = 1',
      { parents: groupParentIds },
      'type ASC, status DESC, original_name ASC, representative_name ASC'
    );
    for (const representative of list) {
      if (representative.type === 1) {
        const childNames = findChild.filter((r) => r.parent_id === representative.representative_id).map(reportName);
        representativeNames = [...representativeNames, ...childNames];
      }
    }
  }

  const [findReports, findAdminReports] = await Promise.all([
    repository.representativeReports(representativeNames),
    repository.adminRepresentativeReports(representativeNames),
  ]);

  // share-code restriction (view-only shares list a company subset)
  let selectedCompany = [];
  if (auth.showOtherCompanies !== undefined && Number(auth.showOtherCompanies) === 0 && auth.shareCode) {
    const transactions = await repository.sharedTransactions(auth.shareCode);
    if (transactions) {
      try {
        const sharedData = JSON.parse(transactions);
        if (Array.isArray(sharedData.selectedCompanies) && sharedData.selectedCompanies.length) {
          selectedCompany = sharedData.selectedCompanies;
        }
      } catch (_err) { /* malformed share payload: no restriction */ }
    }
  }

  let companiesList = [];
  for (const representative of list) {
    const row = { ...representative };
    if (row.company_id > 0) row.representative_id = row.company_id;
    if (selectedCompany.length) {
      row.status = selectedCompany.includes(representative.company_id) ? 1 : 0;
    }
    delete row.company_id;
    delete row.parent_id;

    const childRows = findChild.filter((r) => r.parent_id === representative.representative_id);
    const childWithName = [];
    const child = childRows.map((obj) => {
      const companyID = obj.company_id > 0 ? obj.company_id : obj.representative_id;
      let status = obj.status;
      if (selectedCompany.length) status = selectedCompany.includes(companyID) ? 1 : 0;
      childWithName.push({
        original_name: obj.original_name,
        representative_name: obj.representative_name,
        representative_id: companyID,
        status,
      });
      return companyID;
    });

    let counters = { no_of_assets: 0, no_of_transactions: 0, no_of_parties: 0, no_of_inventor: 0, no_of_activities: 0, product: 0 };
    if (representative.type === 1 && child.length) {
      const childNames = childRows.map(reportName);
      let adminTransactions = 0;
      let adminParties = 0;
      for (const name of childNames) {
        const rep = findReports.find((r) => r.representative_name === name);
        if (rep) {
          counters.no_of_assets += parseInt(rep.no_of_assets, 10);
          counters.no_of_transactions += parseInt(rep.no_of_transactions, 10);
          counters.no_of_parties += parseInt(rep.no_of_parties, 10);
          counters.no_of_inventor += rep.no_of_inventor != null && rep.no_of_inventor !== '' ? parseInt(rep.no_of_inventor, 10) : 0;
          counters.no_of_activities += parseInt(rep.no_of_activities, 10);
        }
        const admin = findAdminReports.find((r) => r.representative_name === name);
        if (admin) {
          adminTransactions += parseInt(admin.no_of_transactions, 10);
          adminParties += parseInt(admin.no_of_parties, 10);
        }
      }
      counters.product = adminParties - adminTransactions;
    } else if (representative.type !== 1) {
      counters = mergeReports(representative.representative_name, findReports, findAdminReports);
    }
    if (counters.product === 0 && counters.no_of_parties > 0) {
      counters.product = counters.no_of_parties - counters.no_of_transactions;
    }

    companiesList.push({
      ...row,
      channel: '',
      child: JSON.stringify(child),
      child_total: child.length,
      child_full_detail: JSON.stringify(childWithName),
      ...counters,
    });
  }

  if (selectedCompany.length) {
    const active = companiesList.filter((r) => selectedCompany.includes(r.representative_id));
    const inactive = companiesList.filter((r) => !selectedCompany.includes(r.representative_id));
    companiesList = [...active, ...inactive];
  }
  return { list: companiesList, total_records };
};

// GET /companies/maintainence_assets
const maintainenceAssets = async (orgId, orgType, representativeIds) => {
  if (!representativeIds.length) return { total_records: 0, list: [] };
  const list = await repository.maintainenceAssets({ representativeIds, orgId, bankMode: orgType === 2 });
  return { total_records: list.length, list };
};

// GET /companies/lawfirm, POST /companies/lawfirm, DELETE /companies/lawfirm/:id
const lawfirmMappings = (tenant, representativeIds) => repository.companyLawfirms(tenant, representativeIds);

const addLawfirmMappings = async (tenant, companies, lawfirms) => {
  if (!lawfirms.length) throw ApiError.badRequest('Please select law firm IDs.');
  const rows = [];
  for (const company of companies) {
    for (const lawfirm of lawfirms) rows.push({ representative_id: company, lawfirm_id: lawfirm });
  }
  const added = await repository.bulkCreateCompanyLawfirms(tenant, rows);
  return added.map((a) => (a.toJSON ? a.toJSON() : a));
};

const removeLawfirmMapping = async (tenant, id) => {
  const existing = await repository.findCompanyLawfirm(tenant, id);
  if (!existing) throw ApiError.notFound('Record not found');
  await repository.deleteCompanyLawfirm(tenant, id);
  return { company_lawfirm_id: id, deleted: true };
};

// GET /companies/search/:searchName — multi-line fulltext search (live path of
// the legacy helper; its PTAB half was fully commented out).
const search = async (searchName) => {
  const lines = String(searchName).split(/\r\n|\r|\n/);
  const out = [];
  for (const line of lines) {
    const cleaned = line.replace(/[.,]/g, '').toLowerCase();
    if (!cleaned) continue;
    const rows = await repository.searchCompanies(cleaned, 0, DEFAULT_YEAR());
    out.push(...rows);
  }
  return out;
};

// POST /companies/group — find-or-create a type-1 group.
const addGroup = async (tenant, groupName) => {
  const existing = await repository.findGroup(tenant, groupName);
  if (existing) return existing;
  const created = await repository.createRepresentative(tenant, {
    original_name: groupName,
    representative_name: groupName,
    instances: 0,
    type: 1,
    company_id: 0,
  });
  return created.toJSON ? created.toJSON() : created;
};

const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

const triggerCompanyRebuild = async (orgId, companyId, extraArg) => {
  await runPhpScript('add_representative_rfids.php', [orgId, companyId]);
  runPhpScriptBackground(
    'create_data_for_company_db_application.php',
    extraArg !== undefined ? [orgId, companyId, extraArg] : [orgId, companyId]
  );
};

/**
 * POST /companies — import requested companies, either under a parent group or
 * as top-level companies, then trigger the PHP data-pipeline rebuild per
 * company. Faithful port; two legacy bugs fixed: the parent-status update was
 * missing its where clause (threw for type-1 inactive parents), and the
 * assignee-list loop awaited the wrong promise array.
 */
const createCompanies = async (tenant, auth, { name, parent_company }) => {
  if (!name || !String(name).length) throw ApiError.badRequest('Name cannot be blank');
  const requestedIds = JSON.parse(name);
  if (!Array.isArray(requestedIds) || !requestedIds.length) {
    throw ApiError.badRequest('Please select companies first.');
  }

  const requests = await repository.requestsByIds(requestedIds);
  const accounts = requests.filter((r) => r.account_id > 0).map((r) => r.account_id);
  const representativeIds = requests.filter((r) => r.representative_id > 0).map((r) => r.representative_id);

  if (accounts.length) {
    runPhpScriptBackground('transferred_data_from_one_account_to_another_accounts.php', [auth.orgId, accounts.join(',')]);
  }

  let companyList = [];
  if (representativeIds.length) {
    const assignees = await repository.assigneeIdsForRepresentatives(representativeIds);
    companyList = assignees.map((r) => r.assignor_and_assignee_id);
  }
  if (!companyList.length) throw ApiError.badRequest('Please select companies first.');

  const getList = await repository.subsidiaryCompanies(companyList);
  const currentDate = now();
  const activityLogs = [];

  if (parent_company !== undefined && parent_company > 0) {
    const parent = await repository.findParentCompany(tenant, parent_company);
    if (!parent) throw ApiError.forbidden('Parent company not exist');
    if (parent.type === 1 && parent.status === 0) {
      await repository.updateRepresentative(tenant, parent.representative_id, { status: 1 });
    }
    const listed = await repository.representativesByParent(tenant, parent.representative_id);
    const listedNames = [parent.original_name, ...listed.map((l) => l.original_name)];

    const companies = [];
    const childCompanies = [];
    let alreadyAdded = false;
    for (const company of getList) {
      if (listedNames.includes(company.name)) {
        alreadyAdded = true;
        continue;
      }
      const instances = company.representative_instances > 0 ? company.representative_instances : company.instances;
      const row = {
        original_name: company.name,
        company_id: company.representative_id,
        representative_name: company.representative_name != null ? company.representative_name : company.name,
        instances,
        parent_id: parent.representative_id,
      };
      if (companyList.includes(company.assignor_and_assignee_id)) row.child = 1;
      companies.push(row);
      childCompanies.push(company.representative_id);
      activityLogs.push({
        organisation_id: auth.orgId, user_id: auth.userId, type: 0,
        company_name: company.name, representative_company_name: parent.original_name, activity_date: currentDate,
      });
    }

    if (!companies.length) {
      if (alreadyAdded) throw ApiError.forbidden('Company already added');
      throw ApiError.badRequest('Invalid inputs');
    }
    await repository.bulkCreateRepresentatives(tenant, companies);
    repository.logActivities(activityLogs).catch(() => {});
    for (const companyId of childCompanies) {
      await triggerCompanyRebuild(auth.orgId, companyId);
    }
    return { added: companies };
  }

  // top-level companies
  const companies = [];
  const originalNames = [];
  const representativeNames = [];
  for (const company of getList) {
    const instances = company.representative_instances > 0 ? company.representative_instances : company.instances;
    if (company.name != null) originalNames.push(company.name);
    if (company.representative_name != null) representativeNames.push(company.representative_name);
    companies.push({
      instances,
      representative_id: company.representative_id,
      original_name: company.name,
      representative_name: company.representative_name != null ? company.representative_name : company.name,
    });
  }
  if (!companies.length) throw ApiError.badRequest('Invalid inputs');

  const existing = await repository.representativesByNames(tenant, originalNames, representativeNames);
  const existingNames = new Set();
  for (const c of existing) {
    existingNames.add(c.original_name);
    existingNames.add(c.representative_name);
  }

  const mainCompanies = [];
  let added = 0;
  for (const company of companies) {
    if (existingNames.has(company.original_name) || existingNames.has(company.representative_name)) continue;
    const parent = await repository.createRepresentative(tenant, {
      original_name: company.original_name,
      company_id: company.representative_id,
      representative_name: company.representative_name,
      instances: company.instances,
    });
    if (parent) {
      activityLogs.push({
        organisation_id: auth.orgId, user_id: auth.userId, type: 0,
        company_name: company.original_name, representative_company_name: company.original_name, activity_date: currentDate,
      });
      mainCompanies.push(company.representative_id);
      added++;
    }
  }
  if (!added) throw ApiError.internal('Internal server error');
  repository.logActivities(activityLogs).catch(() => {});
  for (const companyId of mainCompanies) {
    await triggerCompanyRebuild(auth.orgId, companyId);
  }
  return { added };
};

/**
 * DELETE /companies — delete companies (optionally dissolving groups while
 * keeping their members), clean representative transactions and trigger the
 * KPI/tree rebuild. Faithful port of the legacy flow.
 */
const deleteCompanies = async (tenant, auth, { companies, type }) => {
  if (!companies.length) throw ApiError.badRequest('No company found');
  const found = await repository.representativesByIds(tenant, companies);
  if (!found.length) throw ApiError.badRequest('No company found');

  const currentDate = now();
  const deleteParents = [];
  const reUpdate = [];
  const deleteIds = [];
  const activityLogs = [];
  for (const c of found) {
    if (c.parent_id === 0) deleteParents.push(c.representative_id);
    else if (!reUpdate.includes(c.parent_id)) reUpdate.push(c.parent_id);
    deleteIds.push(c.representative_id);
    activityLogs.push({
      organisation_id: auth.orgId, user_id: auth.userId, type: 1,
      company_name: c.original_name, representative_company_name: c.original_name, activity_date: currentDate,
    });
  }
  if (deleteParents.length) {
    const subs = await repository.childRepresentativeIds(tenant, deleteParents);
    deleteIds.push(...subs.map((s) => s.representative_id));
  }

  const where = { representative_id: deleteIds };
  if (Number(type) === 1) {
    // dissolve groups: detach members, delete only type-1 rows
    await repository.updateRepresentativesWhere(tenant, { parent_id: 0 }, { parent_id: deleteIds, type: 0, child: 1 });
    where.type = 1;
  }
  await repository.destroyRepresentatives(tenant, where);
  repository.logActivities(activityLogs).catch(() => {});

  if (deleteParents.length) {
    await repository.destroyRepresentativeTransactions({ representative_id: deleteParents, organisation_id: auth.orgId });
  }
  if (reUpdate.length) {
    await repository.destroyRepresentativeTransactions({ representative_id: reUpdate, organisation_id: auth.orgId });
    const parents = await q_representativesForRebuild(tenant, reUpdate);
    for (const company of parents) {
      await triggerCompanyRebuild(auth.orgId, company.company_id);
    }
  } else {
    runPhpScriptBackground('create_data_for_company_db_application.php', [auth.orgId, '']);
  }
  return { deleted: deleteIds };
};

// helper: parents needing a rebuild after member deletion
const q_representativesForRebuild = async (tenant, ids) => {
  const rows = await repository.representativesWhere(
    tenant, 'representative_id IN (:ids) AND type = 0', { ids }, 'representative_id'
  );
  return rows;
};

// DELETE /companies/subcompanies — remove child companies and rebuild parents.
const deleteSubcompanies = async (tenant, auth, companies) => {
  if (!companies.length) throw ApiError.badRequest('No company found');
  const found = await repository.subcompaniesByIds(tenant, companies);
  if (!found.length) throw ApiError.badRequest('No company found');

  const currentDate = now();
  const ids = found.map((c) => c.representative_id);
  const activityLogs = found.map((c) => ({
    organisation_id: auth.orgId, user_id: auth.userId, type: 1,
    company_name: c.original_name, representative_company_name: '', activity_date: currentDate,
  }));
  await repository.destroyRepresentatives(tenant, { representative_id: ids });
  repository.logActivities(activityLogs).catch(() => {});

  const parentCompanyIds = [...new Set(found.filter((c) => c.company_id > 0).map((c) => c.company_id))];
  const mains = parentCompanyIds.length
    ? await repository.representativesByCompanyIds(tenant, parentCompanyIds)
    : [];
  if (mains.length) {
    await repository.destroyRepresentativeTransactions({ representative_id: parentCompanyIds });
    for (const company of mains) {
      await triggerCompanyRebuild(auth.orgId, company.company_id, 1);
    }
  } else {
    runPhpScriptBackground('create_data_for_company_db_application.php', [auth.orgId, '']);
  }
  return { deleted: ids };
};

module.exports = {
  createCompanies,
  deleteCompanies,
  deleteSubcompanies,
  addRequest,
  listRequests,
  companiesWithChildren,
  updateCompany,
  summary,
  companyChildren,
  companyList,
  maintainenceAssets,
  lawfirmMappings,
  addLawfirmMappings,
  removeLawfirmMapping,
  search,
  addGroup,
};
