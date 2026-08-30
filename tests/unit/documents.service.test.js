'use strict';

jest.mock('../../src/modules/documents/documents.repository');
jest.mock('../../src/utils/google');
jest.mock('../../src/utils/uploads', () => ({
  uploadFile: jest.fn().mockResolvedValue({ Location: 'https://static/x.pdf' }),
  contentTypeFor: jest.fn().mockReturnValue('application/pdf'),
}));

const repo = require('../../src/modules/documents/documents.repository');
const googleApi = require('../../src/utils/google');
const uploads = require('../../src/utils/uploads');
const service = require('../../src/modules/documents/documents.service');

const tenant = { id: 't' };

beforeEach(() => jest.clearAllMocks());

describe('documents google endpoints', () => {
  it('authToken swallows exchange errors into {} like legacy', async () => {
    googleApi.exchangeCode.mockRejectedValue(new Error('bad code'));
    await expect(service.authToken('abc')).resolves.toEqual({});
  });
  it('authToken 400 when no code', async () => {
    await expect(service.authToken(undefined)).rejects.toMatchObject({ statusCode: 400 });
  });
  it('driveList reports token expiry as a message, not an error', async () => {
    googleApi.driveFor.mockImplementation(() => { throw new Error('expired'); });
    const res = await service.driveList({ accessToken: 'x', refreshToken: undefined, id: undefined });
    expect(res.message).toBe('Token expired');
  });
});

describe('layout templates', () => {
  it('addTemplateToLayouts maps ids into template rows', async () => {
    repo.layoutsExist.mockResolvedValue([{ layout_id: 1 }]);
    repo.bulkCreateTemplates.mockResolvedValue([]);
    repo.layoutsWithTemplates.mockResolvedValue([]);
    await service.addTemplateToLayouts(118, {
      layoutIds: [1, 2], userAccount: 'u@g.com', containerId: 'c1', containerName: 'Doc',
    });
    const rows = repo.bulkCreateTemplates.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ layout_id: 1, organisation_id: 118, container_id: 'c1' });
  });
  it('404 when no layout exists', async () => {
    repo.layoutsExist.mockResolvedValue([]);
    await expect(service.addTemplateToLayouts(118, { layoutIds: [9], userAccount: 'u', containerId: 'c', containerName: 'n' }))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('tenant document CRUD', () => {
  it('create requires a tenant admin (role 1)', async () => {
    repo.isTenantAdmin.mockResolvedValue(false);
    await expect(service.createDocument(tenant, 5, { name: 'x' })).rejects.toMatchObject({ statusCode: 403 });
  });

  it('create with a file uploads it and stores the location', async () => {
    repo.isTenantAdmin.mockResolvedValue(true);
    repo.createDocument.mockResolvedValue({ toJSON: () => ({ document_id: 7 }) });
    await service.createDocument(tenant, 5, {
      name: 'Doc', description: 'd', file: { name: 'a.pdf', mimetype: 'application/pdf', data: Buffer.from('x') },
    });
    expect(uploads.uploadFile).toHaveBeenCalled();
    expect(repo.createDocument.mock.calls[0][1].file).toBe('https://static/x.pdf');
  });

  it('create rejects .exe mimetypes', async () => {
    repo.isTenantAdmin.mockResolvedValue(true);
    await expect(
      service.createDocument(tenant, 5, { name: 'x', file: { name: 'a', mimetype: 'app/.exe', data: Buffer.from('') } })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('update without file/link renames only', async () => {
    repo.isTenantAdmin.mockResolvedValue(true);
    repo.findDocument.mockResolvedValue({ document_id: 7, title: 'Old', description: 'od' });
    await service.updateDocument(tenant, 5, 7, { name: 'New', description: 'nd' });
    const data = repo.updateDocument.mock.calls[0][2];
    expect(data.title).toBe('New');
    expect(data.description).toBe('nd');
  });

  it('delete 404 when missing', async () => {
    repo.isTenantAdmin.mockResolvedValue(true);
    repo.findDocument.mockResolvedValue(null);
    await expect(service.deleteDocument(tenant, 5, 99)).rejects.toMatchObject({ statusCode: 404 });
  });
});
