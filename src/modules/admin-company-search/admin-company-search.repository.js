'use strict';

const { connections } = require('../../db');
const q = require('../../db/query');
const models = require('../../db/models/uspto.models');
const { ordinalCase } = require('./conveyance.constants');
const { AssigneeOrganization } = require('../../db/models/citations.models');

const uspto = () => connections.resources;
const app = () => connections.applicationNew;

const YEAR_FLOOR = () => new Date().getFullYear() - 24;

/* ------------------------------------------------------ company requests */

/**
 * Customer requests to add a company.
 *
 * Three shapes union together: a request pointed at a corpus company, one
 * pointed at another customer account, and one still unassigned.
 */
const companyRequests = () =>
  q.selectAll(
    uspto(),
    `SELECT * FROM (
        SELECT cac.company_id, cac.name, cac.status, r.representative_name,
               org.name AS organisation_name, cac.request_date AS date
          FROM db_new_application.client_add_company AS cac
          INNER JOIN db_business.organisation AS org ON org.organisation_id = cac.organisation_id
          INNER JOIN db_uspto.representative AS r ON r.representative_id = cac.representative_id
        UNION
        SELECT cac.company_id, cac.name, cac.status, org1.name AS representative_name,
               org.name AS organisation_name, cac.request_date AS date
          FROM db_new_application.client_add_company AS cac
          INNER JOIN db_business.organisation AS org ON org.organisation_id = cac.organisation_id
          INNER JOIN db_business.organisation AS org1 ON org1.organisation_id = cac.account_id
        UNION
        SELECT cac.company_id, cac.name, cac.status, '' AS representative_name,
               org.name AS organisation_name, cac.request_date AS date
          FROM db_new_application.client_add_company AS cac
          INNER JOIN db_business.organisation AS org ON org.organisation_id = cac.organisation_id
         WHERE cac.representative_id = 0 AND cac.account_id = 0
      ) AS temp ORDER BY company_id DESC`
  );

const resolveCompanyRequests = (companyIds, fields) =>
  models.ClientAddCompany.update(fields, { where: { company_id: companyIds } });

/* -------------------------------------------------------------- searching */

/** Full-text search over canonical company names. */
const searchRepresentatives = (name) =>
  q.selectAll(
    uspto(),
    `SELECT representative_id, representative_name FROM representative
      WHERE MATCH(representative_name) AGAINST (:name IN BOOLEAN MODE)`,
    { name }
  );

/** Customer accounts by name. */
const searchAccounts = (name) =>
  q.selectAll(
    connections.business,
    `SELECT organisation_id, name FROM organisation WHERE name LIKE :name`,
    { name: `%${name}%` }
  );

/**
 * Recorded party names matching a search term, with how often each appears and
 * what it currently normalises to.
 */
const searchParties = (terms) =>
  q.selectAll(
    uspto(),
    `SELECT a.assignor_and_assignee_id AS id, a.assignor_and_assignee_id, a.name,
            a.instances AS counter, a.representative_id,
            c.representative_name AS normalize_name
       FROM assignor_and_assignee AS a
       LEFT JOIN representative AS c ON c.representative_id = a.representative_id
      WHERE MATCH(a.name) AGAINST (:terms IN BOOLEAN MODE)
      GROUP BY a.name ORDER BY counter DESC`,
    { terms }
  );

/** Parties whose recorded address matches, restricted to security interests. */
const searchPartiesByAddress = ({ address, securityOnly }) => {
  const repl = { address, year: YEAR_FLOOR() };
  let sql = `SELECT a.assignor_and_assignee_id AS id, a.assignor_and_assignee_id, a.name,
            a.instances AS counter, COUNT(name) AS total_occurences,
            c.representative_name AS normalize_name,
            (SELECT rr.representative_name FROM representative AS rr
              WHERE rr.representative_name = a.name GROUP BY rr.representative_name)
              AS representative_company,
            CONCAT(assignment.reel_no, '-', assignment.frame_no) AS assigneeRFID,
            NULL AS assignorRFID
       FROM assignor_and_assignee AS a
       LEFT JOIN representative AS c ON c.representative_id = a.representative_id
       INNER JOIN assignee AS ass ON ass.assignor_and_assignee_id = a.assignor_and_assignee_id
       INNER JOIN assignment ON ass.rf_id = assignment.rf_id`;
  if (securityOnly) {
    sql += ` INNER JOIN representative_assignment_conveyance
                    ON assignment.rf_id = representative_assignment_conveyance.rf_id`;
  }
  sql += ` WHERE date_format(assignment.record_dt, '%Y') >= :year`;
  if (securityOnly) {
    sql += ` AND representative_assignment_conveyance.convey_ty IN (:conveyanceTypes)`;
    repl.conveyanceTypes = ['security', 'restatedsecurity'];
  }
  sql += ` AND MATCH(ass.ee_address_1, ass.ee_address_2) AGAINST (:address IN BOOLEAN MODE)
      GROUP BY a.name ORDER BY counter DESC`;
  return q.selectAll(uspto(), sql, repl);
};

