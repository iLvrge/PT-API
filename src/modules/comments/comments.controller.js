'use strict';

const asyncHandler = require('../../utils/async-handler');
const service = require('./comments.service');

const listBySubjectType = asyncHandler(async (req, res) => {
  res.status(200).json(await service.listBySubjectType(req.tenant, req.params.subjectType));
});

const getBySubject = asyncHandler(async (req, res) => {
  res.status(200).json(await service.getBySubject(req.tenant, req.params.subjectType, req.params.subject));
});

const create = asyncHandler(async (req, res) => {
  const hasFile = !!(req.files && req.files.file);
  const result = await service.addComment(
    req.tenant,
    {
      userId: req.auth.userId,
      subjectType: req.params.subjectType,
      subject: req.body.subject,
      comment: req.body.comment,
      professionalId: req.body.professional_id,
      documentId: req.body.document_id,
    },
    hasFile
  );
  res.status(201).json(result);
});

const update = asyncHandler(async (req, res) => {
  res.status(200).json(await service.updateComment(req.tenant, req.auth.userId, req.params.ID, req.body.comment));
});

const remove = asyncHandler(async (req, res) => {
  res.status(200).json(await service.removeComment(req.tenant, req.auth.userId, req.params.ID));
});

module.exports = { listBySubjectType, getBySubject, create, update, remove };
