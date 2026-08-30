'use strict';

jest.mock('../../src/modules/admin-company-search/admin-company-search.repository');
jest.mock('../../src/utils/php-jobs');

const repo = require('../../src/modules/admin-company-search/admin-company-search.repository');
const jobs = require('../../src/utils/php-jobs');
const service = require('../../src/modules/admin-company-search/admin-company-search.service');

beforeEach(() => {
  jest.clearAllMocks();
  jobs.runNodeScript.mockResolvedValue({ stdout: '', stderr: '' });
});

describe('booleanTerms', () => {
  it('quotes each line so it matches as a phrase', () => {
    expect(service.booleanTerms('Acme Inc')).toBe('"Acme Inc"');
    expect(service.booleanTerms('Acme Inc\nBeta Corp')).toBe('"Acme Inc" "Beta Corp"');
  });

  it('strips the punctuation MySQL would read as boolean operators', () => {
    // +, -, >, <, (, ), ~, * and " all mean something in boolean mode, so a
    // pasted company name would otherwise change the query's meaning.
    expect(service.booleanTerms('Acme +Inc. (US)')).toBe('"Acme Inc US"');
    expect(service.booleanTerms('A "quoted" name')).toBe('"A quoted name"');
  });

  it('drops blank lines', () => {
    expect(service.booleanTerms('Acme\n\n\nBeta')).toBe('"Acme" "Beta"');
  });
});