/** Law firms whose correspondent address matches. */
const searchLawFirmsByAddress = (address) =>
  q.selectAll(
    uspto(),
    `SELECT law_firms.law_firm_id, name, assignment.rf_id AS rf_id, assignment.reel_no,
            assignment.frame_no, COUNT(law_firms.law_firm_id) AS counter,
            instances AS total_occurences, representative_law_firm.representative_id,
            representative_law_firm.representative_name
       FROM db_uspto.law_firm AS law_firms
       LEFT JOIN db_uspto.representative_law_firm AS representative_law_firm
              ON representative_law_firm.representative_id = law_firms.representative_id
       INNER JOIN (SELECT rf_id, cname, caddress_1 FROM correspondent AS cor
                    WHERE MATCH(cor.caddress_7, cor.caddress_5, cor.caddress_6, cor.caddress_3,
                                cor.caddress_4, cor.caddress_2, cor.caddress_1)
                          AGAINST (:address IN BOOLEAN MODE)
                    GROUP BY rf_id) AS temp ON temp.cname = law_firms.name
       INNER JOIN assignment ON assignment.rf_id = temp.rf_id
                            AND date_format(assignment.record_dt, '%Y') >= :year
      GROUP BY law_firms.name ORDER BY counter DESC`,
    { address, year: YEAR_FLOOR() }
  );

/** Parties in one country. */
const searchPartiesByCountry = (country) =>
  q.selectAll(
    uspto(),
    `SELECT a.assignor_and_assignee_id AS id, a.name, a.instances AS counter,
            c.representative_name AS normalize_name
       FROM assignor_and_assignee AS a
       LEFT JOIN representative AS c ON c.representative_id = a.representative_id
       INNER JOIN assignee AS ass ON ass.assignor_and_assignee_id = a.assignor_and_assignee_id
      WHERE ass.ee_country = :country
      GROUP BY a.name ORDER BY counter DESC`,
    { country }
  );

/* -------------------------------------------------------------- addresses */

const addressesForParty = ({ partyId, applicant }) =>
  q.selectAll(
    uspto(),
    applicant
      ? `SELECT ee_address_1, ee_address_2, ee_city, ee_state, ee_country, ee_postcode,
                COUNT(*) AS counter
           FROM db_patent_application_bibliographic.assignee
          WHERE assignor_and_assignee_id = :partyId
          GROUP BY ee_address_1, ee_address_2 ORDER BY counter DESC`
      : `SELECT ee_address_1, ee_address_2, ee_city, ee_state, ee_country, ee_postcode,
                COUNT(*) AS counter
           FROM assignee WHERE assignor_and_assignee_id = :partyId
          GROUP BY ee_address_1, ee_address_2 ORDER BY counter DESC`,
    { partyId }
  );

const addressesForLawFirm = (lawFirmId) =>
  q.selectAll(
    uspto(),
    `SELECT cor.caddress_1, cor.caddress_2, cor.caddress_3, cor.caddress_4,
            cor.caddress_5, cor.caddress_6, cor.caddress_7, COUNT(*) AS counter
       FROM correspondent AS cor
       INNER JOIN law_firm AS lf ON lf.name = cor.cname
      WHERE lf.law_firm_id = :lawFirmId
      GROUP BY cor.caddress_1, cor.caddress_2 ORDER BY counter DESC`,
    { lawFirmId }
  );

/** The addresses a party used, with the transaction each came from. */
const addressesWithTransactions = (partyId) =>
  q.selectAll(
    uspto(),
    `SELECT ass.rf_id, assignment.reel_no, assignment.frame_no, assignment.record_dt,
            ass.ee_address_1, ass.ee_address_2, ass.ee_city, ass.ee_state, ass.ee_country
       FROM assignee AS ass
       INNER JOIN assignment ON assignment.rf_id = ass.rf_id
      WHERE ass.assignor_and_assignee_id = :partyId
      ORDER BY assignment.record_dt DESC`,
    { partyId }
  );

/** The most recent transaction where a party used a given address. */
const latestTransactionForAddress = ({ partyId, address1, address2 }) =>
  q.selectOne(
    uspto(),
    `SELECT ass.rf_id, ass.assignor_and_assignee_id, aaa.representative_id AS representativeID
       FROM assignee AS ass
       INNER JOIN assignor_and_assignee AS aaa
               ON aaa.assignor_and_assignee_id = ass.assignor_and_assignee_id
       INNER JOIN assignment ON assignment.rf_id = ass.rf_id
      WHERE ass.assignor_and_assignee_id = :partyId
        AND ass.ee_address_1 = :address1 AND ass.ee_address_2 = :address2
      ORDER BY assignment.record_dt DESC LIMIT 1`,
    { partyId, address1: address1 || '', address2: address2 || '' }
  );

const rememberAddressTransaction = (rows) =>
  models.RepresentativeAddress.bulkCreate(rows, { ignoreDuplicates: true });

/* -------------------------------------------------------- normalisation */

const findRepresentativeByName = (name) =>
  q.selectOne(
    uspto(),
    `SELECT representative_id, representative_name FROM representative
      WHERE representative_name = :name LIMIT 1`,
    { name }
  );

const createRepresentative = (name) =>
  models.Representative.create({ representative_name: name });

const partiesByIds = (ids) =>
  q.selectAll(
    uspto(),
    `SELECT assignor_and_assignee_id, name, representative_id FROM assignor_and_assignee
      WHERE assignor_and_assignee_id IN (:ids)`,
    { ids }
  );

const pointPartiesAt = (ids, representativeId) =>
  models.AssignorAndAssignee.update(
    { representative_id: representativeId },
    { where: { assignor_and_assignee_id: ids } }
  );

const pointPtabNamesAt = (names, representativeId) =>
  models.PtabName.update({ representative_id: representativeId }, { where: { name: names } });

/* ------------------------------------------------------------- law firms */

