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

  it('defaultAssets reduces the assets table before joining it', () => {
    // One row per transaction that touched an asset - 57,949 of them behind
    // 4,273 applications for the test customer. Joining that fan-out and
    // grouping afterwards took five times as long as grouping first.
    const { template } = actual.defaultAssets({ companies: [9], tabs: [], customers: [], assignments: [], bankMode: false });
    const grouped = template.indexOf('GROUP BY assets.appno_doc_num');
    const joined = template.indexOf('INNER JOIN');
    expect(grouped).toBeGreaterThan(-1);
    expect(joined).toBeGreaterThan(grouped);
  });

  it('defaultAssets settles an application that was granted mid-history', () => {
    // Where some of an application's rows carry the grant number and its
    // earlier ones are empty, an ungrouped column returned whichever the join
    // reached first, so the asset showed as granted or pending run to run.
    const { template } = actual.defaultAssets({ companies: [9], tabs: [], customers: [], assignments: [], bankMode: false });
    expect(template).toContain('MAX(assets.grant_doc_num) AS grant_doc_num');
  });

  it('defaultAssets converts the latin1 side of the join, never the indexed column', () => {
    const { template } = actual.defaultAssets({ companies: [9], tabs: [], customers: [], assignments: [], bankMode: false });
    expect(template).toContain('CONVERT(did.appno_doc_num USING utf8mb4) COLLATE utf8mb4_0900_ai_ci');
    expect(template).not.toContain('CONVERT(assets.appno_doc_num');
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

describe('countAndList', () => {
  const q = require('../../src/db/query');
  const opts = { column: 'asset', direction: 'DESC', limit: 10, offset: 0 };

  afterEach(() => { jest.restoreAllMocks(); });

  it('runs the count and the page together, not one after the other', async () => {
    // Both evaluate the same template, and the template is the whole cost -
    // 11 s to count and 12 s to page the same list. Sequentially the request
    // took 23 s to do 12 s of work.
    const started = [];
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    jest.spyOn(q, 'selectValue').mockImplementation(async () => {
      started.push('count');
      await gate;
      return 2;
    });
    jest.spyOn(q, 'selectAll').mockImplementation(async () => {
      started.push('page');
      // The page query starts before the count has returned, or this hangs.
      release();
      return [{ asset: '1' }];
    });

    const res = await actual.countAndList('SELECT STRING_COLUMNS FROM t', {}, opts);
    expect(started).toEqual(['count', 'page']);
    expect(res).toEqual({ list: [{ asset: '1' }], total_records: 2 });
  });

  it('reports an empty list when the count comes back zero', async () => {
    jest.spyOn(q, 'selectValue').mockResolvedValue(0);
    jest.spyOn(q, 'selectAll').mockResolvedValue([]);
    expect(await actual.countAndList('SELECT STRING_COLUMNS FROM t', {}, opts))
      .toEqual({ list: [], total_records: 0 });
  });

  it('pages when a limit is given and asks for everything when it is zero', async () => {
    jest.spyOn(q, 'selectValue').mockResolvedValue(1);
    const selectAll = jest.spyOn(q, 'selectAll').mockResolvedValue([]);

    await actual.countAndList('SELECT STRING_COLUMNS FROM t', {}, { ...opts, limit: 25, offset: 50 });
    // (connection, sql, replacements)
    expect(selectAll.mock.calls[0][2]).toMatchObject({ offset: 50, limit: 25 });
    expect(selectAll.mock.calls[0][1]).toContain('LIMIT :offset, :limit');

    await actual.countAndList('SELECT STRING_COLUMNS FROM t', {}, { ...opts, limit: 0 });
    expect(selectAll.mock.calls[1][1]).not.toContain('LIMIT');
  });
});
