'use strict';

jest.mock('../../src/modules/assets/assets.repository');
jest.mock('../../src/utils/background-job');

const repo = require('../../src/modules/assets/assets.repository');
const backgroundJob = require('../../src/utils/background-job');
const service = require('../../src/modules/assets/assets.service');
const cpcSql = require('../../src/modules/assets/assets.cpc.sql');
const { cpcRangeExpression, normaliseAssetNumber } = require('../../src/modules/assets/assets.constants');

beforeEach(() => jest.clearAllMocks());

describe('assets.constants', () => {
  it('maps each CPC range to its grouping expression', () => {
    expect(cpcRangeExpression(5)).toBe('section');
    expect(cpcRangeExpression(4)).toBe('CONCAT(section, class)');
    expect(cpcRangeExpression(1)).toContain('sub_group');
  });

  it('falls back to sub-class for an unknown or missing range', () => {
    expect(cpcRangeExpression(undefined)).toBe('CONCAT(section, class, sub_class)');
    expect(cpcRangeExpression(99)).toBe('CONCAT(section, class, sub_class)');
    // Never interpolates caller input into the SQL.
    expect(cpcRangeExpression("1; DROP TABLE x")).toBe('CONCAT(section, class, sub_class)');
  });

  it('strips the decoration people paste around asset numbers', () => {
    expect(normaliseAssetNumber('US9,446,259 B2')).toBe('9446259');
    expect(normaliseAssetNumber('13/456,789')).toBe('13456789');
    expect(normaliseAssetNumber('9446259')).toBe('9446259');
  });
});

describe('assets.cpc.sql', () => {
  const boundNames = (statement) => {
    const found = new Set();
    const re = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;
    let m = re.exec(statement);
    while (m) { found.add(m[1]); m = re.exec(statement); }
    return found;
  };

  it('binds only list, scopeList and date', () => {
    [
      cpcSql.primaryBreakdown({ range: 3, scope: ['H04'], bySection: false, yearClause: 'IN (:date)', missedMonetization: false }),
      cpcSql.primaryBreakdown({ range: 3, scope: [], bySection: false, yearClause: '>= :date', missedMonetization: true }),
      cpcSql.fallbackBreakdown({ range: 1, scope: ['H'], bySection: true, yearClause: '>= :date', missedMonetization: false }),
      cpcSql.fallbackBreakdown({ range: 5, scope: [], bySection: false, yearClause: '>= :date', missedMonetization: true }),
    ].forEach((sql) => {
      [...boundNames(sql)].forEach((name) => {
        expect(['list', 'scopeList', 'date']).toContain(name);
      });
    });
  });

  it('omits the scope filter when nothing was scoped', () => {
    const scoped = cpcSql.primaryBreakdown({ range: 3, scope: ['H04'], bySection: false, yearClause: '>= :date' });
    const open = cpcSql.primaryBreakdown({ range: 3, scope: [], bySection: false, yearClause: '>= :date' });
    expect(scoped).toContain(':scopeList');
    expect(open).not.toContain(':scopeList');
  });

  it('scopes by section when the caller already had a list', () => {
    const sql = cpcSql.primaryBreakdown({ range: 1, scope: ['H'], bySection: true, yearClause: '>= :date' });
    expect(sql).toContain('AND section IN (:scopeList)');
  });

  it('queries only the application side for missed monetization', () => {
    const sql = cpcSql.primaryBreakdown({ range: 3, scope: [], bySection: false, yearClause: '>= :date', missedMonetization: true });
    expect(sql).not.toContain('UNION');
    expect(sql).toContain('db_patent_application_bibliographic.patent_cpc');
  });
});

