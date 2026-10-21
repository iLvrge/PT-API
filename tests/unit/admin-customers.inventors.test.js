'use strict';

// PUT /admin/customers/:id/flag_update_manually — the console's inventor review
// screen, missing from the rewrite (404) — and the missing_inventor_process
// table, which the rewrite had pointed at db_new_application when it lives in
// db_uspto (so /missing_inventor answered 500 for every customer).

jest.mock('../../src/modules/admin-customers/admin-customers.repository');
jest.mock('../../src/db/tenant-connections');
jest.mock('../../src/db/query');
jest.mock('../../src/jobs/queue');

const repo = require('../../src/modules/admin-customers/admin-customers.repository');
const jobs = require('../../src/jobs/queue');
const service = require('../../src/modules/admin-customers/admin-customers.service');

beforeEach(() => {
  jest.clearAllMocks();
  repo.findCustomer.mockResolvedValue({ organisation_id: 146, name: 'AMPACC LAW GROUP' });
  repo.setEmployerAssign.mockResolvedValue([]);
  repo.rememberInventors.mockResolvedValue([]);
  jobs.enqueue.mockResolvedValue({ id: 'job-1' });
});

describe('flagInventors', () => {
  it('flags the given parties and records them as inventors', async () => {
    const result = await service.flagInventors({ organisationId: 146, partyIds: [7, 8], flag: '1' });

    expect(repo.setEmployerAssign).toHaveBeenCalledWith({ partyIds: [7, 8], flag: '1' });
    expect(repo.rememberInventors).toHaveBeenCalledWith([7, 8]);
    expect(result).toEqual({ updated: 2, flag: 1 });
  });

  it('does not record inventors when the flag is being cleared', async () => {
    await service.flagInventors({ organisationId: 146, partyIds: [7], flag: '0' });
    expect(repo.setEmployerAssign).toHaveBeenCalled();
    expect(repo.rememberInventors).not.toHaveBeenCalled();
  });

  it('rejects an empty list rather than running an unbounded UPDATE', async () => {
    await expect(
      service.flagInventors({ organisationId: 146, partyIds: [], flag: '1' })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repo.setEmployerAssign).not.toHaveBeenCalled();
  });

  it('404s for a customer that does not exist', async () => {
    repo.findCustomer.mockResolvedValue(null);
    await expect(
      service.flagInventors({ organisationId: 999, partyIds: [7], flag: '1' })
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(repo.setEmployerAssign).not.toHaveBeenCalled();
  });
});

describe('findMissingInventors', () => {
  it('starts a run and records the process', async () => {
    repo.findInventorProcess.mockResolvedValue(null);
    repo.createInventorProcess.mockResolvedValue({ process_id: 1 });

    const result = await service.findMissingInventors({ organisationId: 146, representativeId: 1 });

    expect(repo.createInventorProcess).toHaveBeenCalledWith({
      organisationId: 146, representativeId: 1,
    });
    expect(result.message).toMatch(/missing inventor/i);
  });

  it('does not start a second run while one is in flight', async () => {
    repo.findInventorProcess.mockResolvedValue({ process_id: 4, status: 0 });

    const result = await service.findMissingInventors({ organisationId: 146, representativeId: 1 });

    expect(result).toEqual({ message: 'Already in process.' });
    expect(repo.createInventorProcess).not.toHaveBeenCalled();
    expect(jobs.enqueue).not.toHaveBeenCalled();
  });
});

// missing_inventor_process has a UNIQUE index on
// (organisation_id, representative_id). A plain INSERT therefore succeeds
// exactly once per company; every later run failed on the constraint and the
// route answered 409, so the search could be used once and never again.
describe('restarting a finished inventor search', () => {

  it('does not start a second run while one is genuinely in flight', async () => {
    repo.findInventorProcess.mockResolvedValue({ process_id: 26, status: 0 });
    const result = await service.findMissingInventors({ organisationId: 68, representativeId: 55 });
    expect(result).toEqual({ message: 'Already in process.' });
    expect(repo.createInventorProcess).not.toHaveBeenCalled();
  });

  it('starts again once the previous run has finished', async () => {
    // findInventorProcess only matches status = 0, so a finished row looks absent
    repo.findInventorProcess.mockResolvedValue(null);
    repo.createInventorProcess.mockResolvedValue({ process_id: 26, restarted: true });

    const result = await service.findMissingInventors({ organisationId: 68, representativeId: 55 });

    expect(repo.createInventorProcess).toHaveBeenCalledWith({
      organisationId: 68, representativeId: 55,
    });
    expect(result.message).toMatch(/missing inventor/i);
  });
});