describe('resolveCompanyRequests', () => {
  it('points requests at a corpus company for type 0', async () => {
    await service.resolveCompanyRequests({ companyIds: [1, 2], representativeId: 9, type: 0 });
    expect(repo.resolveCompanyRequests).toHaveBeenCalledWith([1, 2], {
      status: 1, representative_id: 9, account_id: 0,
    });
  });

  it('points them at a customer account otherwise', async () => {
    await service.resolveCompanyRequests({ companyIds: [1], representativeId: 118, type: 1 });
    expect(repo.resolveCompanyRequests).toHaveBeenCalledWith([1], {
      status: 1, account_id: 118, representative_id: 0,
    });
  });

  it('rejects an empty selection or a missing target', async () => {
    await expect(
      service.resolveCompanyRequests({ companyIds: [], representativeId: 9, type: 0 })
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.resolveCompanyRequests({ companyIds: [1], representativeId: 0, type: 0 })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('normaliseCompanies', () => {
  it('reuses the canonical record when one already exists', async () => {
    repo.findRepresentativeByName.mockResolvedValue({ representative_id: 9 });
    await service.normaliseCompanies({ partyIds: [1, 2], ptabNames: [], normalizeName: 'Acme Inc' });

    expect(repo.createRepresentative).not.toHaveBeenCalled();
    expect(repo.pointPartiesAt).toHaveBeenCalledWith([1, 2], 9);
  });

  it('creates the canonical record when it does not', async () => {
    repo.findRepresentativeByName.mockResolvedValue(null);
    repo.createRepresentative.mockResolvedValue({ toJSON: () => ({ representative_id: 77 }) });

    const result = await service.normaliseCompanies({
      partyIds: [1], ptabNames: [], normalizeName: 'New Co',
    });
    expect(repo.createRepresentative).toHaveBeenCalledWith('New Co');
    expect(result.representative_id).toBe(77);
  });

  it('updates PTAB names by name, separately from the party ids', async () => {
    repo.findRepresentativeByName.mockResolvedValue({ representative_id: 9 });
    await service.normaliseCompanies({
      partyIds: [1], ptabNames: ['ACME INC'], normalizeName: 'Acme Inc',
    });
    expect(repo.pointPartiesAt).toHaveBeenCalledWith([1], 9);
    expect(repo.pointPtabNamesAt).toHaveBeenCalledWith(['ACME INC'], 9);
  });

  it('does not touch either table when only one kind was selected', async () => {
    repo.findRepresentativeByName.mockResolvedValue({ representative_id: 9 });
    await service.normaliseCompanies({ partyIds: [], ptabNames: ['X'], normalizeName: 'Acme' });
    expect(repo.pointPartiesAt).not.toHaveBeenCalled();
  });

  it('rejects a blank name or an empty selection', async () => {
    await expect(
      service.normaliseCompanies({ partyIds: [1], ptabNames: [], normalizeName: '' })
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.normaliseCompanies({ partyIds: [], ptabNames: [], normalizeName: 'Acme' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('normaliseLawFirms', () => {
  beforeEach(() => {
    repo.findLawFirmRepresentative.mockResolvedValue({ representative_id: 5 });
  });

  it('creates rows for selected names the corpus does not hold yet', async () => {
    repo.lawFirmsByNames
      .mockResolvedValueOnce([{ law_firm_id: 1, name: 'Known LLP' }])
      .mockResolvedValueOnce([{ law_firm_id: 2, name: 'New LLP' }]);

    const result = await service.normaliseLawFirms({
      lawFirmIds: [1], names: ['Known LLP', 'New LLP'], normalizeName: 'Known LLP',
    });

    expect(repo.createLawFirmsFromCorrespondence).toHaveBeenCalledWith(['New LLP']);
    expect(repo.pointLawFirmsAt).toHaveBeenCalledWith([1, 2], 5);
    expect(result.normalised).toBe(2);
  });

  it('skips the creation step when every name is already known', async () => {
    repo.lawFirmsByNames.mockResolvedValue([{ law_firm_id: 1, name: 'Known LLP' }]);
    await service.normaliseLawFirms({
      lawFirmIds: [1], names: ['Known LLP'], normalizeName: 'Known LLP',
    });
    expect(repo.createLawFirmsFromCorrespondence).not.toHaveBeenCalled();
  });

  it('rejects an empty selection', async () => {
    await expect(
      service.normaliseLawFirms({ lawFirmIds: [], names: [], normalizeName: 'X' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('normaliseLawyers', () => {
  it('points the lawyers at the canonical record', async () => {
    repo.findLawyerRepresentative.mockResolvedValue({ representative_lawyer_id: 3 });
    const result = await service.normaliseLawyers({ lawyerIds: [1, 2], normalizeName: 'A Lawyer' });
    expect(repo.pointLawyersAt).toHaveBeenCalledWith([1, 2], 3);
    expect(result.normalised).toBe(2);
  });
});

describe('updateAssignment', () => {
  beforeEach(() => repo.rawAssignment.mockResolvedValue({ rf_id: 500 }));

  it('writes only the correspondent columns', async () => {
    await service.updateAssignment({
      rfId: 500,
      // reel_no is not a correspondent column and must be ignored.
      fields: { cname: 'New Firm', caddress_1: '1 Main St', reel_no: 'nope', rf_id: 500 },
    });
    expect(repo.updateCorrespondent).toHaveBeenCalledWith(500, {
      cname: 'New Firm', caddress_1: '1 Main St',
    });
  });

  it('400s when nothing changeable was sent', async () => {
    await expect(
      service.updateAssignment({ rfId: 500, fields: { reel_no: '1' } })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('404s for a transaction that does not exist', async () => {
    repo.rawAssignment.mockResolvedValue(null);
    await expect(
      service.updateAssignment({ rfId: 999, fields: { cname: 'x' } })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('updateCitedAssignee', () => {
  beforeEach(() => repo.findAssignee.mockResolvedValue({ assignee_id: 7 }));

  it('changes just the search name when that is what was sent', async () => {
    await service.updateCitedAssignee({ assigneeId: 7, fields: { assignee_query: 'acme' } });
    expect(repo.updateAssignee).toHaveBeenCalledWith(7, { assignee_query: 'acme' });
  });

  it('changes the logo set when api_logo is present', async () => {
    await service.updateCitedAssignee({
      assigneeId: 7, fields: { api_logo: 'a.png', image_url: 'b.png' },
    });
    expect(repo.updateAssignee).toHaveBeenCalledWith(7, { api_logo: 'a.png', image_url: 'b.png' });
  });

  it('changes just the chosen image when only that was sent', async () => {
    await service.updateCitedAssignee({ assigneeId: 7, fields: { image_url: 'c.png' } });
    expect(repo.updateAssignee).toHaveBeenCalledWith(7, { image_url: 'c.png' });
  });

  it('404s for an assignee that does not exist', async () => {
    repo.findAssignee.mockResolvedValue(null);
    await expect(
      service.updateCitedAssignee({ assigneeId: 9, fields: { image_url: 'x' } })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('assigneeLogos', () => {
  it('clears the stored logos', async () => {
    const result = await service.assigneeLogos({ assigneeIds: [1, 2], type: 'clear' });
    expect(repo.clearAssigneeLogos).toHaveBeenCalledWith([1, 2]);
    expect(result.message).toMatch(/cleared/);
    expect(jobs.runNodeScript).not.toHaveBeenCalled();
  });

  it('queues the download with an argument array, not a shell string', async () => {
    await service.assigneeLogos({ assigneeIds: [1, 2], type: 'download' });
    expect(jobs.runNodeScript).toHaveBeenCalledWith(
      'download_assignees_logos.js', ['[1,2]']
    );
  });

  it('rejects an unknown action', async () => {
    await expect(
      service.assigneeLogos({ assigneeIds: [1], type: 'nonsense' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects an empty selection', async () => {
    await expect(
      service.assigneeLogos({ assigneeIds: [], type: 'clear' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('rememberAddress', () => {
  it('records the transaction the address came from', async () => {
    repo.latestTransactionForAddress.mockResolvedValue({
      rf_id: 500, assignor_and_assignee_id: 9, representativeID: 3,
    });
    await service.rememberAddress({ partyId: 9, address1: '1 Main', address2: '' });
    expect(repo.rememberAddressTransaction).toHaveBeenCalledWith([{
      representative_id: 3, rf_id: 500, assignor_and_assignee_id: 9,
    }]);
  });

  it('returns null when the party never used that address', async () => {
    repo.latestTransactionForAddress.mockResolvedValue(null);
    expect(await service.rememberAddress({ partyId: 9, address1: 'x' })).toBeNull();
    expect(repo.rememberAddressTransaction).not.toHaveBeenCalled();
  });
});

describe('searchByAddress', () => {
  it('quotes each address and flags the security-only variant', async () => {
    repo.searchPartiesByAddress.mockResolvedValue([]);
    await service.searchByAddress({ addresses: ['1 Main St', '2 Side St'], securityOnly: true });
    expect(repo.searchPartiesByAddress).toHaveBeenCalledWith({
      address: '"1 Main St" "2 Side St"', securityOnly: true,
    });
  });

  it('does not query for an empty address list', async () => {
    expect(await service.searchByAddress({ addresses: [] })).toEqual([]);
    expect(repo.searchPartiesByAddress).not.toHaveBeenCalled();
  });
});
