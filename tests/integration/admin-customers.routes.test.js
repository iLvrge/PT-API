'use strict';

jest.mock('../../src/modules/users/users.repository');
jest.mock('../../src/db/tenant-connections');
jest.mock('../../src/modules/admin-customers/admin-customers.repository');
jest.mock('../../src/utils/php-jobs');
jest.mock('../../src/utils/uploads');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const usersRepo = require('../../src/modules/users/users.repository');
const repo = require('../../src/modules/admin-customers/admin-customers.repository');
const jobs = require('../../src/utils/php-jobs');
const { startTestServer } = require('../helpers/server');
const { env } = require('../../src/config/env');

const app = startTestServer();
const token = jwt.sign({ id: 5, orgId: 3 }, env.auth.secret);
const auth = (req) => req.set('Authorization', `Bearer ${token}`);

beforeEach(() => {
  jest.clearAllMocks();
  usersRepo.findActiveById.mockResolvedValue({ user_id: 5, organisation_id: 3, type: 9 });
  usersRepo.isAdmin.mockResolvedValue(true);
  repo.connections = {
    business: {
      transaction: jest.fn().mockResolvedValue({
        commit: jest.fn().mockResolvedValue(), rollback: jest.fn().mockResolvedValue(),
      }),
    },
  };
  jobs.runPhpScript.mockResolvedValue({ stdout: '', stderr: '' });
  jobs.runNodeScript.mockResolvedValue({ stdout: '', stderr: '' });
});

describe('admin access', () => {
  it('401s without a token', async () => {
    await request(app).get('/admin/customers').expect(401);
  });

  it('403s for a non-admin token', async () => {
    usersRepo.isAdmin.mockResolvedValue(false);
    await auth(request(app).get('/admin/customers')).expect(403);
  });
});

describe('GET /admin/customers', () => {
  it('lists the customers', async () => {
    repo.listCustomers.mockResolvedValue([{ id: 118, name: 'Acme Inc' }]);
    const res = await auth(request(app).get('/admin/customers')).expect(200);
    expect(res.body).toHaveLength(1);
  });
});

describe('GET /admin/customers/:id', () => {
  it('returns the customer', async () => {
    repo.findCustomer.mockResolvedValue({
      organisation_id: 118, name: 'Acme Inc', subscribtion: 3, logo: '', standard: 'uuid',
    });
    const res = await auth(request(app).get('/admin/customers/118')).expect(200);
    expect(res.body).toMatchObject({ organisation_id: 118, name: 'Acme Inc' });
  });

  it('404s for an unknown customer', async () => {
    repo.findCustomer.mockResolvedValue(null);
    await auth(request(app).get('/admin/customers/999')).expect(404);
  });

  it('400s on a non-numeric id', async () => {
    await auth(request(app).get('/admin/customers/abc')).expect(400);
  });
});

describe('DELETE /admin/customers/:organisation_id', () => {
  it('refuses a provisioned customer', async () => {
    repo.findCustomer.mockResolvedValue({ organisation_id: 118 });
    repo.customerDatabase.mockResolvedValue({
      org_db: 'db_118', org_usr: 'u', org_host: 'localhost',
    });
    await auth(request(app).delete('/admin/customers/118')).expect(403);
  });

  it('deletes one that was never provisioned', async () => {
    repo.findCustomer.mockResolvedValue({ organisation_id: 500 });
    repo.customerDatabase.mockResolvedValue({ org_db: '', org_usr: '', org_host: '' });
    const res = await auth(request(app).delete('/admin/customers/500')).expect(200);
    expect(res.body).toEqual({ organisation_id: 500, deleted: true });
  });
});

describe('GET /admin/customers/run_query/:name/:query_no', () => {
  it('runs the report', async () => {
    repo.runReport.mockResolvedValue([{ appno_doc_num: '111' }]);
    await auth(request(app).get('/admin/customers/run_query/Acme%20Inc/1?company_id=9&organisation_id=118'))
      .expect(200);

    expect(repo.runReport).toHaveBeenCalledWith(
      expect.objectContaining({ representativeName: 'Acme Inc', queryNo: 1 })
    );
  });

  it('400s on a report number outside the fixed set', async () => {
    await auth(request(app).get('/admin/customers/run_query/Acme/99')).expect(400);
    expect(repo.runReport).not.toHaveBeenCalled();
  });

  it('is not shadowed by /customers/:id', async () => {
    repo.runReport.mockResolvedValue([]);
    await auth(request(app).get('/admin/customers/run_query/Acme/2')).expect(200);
    expect(repo.findCustomer).not.toHaveBeenCalled();
  });
});

