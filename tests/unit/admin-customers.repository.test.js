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
  callProcedure: jest.fn().mockResolvedValue([]),
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

/*
 * Run Queries reports.
 *
 * Every one of these came back empty. The report tables are scratch space that
 * a stored procedure fills; the port read them but never called the procedure,
 * so a request saw whatever the previous run happened to leave behind - almost
 * always nothing.
 */
describe('run_query reports', () => {
  beforeEach(() => {
    q.selectAll.mockClear();
    q.selectAll.mockResolvedValue([]);
    q.callProcedure.mockClear();
    q.callProcedure.mockResolvedValue([]);
  });

  const callFor = () => {
    const call = q.callProcedure.mock.calls[0];
    return call ? { db: call[0], sql: flat(call[1]), repl: call[2] } : null;
  };

  it('fills the table before reading it', async () => {
    await repository.runReport({
      queryNo: 1, representativeName: 'Acme', companyId: 9, organisationId: 68,
    });
    const call = callFor();
    expect(call).not.toBeNull();
    expect(call.db).toBe(connections.resources);
    expect(call.sql).toBe('CALL routine_list1(:representativeName, :companyId, :organisationId)');
    // A CALL returns a multi-result set, so it cannot go through the SELECT
    // helper — that formatter throws 'results.map is not a function'.
    expect(q.callProcedure).toHaveBeenCalledTimes(1);
  });

  it('drops the name for the two procedures that take only the company', async () => {
    for (const [queryNo, procedure] of [[6, 'routine_broken_title'], [8, 'routine_correct_chain']]) {
      q.callProcedure.mockClear();
      await repository.runReport({
        queryNo, representativeName: 'Acme', companyId: 9, organisationId: 68,
      });
      expect(callFor().sql).toBe(`CALL ${procedure}(:companyId, :organisationId)`);
    }
  });

  it('never interpolates a procedure name from the request', async () => {
    await repository.runReport({
      queryNo: 2, representativeName: 'DROP TABLE x', companyId: 9, organisationId: 68,
    });
    const call = callFor();
    expect(call.sql).toBe('CALL routine_list2(:representativeName, :companyId, :organisationId)');
    expect(call.repl.representativeName).toBe('DROP TABLE x');
  });

  // Correct Chain reads db_new_application.assets at layout 99, which is what
  // routine_correct_chain declares and writes. The legacy handler read
  // db_uspto.table_c here: its `query_no === 8 ? 99` branch sat inside a
  // condition that excluded 8, so it never ran.
  it('reads report 8 from the assets table at layout 99', async () => {
    await repository.runReport({
      queryNo: 8, representativeName: 'Acme', companyId: 9, organisationId: 68,
    });
    const read = flat(q.selectAll.mock.calls[0][1]);
    expect(read).toContain('FROM db_new_application.assets');
    expect(read).toContain('layout_id = :layoutId');
    expect(q.selectAll.mock.calls.at(-1)[2].layoutId).toBe(99);
  });

  it('returns nothing for a report number with no mapping', async () => {
    await expect(repository.runReport({ queryNo: 42, companyId: 9, organisationId: 68 }))
      .resolves.toEqual([]);
    expect(q.selectAll).not.toHaveBeenCalled();
    expect(q.callProcedure).not.toHaveBeenCalled();
  });
});


/*
 * The customer Entities / Inventors lists. The legacy queries carried the
 * customer's transactions and application numbers back in as IN (...) lists of
 * 14,000-17,000 values; these read them through joins.
 */
describe('customer party lists', () => {
  beforeEach(() => { q.selectAll.mockClear(); q.selectAll.mockResolvedValue([]); });
  const scope = { companyIds: [859], yearFloor: '2002-01-01' };

  it('entities: assignors and assignees on the application two-hop, no id lists', async () => {
    await repository.entitiesForCustomer(scope);
    const [db, sql, repl] = q.selectAll.mock.calls[0];
    expect(db).toBe(connections.resources);
    const s = flat(sql);
    expect(s).toContain('INNER JOIN documentid AS d2 ON d2.appno_doc_num = d1.appno_doc_num');
    expect(s).toContain('rac.employer_assign = 0');
    expect(s).toContain('inv.assignor_and_assignee_id IS NULL');
    expect(s).not.toMatch(/IN \(SELECT/);
    expect(repl).toEqual(scope);
  });

  it('inventors: employee assignments only on the assignor side', async () => {
    await repository.inventorAssignorsForCustomer(scope);
    const s = flat(q.selectAll.mock.calls[0][1]);
    expect(s).toContain('rac.employer_assign = 1');
    expect(s).toContain('a.exec_dt >= :yearFloor');
    expect(s).not.toMatch(/IN \(SELECT/);
  });

  it('inventors: both bibliographic databases, joined on the application set', async () => {
    await repository.bibliographicInventorsForCustomer(scope);
    const s = flat(q.selectAll.mock.calls[0][1]);
    expect(s).toContain('db_patent_application_bibliographic.inventor AS appInv');
    expect(s).toContain('db_patent_grant_bibliographic.inventor_new AS appInv');
    expect(s).toContain('ON appInv.appno_doc_num = assets.appno_doc_num');
    expect(s).not.toContain(':allAssets');
  });
});