describe('assets.service.resolveAssets', () => {
  const base = {
    list: [], total: 0, companies: [9], assignments: [], customers: [], bankMode: false,
  };

  it('takes a caller list at face value when it matches its total', async () => {
    const assets = await service.resolveAssets({ ...base, list: ['111', '222'], total: 2, type: 'acquired' });
    expect(assets).toEqual(['111', '222']);
    expect(repo.applicationsForMetric).not.toHaveBeenCalled();
  });

  it('ignores a list whose length disagrees with its total', async () => {
    repo.applicationsForMetric.mockResolvedValue([{ application: '999' }]);
    const assets = await service.resolveAssets({ ...base, list: ['111'], total: 5, type: 'acquired' });
    expect(assets).toEqual(['999']);
  });

  it('resolves the metric behind a layout', async () => {
    repo.applicationsForMetric.mockResolvedValue([{ application: '111' }]);
    await service.resolveAssets({ ...base, type: 'divested' });
    expect(repo.applicationsForMetric).toHaveBeenCalledWith(
      expect.objectContaining({ type: 33, companies: [9] })
    );
  });

  it('computes metric 38 over the owned assets instead', async () => {
    repo.applicationsForMetric.mockResolvedValue([]);
    await service.resolveAssets({ ...base, type: 'top_non_us_members' });
    expect(repo.applicationsForMetric).toHaveBeenCalledWith(expect.objectContaining({ type: 30 }));
  });

  it('takes two hops for the law-firm view', async () => {
    repo.applicationsForMetric.mockResolvedValue([{ application: '111' }]);
    repo.lawFirmNames.mockResolvedValue([{ lawfirm: 'Fish & Richardson' }]);
    repo.applicationsByLawFirm.mockResolvedValue([{ appno_doc_num: '222' }]);

    const assets = await service.resolveAssets({ ...base, type: 'top_law_firms' });
    expect(repo.applicationsByLawFirm).toHaveBeenCalledWith({
      applications: ['111'], lawFirmNames: ['Fish & Richardson'],
    });
    expect(assets).toEqual(['222']);
  });

  it('stops early when the law-firm view has no applications', async () => {
    repo.applicationsForMetric.mockResolvedValue([]);
    expect(await service.resolveAssets({ ...base, type: 'top_law_firms' })).toEqual([]);
    expect(repo.lawFirmNames).not.toHaveBeenCalled();
  });

  it('leaves due diligence to the caller list', async () => {
    expect(await service.resolveAssets({ ...base, type: 'due_dilligence' })).toEqual([]);
    expect(repo.applicationsForMetric).not.toHaveBeenCalled();
  });
});

describe('assets.service.cpcBreakdown', () => {
  const input = {
    list: ['111'], total: 1, type: 'acquired', companies: [9], tabs: [], customers: [],
    assignments: [], scope: [], years: [], range: 3, dataType: 0, otherMode: false,
    bankMode: false, orgId: 118,
  };

  it('returns empty when nothing resolves', async () => {
    repo.selectionAssets.mockResolvedValue([]);
    const res = await service.cpcBreakdown({ ...input, list: [], total: 0 });
    expect(res).toEqual({ list: [], group: [], sales: [] });
  });

  it('runs a second pass over the assets the first did not classify', async () => {
    repo.assetsForSale.mockResolvedValue([]);
    repo.cpcBreakdown
      .mockResolvedValueOnce([{ cpc_code: 'H04L', appNum: '111', section: 'H' }])
      .mockResolvedValueOnce([{ cpc_code: 'G06F', appNum: '222', section: 'G' }]);
    repo.cpcDefinitions.mockResolvedValue([]);

    const res = await service.cpcBreakdown({ ...input, list: ['111', '222'], total: 2 });

    expect(repo.cpcBreakdown).toHaveBeenCalledTimes(2);
    expect(repo.cpcBreakdown.mock.calls[1][0]).toMatchObject({ list: ['222'], fallback: true });
    expect(res.list).toHaveLength(2);
  });

  it('skips the second pass when the first classified everything', async () => {
    repo.assetsForSale.mockResolvedValue([]);
    repo.cpcBreakdown.mockResolvedValueOnce([{ cpc_code: 'H04L', appNum: '111,222' }]);
    repo.cpcDefinitions.mockResolvedValue([]);

    await service.cpcBreakdown({ ...input, list: ['111', '222'], total: 2 });
    expect(repo.cpcBreakdown).toHaveBeenCalledTimes(1);
  });

  it('builds one group entry per CPC code and attaches its definition', async () => {
    repo.assetsForSale.mockResolvedValue([]);
    repo.cpcBreakdown.mockResolvedValue([
      { cpc_code: 'H04L', appNum: '111', section: 'H', class: '04' },
      { cpc_code: 'H04L', appNum: '111', section: 'H', class: '04' },
    ]);
    repo.cpcDefinitions.mockResolvedValue([{ cpc_code: 'H04L', defination: 'Transmission' }]);

    const res = await service.cpcBreakdown({ ...input, list: ['111'], total: 1 });
    expect(res.group).toHaveLength(1);
    expect(res.group[0]).toMatchObject({ id: 1, cpc_code: 'H04L', defination: 'Transmission' });
  });

  it('treats every asset as for sale in other mode', async () => {
    repo.assetsForSale.mockResolvedValue([{ appno_doc_num: '111' }]);
    repo.cpcBreakdown.mockResolvedValue([]);

    const res = await service.cpcBreakdown({ ...input, otherMode: true, list: ['111'], total: 1 });
    expect(res.sales).toEqual(['111']);
  });

  it('switches the year filter to a list when years were given', async () => {
    repo.assetsForSale.mockResolvedValue([]);
    repo.cpcBreakdown.mockResolvedValue([]);
    await service.cpcBreakdown({ ...input, years: [2018, 2019] });
    expect(repo.cpcBreakdown).toHaveBeenCalledWith(
      expect.objectContaining({ yearClause: 'IN (:date)', years: [2018, 2019] })
    );
  });
});

