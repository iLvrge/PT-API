'use strict';

jest.mock('../../src/modules/customers/customers.repository');
jest.mock('../../src/modules/customers/customers.assets', () => {
  const actual = jest.requireActual('../../src/modules/customers/customers.assets');
  return {
    ...actual,
    forSale: jest.fn(),
    maintenance: jest.fn(),
    tenantCompanyName: jest.fn(),
    ownedApplications: jest.fn(),
    fetchPtabProceedings: jest.fn(),
    ptabDocuments: jest.fn(),
    lawfirmAssets: jest.fn(),
    countAndList: jest.fn(),
  };
});

const assetsQ = require('../../src/modules/customers/customers.assets');
const actual = jest.requireActual('../../src/modules/customers/customers.assets');
const service = require('../../src/modules/customers/customers.service');

const tenant = { id: 't' };
const auth = { orgId: 118, orgType: 1 };
const base = { layout: 'x', companies: [9], tabs: [], customers: [], assignments: [], limit: 10, offset: 0, otherMode: 0, lawyers: 0 };

beforeEach(() => jest.clearAllMocks());

describe('orderClause (F7 allowlist)', () => {
  it('allows known columns and wraps asset in ABS', () => {
    expect(actual.orderClause('asset', 'ASC')).toContain('ABS(asset) ASC');
    expect(actual.orderClause('grant_date', 'desc')).toContain('grant_date DESC');
  });
  it('rejects injection attempts back to the default', () => {
    const clause = actual.orderClause('asset; DROP TABLE user', 'ASC, (SELECT 1)');
    expect(clause).toContain('ABS(asset)');
    expect(clause).not.toContain('DROP');
    expect(clause).toContain('DESC');
  });
});

