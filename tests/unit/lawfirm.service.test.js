'use strict';

jest.mock('../../src/modules/lawfirm/lawfirm.repository');

const repository = require('../../src/modules/lawfirm/lawfirm.repository');
const service = require('../../src/modules/lawfirm/lawfirm.service');

const tenant = { id: 't' };

describe('lawfirm.service.list (nested assembly)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('nests addresses and companylawfirm+representative under each lawfirm', async () => {
    repository.listLawfirms.mockResolvedValue([
      { lawfirm_id: 1, name: 'Firm A' },
      { lawfirm_id: 2, name: 'Firm B' },
    ]);
    repository.listAddressesFor.mockResolvedValue([
      { address_id: 10, lawfirm_id: 1, city: 'NYC' },
    ]);
    repository.listCompanyLawfirms.mockResolvedValue([
      { company_lawfirm_id: 100, lawfirm_id: 1, representative_id: 9, rep_id: 9, original_name: 'O', representative_name: 'R' },
    ]);

    const result = await service.list(tenant, []);

    const firmA = result.find((l) => l.lawfirm_id === 1);
    expect(firmA.lawfirm_address).toHaveLength(1);
    expect(firmA.companylawfirm[0].companylawfirm_representative.representative_name).toBe('R');

    const firmB = result.find((l) => l.lawfirm_id === 2);
    expect(firmB.lawfirm_address).toEqual([]);
    expect(firmB.companylawfirm).toEqual([]);
  });

  it('returns [] when there are no lawfirms', async () => {
    repository.listLawfirms.mockResolvedValue([]);
    await expect(service.list(tenant, [])).resolves.toEqual([]);
  });

  it('represents a company_lawfirm with no representative as null', async () => {
    repository.listLawfirms.mockResolvedValue([{ lawfirm_id: 1, name: 'A' }]);
    repository.listAddressesFor.mockResolvedValue([]);
    repository.listCompanyLawfirms.mockResolvedValue([
      { company_lawfirm_id: 1, lawfirm_id: 1, representative_id: 9, rep_id: null },
    ]);
    const result = await service.list(tenant, []);
    expect(result[0].companylawfirm[0].companylawfirm_representative).toBeNull();
  });
});

describe('lawfirm.service writes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('update throws 404 when the lawfirm is missing', async () => {
    repository.findById.mockResolvedValue(null);
    await expect(service.update(tenant, 99, { name: 'x' })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('remove deletes an existing lawfirm', async () => {
    repository.findById.mockResolvedValue({ lawfirm_id: 3, name: 'C' });
    repository.destroyById.mockResolvedValue(1);
    await expect(service.remove(tenant, 3)).resolves.toEqual({ lawfirm_id: 3, deleted: true });
  });
});
