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