const lawFirms = ({ search }) => {
  const repl = {};
  let sql = `SELECT lf.law_firm_id, lf.name, lf.instances, lf.representative_id,
            rlf.representative_name
       FROM law_firm AS lf
       LEFT JOIN representative_law_firm AS rlf ON rlf.representative_id = lf.representative_id`;
  if (search) {
    sql += ` WHERE MATCH(lf.name) AGAINST (:search IN BOOLEAN MODE)`;
    repl.search = search;
  }
  return q.selectAll(uspto(), `${sql} ORDER BY lf.instances DESC`, repl);
};

const lawFirmsByIds = (ids) =>
  q.selectAll(
    uspto(),
    `SELECT law_firm_id, name, representative_id FROM law_firm WHERE law_firm_id IN (:ids)`,
    { ids }
  );

const lawFirmsByNames = (names) =>
  q.selectAll(uspto(), `SELECT law_firm_id, name FROM law_firm WHERE name IN (:names)`, { names });

/** Add law firms we have correspondence for but no row yet. */
const createLawFirmsFromCorrespondence = (names) =>
  uspto().query(
    `INSERT IGNORE INTO db_uspto.law_firm(name, instances)
       SELECT cname, COUNT(cname) FROM db_uspto.correspondent
        WHERE cname IN (:names) GROUP BY cname`,
    { replacements: { names }, logging: false }
  );

const findLawFirmRepresentative = (name) =>
  q.selectOne(
    uspto(),
    `SELECT representative_id, representative_name FROM representative_law_firm
      WHERE representative_name = :name LIMIT 1`,
    { name }
  );

const createLawFirmRepresentative = (name) =>
  models.RepresentativeLawFirm.create({ representative_name: name });

const pointLawFirmsAt = (ids, representativeId) =>
  models.LawFirm.update({ representative_id: representativeId }, { where: { law_firm_id: ids } });

/** The companies a law firm has filed for. */
const companiesForLawFirm = (lawFirmId) =>
  q.selectAll(
    uspto(),
    `SELECT aaa.assignor_and_assignee_id, aaa.name, COUNT(DISTINCT doc.appno_doc_num) AS assets
       FROM law_firm AS lf
       INNER JOIN correspondent AS cor ON cor.cname = lf.name
       INNER JOIN assignee AS ass ON ass.rf_id = cor.rf_id
       INNER JOIN assignor_and_assignee AS aaa
               ON aaa.assignor_and_assignee_id = ass.assignor_and_assignee_id
       INNER JOIN documentid AS doc ON doc.rf_id = cor.rf_id
      WHERE lf.law_firm_id = :lawFirmId
      GROUP BY aaa.assignor_and_assignee_id ORDER BY assets DESC`,
    { lawFirmId }
  );

const lawFirmsForCompany = (partyId) =>
  q.selectAll(
    uspto(),
    `SELECT lf.law_firm_id, lf.name, COUNT(DISTINCT cor.rf_id) AS transactions
       FROM assignee AS ass
       INNER JOIN correspondent AS cor ON cor.rf_id = ass.rf_id
       INNER JOIN law_firm AS lf ON lf.name = cor.cname
      WHERE ass.assignor_and_assignee_id = :partyId
      GROUP BY lf.law_firm_id ORDER BY transactions DESC`,
    { partyId }
  );

/* --------------------------------------------------------------- lawyers */

const lawyers = ({ search }) => {
  const repl = {};
  let sql = `SELECT l.lawyer_id, l.law_firm_id, l.name, l.instances,
            l.representative_lawyer_id, rl.representative_name
       FROM lawyer AS l
       LEFT JOIN representative_lawyer AS rl
              ON rl.representative_lawyer_id = l.representative_lawyer_id`;
  if (search) {
    sql += ` WHERE MATCH(l.name) AGAINST (:search IN BOOLEAN MODE)`;
    repl.search = search;
  }
  return q.selectAll(uspto(), `${sql} ORDER BY l.instances DESC`, repl);
};

const lawyersForFirm = (lawFirmId) =>
  q.selectAll(
    uspto(),
    `SELECT lawyer_id, law_firm_id, name, instances, representative_lawyer_id
       FROM lawyer WHERE law_firm_id = :lawFirmId ORDER BY instances DESC`,
    { lawFirmId }
  );

const findLawyerRepresentative = (name) =>
  q.selectOne(
    uspto(),
    `SELECT representative_lawyer_id, representative_name FROM representative_lawyer
      WHERE representative_name = :name LIMIT 1`,
    { name }
  );

const createLawyerRepresentative = (name) =>
  models.RepresentativeLawyer.create({ representative_name: name });

const pointLawyersAt = (ids, representativeLawyerId) =>
  models.Lawyer.update(
    { representative_lawyer_id: representativeLawyerId },
    { where: { lawyer_id: ids } }
  );

/* ----------------------------------------------------------- assignments */

const rawAssignment = (rfId) =>
  q.selectOne(
    uspto(),
    `SELECT cor.rf_id, cor.cname, cor.caddress_1, cor.caddress_2, cor.caddress_3,
            cor.caddress_4, cor.caddress_5, cor.caddress_6, cor.caddress_7,
            a.reel_no, a.frame_no, a.record_dt, a.convey_text
       FROM correspondent AS cor
       INNER JOIN assignment AS a ON a.rf_id = cor.rf_id
      WHERE cor.rf_id = :rfId LIMIT 1`,
    { rfId }
  );

const updateCorrespondent = (rfId, fields) =>
  models.Correspondent.update(fields, { where: { rf_id: rfId } });

