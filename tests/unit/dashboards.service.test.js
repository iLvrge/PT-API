'use strict';

jest.mock('../../src/modules/dashboards/dashboards.repository');

const repo = require('../../src/modules/dashboards/dashboards.repository');
const service = require('../../src/modules/dashboards/dashboards.service');

const tenant = { id: 't' };

beforeEach(() => jest.clearAllMocks());

describe('dashboards.service.parties', () => {
  it('resolves the asset set from the owned-assets metric by default', async () => {
    repo.tenantCompanyName.mockResolvedValue('Acme Inc');
    repo.ownedApplications.mockResolvedValue(['111', '222']);
    repo.parties.mockResolvedValue([{ id: 1, name: 'Other Co' }]);

    await service.parties({
      tenant, companies: [9], layout: 'acquired', list: [], total: 0, bankMode: false,
    });

    expect(repo.ownedApplications).toHaveBeenCalledWith({ companies: [9], type: 32, bankMode: false });
    expect(repo.parties).toHaveBeenCalledWith(
      expect.objectContaining({ assets: ['111', '222'], activityIds: [1, 6], inventors: false })
    );
  });

  it('uses the lending activities for type "lenders"', async () => {
    repo.tenantCompanyName.mockResolvedValue('Acme Inc');
    repo.ownedApplications.mockResolvedValue(['111']);
    repo.parties.mockResolvedValue([]);

    await service.parties({ tenant, companies: [9], type: 'lenders', list: [], total: 0 });
    expect(repo.parties).toHaveBeenCalledWith(expect.objectContaining({ activityIds: [5, 12] }));
  });

  it('queries the inventor tables for type "filled"', async () => {
    repo.tenantCompanyName.mockResolvedValue('Acme Inc');
    repo.ownedApplications.mockResolvedValue(['111']);
    repo.parties.mockResolvedValue([]);

    await service.parties({ tenant, companies: [9], type: 'filled', list: [], total: 0 });
    expect(repo.parties).toHaveBeenCalledWith(expect.objectContaining({ inventors: true }));
  });

  it('takes the caller-supplied list and re-derives the company when it is complete', async () => {
    repo.tenantCompanyName.mockResolvedValueOnce(null).mockResolvedValueOnce('Derived Co');
    repo.dominantCompanyForAssets.mockResolvedValue({ representative_id: 42 });
    repo.parties.mockResolvedValue([]);

    await service.parties({
      tenant, companies: [], search: 'all', list: ['111', '222'], total: 2,
    });

    expect(repo.dominantCompanyForAssets).toHaveBeenCalledWith(['111', '222']);
    expect(repo.tenantCompanyName).toHaveBeenLastCalledWith(tenant, [42]);
    expect(repo.parties).toHaveBeenCalledWith(
      expect.objectContaining({ assets: ['111', '222'], assigneeName: 'Derived Co' })
    );
  });

  it('returns an empty list rather than throwing when the company cannot be named', async () => {
    repo.tenantCompanyName.mockResolvedValue(null);
    repo.dominantCompanyForAssets.mockResolvedValue(null);

    const res = await service.parties({
      tenant, companies: [], search: 'all', list: ['111'], total: 1,
    });
    expect(res).toEqual([]);
    expect(repo.parties).not.toHaveBeenCalled();
  });

  it('does not query when the company owns no assets', async () => {
    repo.tenantCompanyName.mockResolvedValue('Acme Inc');
    repo.ownedApplications.mockResolvedValue([]);

    expect(await service.parties({ tenant, companies: [9], list: [], total: 0 })).toEqual([]);
    expect(repo.parties).not.toHaveBeenCalled();
  });
});

describe('dashboards.service.inventorParty', () => {
  it('tries every ordering of the inventor name parts', async () => {
    repo.inventorNames.mockResolvedValue({
      assignor_and_assignee_id: 5,
      given_name: ' John',
      middle_name: ' Q',
      family_name: ' Public,',
    });
    repo.partyIdForNames.mockResolvedValue({ id: 88 });

    const res = await service.inventorParty(5);
    expect(res).toEqual({ id: 88 });

    const names = repo.partyIdForNames.mock.calls[0][0];
    expect(names).toHaveLength(8);
    expect(names).toContain('public john q');
    expect(names).toContain('john q public');
    // The legacy normaliser strips the first comma only, and lowercases.
    expect(names.every((n) => n === n.toLowerCase())).toBe(true);
  });

  it('skips the lookup for an unknown inventor', async () => {
    repo.inventorNames.mockResolvedValue(null);
    expect(await service.inventorParty(5)).toEqual({});
    expect(repo.partyIdForNames).not.toHaveBeenCalled();
  });

  it('skips the lookup for a non-positive id', async () => {
    expect(await service.inventorParty(0)).toEqual({});
    expect(repo.inventorNames).not.toHaveBeenCalled();
  });
});

