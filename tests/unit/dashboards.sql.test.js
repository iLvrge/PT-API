'use strict';

const sql = require('../../src/modules/dashboards/dashboards.sql');

const base = {
  type: 1,
  dataFormat: 0,
  bank: false,
  bankMode: false,
  companies: [9],
  parties: [],
  transactions: [],
  ownedAssets: [],
  year: 2002,
};

// Every :name the builder emits must have a matching replacement, or Sequelize
// throws at execution time. This is the check the legacy route never had.
const boundNames = (statement) => {
  const found = new Set();
  const re = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let m = re.exec(statement);
  while (m) {
    found.add(m[1]);
    m = re.exec(statement);
  }
  return found;
};

const expectFullyBound = (built) => {
  const missing = [...boundNames(built.sql)].filter(
    (name) => !Object.prototype.hasOwnProperty.call(built.replacements, name)
  );
  expect(missing).toEqual([]);
};

describe('buildMetricQuery', () => {
  const METRIC_TYPES = [1, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 30, 31, 32, 33, 34, 35, 39, 40, 41];

  it.each(METRIC_TYPES)('binds every parameter it references (type %i)', (type) => {
    const built = sql.buildMetricQuery({ ...base, type });
    expect(built).not.toBeNull();
    expectFullyBound(built);
  });

  it.each([1, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26])(
    'binds every parameter in bank mode (type %i)',
    (type) => {
      const built = sql.buildMetricQuery({
        ...base, type, bank: true, bankMode: true, parties: [3], transactions: [77],
      });
      expect(built).not.toBeNull();
      expectFullyBound(built);
    }
  );

  it.each([1, 17, 18, 19, 20, 22, 23, 24, 25])(
    'binds every parameter for the cumulative series (type %i)',
    (type) => {
      const built = sql.buildMetricQuery({ ...base, type, dataFormat: 1 });
      expect(built).not.toBeNull();
      expectFullyBound(built);
    }
  );

  it('returns a list rather than a single row for the leaderboard metrics', () => {
    [38, 39, 40, 41].forEach((type) => {
      const built = sql.buildMetricQuery({ ...base, type, ownedAssets: ['123'] });
      expect(built.plain).toBe(false);
    });
    expect(sql.buildMetricQuery({ ...base, type: 30 }).plain).toBe(true);
  });

  it('treats the cumulative series as a list too', () => {
    expect(sql.buildMetricQuery({ ...base, type: 1, dataFormat: 1 }).plain).toBe(false);
  });

  it('reads client transactions from the borrowers table for type 27', () => {
    const t21 = sql.buildMetricQuery({ ...base, type: 21, bank: true, companies: [9] });
    const t27 = sql.buildMetricQuery({ ...base, type: 27, bank: true, companies: [9] });
    expect(t21.sql).toContain('FROM activity_parties_transactions AS apt');
    expect(t27.sql).toContain('FROM borrowers_activity_parties_transactions AS apt');
    expect(t21.plain).toBe(false);
    expect(t27.plain).toBe(false);
  });

  it('omits the transaction filter when no rf_ids were supplied', () => {
    const withRf = sql.buildMetricQuery({ ...base, bank: true, transactions: [5] });
    const withoutRf = sql.buildMetricQuery({ ...base, bank: true, transactions: [] });
    expect(withRf.sql).toContain(':transactions');
    expect(withoutRf.sql).not.toContain(':transactions');
    expect(withoutRf.replacements).not.toHaveProperty('transactions');
  });

  it('returns null for type 37 — PTAB is an outbound lookup, not a query', () => {
    expect(sql.buildMetricQuery({ ...base, type: 37 })).toBeNull();
  });

  it('returns null for type 38 until the owned assets are known', () => {
    expect(sql.buildMetricQuery({ ...base, type: 38, ownedAssets: [] })).toBeNull();
    expect(sql.buildMetricQuery({ ...base, type: 38, ownedAssets: ['123'] })).not.toBeNull();
  });

  it('caps proliferate inventors at 50 but not top lenders', () => {
    expect(sql.buildMetricQuery({ ...base, type: 39 }).sql).toContain('LIMIT 50');
    expect(sql.buildMetricQuery({ ...base, type: 41 }).sql).not.toContain('LIMIT 50');
  });

  it('only filters on mode for bank organisations', () => {
    expect(sql.buildMetricQuery({ ...base, type: 30, bankMode: true }).sql).toContain(':mode');
    expect(sql.buildMetricQuery({ ...base, type: 30, bankMode: false }).sql).not.toContain(':mode');
  });

  describe('collation', () => {
    it('coerces the db_uspto side when comparing to dashboard_items.application', () => {
      const built = sql.buildMetricQuery({ ...base, type: 17, bank: true, transactions: [5] });
      expect(built.sql).toContain(sql.DOC_APPNO_AS_DASHBOARD);
      // The dashboard_items column itself stays bare so its index is usable.
      expect(built.sql).not.toMatch(/CONVERT\(application USING/);
    });

    it('collates dashboard_items.patent to match assets, never the other way', () => {
      const built = sql.buildMetricQuery({ ...base, type: 18, dataFormat: 1 });
      expect(built.sql).toContain('dt.application COLLATE utf8mb4_0900_ai_ci');
      expect(built.sql).not.toContain('assets.appno_doc_num COLLATE');
    });

    it('leaves the type 22 grant join uncoerced — both sides are utf8mb4_general_ci', () => {
      const built = sql.buildMetricQuery({ ...base, type: 22, dataFormat: 1 });
      expect(built.sql).toContain('assets.grant_doc_num = dt.patent');
      expect(built.sql).not.toContain('dt.patent COLLATE');
    });
  });
});

describe('buildTempQuery', () => {
  const tempBase = {
    type: 1,
    bank: false,
    companies: [9],
    parties: [],
    assets: [],
    list: ['12345678'],
    total: 1,
    year: 2002,
  };

  it.each([1, 17, 18, 23, 24, 25])('binds every parameter (type %i)', (type) => {
    const built = sql.buildTempQuery({ ...tempBase, type });
    expect(built).not.toBeNull();
    expectFullyBound(built);
  });

  it.each([1, 17, 18, 20, 23])('binds every parameter in bank mode (type %i)', (type) => {
    const built = sql.buildTempQuery({ ...tempBase, type, bank: true, parties: [3] });
    expect(built).not.toBeNull();
    expectFullyBound(built);
  });

  it.each([24, 25])('binds every parameter in bank mode with assets (type %i)', (type) => {
    const built = sql.buildTempQuery({
      ...tempBase, type, bank: true, parties: [3], assets: ['12345678'],
    });
    expect(built).not.toBeNull();
    expectFullyBound(built);
  });

  it('returns null outside bank mode when no assets were found', () => {
    expect(sql.buildTempQuery({ ...tempBase, list: [] })).toBeNull();
  });

  it('returns null for bank types that have no aggregate', () => {
    [21, 22, 26, 27].forEach((type) => {
      expect(sql.buildTempQuery({ ...tempBase, type, bank: true })).toBeNull();
    });
  });

  it('returns null for bank types 24 and 25 without an asset list', () => {
    expect(sql.buildTempQuery({ ...tempBase, type: 24, bank: true, assets: [] })).toBeNull();
    expect(sql.buildTempQuery({ ...tempBase, type: 25, bank: true, assets: [] })).toBeNull();
  });

  it('binds the running total instead of splicing it into the SQL', () => {
    const built = sql.buildTempQuery({ ...tempBase, type: 1, total: 4321 });
    expect(built.sql).toContain(':total AS total');
    expect(built.sql).not.toContain('4321');
    expect(built.replacements.total).toBe(4321);
  });

  it('narrows the utf32 assets_with_bank key when joining latin1 db_uspto tables', () => {
    const built = sql.buildTempQuery({ ...tempBase, type: 23, bank: true });
    expect(built.sql).toContain('CONVERT(tawb.appno_doc_num USING latin1)');
    // event_maintainence_fees.appno_doc_num is the indexed latin1 side.
    expect(built.sql).toContain('emf.appno_doc_num = CONVERT');
  });

  it('uses layout 1 only for type 1', () => {
    expect(sql.buildTempQuery({ ...tempBase, type: 1 }).replacements.layoutId).toBe(1);
    expect(sql.buildTempQuery({ ...tempBase, type: 18 }).replacements.layoutId).toBe(15);
  });
});

describe('buildOwnedAssetsQuery', () => {
  const owned = {
    type: 18, companies: [9], tabs: [], customers: [], assignments: [], year: 2002,
  };

  it('narrows the utf8mb4 assets key so the db_uspto index survives', () => {
    const built = sql.buildOwnedAssetsQuery(owned);
    expect(built.sql).toContain('CONVERT(assets.appno_doc_num USING latin1)');
    expect(built.sql).toContain('CONVERT(documentid.appno_doc_num USING latin1)');
  });

  it('adds each supplied filter and binds it', () => {
    const built = sql.buildOwnedAssetsQuery({
      ...owned, tabs: [5], customers: [7], assignments: [11],
    });
    expect(built.sql).toContain('activity_parties_transactions.activity_id IN (:tabs)');
    expect(built.sql).toContain('activity_parties_transactions.assignor_and_assignee_id IN (:customers)');
    expect(built.sql).toContain('activity_parties_transactions.rf_id IN (:assignments)');
    expect(built.replacements).toMatchObject({ tabs: [5], customers: [7], assignments: [11] });
  });

  it('still excludes employee-only assets when no filters are supplied', () => {
    // tabs === [] is the legacy "exclude employees" branch, not "no filter".
    expect(sql.buildOwnedAssetsQuery(owned).sql).toContain('activity_parties_transactions');
  });
});

describe('buildBankAssetsQuery', () => {
  it('collects the asset numbers for types 24 and 25', () => {
    [24, 25].forEach((type) => {
      const built = sql.buildBankAssetsQuery({ type, companies: [9], parties: [] });
      expect(built.wantsList).toBe(true);
      expect(built.sql).toContain('SELECT appno_doc_num');
      expect(built.sql).toContain('GROUP BY appno_doc_num');
    });
  });

  it('only counts for every other type', () => {
    const built = sql.buildBankAssetsQuery({ type: 1, companies: [9], parties: [3] });
    expect(built.wantsList).toBe(false);
    expect(built.sql).toContain('COUNT(*) AS total');
    expect(built.replacements.parties).toEqual([3]);
  });
});
