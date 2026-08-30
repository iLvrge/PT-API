'use strict';

const { connections } = require('../../db');
const q = require('../../db/query');
const { tenantModel } = require('../../db/tenant-models');
const ClientAddCompany = require('../../db/models/client-add-company.model');

// ---- company requests (db_new_application.client_add_company) ----
const findRequestByName = (name) =>
  q.selectOne(connections.applicationNew, `SELECT * FROM client_add_company WHERE name = :name LIMIT 1`, { name });

const createRequest = (data) => ClientAddCompany.create(data);

const listRequests = (orgId) =>
  q.selectAll(
    connections.applicationNew,
    `SELECT name, company_id,
            (CASE status WHEN 1 THEN 'Ready to import' ELSE 'Data is being prepared' END) AS status
       FROM client_add_company WHERE organisation_id = :orgId`,
    { orgId }
  );

// ---- tenant representative tree (helpers.getCompaniesWithChildren) ----
const companiesWithChildren = async (tenant) => {
  const companies = await q.selectAll(
    tenant,
    `SELECT *, CAST(counter AS UNSIGNED) AS counter FROM (
       SELECT representative_id as id, '' AS slack, original_name, representative_name, instances,
              (Select SUM(instances) FROM representative as r1 WHERE r1.parent_id = r.representative_id) as counter,
              type, status
         FROM representative as r WHERE r.parent_id = 0) AS tempT`
  );
  if (!companies.length) return companies;

  const children = await q.selectAll(
    tenant,
    `SELECT representative_id as id, '' AS slack, original_name, representative_name, instances as counter,
            parent_id, status
       FROM representative as r WHERE r.parent_id IN (:parentIds) AND child = 1
      ORDER BY r.parent_id ASC, representative_name ASC, counter DESC`,
    { parentIds: companies.map((c) => c.id) }
  );
  const byParent = new Map();
  for (const child of children) {
    if (!byParent.has(child.parent_id)) byParent.set(child.parent_id, []);
    byParent.get(child.parent_id).push(child);
  }
  return companies.map((c) => ({ ...c, children: byParent.get(c.id) || [] }));
};

const findRepresentative = (tenant, representativeId) =>
  q.selectOne(tenant, `SELECT * FROM representative WHERE representative_id = :representativeId LIMIT 1`, {
    representativeId,
  });

const updateRepresentative = (tenant, representativeId, data) =>
  tenantModel(tenant, 'client_representative').update(data, { where: { representative_id: representativeId } });

const countChildren = (tenant, parentId) =>
  q.selectValue(tenant, `SELECT COUNT(*) AS c FROM representative WHERE parent_id = :parentId`, { parentId }, 'c', 0);

const findGroup = (tenant, name) =>
  q.selectOne(
    tenant,
    `SELECT * FROM representative
      WHERE original_name = :name AND representative_name = :name AND instances = 0 AND type = 1 LIMIT 1`,
    { name }
  );

const createRepresentative = (tenant, data) => tenantModel(tenant, 'client_representative').create(data);

// representatives by filter (list endpoints)
const representativesWhere = (tenant, whereSql, repl, orderSql) =>
  q.selectAll(
    tenant,
    `SELECT representative_id, company_id, parent_id, original_name, representative_name, type, status, child
       FROM representative WHERE ${whereSql} ORDER BY ${orderSql}`,
    repl
  );

const countRepresentativesWhere = (tenant, whereSql, repl) =>
  q.selectValue(tenant, `SELECT COUNT(*) AS c FROM representative WHERE ${whereSql}`, repl, 'c', 0);

// ---- summary (db_uspto.summary) ----
const orgSummary = (orgId) =>
  q.selectOne(
    connections.resources,
    `SELECT companies, activities AS activites, entities, parties, entities, employees, transactions, assets, arrows AS rights
       FROM db_uspto.summary WHERE organisation_id = :orgId AND company_id = 0 LIMIT 1`,
    { orgId }
  );

const activeRights = (orgId, companyIds) =>
  q.selectOne(
    connections.resources,
    `SELECT SUM(arrows) AS rightsActive FROM db_uspto.summary
      WHERE organisation_id = :orgId AND company_id IN (:companyIds) GROUP BY organisation_id`,
    { orgId, companyIds }
  );

