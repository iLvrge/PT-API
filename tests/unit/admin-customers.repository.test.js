'use strict';

// Repository-level SQL guards for admin-customers.
//
// admin_account_process (the per-customer feature switches behind
// GET/PUT /admin/customers/:id/buttons) was ported onto the wrong connection
// and the wrong key column: the table lives in db_uspto, not db_business, and
// its primary key is process_id, not id. The route answered 500 with
// "Table 'db_business.admin_account_process' doesn't exist" for every customer.
// Mocking the repository cannot catch that, so the SQL and the connection it is
// handed are asserted directly.

jest.mock('../../src/db', () => {
  // define() has to hand back something model-shaped: the repository calls
  // .create() and .update() on the models it defines at require time. Memoized
  // by table name, so a later `connections.X.define('name')` in a test — with
  // no second argument — retrieves the exact same mock the repository already
  // holds a reference to, rather than a fresh, disconnected one.
  const model = () => ({
    create: jest.fn(async (attrs) => ({ ...attrs, toJSON: () => attrs })),
    update: jest.fn(async () => [1]),
    destroy: jest.fn(async () => 1),
    findOne: jest.fn(async () => null),
    findAll: jest.fn(async () => []),
    bulkCreate: jest.fn(async () => []),
  });
  const conn = (name) => {
    const models = new Map();
    return {
      name,
      define: jest.fn((tableName) => {
        if (!models.has(tableName)) models.set(tableName, model());
        return models.get(tableName);
      }),
      query: jest.fn(async () => [[], 0]),
    };
  };
  return {
    connections: {
      business: conn('business'),
      resources: conn('resources'),
      applicationNew: conn('applicationNew'),
      application: conn('application'),
    },
    Sequelize: require('sequelize').Sequelize,
  };
});
jest.mock('../../src/db/query', () => ({
  selectAll: jest.fn().mockResolvedValue([]),
  selectOne: jest.fn().mockResolvedValue(null),
  selectValue: jest.fn().mockResolvedValue(null),
  exists: jest.fn().mockResolvedValue(false),
  identifier: (v) => v,
  direction: () => 'ASC',
}));

const { connections } = require('../../src/db');
const q = require('../../src/db/query');
const repository = require('../../src/modules/admin-customers/admin-customers.repository');

const flat = (sql) => sql.replace(/\s+/g, ' ');

describe('account process switches', () => {
  it('reads the switch list from db_uspto, not db_business', async () => {
    await repository.listAccountProcesses(95);
    const [db, sql, repl] = q.selectAll.mock.calls[0];
    expect(db).toBe(connections.resources);
    expect(flat(sql)).toContain('FROM admin_account_process');
    expect(repl).toEqual({ organisationId: 95 });
  });

  it('selects process_id — the table has no `id` column', async () => {
    await repository.listAccountProcesses(95);
    const sql = flat(q.selectAll.mock.calls[0][1]);
    expect(sql).toContain('SELECT process_id');
    expect(sql).not.toMatch(/SELECT\s+id\b/);
  });

  it('looks a single switch up on the same connection', async () => {
    await repository.findAccountProcess(95, 2);
    const [db, sql, repl] = q.selectOne.mock.calls[0];
    expect(db).toBe(connections.resources);
    expect(flat(sql)).toContain('process_id');
    expect(repl).toEqual({ organisationId: 95, buttonId: 2 });
  });
});

describe('customer report reads', () => {
  it('reads the summary roll-up row (company_id = 0) from db_uspto', async () => {
    await repository.summaryForOrganisation(146);
    const [db, sql, repl] = q.selectOne.mock.calls[0];
    expect(db).toBe(connections.resources);
    const s = flat(sql);
    expect(s).toContain('FROM summary');
    expect(s).toContain('company_id = 0');
    expect(repl).toEqual({ organisationId: 146 });
  });

  it('exposes the aliases the admin dashboard reads', async () => {
    await repository.summaryForOrganisation(146);
    const s = flat(q.selectOne.mock.calls[0][1]);
    for (const alias of ['no_of_entities', 'no_of_parties', 'no_of_transactions', 'product', 'documents']) {
      expect(s).toContain(`AS ${alias}`);
    }
  });

  it('checks the share link against db_business', async () => {
    await repository.hasShareLink(146);
    const [db, sql, repl] = q.exists.mock.calls[0];
    expect(db).toBe(connections.business);
    expect(flat(sql)).toContain('FROM share_link');
    expect(repl).toEqual({ organisationId: 146 });
  });
});

describe('missing-inventor process', () => {
  // UNIQUE(organisation_id, representative_id): a plain INSERT works once per
  // company and 409s forever after, so a finished row has to be reused.
  it('reads the process row from db_uspto, not db_new_application', async () => {
    await repository.findInventorProcess({ organisationId: 68, representativeId: 55 });
    const [db, sql] = q.selectOne.mock.calls[0];
    expect(db).toBe(connections.resources);
    expect(flat(sql)).toContain('FROM missing_inventor_process');
  });

  it('selects process_id — the table has no `id` column', async () => {
    await repository.findInventorProcess({ organisationId: 68, representativeId: 55 });
    const sql = flat(q.selectOne.mock.calls[0][1]);
    expect(sql).toContain('SELECT process_id');
    expect(sql).not.toMatch(/SELECT\s+id\b/);
  });

  it('restarts an existing row instead of inserting a duplicate', async () => {
    q.selectOne.mockResolvedValueOnce({ process_id: 26 });
    const result = await repository.createInventorProcess({
      organisationId: 68, representativeId: 55,
    });
    expect(result).toEqual({ process_id: 26, restarted: true });
  });

  it('looks for any existing row, not only a running one', async () => {
    q.selectOne.mockResolvedValueOnce(null);
    await repository.createInventorProcess({ organisationId: 68, representativeId: 55 });
    // the lookup used to create the row must not filter on status
    const sql = flat(q.selectOne.mock.calls[0][1]);
    expect(sql).not.toContain('status =');
  });
});

describe('concurrent inventor-process creation', () => {
  // Two requests for the same company arriving together can both pass the
  // "does a row already exist" check before either INSERT lands. The second
  // then hits the UNIQUE(organisation_id, representative_id) constraint —
  // that's a race, not a real error, and should resolve to the same restart
  // outcome rather than surfacing as a 409.
  it('treats a UNIQUE-constraint hit on create as a concurrent restart', async () => {
    q.selectOne
      .mockResolvedValueOnce(null) // first check: nothing exists yet
      .mockResolvedValueOnce({ process_id: 26 }); // re-check after the race: the other request's row

    const err = new Error('duplicate');
    err.name = 'SequelizeUniqueConstraintError';
    connections.resources.define('missing_inventor_process').create.mockRejectedValueOnce(err);

    const result = await repository.createInventorProcess({
      organisationId: 68, representativeId: 55,
    });
    expect(result).toEqual({ process_id: 26, restarted: true });
  });

  it('still throws when create fails for an unrelated reason', async () => {
    q.selectOne.mockResolvedValueOnce(null);
    const err = new Error('connection lost');
    err.name = 'SequelizeConnectionError';
    connections.resources.define('missing_inventor_process').create.mockRejectedValueOnce(err);

    await expect(
      repository.createInventorProcess({ organisationId: 68, representativeId: 55 })
    ).rejects.toThrow('connection lost');
  });
});
