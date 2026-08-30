'use strict';

jest.mock('../../src/modules/timelines/timelines.repository');
jest.mock('../../src/shared/assignment-data');

const repo = require('../../src/modules/timelines/timelines.repository');
const assignmentData = require('../../src/shared/assignment-data');
const service = require('../../src/modules/timelines/timelines.service');
const windows = require('../../src/modules/timelines/timelines.window');

const tenant = { id: 't' };

beforeEach(() => jest.clearAllMocks());

describe('timelines.window.candidates', () => {
  it('opens wide and then narrows before walking an edge', () => {
    const list = windows.candidates('2020-01-01', '2020-12-31', false);
    expect(list[0]).toEqual({ startDate: '2019-01-01', endDate: '2021-12-31' });
    expect(list[1]).toEqual({ startDate: '2019-07-01', endDate: '2021-06-30' });
    expect(list).toHaveLength(2 + 23);
  });

  it('holds the end fixed and walks the start back when scrolling right', () => {
    const list = windows.candidates('2020-01-01', '2020-12-31', true);
    const walking = list.slice(2);
    expect(walking.every((w) => w.endDate === '2022-06-30')).toBe(true);
    expect(walking[0].startDate).toBe('2019-12-01');
    expect(walking[1].startDate).toBe('2019-11-01');
  });

  it('holds the start fixed and walks the end back when scrolling left', () => {
    const list = windows.candidates('2020-01-01', '2020-12-31', false);
    const walking = list.slice(2);
    expect(walking.every((w) => w.startDate === '2020-07-01')).toBe(true);
    expect(walking[0].endDate).toBe('2020-11-30');
  });
});

describe('timelines.window.find', () => {
  const args = { from: '2020-01-01', to: '2020-12-31', scrollRight: false, limit: 100 };

  it('takes the widest window that fits', async () => {
    const count = jest.fn().mockResolvedValue(50);
    expect(await windows.find({ ...args, count })).toEqual({
      startDate: '2019-01-01', endDate: '2021-12-31',
    });
    expect(count).toHaveBeenCalledTimes(1);
  });

  it('narrows once when the widest window is too dense', async () => {
    const count = jest.fn().mockResolvedValueOnce(500).mockResolvedValueOnce(50);
    expect(await windows.find({ ...args, count })).toEqual({
      startDate: '2019-07-01', endDate: '2021-06-30',
    });
  });

  it('walks the edge when both opening windows are too dense', async () => {
    const count = jest.fn()
      .mockResolvedValueOnce(500)
      .mockResolvedValueOnce(400)
      .mockResolvedValueOnce(300)
      .mockResolvedValue(20);
    const chosen = await windows.find({ ...args, count });
    expect(chosen).toEqual({ startDate: '2020-07-01', endDate: '2020-10-31' });
  });

  it('stops immediately when the opening window is empty', async () => {
    const count = jest.fn().mockResolvedValue(0);
    expect(await windows.find({ ...args, count })).toBeNull();
    expect(count).toHaveBeenCalledTimes(1);
  });

  it('treats an empty step inside the walk as a gap, not an end', async () => {
    const count = jest.fn()
      .mockResolvedValueOnce(500)
      .mockResolvedValueOnce(400)
      .mockResolvedValueOnce(0)
      .mockResolvedValue(20);
    expect(await windows.find({ ...args, count })).not.toBeNull();
  });

  it('gives up rather than hanging when nothing ever fits', async () => {
    const count = jest.fn().mockResolvedValue(999999);
    expect(await windows.find({ ...args, count })).toBeNull();
    expect(count).toHaveBeenCalledTimes(25);
  });
});

describe('timelines.service.summarise', () => {
  it('counts each transaction once but keeps every party row', () => {
    const summary = service.summarise([
      { rf_id: 1, type: 'Assignor', exec_dt: '2020-01-01' },
      { rf_id: 1, type: 'Assignee', exec_dt: '2020-01-01' },
      { rf_id: 2, type: 'Assignee', exec_dt: '2020-06-01' },
    ]);
    expect(summary.items).toHaveLength(2);
    expect(summary.assignors).toHaveLength(1);
    expect(summary.assignees).toHaveLength(2);
    expect(new Date(summary.minDate).toISOString().slice(0, 10)).toBe('2020-01-01');
    expect(new Date(summary.maxDate).toISOString().slice(0, 10)).toBe('2020-06-01');
  });

  it('returns empty extents for no rows', () => {
    expect(service.summarise([])).toMatchObject({ items: [], minDate: '', maxDate: '' });
  });
});

describe('timelines.service.standalone', () => {
  it('maps a group to its conveyance types and colour', async () => {
    repo.groupPoints.mockResolvedValue([{ id: 1 }]);
    const res = await service.standalone({ orgId: 118, groupId: 2 });
    expect(repo.groupPoints).toHaveBeenCalledWith({
      orgId: 118, conveyTypes: ['security', 'release'], employerAssign: 0,
    });
    expect(res.className).toBe('yellow');
  });

  it('returns nothing for an unknown group instead of querying', async () => {
    expect(await service.standalone({ orgId: 118, groupId: 99 })).toEqual({ items: [], className: '' });
    expect(repo.groupPoints).not.toHaveBeenCalled();
  });
});

