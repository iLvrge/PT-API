'use strict';

jest.mock('../../src/modules/share/share.repository');
jest.mock('../../src/shared/share-codes');
jest.mock('../../src/utils/background-job');

const repo = require('../../src/modules/share/share.repository');
const shareCodes = require('../../src/shared/share-codes');
const backgroundJob = require('../../src/utils/background-job');
const service = require('../../src/modules/share/share.service');

beforeEach(() => {
  jest.clearAllMocks();
  shareCodes.allocate.mockResolvedValue('abc123');
});

describe('share.service.create', () => {
  it('stores the asset list and returns the link', async () => {
    repo.createShare.mockResolvedValue({ share_id: 7 });
    repo.addAssets.mockResolvedValue([]);

    const url = await service.create({
      orgId: 118, userId: 5, type: 1, assets: [{ asset: '999', flag: 4 }], transactions: [],
    });

    expect(url).toBe('https://share.patentrack.com/abc123');
    expect(repo.addAssets).toHaveBeenCalledWith([{ asset: '999', type: 4, share_id: 7 }]);
  });

  it('uses the sample and standard hosts for those share types', async () => {
    repo.createShare.mockResolvedValue({ share_id: 7 });
    repo.addAssets.mockResolvedValue([]);

    const sample = await service.create({
      orgId: 1, userId: 1, type: 2, assets: [{ asset: 'a', flag: 4 }], transactions: [],
    });
    const standard = await service.create({
      orgId: 1, userId: 1, type: 0, assets: [{ asset: 'a', flag: 4 }], transactions: [],
    });

    expect(sample).toContain('https://sample.app.');
    expect(standard).toContain('https://standard.app.');
  });

  it('derives the assets from a transaction list and records them on the share', async () => {
    repo.createShare.mockResolvedValue({ share_id: 7 });
    repo.assetsForTransactions.mockResolvedValue([{ asset: '999', flag: 4 }]);
    repo.addAssets.mockResolvedValue([]);

    await service.create({ orgId: 118, userId: 5, type: 1, assets: [], transactions: [500] });

    expect(repo.setTransactions).toHaveBeenCalledWith(7, JSON.stringify([500]));
    expect(repo.addAssets).toHaveBeenCalledWith([{ asset: '999', type: 4, share_id: 7 }]);
  });

  it('rejects a share with neither assets nor transactions', async () => {
    await expect(
      service.create({ orgId: 1, userId: 1, type: 1, assets: [], transactions: [] })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repo.createShare).not.toHaveBeenCalled();
  });

  it('rejects when the transactions cover no assets', async () => {
    repo.createShare.mockResolvedValue({ share_id: 7 });
    repo.assetsForTransactions.mockResolvedValue([]);

    await expect(
      service.create({ orgId: 1, userId: 1, type: 1, assets: [], transactions: [500] })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repo.addAssets).not.toHaveBeenCalled();
  });

  it('fails cleanly when no code can be allocated', async () => {
    shareCodes.allocate.mockResolvedValue(undefined);
    await expect(
      service.create({ orgId: 1, userId: 1, type: 1, assets: [{ asset: 'a', flag: 4 }], transactions: [] })
    ).rejects.toMatchObject({ statusCode: 500 });
  });
});

