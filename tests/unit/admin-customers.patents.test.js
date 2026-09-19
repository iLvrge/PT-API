'use strict';

// GET /admin/patents/:asset — the console's patent lookup, missing from the
// rewrite (404). It checks the number exists before handing off to the
// illustration pipeline, so an unknown number fails fast instead of making the
// caller wait on an external service that will answer nothing.

jest.mock('../../src/modules/admin-customers/admin-customers.repository');
jest.mock('../../src/db/tenant-connections');
jest.mock('../../src/db/query');
jest.mock('../../src/utils/background-job');

const repo = require('../../src/modules/admin-customers/admin-customers.repository');
const { illustrationJson } = require('../../src/utils/background-job');
const service = require('../../src/modules/admin-customers/admin-customers.service');

beforeEach(() => {
  jest.clearAllMocks();
  repo.assetExists.mockResolvedValue(true);
  illustrationJson.mockResolvedValue('{"box":[]}');
});

describe('assetIllustration', () => {
  it('returns the pipeline body for a known asset', async () => {
    await expect(
      service.assetIllustration({ asset: '10044709', flag: undefined, orgId: 68, userId: 4 })
    ).resolves.toBe('{"box":[]}');
  });

  it('passes the caller identity through to the pipeline', async () => {
    await service.assetIllustration({ asset: '10044709', flag: 1, orgId: 68, userId: 4 });
    expect(illustrationJson).toHaveBeenCalledWith({
      asset: '10044709', flag: 1, orgId: 68, userId: 4,
    });
  });

  it('sends an empty flag rather than undefined when none was given', async () => {
    await service.assetIllustration({ asset: '10044709', flag: undefined, orgId: 68, userId: 4 });
    expect(illustrationJson.mock.calls[0][0].flag).toBe('');
  });

  it('400s for a number that is in neither column, without calling the pipeline', async () => {
    repo.assetExists.mockResolvedValue(false);
    await expect(
      service.assetIllustration({ asset: 'nope', flag: undefined, orgId: 68, userId: 4 })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(illustrationJson).not.toHaveBeenCalled();
  });

  it('narrows the existence check by flag', async () => {
    await service.assetIllustration({ asset: '10044709', flag: 0, orgId: 68, userId: 4 });
    expect(repo.assetExists).toHaveBeenCalledWith('10044709', 0);
  });

  it('passes an empty pipeline response straight through', async () => {
    illustrationJson.mockResolvedValue('');
    await expect(
      service.assetIllustration({ asset: '10044709', flag: undefined, orgId: 68, userId: 4 })
    ).resolves.toBe('');
  });
});