// ---- reports (db_uspto) ----
const representativeReports = (names) => {
  if (!names.length) return Promise.resolve([]);
  return q.selectAll(
    connections.resources,
    `SELECT representative_name, no_of_assets, no_of_transactions, no_of_parties, no_of_inventor, no_of_activities
       FROM representative_reports WHERE representative_name IN (:names) ORDER BY representative_name ASC`,
    { names }
  );
};

const adminRepresentativeReports = (names) => {
  if (!names.length) return Promise.resolve([]);
  return q.selectAll(
    connections.resources,
    `SELECT representative_name, no_of_transactions, no_of_parties
       FROM admin_representative_reports WHERE representative_name IN (:names) ORDER BY representative_name ASC`,
    { names }
  );
};

const sharedTransactions = (code) =>
  q.selectValue(connections.applicationNew, `SELECT transactions FROM share WHERE code = :code LIMIT 1`, { code }, 'transactions', null);

// ---- maintenance assets ----
const maintainenceAssets = ({ representativeIds, orgId, bankMode }) => {
  const repl = { representativeIDs: representativeIds, organisationID: orgId, layoutID: 3, type: 35 };
  if (bankMode) repl.mode = 1;
  return q.selectAll(
    connections.applicationNew,
    `SELECT asset, asset_type, channel, appno_doc_num, grant_doc_num, grant_date, payment_due, payment_grace, type, fee_code, fee_amount, fee_code_surcharge, fee_surcharge, remaining_year, source, fwd_citation, technology, child_count FROM maintainence_assets WHERE company_id IN (:representativeIDs) AND organisation_id = :organisationID AND appno_doc_num IN (SELECT application COLLATE utf8mb4_0900_ai_ci FROM dashboard_items WHERE organisation_id = :organisationID AND representative_id IN (:representativeIDs) ${bankMode ? 'AND mode IN (:mode)' : ''} AND type = :type GROUP BY application) AND appno_doc_num NOT IN (SELECT appno_doc_num FROM db_application.assets_transfer WHERE appno_doc_num <> '' AND status = 0 AND layout_id = :layoutID AND organisation_id = :organisationID) AND grant_doc_num NOT IN (SELECT grant_doc_num FROM db_application.assets_transfer WHERE appno_doc_num = '' AND grant_doc_num <> '' AND status = 0 AND layout_id = :layoutID AND organisation_id = :organisationID) GROUP BY grant_doc_num, appno_doc_num, company_id`,
    repl
  );
};

// ---- company/lawfirm mappings (tenant) ----
const companyLawfirms = async (tenant, representativeIds) => {
  const hasFilter = Array.isArray(representativeIds) && representativeIds.length > 0;
  const reps = await q.selectAll(
    tenant,
    `SELECT representative_id, original_name, representative_name FROM representative
      WHERE parent_id = 0 ${hasFilter ? 'AND representative_id IN (:representativeIds)' : ''}`,
    hasFilter ? { representativeIds } : {}
  );
  if (!reps.length) return reps;
  const mappings = await q.selectAll(
    tenant,
    `SELECT cl.representative_id, cl.lawfirm_id, l.name AS lawfirm_name
       FROM company_lawfirm AS cl LEFT JOIN lawfirm AS l ON l.lawfirm_id = cl.lawfirm_id
      WHERE cl.representative_id IN (:ids)`,
    { ids: reps.map((r) => r.representative_id) }
  );
  const byRep = new Map();
  for (const m of mappings) {
    if (!byRep.has(m.representative_id)) byRep.set(m.representative_id, []);
    byRep.get(m.representative_id).push({
      lawfirm_id: m.lawfirm_id,
      lawfirm: { lawfirm_id: m.lawfirm_id, name: m.lawfirm_name },
    });
  }
  return reps.map((r) => ({ ...r, mapping_company_law_firms: byRep.get(r.representative_id) || [] }));
};

const bulkCreateCompanyLawfirms = (tenant, rows) =>
  tenantModel(tenant, 'company_lawfirm').bulkCreate(rows, { returning: true });

const findCompanyLawfirm = (tenant, id) =>
  q.selectOne(tenant, `SELECT company_lawfirm_id FROM company_lawfirm WHERE company_lawfirm_id = :id LIMIT 1`, { id });

const deleteCompanyLawfirm = (tenant, id) =>
  tenantModel(tenant, 'company_lawfirm').destroy({ where: { company_lawfirm_id: id } });

