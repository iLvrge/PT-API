'use strict';

jest.mock('../../src/modules/admin-customers/admin-customers.repository');
jest.mock('../../src/modules/admin-customers/admin-customers.files');
jest.mock('../../src/db/tenant-connections');
jest.mock('../../src/utils/php-jobs');
jest.mock('../../src/utils/uploads');

const repo = require('../../src/modules/admin-customers/admin-customers.repository');
const files = require('../../src/modules/admin-customers/admin-customers.files');
const tenants = require('../../src/db/tenant-connections');
const jobs = require('../../src/utils/php-jobs');
const uploads = require('../../src/utils/uploads');
const service = require('../../src/modules/admin-customers/admin-customers.service');

const transaction = () => ({ commit: jest.fn().mockResolvedValue(), rollback: jest.fn().mockResolvedValue() });

beforeEach(() => {
  jest.clearAllMocks();
  repo.connections = { business: { transaction: jest.fn().mockResolvedValue(transaction()) } };
  jobs.runPhpScript.mockResolvedValue({ stdout: '', stderr: '' });
  jobs.runNodeScript.mockResolvedValue({ stdout: '', stderr: '' });
});

describe('createCustomer', () => {
  it('reuses an organisation with the same name rather than duplicating it', async () => {
    repo.findCustomerByName.mockResolvedValue({ organisation_id: 118, name: 'Acme Inc' });
    const org = await service.createCustomer({ companyName: 'Acme Inc', organisationType: 1 });
    expect(repo.createCustomer).not.toHaveBeenCalled();
    expect(org.organisation_id).toBe(118);
  });

  it('creates, assigns a uuid and queues provisioning', async () => {
    repo.findCustomerByName.mockResolvedValue(null);
    repo.createCustomer.mockResolvedValue({ toJSON: () => ({ organisation_id: 500, name: 'New Co' }) });

    await service.createCustomer({ companyName: 'New Co', organisationType: 1 });
    expect(repo.assignUuid).toHaveBeenCalledWith(500);
    expect(jobs.runPhpScript).toHaveBeenCalledWith('script_create_customer_db.php', [500]);
  });

  it('rejects a blank name', async () => {
    await expect(service.createCustomer({ companyName: '' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('still answers when provisioning fails to start', async () => {
    repo.findCustomerByName.mockResolvedValue(null);
    repo.createCustomer.mockResolvedValue({ toJSON: () => ({ organisation_id: 500 }) });
    jobs.runPhpScript.mockRejectedValue(new Error('script missing'));

    await expect(service.createCustomer({ companyName: 'New Co' })).resolves.toMatchObject({
      organisation_id: 500,
    });
  });
});

describe('deleteCustomer', () => {
  it('refuses once the customer has a tenant database', async () => {
    repo.findCustomer.mockResolvedValue({ organisation_id: 118 });
    repo.customerDatabase.mockResolvedValue({
      org_db: 'db_118', org_usr: 'u', org_host: 'localhost', org_pass: 'p',
    });

    await expect(service.deleteCustomer(118)).rejects.toMatchObject({ statusCode: 403 });
    expect(repo.destroyCustomer).not.toHaveBeenCalled();
  });

  it('deletes an unprovisioned customer inside a committed transaction', async () => {
    const tx = transaction();
    repo.connections.business.transaction.mockResolvedValue(tx);
    repo.findCustomer.mockResolvedValue({ organisation_id: 500 });
    repo.customerDatabase.mockResolvedValue({ org_db: '', org_usr: '', org_host: '' });

    await service.deleteCustomer(500);
    expect(repo.destroyCustomer).toHaveBeenCalledWith(500);
    expect(tx.commit).toHaveBeenCalled();
    expect(tx.rollback).not.toHaveBeenCalled();
  });

  it('rolls the transaction back when the delete fails', async () => {
    const tx = transaction();
    repo.connections.business.transaction.mockResolvedValue(tx);
    repo.findCustomer.mockResolvedValue({ organisation_id: 500 });
    repo.customerDatabase.mockResolvedValue({});
    repo.destroyCustomer.mockRejectedValue(new Error('constraint'));

    await expect(service.deleteCustomer(500)).rejects.toThrow('constraint');
    expect(tx.rollback).toHaveBeenCalled();
  });

  it('404s for an unknown customer', async () => {
    repo.findCustomer.mockResolvedValue(null);
    await expect(service.deleteCustomer(999)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('deleteCustomerUser', () => {
  const tenant = { query: jest.fn().mockResolvedValue([]) };

  beforeEach(() => {
    repo.findUserInOrganisation.mockResolvedValue({ user_id: 335, organisation_id: 118 });
    tenants.getConnection.mockResolvedValue(tenant);
    tenant.query.mockResolvedValue([]);
  });

  it('removes the business row first, then the tenant row', async () => {
    const tx = transaction();
    repo.connections.business.transaction.mockResolvedValue(tx);

    const result = await service.deleteCustomerUser({ organisationId: 118, userId: 335 });
    expect(repo.destroyBusinessUser).toHaveBeenCalledWith(335, tx);
    expect(tx.commit).toHaveBeenCalled();
    expect(tenant.query).toHaveBeenCalled();
    expect(result.message).toBe('User deleted successfully.');
  });

  it('reports the leftover when the tenant row cannot be removed', async () => {
    tenant.query.mockRejectedValue(new Error('read only'));
    const result = await service.deleteCustomerUser({ organisationId: 118, userId: 335 });
    // The user is locked out either way, so this is a note, not a failure.
    expect(result.deleted).toBe(true);
    expect(result.message).toMatch(/could not be removed/);
  });

  it('503s when the tenant database is unreachable', async () => {
    tenants.getConnection.mockResolvedValue(null);
    await expect(
      service.deleteCustomerUser({ organisationId: 118, userId: 335 })
    ).rejects.toMatchObject({ statusCode: 503 });
  });

  it('404s for a user outside that organisation', async () => {
    repo.findUserInOrganisation.mockResolvedValue(null);
    await expect(
      service.deleteCustomerUser({ organisationId: 118, userId: 999 })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('setLogo', () => {
  it('decodes the data URL and stores it under the organisation id', async () => {
    repo.findCustomer.mockResolvedValue({ organisation_id: 118 });
    uploads.uploadFile.mockResolvedValue({ Location: 'https://static/logos/logo_118.png' });

    const result = await service.setLogo({
      organisationId: 118,
      dataUrl: 'data:image/png;base64,aGVsbG8=',
    });

    expect(uploads.uploadFile).toHaveBeenCalledWith(
      expect.any(Buffer), 'logos', 'logo_118.png', 'image/png'
    );
    expect(uploads.uploadFile.mock.calls[0][0].toString()).toBe('hello');
    expect(repo.updateCustomer).toHaveBeenCalledWith(118, { logo: result.logo });
  });

  it('picks the extension from the declared type', async () => {
    repo.findCustomer.mockResolvedValue({ organisation_id: 118 });
    uploads.uploadFile.mockResolvedValue({ Location: 'x' });

    await service.setLogo({ organisationId: 118, dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' });
    expect(uploads.uploadFile).toHaveBeenCalledWith(
      expect.any(Buffer), 'logos', 'logo_118.svg', 'image/svg+xml'
    );
  });

  it('rejects anything that is not a base64 data URL', async () => {
    repo.findCustomer.mockResolvedValue({ organisation_id: 118 });
    await expect(
      service.setLogo({ organisationId: 118, dataUrl: 'https://example.com/logo.png' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('normaliseNames', () => {
  it('passes its arguments to the script rather than building a shell string', () => {
    service.normaliseNames({
      organisationId: 118,
      representativeIds: [9, 10],
      type: '1',
      suggestions: 'yes',
      fixedIdenticals: 'no',
    });
    expect(jobs.runNodeScript).toHaveBeenCalledWith(
      'normalize_names.js', [118, '[9,10]', '1', 'yes', 'no']
    );
  });

  it('sends an empty array when no companies were named', () => {
    service.normaliseNames({ organisationId: 118, type: '1' });
    expect(jobs.runNodeScript).toHaveBeenCalledWith('normalize_names.js', [118, '[]', '1', '', '']);
  });
});

describe('runFlagUpdate', () => {
  beforeEach(() => repo.findCustomer.mockResolvedValue({ organisation_id: 118 }));

  it('uses the batch script for several companies', async () => {
    await service.runFlagUpdate({ organisationId: 118, companyIds: [9, 10] });
    expect(jobs.runPhpScript).toHaveBeenCalledWith(
      'run_script_for_update_flag.php', [118, '[9,10]']
    );
  });

  it('uses the single-company script for one', async () => {
    await service.runFlagUpdate({ organisationId: 118, companyIds: [9] });
    expect(jobs.runPhpScript).toHaveBeenCalledWith('update_flag.php', [118, 9]);
  });

  it('runs across the whole organisation when none are named', async () => {
    await service.runFlagUpdate({ organisationId: 118, companyIds: [] });
    expect(jobs.runPhpScript).toHaveBeenCalledWith('update_flag.php', [118, '']);
  });

  it('404s for an unknown customer', async () => {
    repo.findCustomer.mockResolvedValue(null);
    await expect(
      service.runFlagUpdate({ organisationId: 999, companyIds: [] })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('findMissingInventors', () => {
  beforeEach(() => repo.findCustomer.mockResolvedValue({ organisation_id: 118 }));

  it('starts a run and records it', async () => {
    repo.findInventorProcess.mockResolvedValue(null);
    const result = await service.findMissingInventors({ organisationId: 118, representativeId: 9 });
    expect(repo.createInventorProcess).toHaveBeenCalledWith({ organisationId: 118, representativeId: 9 });
    expect(result.message).toMatch(/Finding/);
  });

  it('does not start a second run for the same company', async () => {
    repo.findInventorProcess.mockResolvedValue({ id: 1, status: 0 });
    const result = await service.findMissingInventors({ organisationId: 118, representativeId: 9 });
    expect(result.message).toBe('Already in process.');
    expect(repo.createInventorProcess).not.toHaveBeenCalled();
  });
});

describe('reclassifyLogs', () => {
  it("fills each entry's start time from the previous entry's end", async () => {
    repo.reclassifyLogs.mockResolvedValue([
      { id: 1, end_time: '10:00' },
      { id: 2, end_time: '10:05' },
      { id: 3, end_time: '10:09' },
    ]);
    const rows = await service.reclassifyLogs({ organisationId: 118, companyIds: [] });
    expect(rows[0].start_time).toBeUndefined();
    expect(rows[1].start_time).toBe('10:00');
    expect(rows[2].start_time).toBe('10:05');
  });
});

describe('entity files', () => {
  it('builds the file name a run writes', async () => {
    files.entityFileName.mockReturnValue('normalizeNames_118_file.json');
    files.readEntityFile.mockResolvedValue([{ name: 'Acme' }]);

    await service.entityFile({ organisationId: 118, type: '0', portfolios: [] });
    expect(files.entityFileName).toHaveBeenCalledWith({
      organisationId: 118, type: '0', portfolios: [],
    });
  });
});
