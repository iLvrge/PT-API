'use strict';

const asyncHandler = require('../../utils/async-handler');
const ApiError = require('../../utils/api-error');
const service = require('./documents.service');

const parseIds = (raw) => {
  if (raw === undefined || raw === null || raw === '' || raw === 0) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (_err) {
    throw ApiError.badRequest('layout_id must be JSON');
  }
};

const authToken = asyncHandler(async (req, res) => {
  res.status(200).json(await service.authToken(req.query.code));
});
const profile = asyncHandler(async (req, res) => {
  res.status(200).json(await service.profile(req.query.access_token, req.query.refresh_token));
});
const driveList = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.driveList({ accessToken: req.query.access_token, refreshToken: req.query.refresh_token, id: req.query.id })
  );
});
const copyTemplate = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.copyTemplateToDrive(req.auth.orgId, {
      accessToken: req.body.access_token,
      refreshToken: req.body.refresh_token,
      userAccount: req.body.user_account,
      id: req.body.id,
      name: req.body.name,
    })
  );
});
const layouts = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.layouts({ accessToken: req.query.access_token, userAccount: req.query.user_account, orgId: req.auth.orgId })
  );
});
const layoutTemplates = asyncHandler(async (req, res) => {
  res.status(200).json(await service.layoutTemplates(req.auth.orgId, req.params.layout_id, req.query.user_account));
});
const addTemplateToLayouts = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.addTemplateToLayouts(req.auth.orgId, {
      layoutIds: parseIds(req.body.layout_id),
      userAccount: req.body.user_account,
      containerId: req.body.container_id,
      containerName: req.body.container_name,
    })
  );
});
const removeTemplateFromLayouts = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.removeTemplateFromLayouts(req.auth.orgId, {
      layoutIds: parseIds(req.query.layout_id),
      containerId: req.query.container_id,
      userAccount: req.query.user_account,
    })
  );
});
const getRepoFolder = asyncHandler(async (req, res) => {
  res.status(200).json(await service.getRepoFolder(req.auth.orgId, req.query.user_account));
});
const setRepoFolder = asyncHandler(async (req, res) => {
  res.status(200).json(await service.setRepoFolder(req.auth.orgId, req.body));
});
const setTemplateFolder = asyncHandler(async (req, res) => {
  res.status(200).json(await service.setTemplateFolder(req.auth.orgId, req.body));
});
const listDocuments = asyncHandler(async (req, res) => {
  res.status(200).json(await service.listDocuments(req.tenant));
});
const createDocument = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.createDocument(req.tenant, req.auth.userId, {
      name: req.body.name,
      description: req.body.description,
      fileLink: req.body.file_link,
      file: req.files && req.files.file,
    })
  );
});
const updateDocument = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.updateDocument(req.tenant, req.auth.userId, Number(req.params.document_id), {
      name: req.body.name,
      description: req.body.description,
      fileLink: req.body.file_link,
      file: req.files && req.files.file,
    })
  );
});
const deleteDocument = asyncHandler(async (req, res) => {
  await service.deleteDocument(req.tenant, req.auth.userId, Number(req.params.document_id));
  res.status(200).send('Document deleted successfully.');
});

const notPorted = (what) =>
  asyncHandler(async () => {
    throw new ApiError(501, `${what} generation is not yet available in this API version`);
  });

module.exports = {
  authToken,
  profile,
  driveList,
  copyTemplate,
  layouts,
  layoutTemplates,
  addTemplateToLayouts,
  removeTemplateFromLayouts,
  getRepoFolder,
  setRepoFolder,
  setTemplateFolder,
  listDocuments,
  createDocument,
  updateDocument,
  deleteDocument,
  downloadXML: notPorted('Assignment XML'),
  fixedAddressXML: notPorted('Assignment XML'),
  fixedNameXML: notPorted('Assignment XML'),
  createMaintainenceFile: notPorted('Maintenance file'),
  productSheet: notPorted('Sheet'),
  sheet: notPorted('Sheet'),
  sheetUrl: notPorted('Sheet'),
  sheetUpdate: notPorted('Sheet'),
  sheetByType: notPorted('Sheet'),
  sheetByAsset: notPorted('Sheet'),
  transactionDoc: notPorted('Transaction document'),
};