// ---- search (helpers.searchCompany live path) ----
const searchCompanies = (search, t, year) => {
  let queryCompany = `SELECT a.assignor_and_assignee_id as id, a.assignor_and_assignee_id, a.name COLLATE utf8mb4_general_ci AS name, a.instances COLLATE utf8mb4_general_ci as counter, c.representative_name as normalize_name, (select rr.representative_name FROM representative as rr WHERE rr.representative_name = a.name GROUP BY rr.representative_name) as representative_company, (SELECT concat(ass.reel_no,'-', ass.frame_no) FROM assignee as ee INNER JOIN assignment as ass ON ass.rf_id = ee.rf_id WHERE ee.assignor_and_assignee_id = a.assignor_and_assignee_id LIMIT 1) as assigneeRFID, (SELECT concat(asss.reel_no,'-', asss.frame_no) FROM assignor as assi INNER JOIN assignment as asss ON asss.rf_id = assi.rf_id WHERE assi.assignor_and_assignee_id = a.assignor_and_assignee_id LIMIT 1) as assignorRFID, 0 AS assigneeBibRFID, 0 AS assignorBibRFID, '1' AS flag FROM assignor_and_assignee as a
    LEFT JOIN representative as c ON c.representative_id = a.representative_id
    INNER JOIN LATERAL (Select assignee.assignor_and_assignee_id from assignment
      INNER JOIN assignee ON assignee.rf_id = assignment.rf_id
      WHERE date_format(assignment.record_dt, '%Y') >= :year AND assignee.assignor_and_assignee_id = a.assignor_and_assignee_id
      GROUP BY assignee.ee_name
      UNION
      Select assignor.assignor_and_assignee_id from assignment
      INNER JOIN assignor ON assignor.rf_id = assignment.rf_id
      WHERE date_format(assignment.record_dt, '%Y') >= :year AND assignor.assignor_and_assignee_id = a.assignor_and_assignee_id
      GROUP BY assignor.or_name) as tempAssignorAndAssignee `;
  queryCompany += search.length === 1 ? ` WHERE trim(a.name) = :search ` : ` WHERE MATCH(a.name) AGAINST (:search IN BOOLEAN MODE) `;
  queryCompany += ` GROUP BY a.name `;

  let queryApplicant = `SELECT a.assignor_and_assignee_id as id, a.assignor_and_assignee_id, a.name, a.instances as counter, c.representative_name as normalize_name, (select rr.representative_name FROM db_uspto.representative as rr WHERE rr.representative_name = a.name GROUP BY rr.representative_name) as representative_company, (SELECT appno_doc_num FROM db_patent_application_bibliographic.applicant WHERE assignor_and_assignee_id > 0 AND assignor_and_assignee_id = a.assignor_and_assignee_id LIMIT 1) as assigneeRFID, (SELECT appno_doc_num FROM db_patent_grant_bibliographic.applicant WHERE assignor_and_assignee_id > 0 AND assignor_and_assignee_id = a.assignor_and_assignee_id LIMIT 1) as assignorRFID, (SELECT appno_doc_num FROM db_patent_application_bibliographic.assignee WHERE assignor_and_assignee_id > 0 AND assignor_and_assignee_id = a.assignor_and_assignee_id LIMIT 1) as assigneeBibRFID, (SELECT appno_doc_num FROM db_patent_grant_bibliographic.assignee WHERE assignor_and_assignee_id > 0 AND assignor_and_assignee_id = a.assignor_and_assignee_id LIMIT 1) as assignorBibRFID, '2' AS flag FROM db_patent_application_bibliographic.assignor_and_assignee as a
    LEFT JOIN db_uspto.representative as c ON c.representative_id = a.representative_id `;
  queryApplicant += search.length === 1 ? `WHERE trim(a.name) = :search ` : `WHERE MATCH(a.name) AGAINST (:search IN BOOLEAN MODE) `;
  if (t === 1) queryApplicant += ` AND a.type = 0 `;
  queryApplicant += ` GROUP BY a.name `;

  return q.selectAll(
    connections.resources,
    `SELECT * FROM (${queryCompany} UNION ${queryApplicant}) AS temp ORDER BY counter DESC`,
    { search, year }
  );
};

// ---- company creation / deletion support ----
const ActivityLog = require('../../db/models/activity-log.model');
const RepresentativeTransactions = require('../../db/models/representative-transactions.model');

const requestsByIds = (companyIds) =>
  q.selectAll(connections.applicationNew, `SELECT * FROM client_add_company WHERE company_id IN (:companyIds)`, { companyIds });

