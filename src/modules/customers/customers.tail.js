'use strict';

/**
 * The closing customers endpoints: /:layout/transactions, /:type,
 * /:parentCompany/parties/:tabId and /:parentCompany/:name/collections/:tabId.
 *
 * The collections route's 11 near-identical legacy queries collapse into one
 * template driven by a per-tab config (direction, conveyance types,
 * employer_assign) - results identical, 200 lines fewer.
 */

const { connections } = require('../../db');
const q = require('../../db/query');

// ---- /:layout/transactions ----

const WINDOW_LAYOUTS = new Set([17, 18, 19, 24, 25, 26, 39, 40, 41]);

const windowTransactions = async ({ layoutId, companies, customers, lawfirm, bankMode }) => {
  const repl = { organisationID: 0, layoutID: layoutId, companies };
  if (bankMode) repl.mode = 1;

  let sql = `SELECT trans.rf_id, assignment.reel_no, assignment.frame_no, '' AS channel, trans.date, assets, sum(assets) OVER (ORDER BY trans.date) AS grand_total FROM (SELECT documentid.rf_id, (SELECT date_format(exec_dt,'%m-%d-%Y') FROM db_uspto.assignor AS assignor WHERE assignor.rf_id = documentid.rf_id LIMIT 1) AS date, COUNT(distinct documentid.appno_doc_num) AS assets FROM db_uspto.documentid As documentid WHERE documentid.rf_id IN (SELECT rf_id FROM dashboard_items WHERE organisation_id = :organisationID AND representative_id IN (:companies) AND type = :layoutID `;

  if (layoutId === 41) {
    if (customers.length) {
      repl.customers = customers;
      sql += ` AND assignor_id IN ( SELECT assignor_and_assignee_id FROM ( SELECT assignor_and_assignee_id FROM db_uspto.assignor_and_assignee WHERE assignor_and_assignee_id IN (:customers) UNION SELECT assignor_and_assignee_id FROM db_uspto.assignor_and_assignee WHERE representative_id IN (SELECT representative_id FROM db_uspto.assignor_and_assignee WHERE assignor_and_assignee_id IN (:customers) AND representative_id > 0)) As tempAssignorAndAssignee GROUP BY assignor_and_assignee_id ) `;
    }
  } else {
    // Legacy appended this unconditionally; an empty selection binds '' and
    // matches nothing meaningful, preserved for parity.
    repl.customers = customers.length ? customers : '';
    sql += ` AND assignor_id IN (:customers) `;
  }

  sql += ` ${bankMode ? 'AND mode IN (:mode)' : ''} GROUP BY rf_id) GROUP BY documentid.rf_id) AS trans INNER JOIN db_uspto.assignment AS assignment ON assignment.rf_id = trans.rf_id `;

  if (lawfirm > 0) {
    const firm = await q.selectOne(
      connections.applicationNew,
      `SELECT cname, lf.name, rlf.representative_id FROM db_uspto.correspondent AS c LEFT JOIN db_uspto.law_firm as lf ON c.cname = lf.name LEFT JOIN db_uspto.representative_law_firm AS rlf ON rlf.representative_id = lf.representative_id WHERE c.rf_id = :lawfirm LIMIT 1`,
      { lawfirm }
    );
    if (firm) {
      let tempQuery = `SELECT c.rf_id FROM db_uspto.correspondent AS c LEFT JOIN db_uspto.law_firm as lf ON c.cname = lf.name LEFT JOIN db_uspto.representative_law_firm AS rlf ON rlf.representative_id = lf.representative_id WHERE c.rf_id IN (SELECT rf_id FROM db_new_application.activity_parties_transactions WHERE ( organisation_id = :organisationID OR organisation_id IS NULL ) AND company_id IN (:companies)) `;
      if (firm.representative_id > 0) {
        tempQuery += ` AND rlf.representative_id = :representative_id`;
        repl.representative_id = firm.representative_id;
      } else {
        tempQuery += ` AND c.cname = :name`;
        repl.name = firm.cname;
      }
      tempQuery += ` GROUP BY c.rf_id`;
      sql += ` WHERE assignment.rf_id IN (${tempQuery}) `;
    }
  }

  sql += ' ORDER BY `date` DESC';
  return q.selectAll(connections.applicationNew, sql, repl);
};

// Stored-procedure branch. The legacy selector compared the STALE layoutID
// variable (always 15), so routine_transactions was dead code - every
// non-window layout calls routine_transactions_full except correct_details.
const procTransactions = async ({ layoutName, layoutId, companies, tabs, customers }) => {
  const procedureName = layoutName === 'correct_details' ? 'routine_correct_details' : 'routine_transactions_full';
  const raw = await q.selectAll(
    connections.applicationNew,
    `CALL ${procedureName} (:companies, :organisationID, :tabs, :customers, :layoutID);`,
    {
      companies: companies.join(','),
      organisationID: 0,
      tabs: tabs.join(','),
      customers: customers.join(','),
      layoutID: layoutId,
    }
  );
  const first = Array.isArray(raw) ? raw[0] : raw;
  return first ? Object.values(first) : [];
};

// ---- /:type ----

const TYPE_TABS = {
  acquisitions: 0, sales: 1, licenseIn: 2, licenseOut: 3, securities: 4,
  mergerin: 5, mergerout: 6, options: 7, courtOrders: 8, employees: 9, other: 10,
};

// One grouped query replaces the legacy per-company loop; same counters.
const typeCounters = (tabId, representativeIds) => {
  if (!representativeIds.length) return Promise.resolve([]);
  return q.selectAll(
    connections.application,
    `SELECT representative_id, COUNT(assignor_and_assignee_id) AS counter
       FROM tree WHERE tab = :tabId AND parent = 0 AND organisation_id = :organisationId
        AND representative_id IN (:representativeIds)
       GROUP BY representative_id`,
    { tabId, organisationId: 0, representativeIds }
  );
};