const recentTransactions = (limit) =>
  q.selectAll(
    uspto(),
    `SELECT a.rf_id, a.reel_no, a.frame_no, a.record_dt, a.convey_text, a.cname
       FROM assignment AS a ORDER BY a.record_dt DESC LIMIT :limit`,
    { limit }
  );

const transactionsByConveyance = (conveyanceType) =>
  q.selectAll(
    uspto(),
    `SELECT a.rf_id, a.reel_no, a.frame_no, a.record_dt, rac.convey_ty
       FROM assignment AS a
       INNER JOIN representative_assignment_conveyance AS rac ON rac.rf_id = a.rf_id
      WHERE rac.convey_ty = :conveyanceType
      ORDER BY a.record_dt DESC LIMIT 1000`,
    { conveyanceType }
  );

/* ---------------------------------------------------------------- assets */

const assetsForParty = (partyId) =>
  q.selectAll(
    uspto(),
    `SELECT doc.appno_doc_num, doc.grant_doc_num, doc.appno_date, doc.grant_date, doc.title
       FROM assignee AS ass
       INNER JOIN documentid AS doc ON doc.rf_id = ass.rf_id
      WHERE ass.assignor_and_assignee_id = :partyId
      GROUP BY doc.appno_doc_num`,
    { partyId }
  );

const maintenanceForCompany = (representativeId) =>
  q.selectAll(
    app(),
    `SELECT emf.appno_doc_num, emf.grant_doc_num, emf.event_code,
            date_format(emf.event_date, '%Y-%m-%d') AS event_date
       FROM db_patent_maintainence_fee.event_maintainence_fees AS emf
       INNER JOIN db_new_application.assets AS assets
               ON CONVERT(assets.appno_doc_num USING latin1) = emf.appno_doc_num
      WHERE assets.company_id = :representativeId
      GROUP BY emf.appno_doc_num, emf.event_code`,
    { representativeId }
  );

/* ----------------------------------------------------------------- cited */

const citedOrganisations = (organisationId) =>
  q.selectAll(
    app(),
    `SELECT ao.assignee_id, ao.assignee_organization, ao.domain, ao.image_url, ao.cited
       FROM assignee_organizations AS ao
      WHERE ao.organisation_id = :organisationId
      ORDER BY ao.assignee_organization ASC`,
    { organisationId }
  );

const citedCounters = (organisationId) =>
  q.selectOne(
    app(),
    `SELECT COUNT(*) AS total,
            SUM(IF(image_url <> '' AND image_url IS NOT NULL, 1, 0)) AS with_logo
       FROM assignee_organizations WHERE organisation_id = :organisationId`,
    { organisationId }
  );

const updateAssignee = (assigneeId, fields) =>
  AssigneeOrganization.update(fields, { where: { assignee_id: assigneeId } });

const clearAssigneeLogos = (assigneeIds) =>
  AssigneeOrganization.update(
    {
      domain: '', api_logo: '', api_logo1: '', api_logo2: '', api_logo3: '', api_logo4: '',
      api_logo5: '', api_logo6: '', api_logo7: '', api_logo8: '', api_logo9: '',
      without_square: '', image_url: '', cited: 0,
    },
    { where: { assignee_id: assigneeIds } }
  );

/** Move a set of cited assignees onto an organisation. */
const assignCitedToOrganisation = ({ assigneeIds, organisationId }) =>
  AssigneeOrganization.update(
    { organisation_id: organisationId },
    { where: { assignee_id: assigneeIds } }
  );

const findAssignee = (assigneeId) =>
  q.selectOne(
    app(),
    `SELECT assignee_id, assignee_organization, assignee_query FROM assignee_organizations
      WHERE assignee_id = :assigneeId LIMIT 1`,
    { assigneeId }
  );


/* ------------------------------------------------- conveyance-text grid */

/**
 * Every recorded transaction touching a customer's assets, with the conveyance
 * text and both the original and the reviewed type.
 *
 * `ac.convey_ty` is what the USPTO recorded; `rac.convey_ty` is what a reviewer
 * has since corrected it to. The console shows both and edits the second.
 */
const assignmentsForCompanies = (companyIds) =>
  q.selectAll(
    uspto(),
    `SELECT a.rf_id AS id, a.convey_text AS text,
            (SELECT GROUP_CONCAT(or_name) FROM assignor WHERE assignor.rf_id = a.rf_id) AS assingor,
            (SELECT GROUP_CONCAT(ee_name) FROM assignee WHERE assignee.rf_id = a.rf_id) AS assingee,
            CONCAT(a.reel_no, '/', a.frame_no) AS reel_frame, a.frame_no, a.reel_no,
            ac.convey_ty, rac.convey_ty AS updated_convey_ty,
            ${ordinalCase('rac.convey_ty')} AS assignment_convey_ty
       FROM db_uspto.assignment AS a
       INNER JOIN db_uspto.assignment_conveyance AS ac ON ac.rf_id = a.rf_id
       LEFT JOIN db_uspto.representative_assignment_conveyance AS rac ON rac.rf_id = a.rf_id
       INNER JOIN assignor AS aor
               ON aor.rf_id = a.rf_id AND DATE_FORMAT(aor.exec_dt, '%Y') > :year
       -- Three nested membership tests over db_uspto.documentid, unwound into
       -- joins: the applications the companies hold, then every transaction
       -- touching one of them. Nested like that, MySQL had to materialise a
       -- multi-million-row table twice before it could test one assignment.
       INNER JOIN (
              SELECT DISTINCT scoped.rf_id
                FROM db_uspto.documentid AS scoped
                INNER JOIN (
                      SELECT DISTINCT d.appno_doc_num
                        FROM db_uspto.documentid AS d
                        INNER JOIN db_uspto.list2 AS l ON l.rf_id = d.rf_id
                       WHERE d.appno_doc_num <> ''
                         AND (l.organisation_id = 0 OR l.organisation_id IS NULL)
                         AND l.company_id IN (:companyIds)
                     ) AS companyApplications
                     ON companyApplications.appno_doc_num = scoped.appno_doc_num
            ) AS companyTransactions ON companyTransactions.rf_id = a.rf_id
      GROUP BY a.rf_id`,
    { companyIds, year: YEAR_FLOOR() }
  );

