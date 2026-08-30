'use strict';

const { connections } = require('../../db');
const q = require('../../db/query');
const models = require('../../db/models/uspto.models');
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

const findAssignee = (assigneeId) =>
  q.selectOne(
    app(),
    `SELECT assignee_id, assignee_organization, assignee_query FROM assignee_organizations
      WHERE assignee_id = :assigneeId LIMIT 1`,
    { assigneeId }
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
  YEAR_FLOOR,
};
