'use strict';

jest.mock('../../src/modules/users/users.repository');
jest.mock('../../src/db/tenant-connections');
jest.mock('../../src/modules/admin-company-search/admin-company-search.repository');
jest.mock('../../src/utils/php-jobs');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const usersRepo = require('../../src/modules/users/users.repository');
const repo = require('../../src/modules/admin-company-search/admin-company-search.repository');
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
  jobs.runNodeScript.mockResolvedValue({ stdout: '', stderr: '' });
});

describe('admin access', () => {
  it('401s without a token', async () => {
    await request(app).get('/admin/company/request').expect(401);
  });

  it('403s for a non-admin token', async () => {
    usersRepo.isAdmin.mockResolvedValue(false);
    await auth(request(app).get('/admin/company/request')).expect(403);
  });
});

describe('company requests', () => {
  it('lists them', async () => {
    repo.companyRequests.mockResolvedValue([{ company_id: 1, name: 'Acme' }]);
    const res = await auth(request(app).get('/admin/company/request')).expect(200);
    expect(res.body).toHaveLength(1);
  });

  it('resolves a batch against a corpus company', async () => {
    await auth(request(app).put('/admin/company/request'))
      .send({ company_ids: '[1,2]', representative_id: 9, type: 0 })
      .expect(200);
    expect(repo.resolveCompanyRequests).toHaveBeenCalledWith([1, 2], {
      status: 1, representative_id: 9, account_id: 0,
    });
  });

  it('400s on an empty selection', async () => {
    await auth(request(app).put('/admin/company/request'))
      .send({ company_ids: '[]', representative_id: 9 })
      .expect(400);
  });
});

describe('search routing', () => {
  it('does not let /company/search/:search swallow /company/search/all', async () => {
    repo.searchParties.mockResolvedValue([]);
    await auth(request(app).get('/admin/company/search/all/?filter=%5B%5D')).expect(200);
    // The filter was empty, so nothing was searched.
    expect(repo.searchParties).not.toHaveBeenCalled();
  });

  it('does not let it swallow /company/search/address/...', async () => {
    repo.searchPartiesByAddress.mockResolvedValue([]);
    await auth(request(app).get('/admin/company/search/address/1%20Main%20St')).expect(200);
    expect(repo.searchPartiesByAddress).toHaveBeenCalled();
    expect(repo.searchParties).not.toHaveBeenCalled();
  });

  it('does not let it swallow /company/search/country/...', async () => {
    repo.searchPartiesByCountry.mockResolvedValue([]);
    await auth(request(app).get('/admin/company/search/country/US')).expect(200);
    expect(repo.searchPartiesByCountry).toHaveBeenCalledWith('US');
  });

  it('searches by term otherwise', async () => {
    repo.searchParties.mockResolvedValue([{ id: 1 }]);
    await auth(request(app).get('/admin/company/search/acme')).expect(200);
    expect(repo.searchParties).toHaveBeenCalledWith('"acme"');
  });

  it('400s on a malformed grid filter', async () => {
    await auth(request(app).get('/admin/company/search/all/?filter=oops')).expect(400);
  });
});

describe('PUT /admin/company/search/all/', () => {
  it('splits the selected rows by which corpus they came from', async () => {
    repo.findRepresentativeByName.mockResolvedValue({ representative_id: 9 });

    await auth(request(app).put('/admin/company/search/all/'))
      .send({
        normalize_name: 'Acme Inc',
        selected_rows: JSON.stringify([
          { id: 1, name: 'ACME INC.', flag: 1 },
          { id: 2, name: 'ACME PTAB', flag: 3 },
        ]),
      })
      .expect(200);

    expect(repo.pointPartiesAt).toHaveBeenCalledWith([1], 9);
    expect(repo.pointPtabNamesAt).toHaveBeenCalledWith(['ACME PTAB'], 9);
  });

  it('accepts a plain id list too', async () => {
    repo.findRepresentativeByName.mockResolvedValue({ representative_id: 9 });
    await auth(request(app).put('/admin/company/search/all/'))
      .send({ normalize_name: 'Acme Inc', IDs: '[1,2]' })
      .expect(200);
    expect(repo.pointPartiesAt).toHaveBeenCalledWith([1, 2], 9);
  });

  it('400s without a normalised name', async () => {
    await auth(request(app).put('/admin/company/search/all/'))
      .send({ IDs: '[1]' })
      .expect(400);
  });
});