/**
 * Retype one transaction. Written to representative_assignment_conveyance, which
 * overlays the USPTO's own typing rather than replacing it.
 */
const setReviewedConveyance = async ({ rfId, conveyanceType }) => {
  const existing = await q.selectOne(
    uspto(),
    `SELECT rf_id FROM representative_assignment_conveyance WHERE rf_id = :rfId LIMIT 1`,
    { rfId }
  );
  const sql = existing
    ? `UPDATE representative_assignment_conveyance SET convey_ty = :conveyanceType
        WHERE rf_id = :rfId`
    : `INSERT INTO representative_assignment_conveyance (rf_id, convey_ty)
       VALUES (:rfId, :conveyanceType)`;
  await uspto().query(sql, { replacements: { rfId, conveyanceType }, logging: false });
  return { rf_id: rfId, convey_ty: conveyanceType, created: !existing };
};

/** Free-text search over conveyance text, for the grid's search box. */
const searchConveyanceText = (search) =>
  q.selectAll(
    uspto(),
    `SELECT a.rf_id AS id, a.convey_text AS text,
            CONCAT(a.reel_no, '/', a.frame_no) AS reel_frame, a.reel_no, a.frame_no,
            ac.convey_ty, rac.convey_ty AS updated_convey_ty,
            ${ordinalCase('rac.convey_ty')} AS assignment_convey_ty
       FROM db_uspto.assignment AS a
       INNER JOIN db_uspto.assignment_conveyance AS ac ON ac.rf_id = a.rf_id
       LEFT JOIN db_uspto.representative_assignment_conveyance AS rac ON rac.rf_id = a.rf_id
      WHERE MATCH(a.convey_text) AGAINST (:search IN BOOLEAN MODE)
      GROUP BY a.rf_id
      LIMIT 500`,
    { search }
  );

/**
 * Companies a lender has lent to — the lender drill-down. A lender reaches a
 * company through a security-interest assignment.
 */
const companiesForLender = (lenderIds) =>
  q.selectAll(
    uspto(),
    `SELECT aaa.assignor_and_assignee_id AS id, aaa.name,
            COUNT(DISTINCT a.rf_id) AS counter,
            r.representative_name AS normalize_name, r.representative_id
       FROM assignor AS aor
       INNER JOIN assignment AS a ON a.rf_id = aor.rf_id
       INNER JOIN representative_assignment_conveyance AS rac ON rac.rf_id = a.rf_id
       INNER JOIN assignor_and_assignee AS aaa
               ON aaa.assignor_and_assignee_id = aor.assignor_and_assignee_id
       LEFT JOIN representative AS r ON r.representative_id = aaa.representative_id
       -- The lenders' transactions, joined rather than tested with a subquery.
       INNER JOIN (SELECT DISTINCT rf_id FROM assignee
                    WHERE assignor_and_assignee_id IN (:lenderIds)) AS lenderTransactions
               ON lenderTransactions.rf_id = a.rf_id
      WHERE rac.convey_ty IN (:conveyanceTypes)
        AND DATE_FORMAT(a.record_dt, '%Y') >= :year
      GROUP BY aaa.name
      ORDER BY counter DESC`,
    { lenderIds, conveyanceTypes: ['security', 'restatedsecurity'], year: YEAR_FLOOR() }
  );

/* ------------------------------------------------ correspondence lists */

/**
 * The assignor_and_assignee ids belonging to a customer's companies. The
 * correspondence lists are filtered by these.
 */
const partyIdsForCompanies = (companyIds) =>
  q.selectAll(
    uspto(),
    `SELECT assignor_and_assignee_id FROM assignor_and_assignee
      WHERE representative_id IN (:companyIds)`,
    { companyIds }
  );

/**
 * Correspondents on a customer's recorded assignments — the console's
 * "Correspondence" column.
 *
 * Grouped by name and the first two address lines, because the same firm is
 * recorded once per transaction and the grid wants one row per address.
 */
const correspondenceAddresses = ({ companyIds, partyIds }) => {
  const scoped = partyIds && partyIds.length > 0;
  return q.selectAll(
    uspto(),
    `SELECT a.rf_id AS id, a.rf_id, a.cname, a.caddress_1, a.caddress_2,
            a.reel_no, a.frame_no
       FROM assignment AS a
       INNER JOIN list2 AS l ON l.rf_id = a.rf_id
       INNER JOIN assignee AS e ON e.rf_id = l.rf_id
      WHERE l.organisation_id = 0
        AND l.representative_id IN (:companyIds)
        ${scoped ? 'AND e.assignor_and_assignee_id IN (:partyIds)' : ''}
        AND (a.caddress_1 <> '' OR a.caddress_2 <> '')
      GROUP BY a.cname, a.caddress_1, a.caddress_2`,
    { companyIds, partyIds: scoped ? partyIds : [0] }
  );
};

/**
 * The same correspondents with every address line, for the address-cleaning
 * screen. Two passes, as in the legacy handler: the ones with an address, then
 * the wholly blank ones, which the screen lists so they can be filled in.
 */