describe('timelines.service.byTab', () => {
  it('shortens names on the employee tab only', async () => {
    repo.tabPoints.mockResolvedValue([]);
    await service.byTab({ orgId: 118, tab: 8 });
    expect(repo.tabPoints).toHaveBeenCalledWith({ orgId: 118, tab: 8, truncateNames: true });

    await service.byTab({ orgId: 118, tab: 3 });
    expect(repo.tabPoints).toHaveBeenLastCalledWith({ orgId: 118, tab: 3, truncateNames: false });
  });
});

describe('timelines.service.drillDown', () => {
  beforeEach(() => {
    repo.tenantCompany.mockResolvedValue({ representative_id: 9 });
    repo.drillPoints.mockResolvedValue([]);
  });

  it('404s when the company is unknown to the tenant', async () => {
    repo.tenantCompany.mockResolvedValue(null);
    await expect(
      service.drillDown({ tenant, orgId: 118, organisation: 'Nope', name: 'x', depth: 0, groupId: 1 })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('filters by party name at depth 1', async () => {
    const res = await service.drillDown({
      tenant, orgId: 118, organisation: 'Acme', name: 'Beta Corp', depth: 1, groupId: 1,
    });
    expect(repo.drillPoints.mock.calls[0][0].predicate).toContain('aa.name = :name');
    expect(res.className).toBe('blue');
  });

  it('filters by transaction id at depth 2', async () => {
    await service.drillDown({
      tenant, orgId: 118, organisation: 'Acme', name: '500', depth: 2, groupId: 1,
    });
    expect(repo.drillPoints.mock.calls[0][0].predicate).toBe('t.rf_id = :name');
  });

  it('looks an asset up as a patent first, then as an application', async () => {
    repo.isGrantNumber.mockResolvedValue(true);
    await service.drillDown({
      tenant, orgId: 118, organisation: 'Acme', name: '999', depth: 3, groupId: 1,
    });
    expect(repo.drillPoints.mock.calls[0][0].predicate).toContain('grant_doc_num');

    repo.isGrantNumber.mockResolvedValue(false);
    await service.drillDown({
      tenant, orgId: 118, organisation: 'Acme', name: '111', depth: 3, groupId: 1,
    });
    expect(repo.drillPoints.mock.calls[1][0].predicate).toContain('appno_doc_num');
  });

  it('has no extra predicate for the whole company at depth 0', async () => {
    await service.drillDown({
      tenant, orgId: 118, organisation: 'Acme', name: 'Acme', depth: 0, groupId: 1,
    });
    expect(repo.drillPoints.mock.calls[0][0].predicate).toBe('1 = 1');
  });
});

describe('timelines.service.item', () => {
  it('skips the property list, which the timeline never draws', async () => {
    assignmentData.byRfId.mockResolvedValue({});
    await service.item('500');
    expect(assignmentData.byRfId).toHaveBeenCalledWith('500', false);
  });
});

describe('timelines.service filtered timelines', () => {
  it('returns the standalone shape', async () => {
    repo.countInWindow.mockResolvedValue(5);
    repo.standaloneWindow.mockResolvedValue([
      { rf_id: 1, type: 'Assignor', exec_dt: '2020-01-01' },
    ]);

    const res = await service.standaloneFiltered({
      orgId: 118, groupId: 1, from: '2020-01-01', to: '2020-12-31', scrollRight: false,
    });
    expect(res).toMatchObject({ className: 'blue' });
    expect(res.items).toHaveLength(1);
    expect(res.assignors).toHaveLength(1);
  });

  it('returns the search shape with its group labels', async () => {
    repo.countInWindow.mockResolvedValue(5);
    repo.searchWindow.mockResolvedValue([
      { rf_id: 1, type: 'Assignee', exec_dt: '2020-01-01' },
    ]);

    const res = await service.searchFiltered({
      orgId: 118, groupId: 0, from: '2020-01-01', to: '2020-12-31', scrollRight: true,
    });
    expect(res).toMatchObject({ type: 9, className: 'red' });
    expect(res.group).toEqual(['Employee', 'Acquisition', 'Security', 'Other']);
    expect(res.assignment_assignee).toHaveLength(1);
    expect(res.assignment_assignors).toHaveLength(0);
  });

  it('returns an empty result rather than querying when no window fits', async () => {
    repo.countInWindow.mockResolvedValue(0);
    const res = await service.standaloneFiltered({
      orgId: 118, groupId: 1, from: '2020-01-01', to: '2020-12-31', scrollRight: false,
    });
    expect(res.items).toEqual([]);
    expect(repo.standaloneWindow).not.toHaveBeenCalled();
  });
});