describe('GET /admin/customers/static_file/read_entity_file', () => {
  it('refuses a path traversal', async () => {
    await auth(request(app).get('/admin/customers/static_file/read_entity_file?fileName=../../../../etc/passwd'))
      .expect(400);
  });

  it('returns an empty list when the script has not run', async () => {
    const res = await auth(
      request(app).get('/admin/customers/static_file/read_entity_file?fileName=normalizeNames_118_file.json')
    ).expect(200);
    expect(res.body).toEqual([]);
  });
});

describe('pipeline jobs', () => {
  beforeEach(() => repo.findCustomer.mockResolvedValue({ organisation_id: 118, name: 'Acme Inc' }));

  it('queues name normalisation with an argument array', async () => {
    await auth(request(app).get('/admin/customers/customers/118/1?suggestions=yes')).expect(202);
    expect(jobs.runNodeScript).toHaveBeenCalledWith(
      'normalize_names.js', [118, '[]', '1', 'yes', '']
    );
  });

  it('passes named companies through as JSON, not shell text', async () => {
    await auth(request(app).get('/admin/customers/customers/118/%5B9%2C10%5D/1')).expect(202);
    expect(jobs.runNodeScript).toHaveBeenCalledWith(
      'normalize_names.js', [118, '[9,10]', '1', '', '']
    );
  });

  it('starts a missing-inventor run once per company', async () => {
    repo.findInventorProcess.mockResolvedValue(null);
    await auth(request(app).get('/admin/customers/118/9/missing_inventor')).expect(200);
    expect(repo.createInventorProcess).toHaveBeenCalled();

    repo.findInventorProcess.mockResolvedValue({ id: 1 });
    const res = await auth(request(app).get('/admin/customers/118/9/missing_inventor')).expect(200);
    expect(res.body.message).toBe('Already in process.');
  });

  it('does not let the stop path fall into the start path', async () => {
    await auth(request(app).get('/admin/customers/118/9/missing_inventor/stop')).expect(200);
    expect(repo.stopInventorProcess).toHaveBeenCalled();
    expect(repo.createInventorProcess).not.toHaveBeenCalled();
  });

  it('publishes company changes', async () => {
    const res = await auth(request(app).get('/admin/customers/118/publish')).expect(200);
    expect(jobs.runPhpScript).toHaveBeenCalledWith('update_client_companies.php', [118, '']);
    expect(res.body.message).toBe('UPDATED!');
  });
});

describe('admin users', () => {
  it('lists administrators', async () => {
    repo.listAdminUsers.mockResolvedValue([{ user_id: 1, username: 'root' }]);
    const res = await auth(request(app).get('/admin/users')).expect(200);
    expect(res.body).toHaveLength(1);
  });

  it('creates one', async () => {
    repo.createAdminUser.mockResolvedValue({
      toJSON: () => ({ user_id: 7, first_name: 'A', last_name: 'B', username: 'ab' }),
    });
    const res = await auth(request(app).post('/admin/users'))
      .send({ first_name: 'A', last_name: 'B', username: 'ab', password: 'secret' })
      .expect(201);
    expect(res.body).toMatchObject({ id: 7, username: 'ab' });
  });

  it('400s without a password', async () => {
    await auth(request(app).post('/admin/users')).send({ username: 'ab' }).expect(400);
  });

  it('404s when updating an administrator that does not exist', async () => {
    repo.findAdminUser.mockResolvedValue(null);
    await auth(request(app).put('/admin/users/99')).send({ password: 'x' }).expect(404);
  });
});

describe('logs', () => {
  it('fills the reclassify start times from the previous end', async () => {
    repo.reclassifyLogs.mockResolvedValue([
      { id: 1, end_time: '10:00' }, { id: 2, end_time: '10:05' },
    ]);
    const res = await auth(request(app).get('/admin/customers/118/reclassify')).expect(200);
    expect(res.body[1].start_time).toBe('10:00');
  });

  it('does not query the update log without companies', async () => {
    const res = await auth(request(app).get('/admin/customers/118/run_update_log')).expect(200);
    expect(res.body).toEqual([]);
    expect(repo.updateLogs).not.toHaveBeenCalled();
  });

  it('400s on a malformed companies list', async () => {
    await auth(request(app).get('/admin/customers/118/run_update_log?companies=oops')).expect(400);
  });
});
