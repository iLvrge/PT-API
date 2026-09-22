'use strict';

// The cited/party grid SQL. sort_by, sort_direction, rows_per_page and
// current_page all arrive from the query string, and the legacy handlers built
// the ORDER BY and LIMIT by string concatenation:
//
//   ` ORDER BY ${sort_by} ${sort_direction} LIMIT ${current_page * rows_per_page}, ${rows_per_page}`
//
// A bind parameter cannot stand in for an identifier, so the column and the
// direction go through the allowlist helpers instead, and only the LIMIT values
// are bound. These assert the generated SQL directly, since a mocked repository
// would hide all of it.

jest.mock('../../src/db', () => ({
  connections: {
    resources: { name: 'resources', define: jest.fn(() => ({})) },
    applicationNew: { name: 'applicationNew', define: jest.fn(() => ({})) },
    business: { name: 'business', define: jest.fn(() => ({})) },
    application: { name: 'application', define: jest.fn(() => ({})) },
  },
  Sequelize: require('sequelize').Sequelize,
}));
jest.mock('../../src/db/models/citations.models', () => ({
  AssigneeOrganization: { bulkCreate: jest.fn(), update: jest.fn() },
}));

jest.mock('../../src/db/query', () => ({
  selectAll: jest.fn().mockResolvedValue([]),
  selectOne: jest.fn().mockResolvedValue({ total_records: 0 }),
  exists: jest.fn().mockResolvedValue(false),
  identifier: jest.requireActual('../../src/db/query').identifier,
  direction: jest.requireActual('../../src/db/query').direction,
}));

const q = require('../../src/db/query');
const repository = require('../../src/modules/admin-company-search/admin-company-search.repository');

const lastSelectAll = () => {
  const [, sql, repl] = q.selectAll.mock.calls[q.selectAll.mock.calls.length - 1];
  return { sql: sql.replace(/\s+/g, ' '), repl };
};

const BASE = { companyIds: [1], names: ['Acme Inc'], rowsPerPage: 10, currentPage: 0 };

beforeEach(() => jest.clearAllMocks());

describe('ORDER BY is an allowlisted identifier', () => {
  it('accepts a known column', async () => {
    await repository.citedAssigneesPage({ ...BASE, sortBy: 'domain', sortDirection: 'asc' });
    expect(lastSelectAll().sql).toContain('ORDER BY domain ASC');
  });

  it('falls back to occurences for an unknown column', async () => {
    await repository.citedAssigneesPage({ ...BASE, sortBy: 'password', sortDirection: 'desc' });
    expect(lastSelectAll().sql).toContain('ORDER BY occurences DESC');
  });

  it('does not let a column name carry SQL through', async () => {
    await repository.citedAssigneesPage({
      ...BASE, sortBy: 'occurences; DROP TABLE assignee_organizations--', sortDirection: 'desc',
    });
    const { sql } = lastSelectAll();
    expect(sql).toContain('ORDER BY occurences DESC');
    expect(sql).not.toMatch(/DROP/i);
  });

  it('only ever emits ASC or DESC for the direction', async () => {
    for (const given of ['asc', 'DESC', 'desc OR 1=1', '', undefined]) {
      q.selectAll.mockClear();
      await repository.partiesPage({ ...BASE, sortBy: 'occurences', sortDirection: given });
      const order = lastSelectAll().sql.match(/ORDER BY \w+ (\w+)/);
      expect(['ASC', 'DESC']).toContain(order[1]);
    }
  });
});

describe('LIMIT is bound, not interpolated', () => {
  it('binds offset and limit as parameters', async () => {
    await repository.partiesPage({ ...BASE, rowsPerPage: 25, currentPage: 2 });
    const { sql, repl } = lastSelectAll();
    expect(sql).toContain('LIMIT :offset, :limit');
    expect(repl).toMatchObject({ limit: 25, offset: 50 });
  });

  it('clamps an absurd page size rather than passing it on', async () => {
    await repository.partiesPage({ ...BASE, rowsPerPage: 100000, currentPage: 0 });
    expect(lastSelectAll().repl.limit).toBe(500);
  });

  it('treats a non-numeric page size as the default', async () => {
    await repository.partiesPage({ ...BASE, rowsPerPage: 'lots', currentPage: 0 });
    expect(lastSelectAll().repl.limit).toBe(50);
  });

  it('never produces a negative offset', async () => {
    await repository.partiesPage({ ...BASE, rowsPerPage: 10, currentPage: -5 });
    expect(lastSelectAll().repl.offset).toBe(0);
  });
});