const rawCorrespondence = ({ companyIds, partyIds }) => {
  const scoped = partyIds && partyIds.length > 0;
  const columns = `c.rf_id AS id, c.rf_id, c.cname, c.caddress_1, c.caddress_2,
            c.caddress_7, c.caddress_5, c.caddress_6, c.caddress_3, c.caddress_4`;
  const partyFilter = scoped ? 'AND e.assignor_and_assignee_id IN (:partyIds)' : '';
  const repl = { companyIds, partyIds: scoped ? partyIds : [0], year: YEAR_FLOOR() };

  return Promise.all([
    q.selectAll(
      uspto(),
      `SELECT ${columns}
         FROM correspondent AS c
         INNER JOIN list2 AS l ON l.rf_id = c.rf_id
         INNER JOIN assignee AS e ON e.rf_id = l.rf_id
         INNER JOIN db_new_application.activity_parties_transactions AS apt ON apt.rf_id = l.rf_id
        WHERE l.organisation_id = 0
          AND l.company_id IN (:companyIds)
          ${partyFilter}
          AND DATE_FORMAT(apt.exec_dt, '%Y') >= :year
          AND apt.exec_dt <> '0000-00-00'
        GROUP BY c.cname, c.caddress_1, c.caddress_2`,
      repl
    ),
    q.selectAll(
      uspto(),
      `SELECT ${columns}
         FROM correspondent AS c
         INNER JOIN list2 AS l ON l.rf_id = c.rf_id
         INNER JOIN assignee AS e ON e.rf_id = l.rf_id
        WHERE l.organisation_id = 0
          AND l.company_id IN (:companyIds)
          ${partyFilter}
          AND c.cname = '' AND c.caddress_1 = '' AND c.caddress_2 = ''`,
      repl
    ),
  ]).then(([withAddress, blank]) => [...withAddress, ...blank]);
};

/* ------------------------------------------------- cited and party lists */

// Sortable columns for the cited/party grids. Anything else falls back to
// occurences. The legacy handlers spliced sort_by, sort_direction, current_page
// and rows_per_page straight into the SQL string.
const PARTY_SORT_COLUMNS = new Set([
  'occurences', 'assignee_organization', 'assignee_query', 'domain', 'assignee_id',
]);

const page = ({ rowsPerPage, currentPage }) => {
  const limit = Math.min(Math.max(Number(rowsPerPage) || 50, 1), 500);
  const offset = Math.max(Number(currentPage) || 0, 0) * limit;
  return { limit, offset };
};

const orderClause = (sortBy, sortDirection) =>
  `ORDER BY ${q.identifier(sortBy, PARTY_SORT_COLUMNS, 'occurences')} ${q.direction(sortDirection)}`;

/** The logo columns the console reads, with the literal string "null" blanked. */
const LOGO_COLUMNS = Array.from({ length: 10 }, (_, i) => {
  const col = i === 0 ? 'api_logo' : `api_logo${i}`;
  return `IF(ao.${col} <> 'null', ao.${col}, '') AS ${col}`;
}).join(', ');

const PARTY_COLUMNS = `ao.assignee_id, COUNT(ao.assignee_id) AS occurences,
        ao.assignee_organization, ao.assignee_query, ao.domain, ao.domain2, ao.domain3,
        ${LOGO_COLUMNS}, ao.without_square, ao.image_url, '' AS img`;

/**
 * Cited assignees for a customer: the organisations citing the customer's
 * patents, joined through cited_patents to the customer's dashboard items.
 *
 * The patent-number join crosses a utf8mb4 column and a latin1 one, so it needs
 * an explicit COLLATE — see COLLATION.md.
 */
const citedAssigneesBase = ({ companyIds, assigneeId }) => {
  const repl = { organisationId: 0, companyIds, assigneeId };
  let sql = `
      FROM assignee_organizations AS ao
      INNER JOIN cited_patents AS cp ON cp.assignee_id = ao.assignee_id
      INNER JOIN dashboard_items AS a
              ON a.patent COLLATE utf8mb4_general_ci = cp.patent_number COLLATE utf8mb4_general_ci
     WHERE a.organisation_id = :organisationId
       AND a.representative_id IN (:companyIds)
       AND ao.organisation_id = 0`;
  if (assigneeId !== undefined) sql += ` AND ao.assignee_id = :assigneeId`;
  return { sql: `${sql} GROUP BY ao.assignee_id`, repl };
};

const citedAssigneesCount = async ({ companyIds, assigneeId }) => {
  const { sql, repl } = citedAssigneesBase({ companyIds, assigneeId });
  const row = await q.selectOne(
    app(),
    `SELECT COUNT(*) AS total_records FROM (SELECT ao.assignee_id ${sql}) AS temp`,
    repl
  );
  return Number(row ? row.total_records : 0);
};

const citedAssigneesPage = ({ companyIds, assigneeId, sortBy, sortDirection, rowsPerPage, currentPage }) => {
  const { sql, repl } = citedAssigneesBase({ companyIds, assigneeId });
  const { limit, offset } = page({ rowsPerPage, currentPage });
  return q.selectAll(
    app(),
    `SELECT ${PARTY_COLUMNS} ${sql} ${orderClause(sortBy, sortDirection)} LIMIT :offset, :limit`,
    { ...repl, limit, offset }
  );
};

/**
 * Every party that appears on the customer's transactions, excluding anyone
 * already recorded as an inventor — the console lists companies here, not
 * people.
 */
