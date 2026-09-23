'use strict';

jest.mock('../../src/modules/users/users.repository');
jest.mock('../../src/db/tenant-connections');
jest.mock('../../src/modules/admin-customers/admin-customers.repository');
jest.mock('../../src/jobs/queue');
jest.mock('../../src/utils/uploads');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const usersRepo = require('../../src/modules/users/users.repository');
const repo = require('../../src/modules/admin-customers/admin-customers.repository');
const jobs = require('../../src/jobs/queue');
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
  jobs.enqueue.mockResolvedValue({ id: 'job-1', deduped: false });
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
    await auth(request(app)
      .get('/admin/customers/run_query/Acme/2?company_id=9&organisation_id=118'))
      .expect(200);
    expect(repo.findCustomer).not.toHaveBeenCalled();
  });

  /*
   * company_id and organisation_id are bound into the report SQL, so they must
   * always reach the repository — but they default rather than being required.
   *
   * Requiring them made every click on the console's Run Queries screen a 400:
   * that client sends the name and the report number and nothing else. The
   * defaults are the legacy handler's own, 99999 / 68.
   */
  it('defaults the bound parameters when the client sends neither', async () => {
    repo.runReport.mockResolvedValue([]);
    await auth(request(app).get('/admin/customers/run_query/Acme/1')).expect(200);
    expect(repo.runReport).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 99999, organisationId: 68 })
    );
  });

  it('keeps the given half and defaults the other', async () => {
    repo.runReport.mockResolvedValue([]);
    await auth(request(app).get('/admin/customers/run_query/Acme/1?company_id=9')).expect(200);
    expect(repo.runReport).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 9, organisationId: 68 })
    );
  });

  // Correct Chain. It was missing from the report map, so the console's eighth
  // button was rejected as out of range.
  it('accepts report 8', async () => {
    repo.runReport.mockResolvedValue([]);
    await auth(request(app).get('/admin/customers/run_query/Acme/8')).expect(200);
    expect(repo.runReport).toHaveBeenCalledWith(expect.objectContaining({ queryNo: 8 }));
  });

  it('passes both through to the repository once given', async () => {
    repo.runReport.mockResolvedValue([]);
    await auth(request(app)
      .get('/admin/customers/run_query/Acme/1?company_id=9&organisation_id=118'))
      .expect(200);
    expect(repo.runReport).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 9, organisationId: 118 })
    );
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
    expect(jobs.enqueue).toHaveBeenCalledWith('names.normalise', {
      organisationId: 118, representativeIds: [], type: '1', suggestions: 'yes', fixedIdenticals: undefined,
    });
  });

  it('passes named companies through as JSON, not shell text', async () => {
    // A plain type-1 request is the Inventors list now; the script needs a flag.
    await auth(request(app).get('/admin/customers/customers/118/%5B9%2C10%5D/1?fixed_identicals=1')).expect(202);
    expect(jobs.enqueue).toHaveBeenCalledWith('names.normalise', {
      organisationId: 118, representativeIds: [9, 10], type: '1', suggestions: undefined, fixedIdenticals: '1',
    });
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

  /*
   * The console's Update button. The port called update_client_companies.php,
   * a script that exists in no pipeline repository and that the legacy handler
   * never named — so this failed on every press, silently. It also dropped the
   * user check and the company_id selection the legacy handler honoured.
   */
  describe('publish', () => {
    beforeEach(() => repo.countUsersInOrganisation.mockResolvedValue(3));

    it('rebuilds the whole organisation when nothing is selected', async () => {
      const res = await auth(request(app).get('/admin/customers/118/publish')).expect(200);

      expect(jobs.enqueue).toHaveBeenCalledWith('company.build-application-data', {
        organisationId: 118, companyId: '',
      });
      expect(res.body.message).toBe('UPDATED!');
    });

    it('queues one rebuild per selected company', async () => {
      await auth(request(app).get('/admin/customers/118/publish?company_id=%5B9%2C10%5D')).expect(200);

      // One job each, with the legacy handler's trailing "1".
      expect(jobs.enqueue).toHaveBeenCalledTimes(2);
      expect(jobs.enqueue).toHaveBeenCalledWith('company.build-application-data', {
        organisationId: 118, companyId: 9, extra: '1',
      });
      expect(jobs.enqueue).toHaveBeenCalledWith('company.build-application-data', {
        organisationId: 118, companyId: 10, extra: '1',
      });
    });

    it('refuses when the customer has no users, instead of rebuilding for nobody', async () => {
      repo.countUsersInOrganisation.mockResolvedValue(0);

      const res = await auth(request(app).get('/admin/customers/118/publish')).expect(200);

      expect(res.body.message).toBe('Please create a admin user first for this customer.');
      expect(jobs.enqueue).not.toHaveBeenCalled();
    });

    // validate() replaces req.query with its parsed output, and orgSchema
    // declares only params — so the query survives. Worth holding in place.
    it('still receives company_id after route validation', async () => {
      await auth(request(app).get('/admin/customers/118/publish?company_id=%5B7%5D')).expect(200);
      expect(jobs.enqueue).toHaveBeenCalledWith('company.build-application-data', {
        organisationId: 118, companyId: 7, extra: '1',
      });
    });
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

/*
 * GET /admin/customers/customers/:id/:portfolios/:type carries two things, as
 * it did in the legacy handler: the console's Entities list (type 3, no flags)
 * answered from the database, and the normalisation script, started when
 * `suggestions` or `fixed_identicals` is sent. The port ran the script for
 * both and answered 202, so the Entities button never showed a list.
 */
describe('customer entities', () => {
  const entity = { assignor_and_assignee_id: 7, name: 'Avaya Inc', counter: '3', normalize_name: null,
    representativeCompany: null, total_occurences: 9, rf_id: 1, flag: 1 };

  beforeEach(() => { jobs.enqueue.mockClear(); repo.entitiesForCustomer.mockReset(); });

  it('answers the entities list for type 3 without starting the script', async () => {
    repo.entitiesForCustomer.mockResolvedValue([entity]);
    const res = await auth(request(app).get('/admin/customers/customers/68/[859,864]/3')).expect(200);
    expect(repo.entitiesForCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ companyIds: [859, 864] })
    );
    expect(res.body).toEqual([expect.objectContaining({ id: 7, name: 'Avaya Inc', counter: 3, total_occurences: 9 })]);
    expect(jobs.enqueue).not.toHaveBeenCalled();
  });

  it('folds names differing only in case into one row, counts summed', async () => {
    repo.entitiesForCustomer.mockResolvedValue([
      entity, { ...entity, assignor_and_assignee_id: 8, name: 'AVAYA INC', counter: '2' },
    ]);
    const res = await auth(request(app).get('/admin/customers/customers/68/[859]/3')).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].counter).toBe(5);
  });

  it('still starts the script when normalisation flags are sent', async () => {
    jobs.enqueue.mockResolvedValue({ id: 'job-1' });
    await auth(request(app).get('/admin/customers/customers/68/[859]/3?suggestions=1')).expect(202);
    expect(repo.entitiesForCustomer).not.toHaveBeenCalled();
    expect(jobs.enqueue).toHaveBeenCalled();
  });

  it('answers the inventors list for type 1 from both sources, folded together', async () => {
    repo.inventorAssignorsForCustomer.mockResolvedValue([{ ...entity, name: 'Kevin James', counter: '4', flag: 1 }]);
    repo.bibliographicInventorsForCustomer.mockResolvedValue([{ ...entity, assignor_and_assignee_id: 9, name: 'KEVIN JAMES', counter: '5', flag: 4, rf_id: 0 }]);
    const res = await auth(request(app).get('/admin/customers/customers/68/[859]/1')).expect(200);
    expect(res.body).toEqual([expect.objectContaining({ name: 'Kevin James', counter: 9 })]);
    expect(jobs.enqueue).not.toHaveBeenCalled();
  });
});
