'use strict';

jest.mock('../../src/modules/customers/customers.repository');
jest.mock('../../src/modules/customers/customers.tail', () => {
  const actual = jest.requireActual('../../src/modules/customers/customers.tail');
  return {
    ...actual,
    windowTransactions: jest.fn(),
    procTransactions: jest.fn(),
    typeCounters: jest.fn(),
    tenantCompanies: jest.fn(),
    tenantCompanyByName: jest.fn(),
    treeParties: jest.fn(),
    collectionFrames: jest.fn(),
  };
});

const repo = require('../../src/modules/customers/customers.repository');
const tailQ = require('../../src/modules/customers/customers.tail');
const actual = jest.requireActual('../../src/modules/customers/customers.tail');
const service = require('../../src/modules/customers/customers.service');

const tenant = { id: 't' };

beforeEach(() => jest.clearAllMocks());

describe('layoutTransactions branch selection', () => {
  it('window layouts use the window query', async () => {
    tailQ.windowTransactions.mockResolvedValue([{ rf_id: 1 }]);
    const res = await service.layoutTransactions({ layout: 'incorrect_names', companies: [9], tabs: [], customers: [], lawfirm: 0, orgType: 1 });
    expect(tailQ.windowTransactions.mock.calls[0][0].layoutId).toBe(17);
    expect(res.total_records).toBe(1);
  });

  it('other layouts call routine_transactions_full; correct_details its own proc', async () => {
    tailQ.procTransactions.mockResolvedValue([]);
    await service.layoutTransactions({ layout: 'anything', companies: [9], tabs: [17], customers: [], lawfirm: 0, orgType: 1 });
    let args = tailQ.procTransactions.mock.calls[0][0];
    expect(args.layoutName).toBe('anything');
    expect(args.tabs).toEqual([17, 1, 6]);

    await service.layoutTransactions({ layout: 'correct_details', companies: [], tabs: [], customers: [], lawfirm: 0, orgType: 1 });
    args = tailQ.procTransactions.mock.calls[1][0];
    expect(args.layoutName).toBe('correct_details');
  });
});

describe('customerType', () => {
  it('maps type names to tabs and keeps only companies with activity', async () => {
    tailQ.tenantCompanies.mockResolvedValue([
      { representative_id: 9, original_name: 'A' },
      { representative_id: 10, original_name: 'B' },
    ]);
    tailQ.typeCounters.mockResolvedValue([{ representative_id: 9, counter: 3 }]);
    const res = await service.customerType(tenant, 'securities');
    expect(tailQ.typeCounters.mock.calls[0][0]).toBe(4); // securities -> tab 4
    expect(res).toEqual([{ id: 9, name: 'A', children: [], level: 0 }]);
  });

  it('unknown type returns []', async () => {
    await expect(service.customerType(tenant, 'nope')).resolves.toEqual([]);
    expect(tailQ.tenantCompanies).not.toHaveBeenCalled();
  });
});

describe('parentParties / parentCollections', () => {
  it('parties resolves the company by either name column', async () => {
    tailQ.tenantCompanyByName.mockResolvedValue({ representative_id: 9 });
    tailQ.treeParties.mockResolvedValue([{ id: 1 }]);
    await service.parentParties(tenant, 'Acme', 3);
    expect(tailQ.treeParties).toHaveBeenCalledWith(9, 3);
  });

  it('collections is gated on organisation 0 existing (legacy literal)', async () => {
    repo.organisationExists.mockResolvedValue(false);
    await expect(service.parentCollections('Acme', 'Cust', 0)).resolves.toEqual([]);
    expect(tailQ.collectionFrames).not.toHaveBeenCalled();
  });
});

describe('collection tab config (real module)', () => {
  it('covers all 11 legacy tabs with the right conveyance sets', () => {
    expect(Object.keys(actual.COLLECTION_TABS)).toHaveLength(11);
    expect(actual.COLLECTION_TABS[9][0]).toMatchObject({ ea: 1, convey: ['assignment', 'partialassignment', 'employee'] });
    expect(actual.COLLECTION_TABS[4]).toHaveLength(2); // securities + releases
    expect(actual.COLLECTION_TABS[10]).toHaveLength(2);
  });
});
