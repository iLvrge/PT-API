'use strict';

const ApiError = require('../../utils/api-error');
const repository = require('./activities.repository');

// Reshape a flat joined row into the legacy nested professionals/users/documents.
const shape = (row) => ({
  id: row.id,
  type: row.type,
  subject: row.subject,
  subject_type: row.subject_type,
  complete: row.complete,
  comment: row.comment,
  share_url: row.share_url,
  created_at: row.created_at,
  updated_at: row.updated_at,
  professionals: row.p_first_name
    ? {
        first_name: row.p_first_name,
        last_name: row.p_last_name,
        email_address: row.p_email,
        telephone: row.p_telephone,
        firms: row.f_firm_name ? { firm_name: row.f_firm_name } : null,
      }
    : null,
  users: row.u_first_name
    ? {
        first_name: row.u_first_name,
        last_name: row.u_last_name,
        email_address: row.u_email,
        telephone: row.u_telephone,
      }
    : null,
  documents: row.d_title || row.d_file
    ? { title: row.d_title, file: row.d_file, type: row.d_type, description: row.d_description }
    : null,
});

// GET /activities?type=&count=
// The legacy "fix"/"record" bucket is types [1,2] & incomplete; otherwise complete.
const listOrCount = async (tenant, { type, count }) => {
  const isFixOrRecord = type === 'fix' || type === 'record';
  const complete = isFixOrRecord ? 0 : 1;
  const types = isFixOrRecord ? [1, 2] : undefined;

  if (count === 'true' || count === true) {
    const total = await repository.countByComplete(tenant, complete, types);
    return [{ count_items: total }];
  }
  const rows = await repository.listByComplete(tenant, complete, types, 'created_at');
  return rows.map(shape);
};

// GET /activities/:type/:option  (count | list)
const byTypeOption = async (tenant, type, option) => {
  if (option === 'count') {
    const complete = type === '3' ? 1 : 0;
    const total = await repository.countByTypeComplete(tenant, type, complete);
    return [{ count_items: total }];
  }
  // option === 'list' → { todo, complete }
  const [todo, complete] = await Promise.all([
    repository.listByType(tenant, type, 0, 'created_at'),
    repository.listByComplete(tenant, 1, undefined, 'updated_at'),
  ]);
  return { todo: todo.map(shape), complete: complete.map(shape) };
};

const commentsForSubject = (tenant, subjectType, subject) =>
  repository.commentsForSubject(tenant, subjectType, subject);

const getById = async (tenant, activityId) => {
  const row = await repository.findByIdWithDocument(tenant, activityId);
  if (!row) throw ApiError.notFound('Not found');
  return {
    id: row.id,
    comment: row.comment,
    created_at: row.created_at,
    type: row.type,
    subject: row.subject,
    subject_type: row.subject_type,
    upload_file: row.upload_file,
    documents: row.d_title || row.d_file ? { file: row.d_file, title: row.d_title } : null,
  };
};

const setComplete = async (tenant, activityId, complete) => {
  const existing = await repository.findById(tenant, activityId);
  if (!existing) throw ApiError.badRequest('Bad inputs.');
  await repository.setComplete(tenant, activityId, complete);
  return { activity_id: activityId, complete };
};

module.exports = { listOrCount, byTypeOption, commentsForSubject, getById, setComplete };