describe('address search', () => {
  it('reads the repeated address[] field', async () => {
    repo.searchPartiesByAddress.mockResolvedValue([]);
    await auth(request(app).post('/admin/company/9/search/address/all/1'))
      .send('address[]=1 Main St&address[]=2 Side St')
      .expect(200);

    expect(repo.searchPartiesByAddress).toHaveBeenCalledWith({
      address: '"1 Main St" "2 Side St"', securityOnly: true,
    });
  });

  it('reads the bibliographic applicant record when flag is 2', async () => {
    repo.addressesForParty.mockResolvedValue([]);
    await auth(request(app).get('/admin/company/9/search/address/0?flag=2')).expect(200);
    expect(repo.addressesForParty).toHaveBeenCalledWith({ partyId: 9, applicant: true });
  });

  it('400s on a non-numeric party id', async () => {
    await auth(request(app).get('/admin/company/abc/search/address/0')).expect(400);
  });
});

describe('law firms and lawyers', () => {
  it('creates law-firm rows for names not yet in the corpus', async () => {
    repo.lawFirmsByNames
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ law_firm_id: 2, name: 'New LLP' }]);
    repo.findLawFirmRepresentative.mockResolvedValue({ representative_id: 5 });

    await auth(request(app).put('/admin/company/law_firms'))
      .send({ law_firm_ids: '[1]', names: '["New LLP"]', normalize_name: 'New LLP' })
      .expect(200);

    expect(repo.createLawFirmsFromCorrespondence).toHaveBeenCalledWith(['New LLP']);
    expect(repo.pointLawFirmsAt).toHaveBeenCalledWith([1, 2], 5);
  });

  it('normalises lawyers', async () => {
    repo.findLawyerRepresentative.mockResolvedValue({ representative_lawyer_id: 3 });
    await auth(request(app).put('/admin/company/lawyers'))
      .send({ lawyer_ids: '[1,2]', normalize_name: 'A Lawyer' })
      .expect(200);
    expect(repo.pointLawyersAt).toHaveBeenCalledWith([1, 2], 3);
  });

  it('does not let /company/law_firms/:id swallow the bare list', async () => {
    repo.lawFirms.mockResolvedValue([]);
    await auth(request(app).get('/admin/company/law_firms')).expect(200);
    expect(repo.lawyersForFirm).not.toHaveBeenCalled();
  });
});

describe('assignments', () => {
  it('writes only the correspondent columns', async () => {
    repo.rawAssignment.mockResolvedValue({ rf_id: 500 });
    await auth(request(app).put('/admin/company/assignments'))
      .send({ rf_id: 500, cname: 'New Firm', reel_no: 'ignored' })
      .expect(200);
    expect(repo.updateCorrespondent).toHaveBeenCalledWith(500, { cname: 'New Firm' });
  });

  it('404s for a transaction that does not exist', async () => {
    repo.rawAssignment.mockResolvedValue(null);
    await auth(request(app).get('/admin/company/assignments/999')).expect(404);
  });

  it('caps the recent-transaction limit', async () => {
    repo.recentTransactions.mockResolvedValue([]);
    await auth(request(app).get('/admin/company/recent_transactions?limit=99999')).expect(200);
    expect(repo.recentTransactions).toHaveBeenCalledWith(1000);
  });
});

describe('cited assignee logos', () => {
  it('clears them', async () => {
    await auth(request(app).put('/admin/company/assignees/logos'))
      .send({ assignee_id: '[1,2]', type: 'clear' })
      .expect(200);
    expect(repo.clearAssigneeLogos).toHaveBeenCalledWith([1, 2]);
  });

  it('queues the download as an argument array, never a shell string', async () => {
    await auth(request(app).put('/admin/company/assignees/logos'))
      .send({ assignee_id: '[1,2]', type: 'download' })
      .expect(200);
    expect(jobs.runNodeScript).toHaveBeenCalledWith('download_assignees_logos.js', ['[1,2]']);
  });

  it('cannot be talked into running something else', async () => {
    await auth(request(app).put('/admin/company/assignees/logos'))
      .send({ assignee_id: '["1\\";touch /tmp/pwned;#"]', type: 'download' })
      .expect(200);
    // The crafted value is one argument to the script, not shell syntax.
    expect(jobs.runNodeScript).toHaveBeenCalledWith(
      'download_assignees_logos.js', ['["1\\";touch /tmp/pwned;#"]']
    );
  });

  it('400s on an unknown action', async () => {
    await auth(request(app).put('/admin/company/assignees/logos'))
      .send({ assignee_id: '[1]', type: 'nonsense' })
      .expect(400);
  });
});
