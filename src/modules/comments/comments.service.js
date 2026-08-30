'use strict';

const ApiError = require('../../utils/api-error');
const repository = require('./comments.repository');

// Shape a comment row into { ...comment, user: {...} } like the legacy include.
const shapeComment = (row) => ({
  comment_id: row.comment_id,
  activity_id: row.activity_id,
  user_id: row.user_id,
  comment: row.comment,
  created_at: row.created_at,
  user: row.u_user_id
    ? {
        user_id: row.u_user_id,
        first_name: row.first_name,
        last_name: row.last_name,
        email_address: row.email_address,
        logo: row.logo,
      }
    : null,
});

const attachComments = async (tenant, activities) => {
  if (!activities.length) return activities;
  const comments = await repository.listCommentsFor(
    tenant,
    activities.map((a) => a.activity_id)
  );
  const byActivity = new Map();
  for (const c of comments) {
    if (!byActivity.has(c.activity_id)) byActivity.set(c.activity_id, []);
    byActivity.get(c.activity_id).push(shapeComment(c));
  }
  return activities.map((a) => ({ ...a, comments: byActivity.get(a.activity_id) || [] }));
};

// GET /comments/:subjectType — activities of that (expanded) type with comments.
const listBySubjectType = async (tenant, subjectType) => {
  if (subjectType === 'record') {
    const typeNames = repository.expandSubjectTypes(subjectType);
    const activities = await repository.listActivities(tenant, typeNames);
    return attachComments(tenant, activities);
  }
  // Legacy returned {} for non-record here.
  return {};
};

// GET /comments/:subjectType/:subject — a single activity with comments.
const getBySubject = async (tenant, subjectType, subject) => {
  const typeNames = repository.expandSubjectTypes(subjectType);
  let activities;
  if (subjectType === 'record') {
    const activity = await repository.findActivityById(tenant, subject);
    activities = activity ? [activity] : [];
  } else {
    activities = await repository.listActivities(tenant, typeNames, subject);
    activities = activities.slice(0, 1);
  }
  const [withComments] = await attachComments(tenant, activities);
  return withComments || null;
};

/**
 * POST /comments/:subjectType — core path only.
 * Adds a comment to the matching activity, creating a bare activity if none
 * exists. The legacy file-upload and fix-share-link branches are intentionally
 * NOT ported here — they depend on an upload service and a share-link module
 * that are not yet part of v2. Callers hitting those paths get a clear 501.
 */
const addComment = async (tenant, { userId, subjectType, subject, comment, professionalId, documentId }, hasFile) => {
  if (hasFile || subjectType === 'fix') {
    throw new ApiError(501, 'File uploads and fix share-links are not yet available in this API version');
  }

  const typeNames = repository.expandSubjectTypes(subjectType);
  const type = await repository.findTypeByNames(tenant, typeNames);
  if (!type) throw ApiError.badRequest('Unknown subject type');

  let activity;
  if (subjectType === 'record') {
    activity = subject > 0 ? await repository.findActivityBySubject(tenant, subject) : null;
    if (!activity) activity = await repository.findActivityById(tenant, subject);
  } else {
    const narrow = !(typeNames.includes('asset') && typeNames.includes('error') && typeNames.includes('fix'));
    activity = await repository.findActivityBySubject(tenant, subject, narrow ? type.type_id : undefined);
  }

  let activityId = activity ? activity.activity_id : 0;
  if (!activityId) {
    const created = await repository.createActivity(tenant, {
      user_id: userId,
      professional_id: professionalId || 1,
      subject,
      subject_type: type.type_id,
      type: type.type_id,
      share_url: '',
      document_id: documentId > 0 ? documentId : 1,
    });
    activityId = created.activity_id;
  }

  await repository.createComment(tenant, { activity_id: activityId, user_id: userId, comment });

  const activityRow = await repository.findActivityById(tenant, activityId);
  const [withComments] = await attachComments(tenant, activityRow ? [activityRow] : []);
  return withComments;
};

const updateComment = async (tenant, userId, commentId, comment) => {
  const existing = await repository.findComment(tenant, commentId);
  if (!existing) throw ApiError.notFound('No record found');
  if (existing.user_id !== userId) throw ApiError.forbidden('You are not the author of this comment');
  await repository.updateComment(tenant, commentId, comment);
  return { comment_id: commentId, updated: true };
};

const removeComment = async (tenant, userId, commentId) => {
  const existing = await repository.findComment(tenant, commentId);
  if (!existing) throw ApiError.notFound('No record found');
  if (existing.user_id !== userId) throw ApiError.forbidden('You are not the author of this comment');
  await repository.destroyComment(tenant, commentId);
  return { comment_id: commentId, deleted: true };
};

module.exports = { listBySubjectType, getBySubject, addComment, updateComment, removeComment };