describe('cited join', () => {
  it('collates both sides of the patent-number join', async () => {
    await repository.citedAssigneesPage({ ...BASE, sortBy: 'occurences', sortDirection: 'desc' });
    const { sql } = lastSelectAll();
    expect(sql).toContain('a.patent COLLATE utf8mb4_general_ci = cp.patent_number COLLATE utf8mb4_general_ci');
  });

  it('binds the company scope rather than splicing the id list in', async () => {
    await repository.citedAssigneesPage({ ...BASE, companyIds: [1, 2, 3] });
    const { sql, repl } = lastSelectAll();
    expect(sql).toContain('a.representative_id IN (:companyIds)');
    expect(repl.companyIds).toEqual([1, 2, 3]);
  });
});

/*
 * Three queries rewritten after the console showed them broken. Each guard pins
 * the property that was measured to matter, since a mocked repository would
 * hide all of it.
 */
describe('lenders / borrowers parties', () => {
  it('drives from the conveyance rows, not a 12M-row scan of the party table', async () => {
    await repository.partiesOnConveyances({ party: 'assignee', conveyanceTypes: ['security'] });
    const { sql, repl } = lastSelectAll();
    // Without this the optimiser starts at assignee (ALL, 12,092,535 rows) and
    // the query runs for 5-7 minutes; with it, 18 seconds for the same rows.
    expect(sql).toMatch(/^SELECT STRAIGHT_JOIN /);
    expect(sql).toMatch(/FROM representative_assignment_conveyance AS rac INNER JOIN assignee AS aa/);
    expect(repl).toEqual({ conveyanceTypes: ['security'] });
  });

  it('reads the assignor side when asked', async () => {
    await repository.partiesOnConveyances({ party: 'assignor', conveyanceTypes: ['release'] });
    expect(lastSelectAll().sql).toContain('INNER JOIN assignor AS aa');
  });

  it('never splices an unknown party table into the SQL', () => {
    expect(() => repository.partiesOnConveyances({ party: 'assignor; DROP TABLE x', conveyanceTypes: [] }))
      .toThrow(/Unknown party side/);
    expect(q.selectAll).not.toHaveBeenCalled();
  });

  it('carries no join to assignment or documentid - both measured to change nothing', async () => {
    await repository.partiesOnConveyances({ party: 'assignee', conveyanceTypes: ['security'] });
    const { sql } = lastSelectAll();
    expect(sql).not.toContain('JOIN assignment');
    expect(sql).not.toContain('documentid');
  });
});

describe('recent transactions', () => {
  it('returns the columns the grid reads, ranking by asset count', async () => {
    await repository.recentTransactions(100);
    const { sql, repl } = lastSelectAll();
    for (const col of ['AS assets', 'AS exec_dt', 'AS date_difference', 'convey_ty', 'AS assingor', 'AS assingee']) {
      expect(sql).toContain(col);
    }
    // The count runs once over documentid and only the top window reaches the
    // 11.6M-row assignment join; joining the full grouping took 190 seconds.
    expect(sql).toMatch(/GROUP BY d.rf_id ORDER BY counter DESC LIMIT :window/);
    expect(repl).toEqual({ limit: 100, window: 500 });
  });
});

describe("a customer's law firms", () => {
  it('scopes parties with a join, not an id list sent back in IN (...)', async () => {
    await repository.lawFirmsForCustomer({ companyIds: [859, 864], yearFloor: '2002-01-01' });
    const { sql, repl } = lastSelectAll();
    expect(sql).toContain('INNER JOIN assignor_and_assignee AS aa');
    expect(sql).toContain('aa.representative_id IN (:companyIds)');
    expect(sql).not.toContain(':partyIds');
    expect(sql).toContain('FROM correspondent AS cor');
    expect(repl).toEqual({ companyIds: [859, 864], yearFloor: '2002-01-01' });
  });
});

describe("a customer's lawyers", () => {
  it('groups the customer pairs first and scans lawyer once against them', async () => {
    await repository.lawyersForCustomer({ companyIds: [859] });
    const { sql, repl } = lastSelectAll();
    // lawyer has no index on law_firm_id or name and none can be added, so the
    // small side has to be built first; as one flat join this ran >10 minutes.
    expect(sql).toMatch(/^SELECT STRAIGHT_JOIN /);
    expect(sql).toMatch(/FROM \(SELECT a.law_firm_id, a.caddress_1, COUNT\(\*\) AS counter FROM list2 AS l2/);
    expect(sql).toContain('INNER JOIN lawyer AS l ON l.law_firm_id = p.law_firm_id AND l.name = p.caddress_1');
    expect(sql).toContain('aa.representative_id IN (:companyIds)');
    expect(sql).not.toContain(':partyIds');
    expect(repl).toEqual({ companyIds: [859] });
  });
});
