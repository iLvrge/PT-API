'use strict';

const ApiError = require('../../utils/api-error');
const repository = require('./documents.repository');
const googleApi = require('../../utils/google');
const { uploadFile, contentTypeFor } = require('../../utils/uploads');

// ---- google auth / profile / drive ----
const authToken = async (code) => {
  if (!code) throw ApiError.badRequest('Authentication code is missing');
  try {
    return await googleApi.exchangeCode(code);
  } catch (_err) {
    return {}; // legacy swallowed exchange errors into an empty token object
  }
};

const profile = async (accessToken, refreshToken) => {
  if (!accessToken) return {};
  return googleApi.userProfile(accessToken, refreshToken);
};

const driveList = async ({ accessToken, refreshToken, id }) => {
  if (!accessToken) return { list: [], message: 'Please first login with google account.' };
  try {
    const drive = googleApi.driveFor(accessToken, refreshToken);
    const params = {
      pageSize: 1000,
      fields: 'nextPageToken, files(id, name, mimeType, webContentLink, webViewLink, iconLink, thumbnailLink, exportLinks)',
      q: id && id !== 'undefined' ? `'${id.replace(/'/g, '')}' in parents` : "'root' in parents",
      orderBy: 'folder,name',
    };
    const { data } = await drive.files.list(params);
    return { list: data, message: '' };
  } catch (_err) {
    return { list: [], message: 'Token expired' };
  }
};

const copyTemplateToDrive = async (orgId, { accessToken, refreshToken, userAccount, id, name }) => {
  if (!userAccount) throw ApiError.badRequest('Token expired');
  const repo = await repository.findRepository(orgId, userAccount);
  if (!repo) throw ApiError.badRequest('Please add a repository folder');
  const template = await repository.findTemplateMapping({ organisation_id: orgId, user_account: userAccount, container_id: id });
  if (!template) throw ApiError.badRequest('Invalid inputs');
  const drive = googleApi.driveFor(accessToken, refreshToken);
  const { data } = await drive.files.copy({
    fileId: template.container_id,
    requestBody: { name, parents: [repo.container_id] },
  });
  return data;
};

// ---- layouts / templates ----
const layouts = async ({ accessToken, userAccount, orgId }) => {
  if (!accessToken || userAccount === undefined) {
    return { list: [], message: 'Please first login with google account.' };
  }
  const list = await repository.layoutsWithTemplates(userAccount, orgId);
  return { list, message: list.length ? '' : 'Please add a document to layout first.' };
};

const layoutTemplates = async (orgId, layoutId, userAccount) => {
  if (layoutId === undefined || userAccount === undefined) {
    return { list: [], message: userAccount === undefined ? 'Token expired' : 'Invalid inputs' };
  }
  const list = await repository.templatesForLayout(orgId, layoutId, userAccount);
  return { list, message: '' };
};

const addTemplateToLayouts = async (orgId, { layoutIds, userAccount, containerId, containerName }) => {
  if (!layoutIds.length) throw ApiError.badRequest('Invalid input.');
  const existing = await repository.layoutsExist(layoutIds);
  if (!existing.length) throw ApiError.notFound('Layout not found.');
  await repository.bulkCreateTemplates(
    layoutIds.map((layout_id) => ({
      layout_id,
      user_account: userAccount,
      organisation_id: orgId,
      container_id: containerId,
      container_name: containerName,
    }))
  );
  return repository.layoutsWithTemplates(userAccount, orgId, layoutIds);
};

const removeTemplateFromLayouts = async (orgId, { layoutIds, containerId, userAccount }) => {
  if (!layoutIds.length || !containerId) return null;
  const where = { layout_id: layoutIds, container_id: containerId, organisation_id: orgId, user_account: userAccount };
  const existing = await repository.findTemplateMapping(where);
  if (!existing) return null;
  await repository.destroyTemplates(where);
  return repository.layoutsWithTemplates(userAccount, orgId, layoutIds);
};

// ---- repository folders ----
const getRepoFolder = (orgId, userAccount) => {
  if (userAccount === undefined) return null;
  return repository.findRepository(orgId, userAccount);
};

