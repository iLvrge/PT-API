'use strict';

const { connections } = require('../../db');
const q = require('../../db/query');
const {
  AssigneeOrganization, CitedPatent, CitingPatentWithAssignee,
} = require('../../db/models/citations.models');
const { env } = require('../../config/env');
const sql = require('./external.sql');

const app = () => connections.applicationNew;

/** Resolve a selection to the grant numbers behind it. */
const grantNumbers = async (input) => {
  const built = sql.buildGrantNumberQuery(input);
  const rows = await q.selectAll(app(), built.sql, built.replacements);
  return rows.map((row) => `${row.grant_doc_num}`);
};

/**
 * The companies citing a set of patents, with their logos.
 *
 * The logo path is joined to the static host here rather than in JavaScript, so
 * a stored path that already starts with a slash is not doubled.
 */
const citingCompanies = ({ patents, start, end, limited }) => {
  const repl = { list: patents, baseUrl: env.external.staticFilesUrl };
  let inner = `SELECT cpwa.citing_id AS id, cp.patent_number, cpwa.citing_patent_number AS number,
          IF(o.organisation_name <> '', o.organisation_name, ao.assignee_organization) AS assignee,
          cp.assignee_id,
          IF(o.logo_optimize IS NULL OR o.logo_optimize = '', '',
             CONCAT(:baseUrl, IF(o.logo_optimize LIKE '/%', o.logo_optimize,
                                 CONCAT('/', o.logo_optimize)))) AS logo,
          cpwa.app_date AS start, cpwa.app_date AS end
     FROM cited_patents AS cp
     INNER JOIN assignee_organizations AS ao ON ao.assignee_id = cp.assignee_id
     LEFT JOIN citing_patents_with_assignee AS cpwa
            ON cpwa.assignee_id = ao.assignee_id AND cpwa.patent_number = cp.patent_number
     LEFT JOIN organisations AS o ON o.organisation_id = ao.organisation_id
    WHERE cpwa.citing_id IS NOT NULL AND cp.patent_number IN (:list)`;

  if (start && end) {
    inner += ` AND cpwa.app_date BETWEEN :start AND :end`;
    repl.start = start;
    repl.end = end;
  }

  let statement = `SELECT id, patent_number, number, assignee, logo, COUNT(number) AS combined,
          start, end, GROUP_CONCAT(assignee) AS all_assignee
     FROM (${inner}) AS temp
    GROUP BY patent_number, number, assignee_id ORDER BY start DESC`;
  if (limited) statement += ` LIMIT 0, 500`;

  return q.selectAll(app(), statement, repl);
};

/** Assignee names we have already seen, so only the new ones are inserted. */
const knownAssignees = (names) =>
  q.selectAll(
    app(),
    `SELECT assignee_id, assignee_organization FROM assignee_organizations
      WHERE assignee_organization IN (:names) GROUP BY assignee_organization`,
    { names }
  );

/** Assignee names on citing patents whose organisation we could not resolve. */
const assigneesForPatents = (patentNumbers) =>
  q.selectAll(
    app(),
    `SELECT ag.grant_doc_num, ee.name
       FROM db_patent_application_bibliographic.assignee AS ee
       INNER JOIN db_patent_application_bibliographic.application_grant AS ag
               ON ag.appno_doc_num = ee.appno_doc_num
      WHERE ag.grant_doc_num IN (:patentNumbers)`,
    { patentNumbers }
  );

/** Logos for a set of assignee names. */
const organisationLogos = (names) =>
  q.selectAll(
    app(),
    `SELECT organisation_name, logo_optimize, original_logo FROM organisations
      WHERE organisation_name IN (:names) GROUP BY organisation_name`,
    { names }
  );

/* ----------------------------------------------------------------- writes */

const addAssignees = (rows) => AssigneeOrganization.bulkCreate(rows, { ignoreDuplicates: true });
const addCitedPatents = (rows) => CitedPatent.bulkCreate(rows, { ignoreDuplicates: true });
const addCitingPatents = (rows) =>
  CitingPatentWithAssignee.bulkCreate(rows, { ignoreDuplicates: true });

module.exports = {
  grantNumbers,
  citingCompanies,
  knownAssignees,
  assigneesForPatents,
  organisationLogos,
  addAssignees,
  addCitedPatents,
  addCitingPatents,
};