describe('share.service.assets', () => {
  it('splits patents from applications and resolves both', async () => {
    repo.assetRows.mockResolvedValue([
      { asset: '999', type: 4, organisation_id: 118 },
      { asset: '111', type: 5, organisation_id: 118 },
    ]);
    repo.resolveAssets.mockResolvedValue([{ asset: '999' }, { asset: '111' }]);
    repo.organisationLogo.mockResolvedValue('logo.png');

    const res = await service.assets('abc123', 1);
    expect(repo.resolveAssets).toHaveBeenCalledWith({ grants: ['999'], applications: ['111'] });
    expect(res).toMatchObject({ total_records: 2, logo: 'logo.png' });
  });

  it('404s on an unknown code', async () => {
    repo.assetRows.mockResolvedValue([]);
    await expect(service.assets('nope', 1)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('reads a dashboard share from the share row itself', async () => {
    repo.dashboardSelection.mockResolvedValue({ transactions: '{}', share_button: '2' });
    repo.organisationLogo.mockResolvedValue('');
    await service.assets('abc123', 9);
    expect(repo.assetRows).not.toHaveBeenCalled();
  });
});

describe('share.service.timeline', () => {
  it('uses the stored transaction list when there is one', async () => {
    repo.byCodeWithAssets.mockResolvedValue({
      organisation_id: 118, transactions: '[500,501]', share_lists: [{ asset: '999', type: 4 }],
    });
    repo.timeline.mockResolvedValue([{ id: 500 }]);

    const res = await service.timeline('abc123');
    expect(repo.transactionsForAssets).not.toHaveBeenCalled();
    expect(repo.timeline).toHaveBeenCalledWith(118, [500, 501]);
    expect(res.list).toHaveLength(1);
  });

  it('derives the transactions from the assets on older links', async () => {
    repo.byCodeWithAssets.mockResolvedValue({
      organisation_id: 118,
      transactions: null,
      share_lists: [{ asset: '999', type: 4 }, { asset: '111', type: 5 }],
    });
    repo.transactionsForAssets.mockResolvedValue([500]);
    repo.timeline.mockResolvedValue([]);

    await service.timeline('abc123');
    expect(repo.transactionsForAssets).toHaveBeenCalledWith({
      grants: ['999'], applications: ['111'],
    });
  });

  it('returns an empty timeline rather than querying with no ids', async () => {
    repo.byCodeWithAssets.mockResolvedValue({ organisation_id: 118, transactions: null, share_lists: [] });
    const res = await service.timeline('abc123');
    expect(res).toEqual({ list: [], groups: [] });
    expect(repo.timeline).not.toHaveBeenCalled();
  });

  it('400s on an unknown code', async () => {
    repo.byCodeWithAssets.mockResolvedValue(null);
    await expect(service.timeline('nope')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('survives a corrupt stored transaction list', async () => {
    repo.byCodeWithAssets.mockResolvedValue({
      organisation_id: 118, transactions: 'not json', share_lists: [],
    });
    await expect(service.timeline('abc123')).resolves.toEqual({ list: [], groups: [] });
  });
});

describe('share.service illustration proxying', () => {
  it('passes the share owner through to the pipeline', async () => {
    repo.coversAsset.mockResolvedValue({ organisation_id: 118, user_id: 5 });
    backgroundJob.illustrationJson.mockResolvedValue('{"box":[]}');

    const body = await service.assetIllustration({ code: 'abc123', asset: '999' });
    expect(backgroundJob.illustrationJson).toHaveBeenCalledWith({
      asset: '999', orgId: 118, userId: 5,
    });
    expect(body).toBe('{"box":[]}');
  });

  it('refuses an asset the link does not cover', async () => {
    repo.coversAsset.mockResolvedValue(null);
    await expect(
      service.assetIllustration({ code: 'abc123', asset: '999' })
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(backgroundJob.illustrationJson).not.toHaveBeenCalled();
  });

  it('requests flag 1 for a granted patent and 0 for an application', async () => {
    repo.coversAsset.mockResolvedValue({ organisation_id: 118, user_id: 5 });
    backgroundJob.illustrationJson.mockResolvedValue('');

    repo.assetRows.mockResolvedValue([{ asset: '999', type: 4 }]);
    await service.firstIllustration('abc123');
    expect(backgroundJob.illustrationJson).toHaveBeenCalledWith(expect.objectContaining({ flag: 1 }));

    repo.assetRows.mockResolvedValue([{ asset: '111', type: 5 }]);
    await service.firstIllustration('abc123');
    expect(backgroundJob.illustrationJson).toHaveBeenLastCalledWith(expect.objectContaining({ flag: 0 }));
  });
});

describe('share.service.dashboard', () => {
  it('returns the stored selection with the button type', async () => {
    repo.dashboardSelection.mockResolvedValue({
      transactions: '{"selectedCompanies":[9]}', share_button: '2',
    });
    expect(await service.dashboard('abc123')).toEqual({
      selectedCompanies: [9], share_button: '2',
    });
  });

  it('400s on an unknown code', async () => {
    repo.dashboardSelection.mockResolvedValue(null);
    await expect(service.dashboard('nope')).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('share.service.shareOneAsset', () => {
  it('clones the owning organisation onto the new link', async () => {
    repo.byCode.mockResolvedValue({ organisation_id: 118, user_id: 5, type: 1 });
    repo.createShare.mockResolvedValue({ share_id: 8 });
    repo.addAssets.mockResolvedValue([]);

    const url = await service.shareOneAsset({ code: 'abc123', asset: '111' });
    expect(repo.createShare).toHaveBeenCalledWith(
      expect.objectContaining({ organisation_id: 118, user_id: 5, type: 1 })
    );
    expect(url).toContain('/abc123');
  });

  it('404s on an unknown source code', async () => {
    repo.byCode.mockResolvedValue(null);
    await expect(
      service.shareOneAsset({ code: 'nope', asset: '111' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