describe('dashboards.service.timeline', () => {
  it('maps the timeline tab to its activity ids and asks for logos', async () => {
    repo.recordedPartyIds.mockResolvedValue([7, 8]);
    repo.timeline.mockResolvedValue([]);

    await service.timeline({ companies: [9], type: 3, parties: [] });
    expect(repo.recordedPartyIds).toHaveBeenCalledWith(9);
    expect(repo.timeline).toHaveBeenCalledWith(
      expect.objectContaining({ activityIds: [3, 4], recordedIds: [7, 8], withLogos: true })
    );
  });

  it('skips the logo join for the employees tab', async () => {
    repo.recordedPartyIds.mockResolvedValue([7]);
    repo.timeline.mockResolvedValue([]);

    await service.timeline({ companies: [9], type: 5, parties: [] });
    expect(repo.timeline).toHaveBeenCalledWith(expect.objectContaining({ withLogos: false }));
  });

  it('returns an empty list for an unknown tab', async () => {
    expect(await service.timeline({ companies: [9], type: 99, parties: [] })).toEqual([]);
    expect(repo.recordedPartyIds).not.toHaveBeenCalled();
  });

  it('returns an empty list when the company has no recorded parties', async () => {
    repo.recordedPartyIds.mockResolvedValue([]);
    expect(await service.timeline({ companies: [9], type: 1, parties: [] })).toEqual([]);
    expect(repo.timeline).not.toHaveBeenCalled();
  });
});

describe('dashboards.service.metric', () => {
  it('loads the owned assets before building the family metric', async () => {
    repo.ownedApplications.mockResolvedValue(['111']);
    repo.metric.mockResolvedValue([{ name: 'DE' }]);

    await service.metric({ type: 38, companies: [9], bankMode: false, bank: false });
    expect(repo.ownedApplications).toHaveBeenCalledWith({ companies: [9], type: 30, bankMode: false });
    expect(repo.metric).toHaveBeenCalledWith(expect.objectContaining({ ownedAssets: ['111'] }));
  });

  it('does not load owned assets for other metrics', async () => {
    repo.metric.mockResolvedValue({});
    await service.metric({ type: 30, companies: [9], bankMode: false, bank: false });
    expect(repo.ownedApplications).not.toHaveBeenCalled();
  });

  it('returns an empty object when no branch matches', async () => {
    repo.metric.mockResolvedValue(null);
    expect(await service.metric({ type: 99, companies: [9], bank: false })).toEqual({});
  });
});