const assigneeIdsForRepresentatives = (representativeIds) =>
  q.selectAll(
    connections.resources,
    `SELECT assignor_and_assignee_id FROM db_uspto.assignor_and_assignee
      WHERE name IN (SELECT representative_name FROM db_uspto.representative
                      WHERE representative_id IN (:representativeIds) GROUP BY representative_name)
      GROUP BY assignor_and_assignee_id`,
    { representativeIds }
  );

const subsidiaryCompanies = (ids) =>
  q.selectAll(
    connections.resources,
    `SELECT aaa.assignor_and_assignee_id, aaa.name, r.representative_name, aaa.instances, r.representative_id,
            (SELECT sum(a.instances) as counter FROM assignor_and_assignee as a
              WHERE a.representative_id IN (SELECT representative_id FROM representative
                                             WHERE representative_name = r.representative_name)
              GROUP BY a.representative_id) as representative_instances
       FROM assignor_and_assignee as aaa
       LEFT JOIN representative as r ON r.representative_id = aaa.representative_id
      WHERE aaa.assignor_and_assignee_id IN (:ids)`,
    { ids }
  );

const findParentCompany = (tenant, representativeId) =>
  q.selectOne(
    tenant,
    `SELECT representative_id, original_name, representative_name, type, status
       FROM representative WHERE representative_id = :representativeId AND parent_id = 0 LIMIT 1`,
    { representativeId }
  );

const representativesByParent = (tenant, parentId) =>
  q.selectAll(tenant, `SELECT * FROM representative WHERE parent_id = :parentId`, { parentId });

const representativesByNames = (tenant, originalNames, representativeNames) => {
  if (representativeNames.length) {
    return q.selectAll(
      tenant,
      `SELECT * FROM representative WHERE original_name IN (:originalNames) OR representative_name IN (:representativeNames)`,
      { originalNames, representativeNames }
    );
  }
  return q.selectAll(tenant, `SELECT * FROM representative WHERE original_name IN (:originalNames)`, { originalNames });
};

const representativesByIds = (tenant, ids) =>
  q.selectAll(
    tenant,
    `SELECT representative_id, parent_id, original_name, type, company_id, child FROM representative
      WHERE representative_id IN (:ids) GROUP BY representative_id, parent_id`,
    { ids }
  );

const childRepresentativeIds = (tenant, parentIds) =>
  q.selectAll(tenant, `SELECT representative_id FROM representative WHERE parent_id IN (:parentIds)`, { parentIds });

const subcompaniesByIds = (tenant, ids) =>
  q.selectAll(
    tenant,
    `SELECT representative_id, original_name, parent_id, company_id FROM representative
      WHERE representative_id IN (:ids) AND parent_id > 0`,
    { ids }
  );

const representativesByCompanyIds = (tenant, companyIds) =>
  q.selectAll(
    tenant,
    `SELECT representative_id, original_name, company_id FROM representative
      WHERE company_id IN (:companyIds) AND type = 0`,
    { companyIds }
  );

const bulkCreateRepresentatives = (tenant, rows) =>
  tenantModel(tenant, 'client_representative').bulkCreate(rows);

const destroyRepresentatives = (tenant, where) =>
  tenantModel(tenant, 'client_representative').destroy({ where });

const updateRepresentativesWhere = (tenant, data, where) =>
  tenantModel(tenant, 'client_representative').update(data, { where });

const logActivities = (rows) => ActivityLog.bulkCreate(rows);

const destroyRepresentativeTransactions = (where) => RepresentativeTransactions.destroy({ where });

module.exports = {
  requestsByIds,
  assigneeIdsForRepresentatives,
  subsidiaryCompanies,
  findParentCompany,
  representativesByParent,
  representativesByNames,
  representativesByIds,
  childRepresentativeIds,
  subcompaniesByIds,
  representativesByCompanyIds,
  bulkCreateRepresentatives,
  destroyRepresentatives,
  updateRepresentativesWhere,
  logActivities,
  destroyRepresentativeTransactions,
  findRequestByName,
  createRequest,
  listRequests,
  companiesWithChildren,
  findRepresentative,
  updateRepresentative,
  countChildren,
  findGroup,
  createRepresentative,
  representativesWhere,
  countRepresentativesWhere,
  orgSummary,
  activeRights,
  representativeReports,
  adminRepresentativeReports,
  sharedTransactions,
  maintainenceAssets,
  companyLawfirms,
  bulkCreateCompanyLawfirms,
  findCompanyLawfirm,
  deleteCompanyLawfirm,
  searchCompanies,
};
