'use strict';

jest.mock('../../src/modules/events/events.repository');

const repo = require('../../src/modules/events/events.repository');
const service = require('../../src/modules/events/events.service');
const series = require('../../src/modules/events/events.lifespan');
const icons = require('../../src/modules/events/events.icons');
const { windowOf } = require('../../src/modules/events/events.constants');

beforeEach(() => jest.clearAllMocks());

describe('events.constants.windowOf', () => {
  it('maps each code to its maintenance window regardless of entity size', () => {
    expect(['M1551', 'M2551', 'M3551'].map(windowOf)).toEqual([1, 1, 1]);
    expect(['M1552', 'M2552', 'M3552'].map(windowOf)).toEqual([2, 2, 2]);
    expect(['M1553', 'M2553', 'M3553'].map(windowOf)).toEqual([3, 3, 3]);
  });

  it('returns null for anything else', () => {
    expect(windowOf('EXP.')).toBeNull();
    expect(windowOf(undefined)).toBeNull();
  });
});

describe('events.lifespan.lifeSpan', () => {
  it('counts an asset across the twenty years of its term', () => {
    const rows = series.lifeSpan([{ application: '111', appno_date: '2000-06-01' }]);
    expect(rows[0]).toEqual({ year: 2000, count: 1 });
    expect(rows[rows.length - 1]).toEqual({ year: 2020, count: 1 });
    expect(rows).toHaveLength(21);
  });

  it('overlaps two assets filed in different years', () => {
    const rows = series.lifeSpan([
      { application: '111', appno_date: '2000-01-01' },
      { application: '222', appno_date: '2010-01-01' },
    ]);
    const at = (year) => rows.find((r) => r.year === year).count;
    expect(at(2005)).toBe(1);
    expect(at(2015)).toBe(2);
    expect(at(2025)).toBe(1);
  });

  it('counts an application once even when the selection repeats it', () => {
    const rows = series.lifeSpan([
      { application: '111', appno_date: '2000-01-01' },
      { application: '111', appno_date: '2000-01-01' },
    ]);
    expect(rows[0].count).toBe(1);
  });

  it('skips a row with no usable filing date', () => {
    expect(series.lifeSpan([{ application: '111', appno_date: null }])).toEqual([]);
    expect(series.lifeSpan([{ application: null, appno_date: '2000-01-01' }])).toEqual([]);
  });

  it('returns nothing for no assets', () => {
    expect(series.lifeSpan([])).toEqual([]);
  });
});

describe('events.lifespan.yearlySeries', () => {
  it('opens with the charting header row', () => {
    const table = series.yearlySeries([]);
    expect(table).toHaveLength(1);
    expect(table[0][0]).toBe('year');
  });

  it('fills the gap years between the first and last with zero', () => {
    const table = series.yearlySeries([
      { year: '2010', count: 3 },
      { year: '2013', count: 5 },
    ]);
    // header + 2010..2013
    expect(table).toHaveLength(5);
    expect(table[1].slice(0, 2)).toEqual([2010, 3]);
    expect(table[2].slice(0, 2)).toEqual([2011, 0]);
    expect(table[4].slice(0, 2)).toEqual([2013, 5]);
  });

  it('sums two rows for the same year', () => {
    const table = series.yearlySeries([{ year: 2010, count: 2 }, { year: 2010, count: 3 }]);
    expect(table[1][1]).toBe(5);
  });
});

describe('events.service.maintenanceAbandonment', () => {
  it('returns just the header when no company was selected', async () => {
    const table = await service.maintenanceAbandonment({ type: 'acquired', companies: [] });
    expect(table).toHaveLength(1);
    expect(repo.metricApplications).not.toHaveBeenCalled();
  });

  it('counts assets with no grant number as still pending', async () => {
    repo.metricApplications.mockResolvedValue([
      { application: '111', patent: '9446259' },
      { application: '222', patent: '' },
    ]);
    repo.maintenanceEvents.mockResolvedValue([]);

    const table = await service.maintenanceAbandonment({ type: 'acquired', companies: [9] });
    expect(table[1].slice(0, 2)).toEqual(['Application', 1]);
    // The pending one is excluded from the maintenance lookup.
    expect(repo.maintenanceEvents).toHaveBeenCalledWith({
      applications: ['111', '222'], exclude: ['222'],
    });
  });

  it('places each asset in the window it stopped paying at', async () => {
    repo.metricApplications.mockResolvedValue([
      { application: 'a', patent: '1' },
      { application: 'b', patent: '2' },
      { application: 'c', patent: '3' },
      { application: 'd', patent: '4' },
    ]);
    repo.maintenanceEvents.mockResolvedValue([
      // a paid the first window only.
      { appno_doc_num: 'a', event_code: 'M1551' },
      // b paid the first two.
      { appno_doc_num: 'b', event_code: 'M1551' },
      { appno_doc_num: 'b', event_code: 'M2552' },
      // c paid all three.
      { appno_doc_num: 'c', event_code: 'M1551' },
      { appno_doc_num: 'c', event_code: 'M2552' },
      { appno_doc_num: 'c', event_code: 'M3553' },
      // d has no maintenance record at all.
    ]);

    const table = await service.maintenanceAbandonment({ type: 'acquired', companies: [9] });
    const row = (label) => table.find((r) => r[0] === label);

    expect(row('Not yet due')[1]).toBe(1);          // d
    expect(row('Lapsed at 7.5 years')[1]).toBe(1);  // a
    expect(row('Lapsed at 11.5 years')[1]).toBe(1); // b
    expect(row('Maintained')[1]).toBe(1);           // c
  });

  it('returns just the header when the metric is empty', async () => {
    repo.metricApplications.mockResolvedValue([]);
    const table = await service.maintenanceAbandonment({ type: 'acquired', companies: [9] });
    expect(table).toHaveLength(1);
  });
});