const tenantCompanies = (tenant) =>
  q.selectAll(tenant, `SELECT representative_id, original_name FROM representative WHERE type = 0`);

// ---- /:parentCompany/parties/:tabId ----

const tenantCompanyByName = (tenant, companyName) =>
  q.selectOne(
    tenant,
    `SELECT representative_id FROM representative
      WHERE parent_id = 0 AND (representative_name = :companyName OR original_name = :companyName) LIMIT 1`,
    { companyName }
  );

const treeParties = (representativeId, tabId) =>
  q.selectAll(
    connections.application,
    `SELECT assignor_and_assignee_id as id, name, 'Invented' as type, 1 as level, 'closed' as state,
            :representativeId as parent_id
       FROM tree WHERE tab = :tabId AND parent = 0 AND organisation_id = :organisationId
        AND representative_id = :representativeId
       GROUP BY name ORDER BY name ASC`,
    { representativeId, tabId, organisationId: 0 }
  );

// ---- /:parentCompany/:name/collections/:tabId ----

// direction: which side the outer query reads. 'assignor' = outer assignor
// joined against inner assignee matches (and vice versa).
const COLLECTION_TABS = {
  0: [{ dir: 'assignor', convey: ['assignment', 'partialassignment'], ea: 0 }],
  1: [{ dir: 'assignee', convey: ['assignment', 'partialassignment'], ea: 0 }],
  2: [{ dir: 'assignor', convey: ['license', 'licenseend', 'govern'], ea: 0 }],
  3: [{ dir: 'assignee', convey: ['license', 'licenseend', 'govern'], ea: 0 }],
  4: [
    { dir: 'assignee', convey: ['security', 'restatedsecurity'], ea: 0 },
    { dir: 'assignor', convey: ['release', 'restatedsecurity', 'partialrelease'], ea: 0 },
  ],
  5: [{ dir: 'assignor', convey: ['merger'], ea: 0 }],
  6: [{ dir: 'assignee', convey: ['merger'], ea: 0 }],
  7: [
    { dir: 'assignor', convey: ['option'], ea: 0 },
    { dir: 'assignee', convey: ['option'], ea: 0 },
  ],
  8: [
    { dir: 'assignor', convey: ['courtorder'], ea: 0 },
    { dir: 'assignee', convey: ['courtorder'], ea: 0 },
  ],
  9: [{ dir: 'assignor', convey: ['assignment', 'partialassignment', 'employee'], ea: 1 }],
  10: [
    { dir: 'assignor', convey: ['missing', 'other', 'namechg'], ea: 0 },
    { dir: 'assignee', convey: ['missing', 'other', 'namechg'], ea: 0 },
  ],
};

const collectionQuery = ({ dir, convey, ea }, parentCompany, customerName) => {
  const outer = dir === 'assignor' ? 'assignor' : 'assignee';
  const inner = dir === 'assignor' ? 'assignee' : 'assignor';
  const execCol =
    dir === 'assignor'
      ? `date_format(ac.exec_dt, '%m-%d-%Y') as exec_dt`
      : `(SELECT date_format(ap.exec_dt, '%m-%d-%Y') FROM assignor as ap WHERE ap.rf_id = ac.rf_id ORDER BY ap.exec_dt ASC LIMIT 1) as exec_dt`;

  const sql = `SELECT ac.rf_id, ac.rf_id as name, ${execCol},
      (select count(d.appno_doc_num) FROM documentid as d WHERE d.rf_id = ac.rf_id) as counter
    FROM ${outer} as ac
    INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id
    LEFT JOIN representative as rr ON rr.representative_id = aa.representative_id
    INNER JOIN (
      SELECT a.rf_id FROM assignment as a
      INNER JOIN assignment_conveyance as ass ON ass.rf_id = a.rf_id
      INNER JOIN documentid as d ON ass.rf_id = d.rf_id
      INNER JOIN ${inner} as acc ON acc.rf_id = a.rf_id
      INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = acc.assignor_and_assignee_id
      LEFT JOIN representative as r ON r.representative_id = aaa.representative_id
      WHERE ass.convey_ty IN (:convey_type) AND ass.employer_assign = :employer_assign
        AND (aaa.name = :name OR r.representative_name = :name)
      GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id
    WHERE (aa.name = :customer_name OR rr.representative_name = :customer_name)
    GROUP BY ac.rf_id ORDER BY ac.rf_id ASC, exec_dt ASC`;

  return q.selectAll(connections.application, sql, {
    name: parentCompany,
    customer_name: customerName,
    convey_type: convey,
    employer_assign: ea,
  });
};

const collectionFrames = async (tabId, parentCompany, customerName) => {
  const configs = COLLECTION_TABS[tabId];
  if (!configs) return [];
  const resultSets = await Promise.all(configs.map((c) => collectionQuery(c, parentCompany, customerName)));
  const all = resultSets.flat().sort((a, b) => a.name - b.name);

  const seen = new Set();
  const frames = [];
  for (const reel of all) {
    if (!seen.has(reel.rf_id)) {
      seen.add(reel.rf_id);
      frames.push({ ...reel, id: reel.rf_id, level: 2 });
    }
  }
  return frames;
};

module.exports = {
  WINDOW_LAYOUTS,
  windowTransactions,
  procTransactions,
  TYPE_TABS,
  typeCounters,
  tenantCompanies,
  tenantCompanyByName,
  treeParties,
  COLLECTION_TABS,
  collectionFrames,
};
