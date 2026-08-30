'use strict';

jest.mock('../../src/modules/customers/customers.repository');
jest.mock('../../src/modules/customers/customers.timeline', () => {
  const actual = jest.requireActual('../../src/modules/customers/customers.timeline');
  return {
    ...actual,
    collateralizedAssets: jest.fn(),
    lawfirmFilterFor: jest.fn(),
    run: jest.fn(),
  };
});

const timelineQ = require('../../src/modules/customers/customers.timeline');
const service = require('../../src/modules/customers/customers.service');
const actual = jest.requireActual('../../src/modules/customers/customers.timeline');

beforeEach(() => jest.clearAllMocks());

describe('timeline branch builders (SQL construction)', () => {
  it('generic layout 26 bank mode has the fixed dd.mode clause (legacy typo)', () => {
    const { sql } = actual.branchGenericLayout({
      companies: [9], layoutId: 26, bankMode: true, organisationId: 0,
    });
    expect(sql).toContain('AND dd.mode IN (:mode)');
    expect(sql).not.toContain('ANDdd.');
    expect(sql).toContain('assign1.reel_no AS release_reel_no');
  });

  it('layout 25 uses MIN(exec_dt), others MAX', () => {
    expect(actual.branchGenericLayout({ companies: [9], layoutId: 25, bankMode: false, organisationId: 0 }).sql)
      .toContain('MIN(aor.exec_dt)');
    expect(actual.branchGenericLayout({ companies: [9], layoutId: 30, bankMode: false, organisationId: 0 }).sql)
      .toContain('MAX(aor.exec_dt)');
  });

  it('default branch excludes activity 10 unless tab 10 requested or exclude=true', () => {
    const base = { companies: [], customers: [], rfIds: [], organisationId: 0 };
    expect(actual.branchDefault({ ...base, tabs: [], exclude: undefined }).sql).toContain('activity_id <> 10');
    expect(actual.branchDefault({ ...base, tabs: [10], exclude: undefined }).sql).not.toContain('activity_id <> 10');
    expect(actual.branchDefault({ ...base, tabs: [], exclude: 'true' }).sql).not.toContain('activity_id <> 10');
  });

  it('date window: explicit range binds start/end, else year floor', () => {
    const withRange = actual.branchDefault({ companies: [], tabs: [], customers: [], rfIds: [], organisationId: 0, start: '2020-01-01', end: '2021-01-01' });
    expect(withRange.sql).toContain('BETWEEN :start AND :end');
    expect(withRange.repl.start).toBe('2020-01-01');
    const noRange = actual.branchDefault({ companies: [], tabs: [], customers: [], rfIds: [], organisationId: 0 });
    expect(noRange.sql).toContain("date_format(aor.exec_dt, '%Y') > :year");
  });
});

describe('customers.service.timeline branch selection', () => {
  it('layout 34 with no collateralized assets returns empty without running', async () => {
    timelineQ.collateralizedAssets.mockResolvedValue([]);
    const res = await service.timeline({ layout: 'collaterlized', companies: [9], tabs: [], customers: [], rfIds: [], orgType: 1 });
    expect(res).toEqual({ list: [], groups: [] });
    expect(timelineQ.run).not.toHaveBeenCalled();
  });

  it('layout 40 resolves the firm filter from the first rf_id', async () => {
    timelineQ.lawfirmFilterFor.mockResolvedValue({ representative_id: 4, cname: 'X' });
    timelineQ.run.mockResolvedValue([]);
    await service.timeline({ layout: 'top_law_firms', companies: [9], tabs: [], customers: [], rfIds: [77], orgType: 1 });
    expect(timelineQ.lawfirmFilterFor).toHaveBeenCalledWith(77);
    const { sql } = timelineQ.run.mock.calls[0][0];
    expect(sql).toContain('rlf.representative_id = :representativeId');
  });

  it('logo layouts get the wrapper', async () => {
    timelineQ.run.mockResolvedValue([]);
    await service.timeline({ layout: 'deflated_collaterals', companies: [9], tabs: [], customers: [], rfIds: [], orgType: 1 });
    const { sql } = timelineQ.run.mock.calls[0][0];
    expect(sql).toContain('logo_optimize');
  });

  it('default layout goes through branchDefault with expanded tabs', async () => {
    timelineQ.run.mockResolvedValue([{ id: 1 }]);
    const res = await service.timeline({ layout: 'anything', companies: [], tabs: [17], customers: [], rfIds: [], orgType: 1 });
    const { sql, repl } = timelineQ.run.mock.calls[0][0];
    expect(repl.tabs).toEqual([17, 1, 6]);
    expect(sql).toContain('activity_parties_transactions.activity_id IN (:tabs)');
    expect(res.list).toHaveLength(1);
    expect(res.groups).toEqual([]);
  });
});
