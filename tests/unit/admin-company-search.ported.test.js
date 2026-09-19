'use strict';

// Endpoints the admin console calls that the rewrite had left unported (404):
// GET /admin/company/report, /company/lender, /company/:id/companies,
// /company/law_firms/:id/normalize_lawfirms and the /company/family/:id pair.

jest.mock('../../src/modules/admin-company-search/admin-company-search.repository');
jest.mock('../../src/utils/php-jobs');

const repo = require('../../src/modules/admin-company-search/admin-company-search.repository');
const jobs = require('../../src/utils/php-jobs');
const service = require('../../src/modules/admin-company-search/admin-company-search.service');

beforeEach(() => jest.clearAllMocks());

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
  it('starts the rebuild in the background and acknowledges immediately', () => {
    const result = service.runFamilyAssets({ customerId: 146, retrieveAll: '0' });
    expect(jobs.runPhpScriptBackground).toHaveBeenCalledWith(
      'assets_family.php', ['146', '[]', '0']
    );
    expect(result).toEqual({ message: 'Run assets family' });
  });

  it('passes the chosen companies as a JSON array argument, never a shell string', () => {
    service.runFamilyAssets({ customerId: 146, representativeIds: [1, 2], retrieveAll: '1' });
    const [, args] = jobs.runPhpScriptBackground.mock.calls[0];
    expect(args).toEqual(['146', '[1,2]', '1']);
    args.forEach((a) => expect(typeof a).toBe('string'));
  });

  it('says so when it was scoped to particular companies', () => {
    const result = service.runFamilyAssets({ customerId: 146, representativeIds: [1] });
    expect(result.message).toBe('Run assets family with representatives');
  });

  it('does not wait for the job — the rebuild takes minutes', () => {
    const result = service.runFamilyAssets({ customerId: 146 });
    expect(result).not.toBeInstanceOf(Promise);
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