describe('assets.service.move', () => {
  it('writes an arrival and a departure row for a real move', async () => {
    repo.findMovedAssets.mockResolvedValue([{ asset_id: 1 }, { asset_id: 2 }]);
    await service.move({
      orgId: 118,
      movedAssets: [{ grant_doc_num: '9446259', appno_doc_num: '13456789', currentLayout: 15, move_category: 30 }],
    });

    const rows = repo.moveAssets.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ layout_id: 30, status: 1 });
    expect(rows[1]).toMatchObject({ layout_id: 15, status: 0 });
  });

  it('writes one row when the asset stays put', async () => {
    repo.findMovedAssets.mockResolvedValue([]);
    await service.move({
      orgId: 118,
      movedAssets: [{ grant_doc_num: '9446259', appno_doc_num: '13456789', currentLayout: 15, move_category: 0 }],
    });
    expect(repo.moveAssets.mock.calls[0][0]).toHaveLength(1);
  });

  it('does nothing for an empty list', async () => {
    expect(await service.move({ orgId: 118, movedAssets: [] })).toEqual([]);
    expect(repo.moveAssets).not.toHaveBeenCalled();
  });
});

describe('assets.service.validate', () => {
  it('reports back the caller\'s own spelling of an unknown number', async () => {
    repo.knownAssetNumbers.mockResolvedValue(new Set(['9446259']));
    const unknown = await service.validate(['US9,446,259 B2', 'EP1234567 A1']);
    expect(repo.knownAssetNumbers).toHaveBeenCalledWith(['9446259', 'ep1234567']);
    expect(unknown).toEqual(['EP1234567 A1']);
  });

  it('returns nothing for an empty input', async () => {
    expect(await service.validate([])).toEqual([]);
    expect(repo.knownAssetNumbers).not.toHaveBeenCalled();
  });
});

describe('assets.service.downloadLink', () => {
  it('uses the CDN copy when we mirrored the document', async () => {
    repo.reelFrame.mockResolvedValue({ reel_no: '45231', frame_no: '0812', status: 1 });
    const link = await service.downloadLink(500);
    expect(link).toContain('static.patentrack.com');
    expect(link).toContain('assignment-pat-45231-0812.pdf');
  });

  it('links to the USPTO otherwise', async () => {
    repo.reelFrame.mockResolvedValue({ reel_no: '45231', frame_no: '0812', status: 0 });
    expect(await service.downloadLink(500)).toContain('legacy-assignments.uspto.gov');
  });

  it('404s for an unknown transaction', async () => {
    repo.reelFrame.mockResolvedValue(null);
    await expect(service.downloadLink(500)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('assets.service.illustration', () => {
  it('falls back to the bibliographic index when the corpus has no record', async () => {
    repo.findAsset.mockResolvedValue([]);
    repo.findAssetInBiblio.mockResolvedValue([{ appno_doc_num: '13456789' }]);
    backgroundJob.illustrationJson.mockResolvedValue('{"box":[]}');

    await service.illustration({ asset: '9446259', flag: 1, orgId: 118, userId: 5 });
    expect(repo.findAssetInBiblio).toHaveBeenCalledWith({ asset: '9446259', isGrant: true });
  });

  it('400s for a number nobody has heard of', async () => {
    repo.findAsset.mockResolvedValue([]);
    repo.findAssetInBiblio.mockResolvedValue([]);
    await expect(
      service.illustration({ asset: 'nope', flag: 1, orgId: 118, userId: 5 })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
