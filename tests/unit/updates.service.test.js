'use strict';

// Partial mock: COUNTERS is the column list the service zero-fills from.
jest.mock('../../src/modules/updates/updates.repository', () => {
  const actual = jest.requireActual('../../src/modules/updates/updates.repository');
  return {
    ...actual,
    organisationName: jest.fn(),
    findParentRepresentative: jest.fn(),
    forRepresentative: jest.fn(),
    forOrganisation: jest.fn(),
  };
});

const repo = require('../../src/modules/updates/updates.repository');
const service = require('../../src/modules/updates/updates.service');

const tenant = { id: 't' };

beforeEach(() => jest.clearAllMocks());

describe('updates.service.counters', () => {
  it('falls back to the organisation name when the client sends "undefined"', async () => {
    repo.organisationName.mockResolvedValue('Acme Inc');
    repo.findParentRepresentative.mockResolvedValue({ representative_id: 9 });
    repo.forRepresentative.mockResolvedValue({ weekly_transactions: 3 });

    const res = await service.counters(tenant, 118, 'undefined');
    expect(repo.organisationName).toHaveBeenCalledWith(118);
    expect(repo.findParentRepresentative).toHaveBeenCalledWith(tenant, 'Acme Inc');
    expect(res).toEqual({ weekly_transactions: 3 });
  });

  it('sums across the organisation when the company is 0', async () => {
    repo.forOrganisation.mockResolvedValue({ weekly_transactions: 10 });
    const res = await service.counters(tenant, 118, '0');
    expect(res).toEqual({ weekly_transactions: 10 });
    expect(repo.findParentRepresentative).not.toHaveBeenCalled();
  });

  it('returns zeros for a company the tenant does not know', async () => {
    repo.findParentRepresentative.mockResolvedValue(null);
    const res = await service.counters(tenant, 118, 'Unknown Co');
    expect(res).toEqual(service.EMPTY);
    expect(repo.forRepresentative).not.toHaveBeenCalled();
  });

  it('returns zeros rather than null when the company has no counters yet', async () => {
    repo.findParentRepresentative.mockResolvedValue({ representative_id: 9 });
    repo.forRepresentative.mockResolvedValue(null);
    expect(await service.counters(tenant, 118, 'Acme Inc')).toEqual(service.EMPTY);
  });

  it('sums across the organisation when it has no name either', async () => {
    repo.organisationName.mockResolvedValue(null);
    repo.forOrganisation.mockResolvedValue(null);
    expect(await service.counters(tenant, 118, undefined)).toEqual({
      weekly_transactions: 0,
      weekly_applications: 0,
      monthly_transactions: 0,
      montly_applications: 0,
      quaterly_transactions: 0,
      quaterly_applications: 0,
    });
  });
});
