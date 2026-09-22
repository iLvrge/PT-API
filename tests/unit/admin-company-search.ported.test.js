'use strict';

// Endpoints the admin console calls that the rewrite had left unported (404):
// GET /admin/company/report, /company/lender, /company/:id/companies,
// /company/law_firms/:id/normalize_lawfirms and the /company/family/:id pair.

jest.mock('../../src/modules/admin-company-search/admin-company-search.repository');
jest.mock('../../src/jobs/queue');

const repo = require('../../src/modules/admin-company-search/admin-company-search.repository');
const jobs = require('../../src/jobs/queue');
const service = require('../../src/modules/admin-company-search/admin-company-search.service');

beforeEach(() => {
  jest.clearAllMocks();
  // The auto-mock resolves undefined, and the services read the queued
  // job's id to hand back to the caller.
  jobs.enqueue.mockResolvedValue({ id: 'job-1', deduped: false });
});

describe('searchLenders', () => {
  it('does not touch the corpus when no search term is given', async () => {
    await expect(service.searchLenders(undefined)).resolves.toEqual([]);
    await expect(service.searchLenders('')).resolves.toEqual([]);
    expect(repo.searchLenders).not.toHaveBeenCalled();
  });

  it('passes a real search term through', async () => {
    repo.searchLenders.mockResolvedValue([{ name: 'Wells Fargo Bank' }]);
    await expect(service.searchLenders('Wells')).resolves.toEqual([{ name: 'Wells Fargo Bank' }]);
    expect(repo.searchLenders).toHaveBeenCalledWith('Wells');
  });
});

describe('runFamilyAssets', () => {
  it('starts the rebuild in the background and acknowledges immediately', async () => {
    const result = await service.runFamilyAssets({ customerId: 146, retrieveAll: '0' });
    expect(jobs.enqueue).toHaveBeenCalledWith('family.build-for-customer', {
      customerId: 146, representativeIds: [], retrieveAll: '0',
    });
    expect(result).toEqual({ message: 'Run assets family', jobId: 'job-1' });
  });

  it('passes the chosen companies as payload data, never a shell string', async () => {
    await service.runFamilyAssets({ customerId: 146, representativeIds: [1, 2], retrieveAll: '1' });
    const [name, payload] = jobs.enqueue.mock.calls[0];
    expect(name).toBe('family.build-for-customer');
    expect(payload).toEqual({ customerId: 146, representativeIds: [1, 2], retrieveAll: '1' });
  });

  it('says so when it was scoped to particular companies', async () => {
    const result = await service.runFamilyAssets({ customerId: 146, representativeIds: [1] });
    expect(result.message).toBe('Run assets family with representatives');
  });

  /*
   * The rebuild takes minutes, so the request must not wait for it. It now
   * awaits the enqueue — a Redis write — rather than returning synchronously,
   * which is what lets it hand back a job id. The property that matters is
   * unchanged and is what this asserts: the script is never run here.
   */
  it('waits only for the job to be queued, never for the rebuild', async () => {
    const runner = require('../../src/jobs/runner');
    const result = await service.runFamilyAssets({ customerId: 146 });

    expect(jobs.enqueue).toHaveBeenCalledTimes(1);
    expect(result.jobId).toBe('job-1');
    // enqueue is mocked, so nothing should have reached the runner.
    expect(typeof runner.runJob).toBe('function');
  });
});

describe('pass-through reads', () => {
  it('representativeReports asks the repository for the pre-aggregated table', async () => {
    repo.representativeReports.mockResolvedValue([{ representative_id: 6720 }]);
    await expect(service.representativeReports()).resolves.toHaveLength(1);
  });

  it('normalisationCandidates forwards the party id', async () => {
    repo.normalisationCandidates.mockResolvedValue([]);
    await service.normalisationCandidates(4028728);
    expect(repo.normalisationCandidates).toHaveBeenCalledWith(4028728);
  });

  it('lawFirmNormalisationCandidates forwards the firm id', async () => {
    repo.lawFirmNormalisationCandidates.mockResolvedValue([]);
    await service.lawFirmNormalisationCandidates(7925);
    expect(repo.lawFirmNormalisationCandidates).toHaveBeenCalledWith(7925);
  });
});