const partyNamesForCompanies = (companyIds) =>
  q.selectAll(
    app(),
    `SELECT partyName FROM (
        SELECT IF(r.representative_name <> '', r.representative_name, aaa.name) AS partyName
          FROM (SELECT apt.assignor_and_assignee_id
                  FROM db_new_application.activity_parties_transactions AS apt
                  LEFT JOIN db_uspto.inventors AS inv
                         ON inv.assignor_and_assignee_id = apt.assignor_and_assignee_id
                 WHERE apt.activity_id IN (:activityIds)
                   AND (apt.organisation_id = :organisationId OR apt.organisation_id IS NULL)
                   AND apt.company_id IN (:companyIds)
                   AND DATE_FORMAT(apt.exec_dt, '%Y') > :year
                   AND inv.assignor_and_assignee_id IS NULL
                 GROUP BY apt.assignor_and_assignee_id) AS temp
          INNER JOIN db_uspto.assignor_and_assignee AS aaa
                  ON aaa.assignor_and_assignee_id = temp.assignor_and_assignee_id
          LEFT JOIN db_uspto.representative AS r
                 ON r.representative_id = aaa.representative_id
      ) AS temp
      GROUP BY partyName`,
    {
      organisationId: 0,
      activityIds: [1, 6, 2, 7, 3, 4, 5, 12, 9, 14, 8, 11, 15, 16, 17, 18],
      companyIds,
      year: 1998,
    }
  );

/** Record any party name we have not seen before, so a logo can be attached. */
const rememberPartyNames = (names) =>
  AssigneeOrganization.bulkCreate(
    names.map((name) => ({ assignee_organization: name, assignee_query: name })),
    { ignoreDuplicates: true }
  );

const partiesBase = ({ names, assigneeId, savedLogos }) => {
  const repl = { names, assigneeId };
  const logo = savedLogos
    ? `IF(o.logo_optimize <> 'null', o.logo_optimize, ao.api_logo) AS api_logo`
    : `IF(ao.api_logo <> 'null', ao.api_logo, '') AS api_logo`;
  const extraLogos = Array.from({ length: 9 }, (_, i) =>
    `IF(ao.api_logo${i + 1} <> 'null', ao.api_logo${i + 1}, '') AS api_logo${i + 1}`).join(', ');
  const columns = `ao.assignee_id, COUNT(ao.assignee_id) AS occurences,
        ao.assignee_organization, ao.assignee_query, ao.domain, ao.domain2, ao.domain3,
        ${logo}, ${extraLogos}, ao.without_square, ao.image_url, '' AS img`;

  let sql = ` FROM assignee_organizations AS ao`;
  if (savedLogos) sql += ` INNER JOIN organisations AS o ON ao.organisation_id = o.organisation_id`;
  sql += ` WHERE ao.assignee_organization IN (:names)`;
  sql += savedLogos ? ` AND ao.organisation_id <> 0` : ` AND ao.organisation_id = 0`;
  if (assigneeId !== undefined) sql += ` AND ao.assignee_id = :assigneeId`;
  return { columns, sql: `${sql} GROUP BY ao.assignee_id`, repl };
};

const partiesCount = async (input) => {
  const { sql, repl } = partiesBase(input);
  const row = await q.selectOne(
    app(),
    `SELECT COUNT(*) AS total_records FROM (SELECT ao.assignee_id ${sql}) AS temp`,
    repl
  );
  return Number(row ? row.total_records : 0);
};

const partiesPage = (input) => {
  const { columns, sql, repl } = partiesBase(input);
  const { limit, offset } = page(input);
  return q.selectAll(
    app(),
    `SELECT ${columns} ${sql} ${orderClause(input.sortBy, input.sortDirection)} LIMIT :offset, :limit`,
    { ...repl, limit, offset }
  );
};

/* -------------------------------------------------- representative report */

/**
 * The corpus-wide company report (admin console "Reports" tab). Pre-aggregated
 * into admin_representative_reports by the nightly pipeline.
 *
 * `product` is parties minus transactions and `tranaction_assets` is the
 * transactions-per-asset ratio; both names (including the misspelling) are what
 * the admin console's column accessors read, so they are kept as-is.
 */
const representativeReports = () =>
  q.selectAll(
    uspto(),
    `SELECT representative_id, representative_name,
            no_of_assets AS assets, no_of_transactions, no_of_parties,
            (no_of_parties - no_of_transactions) AS product,
            (no_of_transactions / no_of_assets) AS tranaction_assets,
            no_of_loans, no_of_banks
       FROM admin_representative_reports`
  );

/* ------------------------------------------------------- lender search */

/**
 * Lenders: parties on a security-interest transaction. Either the conveyance is
 * typed as security/restatedsecurity, or it is untyped ("missing") and the
 * free-text conveyance says SECURITY INTEREST.
 */
