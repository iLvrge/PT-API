'use strict';

const q = require('../../db/query');
const { tenantModel } = require('../../db/tenant-models');

/**
 * Comments live in the tenant DB across activity / comment / type / document /
 * user. Reads are raw SQL; the nested activity->comments[]->user shape is
 * assembled in the service. All tables share the tenant connection.
 */

// Expand a subject type into the set the legacy code queried together.
const expandSubjectTypes = (subjectType) => {
  const set = [subjectType];
  if (subjectType === 'error' || subjectType === 'fix') {
    set.push('asset');
    if (!set.includes('error')) set.push('error');
    if (!set.includes('fix')) set.push('fix');
  } else if (subjectType === 'asset') {
    set.push('error', 'fix');
  }
  return [...new Set(set)];
};

// activities of the given type names (joined to `type`) with an optional subject
const listActivities = (tenant, typeNames, subject) => {
  const where = subject !== undefined ? 'AND a.subject = :subject' : '';
  return q.selectAll(
    tenant,
    `SELECT a.activity_id, a.subject, a.subject_type, a.type, a.document_id, a.upload_file, a.share_url
       FROM activity AS a
       INNER JOIN type AS t ON t.type_id = a.type
      WHERE t.name IN (:typeNames) ${where}
      ORDER BY a.activity_id`,
    subject !== undefined ? { typeNames, subject } : { typeNames }
  );
};

const findActivityById = (tenant, activityId) =>
  q.selectOne(
    tenant,
    `SELECT activity_id, subject, subject_type, type, document_id, upload_file, share_url
       FROM activity WHERE activity_id = :activityId LIMIT 1`,
    { activityId }
  );

// comments for a set of activities, each with its author (user)
const listCommentsFor = (tenant, activityIds) => {
  if (!activityIds.length) return Promise.resolve([]);
  return q.selectAll(
    tenant,
    `SELECT c.comment_id, c.activity_id, c.user_id, c.comment,
            date_format(c.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
            u.user_id AS u_user_id, u.first_name, u.last_name, u.email_address, u.logo
       FROM comment AS c
       LEFT JOIN user AS u ON u.user_id = c.user_id
      WHERE c.activity_id IN (:activityIds)
      ORDER BY c.created_at ASC`,
    { activityIds }
  );
};

const documentsFor = (tenant, documentIds) => {
  if (!documentIds.length) return Promise.resolve([]);
  return q.selectAll(
    tenant,
    `SELECT document_id, file, title FROM document WHERE document_id IN (:documentIds)`,
    { documentIds }
  );
};

const findTypeByNames = (tenant, typeNames) =>
  q.selectOne(tenant, `SELECT type_id, name FROM type WHERE name IN (:typeNames) LIMIT 1`, { typeNames });

const findActivityBySubject = (tenant, subject, type) => {
  const where = type !== undefined ? 'AND type = :type' : '';
  return q.selectOne(
    tenant,
    `SELECT activity_id FROM activity WHERE subject = :subject ${where} LIMIT 1`,
    type !== undefined ? { subject, type } : { subject }
  );
};

const findComment = (tenant, commentId) =>
  q.selectOne(tenant, `SELECT comment_id, user_id, comment FROM comment WHERE comment_id = :commentId LIMIT 1`, {
    commentId,
  });

// writes
const createActivity = (tenant, data) => tenantModel(tenant, 'activity').create(data);
const createComment = (tenant, data) => tenantModel(tenant, 'comment').create(data);
const updateComment = (tenant, commentId, comment) =>
  tenantModel(tenant, 'comment').update({ comment }, { where: { comment_id: commentId } });
const destroyComment = (tenant, commentId) =>
  tenantModel(tenant, 'comment').destroy({ where: { comment_id: commentId } });

module.exports = {
  expandSubjectTypes,
  listActivities,
  findActivityById,
  listCommentsFor,
  documentsFor,
  findTypeByNames,
  findActivityBySubject,
  findComment,
  createActivity,
  createComment,
  updateComment,
  destroyComment,
};