describe('dashboards.service.metric — PTAB (type 37)', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  const jsonOnce = (payload) => ({ ok: true, json: async () => payload });

  it('counts only the proceedings covering assets we track', async () => {
    repo.metric.mockResolvedValue(null);
    repo.ownedApplications.mockResolvedValue(['111', '222']);
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonOnce({ recordTotalQuantity: 3 }))
      .mockResolvedValueOnce(
        jsonOnce({
          results: [
            { appellantPatentNumber: '111' },
            { appellantApplicationNumberText: '222' },
            { appellantPatentNumber: '999' },
          ],
        })
      );

    const res = await service.metric({
      type: 37, companies: [9], bank: false, bankMode: false, company: 'Acme Inc',
    });
    expect(res).toMatchObject({ number: 1, other_number: 1, patent: '111', application: '222', total: 2 });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('handles a single proceeding without a second request', async () => {
    repo.metric.mockResolvedValue(null);
    repo.ownedApplications.mockResolvedValue(['111']);
    global.fetch = jest.fn().mockResolvedValueOnce(
      jsonOnce({ recordTotalQuantity: 1, results: [{ appellantPatentNumber: '111' }] })
    );

    const res = await service.metric({
      type: 37, companies: [9], bank: false, bankMode: false, company: 'Acme Inc',
    });
    expect(res).toMatchObject({ number: 1, patent: '111', total: 1 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('degrades to an empty tile when PTAB is unreachable', async () => {
    repo.metric.mockResolvedValue(null);
    repo.ownedApplications.mockResolvedValue(['111']);
    global.fetch = jest.fn().mockRejectedValue(new Error('ETIMEDOUT'));

    const res = await service.metric({
      type: 37, companies: [9], bank: false, bankMode: false, company: 'Acme Inc',
    });
    expect(res).toEqual({});
  });

  it('does not call out at all in bank mode', async () => {
    repo.metric.mockResolvedValue(null);
    global.fetch = jest.fn();

    expect(await service.metric({ type: 37, companies: [9], bank: true, company: 'Acme' })).toEqual({});
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('dashboards.service.temp', () => {
  it('returns an empty object when the client sent no list', async () => {
    expect(await service.temp({ hasList: false, type: 1 })).toEqual({});
    expect(repo.tempAggregate).not.toHaveBeenCalled();
  });

  it('counts bank assets before aggregating', async () => {
    repo.bankAssets.mockResolvedValue({ total: 12, assets: ['111'] });
    repo.tempAggregate.mockResolvedValue({ number: 3 });

    const res = await service.temp({
      hasList: true, type: 24, bank: true, companies: [9], parties: [3],
      tabs: [], customers: [], assignments: [],
    });

    expect(repo.tempAggregate).toHaveBeenCalledWith(
      expect.objectContaining({ total: 12, assets: ['111'], bank: true })
    );
    expect(res).toEqual({ number: 3 });
  });

  it('derives the asset list and its total outside bank mode', async () => {
    repo.ownedAssetsForTemp.mockResolvedValue(['111', '222']);
    repo.tempAggregate.mockResolvedValue({ number: 2 });

    await service.temp({
      hasList: true, type: 18, bank: false, companies: [9], parties: [],
      tabs: [17], customers: [], assignments: [],
    });

    // checkTabs expands the acquisitions shorthand before the query runs.
    expect(repo.ownedAssetsForTemp).toHaveBeenCalledWith(
      expect.objectContaining({ tabs: [17, 1, 6] })
    );
    expect(repo.tempAggregate).toHaveBeenCalledWith(
      expect.objectContaining({ list: ['111', '222'], total: 2 })
    );
  });
});

describe('dashboards.service.share', () => {
  it('creates a share row and returns the kpi link', async () => {
    repo.countUnselectedCompanies.mockResolvedValue(0);
    repo.shareCodeExists.mockResolvedValue(false);
    repo.createShare.mockResolvedValue({ share_id: 1 });

    const url = await service.share({
      tenant, orgId: 118, userId: 5, selectedCompanies: [9], tabs: [1], customers: [],
      shareButton: '1',
    });

    expect(url).toMatch(/^https:\/\/kpi\.[^/]+\/dashboard\/[a-z0-9]{6}$/);
    expect(repo.createShare).toHaveBeenCalledWith(
      expect.objectContaining({ organisation_id: 118, user_id: 5, type: 9, show_other_companies: 0 })
    );
  });

  it('uses the dashboard subdomain for share_button 2', async () => {
    repo.countUnselectedCompanies.mockResolvedValue(3);
    repo.shareCodeExists.mockResolvedValue(false);
    repo.createShare.mockResolvedValue({ share_id: 1 });

    const url = await service.share({
      tenant, orgId: 118, userId: 5, selectedCompanies: [9], tabs: [], customers: [],
      shareButton: '2',
    });

    expect(url).toContain('https://dashboard.');
    expect(repo.createShare).toHaveBeenCalledWith(
      expect.objectContaining({ show_other_companies: 1 })
    );
  });

  it('retries until it finds a free code', async () => {
    repo.countUnselectedCompanies.mockResolvedValue(0);
    repo.shareCodeExists
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false);
    repo.createShare.mockResolvedValue({ share_id: 1 });

    await service.share({
      tenant, orgId: 118, userId: 5, selectedCompanies: [9], tabs: [], customers: [],
    });
    expect(repo.shareCodeExists).toHaveBeenCalledTimes(3);
  });

  it('rejects an empty company selection', async () => {
    await expect(
      service.share({ tenant, orgId: 118, userId: 5, selectedCompanies: [], tabs: [], customers: [] })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('dashboards.service.assignorParties', () => {
  it('uses the license-in activities when asked', async () => {
    repo.tenantCompanyName.mockResolvedValue('Acme Inc');
    repo.assignorParties.mockResolvedValue([]);

    await service.assignorParties({ tenant, companies: [9], type: 'license_in' });
    expect(repo.assignorParties).toHaveBeenCalledWith(
      expect.objectContaining({ activityIds: [3, 4], assignorName: 'Acme Inc' })
    );
  });

  it('defaults to the divestment activities', async () => {
    repo.tenantCompanyName.mockResolvedValue('Acme Inc');
    repo.assignorParties.mockResolvedValue([]);

    await service.assignorParties({ tenant, companies: [9], search: 'all' });
    expect(repo.assignorParties).toHaveBeenCalledWith(
      expect.objectContaining({ activityIds: [2, 7], allAssets: true })
    );
  });

  it('returns an empty list when the company is unknown to the tenant', async () => {
    repo.tenantCompanyName.mockResolvedValue(null);
    expect(await service.assignorParties({ tenant, companies: [9] })).toEqual([]);
    expect(repo.assignorParties).not.toHaveBeenCalled();
  });
});

describe('dashboards.service.filedAssetEvents', () => {
  it('looks up maintenance events for the filed patents', async () => {
    repo.filedApplications.mockResolvedValue(['111']);
    repo.maintenanceEvents.mockResolvedValue([{ asset: '111', code: 'M1551' }]);

    const res = await service.filedAssetEvents([9]);
    expect(repo.maintenanceEvents).toHaveBeenCalledWith(['111']);
    expect(res).toHaveLength(1);
  });

  it('skips the second query when nothing was filed', async () => {
    repo.filedApplications.mockResolvedValue([]);
    expect(await service.filedAssetEvents([9])).toEqual([]);
    expect(repo.maintenanceEvents).not.toHaveBeenCalled();
  });
});
