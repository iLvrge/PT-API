'use strict';

const q = require('../../db/query');
const { tenantModel } = require('../../db/tenant-models');

/**
 * Activities live in the tenant DB and join to professional/firm, user and
 * document. Reads are raw SQL; the nested shape is assembled in the service.
 */

const ACTIVITY_JOIN = `
  FROM activity AS a
  LEFT JOIN professional AS p ON p.professional_id = a.professional_id
  LEFT JOIN firm AS f ON f.firm_id = p.firm_id
  LEFT JOIN user AS u ON u.user_id = a.user_id
  LEFT JOIN document AS d ON d.document_id = a.document_id`;

const ACTIVITY_COLS = `
  a.activity_id AS id, a.type, a.subject, a.subject_type, a.complete, a.comment,
  a.share_url, a.created_at, a.updated_at,
  p.first_name AS p_first_name, p.last_name AS p_last_name, p.email_address AS p_email, p.telephone AS p_telephone,
  f.firm_name AS f_firm_name,
  u.first_name AS u_first_name, u.last_name AS u_last_name, u.email_address AS u_email, u.telephone AS u_telephone,
  d.title AS d_title, d.file AS d_file, d.type AS d_type, d.description AS d_description`;

// count of activities matching a complete flag (and optional type set)
const countByComplete = (tenant, complete, types) => {
  const typeClause = types ? 'AND type IN (:types)' : '';
  return q.selectValue(
    tenant,
    `SELECT COUNT(*) AS count_items FROM activity WHERE complete = :complete ${typeClause}`,
    types ? { complete, types } : { complete },
    'count_items',
    0
  );
};

// full list filtered by complete (+ optional type set), newest first
const listByComplete = (tenant, complete, types, orderCol = 'created_at') => {
  const typeClause = types ? 'AND a.type IN (:types)' : '';
  return q.selectAll(
    tenant,
    `SELECT ${ACTIVITY_COLS} ${ACTIVITY_JOIN}
      WHERE a.complete = :complete ${typeClause}
      ORDER BY a.${orderCol} DESC`,
    types ? { complete, types } : { complete }
  );
};

// list by an exact type, complete flag
const listByType = (tenant, type, complete, orderCol = 'created_at') =>
  q.selectAll(
    tenant,
    `SELECT ${ACTIVITY_COLS} ${ACTIVITY_JOIN}
      WHERE a.type = :type AND a.complete = :complete
      ORDER BY a.${orderCol} DESC`,
    { type, complete }
  );

const countByTypeComplete = (tenant, type, complete) =>
  q.selectValue(
    tenant,
    `SELECT COUNT(*) AS count_items FROM activity WHERE type = :type AND complete = :complete`,
    { type, complete },
    'count_items',
    0
  );

// bare comments list for a subject
const commentsForSubject = (tenant, subjectType, subject) =>
  q.selectAll(
    tenant,
    `SELECT comment, date_format(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM activity
      WHERE subject_type = :subjectType AND subject = :subject
      ORDER BY created_at DESC`,
    { subjectType, subject }
  );

// single activity with its document
const findByIdWithDocument = (tenant, activityId) =>
  q.selectOne(
    tenant,
    `SELECT a.activity_id AS id, a.comment, a.created_at, a.type, a.subject, a.subject_type, a.upload_file,
            d.file AS d_file, d.title AS d_title
       FROM activity AS a
       LEFT JOIN document AS d ON d.document_id = a.document_id
      WHERE a.activity_id = :activityId LIMIT 1`,
    { activityId }
  );

const findById = (tenant, activityId) =>
  q.selectOne(tenant, `SELECT activity_id FROM activity WHERE activity_id = :activityId LIMIT 1`, {
    activityId,
  });

// write: mark complete
const setComplete = (tenant, activityId, complete) =>
  tenantModel(tenant, 'activity').update({ complete }, { where: { activity_id: activityId } });

module.exports = {
  countByComplete,
  listByComplete,
  listByType,
  countByTypeComplete,
  commentsForSubject,
  findByIdWithDocument,
  findById,
  setComplete,
};