// `IN (SELECT ...)` over db_uspto.documentid / dashboard_items is what takes
// MySQL (and the app, silently) down on this data. Every branch must express
// those as joins; these guard against anyone reintroducing one.
describe('no IN-subqueries in generated SQL', () => {
  const builders = {
    'ownedDashboard 30': () => actual.ownedDashboard({ layoutId: 30, companies: [9], customers: [5], bankMode: false }),
    'ownedDashboard 45': () => actual.ownedDashboard({ layoutId: 45, companies: [9], customers: [5], bankMode: true }),
    'ownedDashboard split': () => actual.ownedDashboard({ layoutId: 30, companies: [9], customers: [5, 6], bankMode: false }),
    'genericDashboard 38': () => actual.genericDashboard({ layoutId: 38, companies: [9], customers: [], assignments: [], bankMode: false }),
    'genericDashboard 32': () => actual.genericDashboard({ layoutId: 32, companies: [9], customers: [5], assignments: [7], bankMode: false }),
    'genericDashboard 41': () => actual.genericDashboard({ layoutId: 41, companies: [9], customers: [5], assignments: [], bankMode: false }),
    'genericDashboard 41 split': () => actual.genericDashboard({ layoutId: 41, companies: [9], customers: [5, 6], assignments: [], bankMode: false }),
    'defaultAssets filtered': () => actual.defaultAssets({ companies: [9], tabs: [1], customers: [5], assignments: [7], bankMode: false }),
    'defaultAssets bare': () => actual.defaultAssets({ companies: [9], tabs: [], customers: [], assignments: [], bankMode: false }),
  };

  for (const [name, build] of Object.entries(builders)) {
    it(`${name} uses joins, never IN (SELECT ...)`, () => {
      const { template } = build();
      // \b so this does not trip on the "IN (" inside "JOIN ("
      expect(template).not.toMatch(/\bIN\s*\(\s*SELECT/i);
      expect(template).toContain('JOIN');
    });
  }
});

describe('builder SQL shapes', () => {
  it('ownedDashboard 45 excludes the type-34 rows with an anti-join', () => {
    const { template } = actual.ownedDashboard({ layoutId: 45, companies: [9], customers: [], bankMode: false });
    expect(template).toContain('AND di.type = 30');
    expect(template).toContain('collateralised.type = 34');
    // the anti-join half: matched rows are the ones to drop
    expect(template).toContain('collateralised.application IS NULL');
  });

  it('two-customer split binds customer + inventor separately with the union', () => {
    const { template, repl } = actual.ownedDashboard({ layoutId: 30, companies: [9], customers: [5, 6], bankMode: false });
    expect(repl.customers).toBe(5);
    expect(repl.inventor).toBe(6);
    expect(template).toContain('tempInventor');
  });

  it('genericDashboard 41 expands customers through the representative union', () => {
    const { template } = actual.genericDashboard({ layoutId: 41, companies: [9], customers: [5], assignments: [], bankMode: false });
    expect(template).toContain('tempAssignorAndAssignee');
  });

  it('defaultAssets without filters still applies the company-scoped subquery', () => {
    const { template } = actual.defaultAssets({ companies: [9], tabs: [], customers: [], assignments: [], bankMode: false });
    expect(template).toContain('activity_parties_transactions');
  });
});

describe('layoutAssets branch selection', () => {
  it('other_mode routes to forSale', async () => {
    assetsQ.forSale.mockResolvedValue({ list: [], total_records: 0 });
    await service.layoutAssets(tenant, { ...base, otherMode: 1 }, auth);
    expect(assetsQ.forSale).toHaveBeenCalled();
    expect(assetsQ.countAndList).not.toHaveBeenCalled();
  });

  it('pay_maintainence_fee routes to... layout 35 generic, but layout 3 is unreachable via names — maintenance still callable directly', async () => {
    assetsQ.countAndList.mockResolvedValue({ list: [], total_records: 0 });
    await service.layoutAssets(tenant, { ...base, layout: 'pay_maintainence_fee' }, auth);
    expect(assetsQ.countAndList).toHaveBeenCalled();
  });

  it('PTAB matches owned assets by VALUE and returns other_data', async () => {
    assetsQ.tenantCompanyName.mockResolvedValue('Acme');
    assetsQ.ownedApplications.mockResolvedValue(['7654321']);
    assetsQ.fetchPtabProceedings.mockResolvedValue([
      { appellantPatentNumber: '7654321' },
      { appellantPatentNumber: '1111111' }, // not owned -> filtered out
    ]);
    assetsQ.ptabDocuments.mockResolvedValue([{ asset: '7654321' }]);
    const res = await service.layoutAssets(tenant, { ...base, layout: 'ptab' }, auth);
    expect(assetsQ.ptabDocuments.mock.calls[0][0].number).toEqual(['7654321']);
    expect(res.other_data).toHaveLength(1);
  });

  // Layout 38 used to run familyGrantList first and hand the result back as
  // `grant_doc_num IN (:assetList)` — thousands of numbers in one statement.
  // It now joins assets_family itself, so there is no pre-query to short
  // circuit on: an empty family simply counts zero.
  it('layout 38 joins the family set in one query instead of pre-fetching it', async () => {
    assetsQ.countAndList.mockResolvedValue({ list: [], total_records: 0 });
    const res = await service.layoutAssets(tenant, { ...base, layout: 'top_non_us_members' }, auth);
    expect(res).toEqual({ list: [], total_records: 0 });
    const [template] = assetsQ.countAndList.mock.calls[0];
    expect(template).toContain('db_uspto.assets_family');
    expect(template).not.toContain(':assetList');
  });

  it('default layout expands tabs and runs the count/list skeleton', async () => {
    assetsQ.countAndList.mockResolvedValue({ list: [{ asset: '1' }], total_records: 1 });
    const res = await service.layoutAssets(tenant, { ...base, layout: 'unknown', tabs: [17] }, auth);
    const [template, repl] = assetsQ.countAndList.mock.calls[0];
    expect(template).toContain('STRING_COLUMNS');
    expect(repl.tabs).toEqual([17, 1, 6]);
    expect(res.total_records).toBe(1);
  });
});