const searchLenders = (search) =>
  q.selectAll(
    uspto(),
    `SELECT a.assignor_and_assignee_id AS id, a.assignor_and_assignee_id, a.name,
            COUNT(a.name) AS counter, c.representative_name AS normalize_name,
            (SELECT rr.representative_name FROM representative AS rr
              WHERE rr.representative_name = a.name GROUP BY rr.representative_name)
              AS representative_company,
            CONCAT(assignment.reel_no, '-', assignment.frame_no) AS assigneeRFID,
            '' AS assignorRFID
       FROM assignor_and_assignee AS a
       LEFT JOIN representative AS c ON c.representative_id = a.representative_id
       INNER JOIN assignee ON assignee.assignor_and_assignee_id = a.assignor_and_assignee_id
       INNER JOIN assignment ON assignment.rf_id = assignee.rf_id
       INNER JOIN representative_assignment_conveyance AS rac ON assignment.rf_id = rac.rf_id
      WHERE ((rac.convey_ty IN (:conveyanceType))
             OR (rac.convey_ty IN (:missingType)
                 AND MATCH(assignment.convey_text) AGAINST (:securityText IN BOOLEAN MODE)))
        AND DATE_FORMAT(assignment.record_dt, '%Y') >= :year
        AND MATCH(a.name) AGAINST (:search IN BOOLEAN MODE)
      GROUP BY a.name
      ORDER BY counter DESC`,
    {
      search,
      year: YEAR_FLOOR(),
      conveyanceType: ['security', 'restatedsecurity'],
      missingType: 'missing',
      securityText: '"SECURITY INTEREST"',
    }
  );

/* ------------------------------------------- normalisation candidate lists */

/**
 * The other spellings that normalise onto the same company as :id — the
 * "Normalised Companies" list in the console.
 */
const normalisationCandidates = (assignorAndAssigneeId) =>
  q.selectAll(
    uspto(),
    `SELECT a.assignor_and_assignee_id AS id, a.assignor_and_assignee_id, a.name,
            a.instances AS counter, c.representative_name AS normalize_name,
            (SELECT rr.representative_name FROM representative AS rr
              WHERE rr.representative_name = a.name GROUP BY rr.representative_name)
              AS representative_company,
            (SELECT CONCAT(ass.reel_no, '-', ass.frame_no)
               FROM assignee AS ee INNER JOIN assignment AS ass ON ass.rf_id = ee.rf_id
              WHERE ee.assignor_and_assignee_id = a.assignor_and_assignee_id LIMIT 1)
              AS assigneeRFID,
            (SELECT CONCAT(asss.reel_no, '-', asss.frame_no)
               FROM assignor AS assi INNER JOIN assignment AS asss ON asss.rf_id = assi.rf_id
              WHERE assi.assignor_and_assignee_id = a.assignor_and_assignee_id LIMIT 1)
              AS assignorRFID,
            0 AS assigneeBibRFID, 0 AS assignorBibRFID, '1' AS flag
       FROM assignor_and_assignee AS a
       LEFT JOIN representative AS c ON c.representative_id = a.representative_id
      WHERE a.representative_id IN (
              SELECT r.representative_id
                FROM db_uspto.assignor_and_assignee AS aaa
                INNER JOIN db_uspto.representative AS r
                        ON r.representative_id = aaa.representative_id
               WHERE aaa.assignor_and_assignee_id = :assignorAndAssigneeId)
      GROUP BY a.name
      ORDER BY counter DESC`,
    { assignorAndAssigneeId }
  );

/**
 * The other law firms that normalise onto the same firm as :id.
 */
const lawFirmNormalisationCandidates = (lawFirmId) =>
  q.selectAll(
    uspto(),
    `SELECT law_firm_id, name, instances AS counter,
            (SELECT SUM(instances) FROM db_uspto.law_firm AS l
              WHERE l.representative_id = law_firm.representative_id) AS total_occurences,
            rlf.representative_id, rlf.representative_name
       FROM db_uspto.law_firm AS law_firm
       LEFT JOIN db_uspto.representative_law_firm AS rlf
              ON rlf.representative_id = law_firm.representative_id
      WHERE law_firm.representative_id IN (
              SELECT rlf2.representative_id
                FROM db_uspto.representative_law_firm AS rlf2
                INNER JOIN db_uspto.law_firm AS lf ON rlf2.representative_id = lf.representative_id
               WHERE lf.law_firm_id = :lawFirmId AND lf.representative_id > 0)`,
    { lawFirmId }
  );

module.exports = {
  models,
  companyRequests,
  resolveCompanyRequests,
  searchRepresentatives,
  searchAccounts,
  searchParties,
  searchPartiesByAddress,
  searchLawFirmsByAddress,
  searchPartiesByCountry,
  addressesForParty,
  addressesForLawFirm,
  addressesWithTransactions,
  latestTransactionForAddress,
  rememberAddressTransaction,
  findRepresentativeByName,
  createRepresentative,
  partiesByIds,
  pointPartiesAt,
  pointPtabNamesAt,
  lawFirms,
  lawFirmsByIds,
  lawFirmsByNames,
  createLawFirmsFromCorrespondence,
  findLawFirmRepresentative,
  createLawFirmRepresentative,
  pointLawFirmsAt,
  companiesForLawFirm,
  lawFirmsForCompany,
  lawyers,
  lawyersForFirm,
  findLawyerRepresentative,
  createLawyerRepresentative,
  pointLawyersAt,
  rawAssignment,
  updateCorrespondent,
  recentTransactions,
  transactionsByConveyance,
  assetsForParty,
  maintenanceForCompany,
  citedOrganisations,
  citedCounters,
  updateAssignee,
  clearAssigneeLogos,
  findAssignee,
  assignCitedToOrganisation,
  assignmentsForCompanies,
  setReviewedConveyance,
  searchConveyanceText,
  companiesForLender,
  partyIdsForCompanies,
  correspondenceAddresses,
  rawCorrespondence,
  citedAssigneesCount,
  citedAssigneesPage,
  partyNamesForCompanies,
  rememberPartyNames,
  partiesCount,
  partiesPage,
  representativeReports,
  searchLenders,
  normalisationCandidates,
  lawFirmNormalisationCandidates,
  YEAR_FLOOR,
};