describe('events.service.yearlyAbandonment', () => {
  it('charts the abandonments', async () => {
    repo.metricApplications.mockResolvedValue([{ application: '111' }]);
    repo.abandonedByYear.mockResolvedValue([{ year: '2015', count: 2 }]);

    const table = await service.yearlyAbandonment({ type: 'acquired', companies: [9] });
    expect(table[1].slice(0, 2)).toEqual([2015, 2]);
  });

  it('returns just the header with no companies', async () => {
    const table = await service.yearlyAbandonment({ type: 'acquired', companies: [] });
    expect(table).toHaveLength(1);
  });
});

describe('events.service.eventsForAsset', () => {
  it('resolves a number the maintenance table does not key on', async () => {
    repo.eventsForApplication
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ event_code: 'M1551', eventdate: '2020-01-01', icon1: 1 }]);
    repo.resolveApplication.mockResolvedValue({ appno_doc_num: '13456789' });

    const result = await service.eventsForAsset({ applicationNumber: '9446259' });
    expect(repo.resolveApplication).toHaveBeenCalled();
    expect(result.events).toHaveLength(1);
  });

  it('reports expiry and its date', async () => {
    repo.eventsForApplication.mockResolvedValue([
      { event_code: 'M1551', eventdate: '2018-01-01' },
      { event_code: 'EXP.', eventdate: '2022-06-01' },
    ]);
    const result = await service.eventsForAsset({ applicationNumber: '13456789' });
    expect(result.expired).toBe(true);
    expect(result.expired_date).toBe('2022-06-01');
  });

  it('is not expired when no expiry event is present', async () => {
    repo.eventsForApplication.mockResolvedValue([{ event_code: 'M1551', eventdate: '2018-01-01' }]);
    const result = await service.eventsForAsset({ applicationNumber: '13456789' });
    expect(result.expired).toBe(false);
  });

  it('attaches the icon set for each event code', async () => {
    repo.eventsForApplication.mockResolvedValue([
      { event_code: 'M1551', eventdate: '2018-01-01', icon1: 1, icon2: 2 },
    ]);
    const result = await service.eventsForAsset({ applicationNumber: '13456789' });
    expect(result.icons['M1551'].icon1).toMatch(/^<svg/);
    expect(result.icons['M1551'].icon2).toMatch(/^<svg/);
    expect(result.icons['M1551'].icon3).toBeUndefined();
  });

  it('400s without an application number', async () => {
    await expect(service.eventsForAsset({})).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('events.service.assetStatus', () => {
  it('prefers the grant index for the filing date once a patent issued', async () => {
    repo.publicationDates.mockResolvedValue({ filling_date: '2013-01-01', pgpub_date: '2014-06-01' });
    repo.grantDates.mockResolvedValue({
      filling_date: '2013-01-02', grant_doc_num: '9446259', grant_date: '2016-09-20',
    });
    repo.statusHistory.mockResolvedValue([]);

    const result = await service.assetStatus('13456789');
    expect(result.filling_date).toBe('2013-01-02');
    expect(result.grant_doc_num).toBe('9446259');
    // No need for the assignment-corpus fallback once the grant index answered.
    expect(repo.documentDates).not.toHaveBeenCalled();
  });

  it('falls back to the assignment corpus when neither index has it', async () => {
    repo.publicationDates.mockResolvedValue(null);
    repo.grantDates.mockResolvedValue(null);
    repo.documentDates.mockResolvedValue({ filling_date: '2013-01-03', grant_date: '2016-01-01' });
    repo.statusHistory.mockResolvedValue([]);

    const result = await service.assetStatus('13456789');
    expect(result.filling_date).toBe('2013-01-03');
  });
});

describe('events.service.assetsByCategory', () => {
  it('rejects a category that is not implemented', async () => {
    await expect(
      service.assetsByCategory({ categoryType: 'nonsense', companies: [9], customers: [] })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('returns nothing without a company', async () => {
    const result = await service.assetsByCategory({
      categoryType: 'to_record', companies: [], customers: [],
    });
    expect(result.list).toEqual([]);
  });

  it('attaches the unrecorded icon to the result', async () => {
    repo.assetsToRecord.mockResolvedValue([{ application: '111' }]);
    const result = await service.assetsByCategory({
      categoryType: 'to_record', companies: [9], customers: [],
    });
    expect(result.list).toHaveLength(1);
    expect(result.icons['13'].icon1).toMatch(/^<svg/);
  });
});

describe('events.icons', () => {
  it('holds all 25 maintenance icons', () => {
    icons.reset();
    expect(Object.keys(icons.all())).toHaveLength(25);
  });

  it('reads them from disk only once', () => {
    icons.reset();
    expect(icons.all()).toBe(icons.all());
  });

  it('returns null for a code with no icon', () => {
    expect(icons.byId(999)).toBeNull();
    expect(icons.byId(null)).toBeNull();
  });

  it('omits the slots a maintenance code does not fill', () => {
    expect(icons.forCode({ icon1: 1, icon2: null, icon3: undefined })).toEqual({
      icon1: expect.stringMatching(/^<svg/),
    });
  });
});