const setRepoFolder = async (orgId, body) => {
  const { container_id, container_name, user_account, breadcrumb, utilities_container_id, utilities_name, utilities_breadcrumb } = body;
  let repo = await repository.findRepository(orgId, user_account);
  if (!repo) {
    let item = null;
    if (container_id !== undefined) item = { container_id, container_name, breadcrumb, user_account };
    else if (utilities_container_id !== undefined) item = { utilities_container_id, utilities_name, utilities_breadcrumb, user_account };
    if (item) {
      item.organisation_id = orgId;
      repo = await repository.createRepository(item);
    }
    return repo;
  }
  if (container_id !== undefined) {
    repo.container_id = container_id;
    repo.container_name = container_name;
    repo.breadcrumb = breadcrumb;
    await repo.save();
  } else if (utilities_container_id !== undefined) {
    repo.utilities_container_id = utilities_container_id;
    repo.utilities_name = utilities_name;
    repo.utilities_breadcrumb = utilities_breadcrumb;
    await repo.save();
  }
  return repo;
};

const setTemplateFolder = async (orgId, { template_container_id, template_container_name, user_account, template_breadcrumb }) => {
  const repo = await repository.findRepository(orgId, user_account);
  if (!repo) {
    return repository.createRepository({
      organisation_id: orgId,
      user_account,
      template_container_id,
      template_container_name,
      template_breadcrumb,
    });
  }
  repo.template_container_id = template_container_id;
  repo.template_container_name = template_container_name;
  repo.template_breadcrumb = template_breadcrumb;
  await repo.save();
  return repo;
};

// ---- tenant documents CRUD ----
const listDocuments = (tenant) => repository.listDocuments(tenant);

const requireTenantAdmin = async (tenant, userId) => {
  if (!(await repository.isTenantAdmin(tenant, userId))) {
    throw ApiError.forbidden('You are not authorized to perform this action');
  }
};

const createDocument = async (tenant, userId, { name, description, fileLink, file }) => {
  await requireTenantAdmin(tenant, userId);
  if (fileLink) {
    const created = await repository.createDocument(tenant, { user_id: userId, title: name, file: fileLink, description });
    return created.toJSON ? created.toJSON() : created;
  }
  if (!file) throw ApiError.badRequest('Please select a file.');
  if (String(file.mimetype).toLowerCase().includes('.exe')) {
    throw ApiError.badRequest('We are not supporting this file format.');
  }
  const uploaded = await uploadFile(file.data, process.env.BUCKET_DOCUMENT_DIR, file.name, contentTypeFor(file.name));
  const created = await repository.createDocument(tenant, { user_id: userId, title: name, file: uploaded.Location, description });
  return created.toJSON ? created.toJSON() : created;
};

const updateDocument = async (tenant, userId, documentId, { name, description, fileLink, file }) => {
  await requireTenantAdmin(tenant, userId);
  const doc = await repository.findDocument(tenant, documentId);
  if (!doc) throw ApiError.notFound('Not found');

  if (file) {
    if (String(file.mimetype).toLowerCase().includes('.exe')) {
      throw ApiError.badRequest('We are not supporting this file format.');
    }
    const uploaded = await uploadFile(file.data, process.env.BUCKET_DOCUMENT_DIR, file.name, contentTypeFor(file.name));
    doc.file = uploaded.Location;
  } else if (fileLink) {
    doc.file = fileLink;
  } else {
    doc.title = name;
    doc.description = description;
  }
  await repository.updateDocument(tenant, documentId, doc);
  return doc;
};

const deleteDocument = async (tenant, userId, documentId) => {
  await requireTenantAdmin(tenant, userId);
  const doc = await repository.findDocument(tenant, documentId);
  if (!doc) throw ApiError.notFound('Not found');
  await repository.destroyDocument(tenant, documentId);
  return { document_id: documentId, deleted: true };
};

module.exports = {
  authToken,
  profile,
  driveList,
  copyTemplateToDrive,
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
};
