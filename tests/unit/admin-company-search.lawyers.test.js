'use strict';

/*
 * A customer's lawyers - GET /admin/company/lawyers/:id.
 *
 * `:id` is the customer. The port read it as a law_firm_id and answered with
 * that firm's lawyers, so the console's Lawyers button showed an unrelated list
 * for every customer. The grid also reads two nested objects the flat query
 * cannot produce, so the service assembles them.
 */

jest.mock('../../src/modules/admin-company-search/admin-company-search.repository', () => ({
  lawyersForCustomer: jest.fn(),
}));
jest.mock('../../src/db/tenant-connections', () => ({ getConnection: jest.fn(async () => null) }));

const repository = require('../../src/modules/admin-company-search/admin-company-search.repository');
const service = require('../../src/modules/admin-company-search/admin-company-search.service');

const row = (extra = {}) => ({
  lawyer_id: 69398, name: 'BIRCH, STEWART, KOLASCH & BIRCH, LLP', counter: '2', total_occurences: 1,
  representative_lawyer_id: null, lawyer_representative_name: null,
  law_firm_id: 23547, law_firm_name: 'BIRCH, STEWART, KOLASCH & BIRCH, LLP',
  law_firm_representative_id: 1267, law_firm_representative_name: 'BIRCH, STEWART, KOLASCH & BIRCH, LLP',
  ...extra,
});

describe('lawyersForCustomer', () => {
  beforeEach(() => repository.lawyersForCustomer.mockReset());

  it('scopes by the chosen portfolio companies and nests what the grid reads', async () => {
    repository.lawyersForCustomer.mockResolvedValue([row()]);

    const [lawyer] = await service.lawyersForCustomer({ organisationId: 68, portfolios: [859, 864] });

    expect(repository.lawyersForCustomer).toHaveBeenCalledWith({ companyIds: [859, 864] });
    expect(lawyer).toEqual({
      lawyer_id: 69398,
      name: 'BIRCH, STEWART, KOLASCH & BIRCH, LLP',
      counter: 2,
      total_occurences: 1,
      // No normalised lawyer name: the cell renderer tests for null, not {}.
      representativelawyers: null,
      lawfirms: {
        law_firm_id: 23547,
        law_firm_name: 'BIRCH, STEWART, KOLASCH & BIRCH, LLP',
        representativelawfirm: { representative_id: 1267, representative_name: 'BIRCH, STEWART, KOLASCH & BIRCH, LLP' },
      },
    });
  });

  it('nests a normalised lawyer name when there is one', async () => {
    repository.lawyersForCustomer.mockResolvedValue([
      row({ representative_lawyer_id: 5, lawyer_representative_name: 'Birch Stewart', law_firm_representative_id: null }),
    ]);
    const [lawyer] = await service.lawyersForCustomer({ organisationId: 68, portfolios: [859] });
    expect(lawyer.representativelawyers).toEqual({ representative_lawyer_id: 5, representative_name: 'Birch Stewart' });
    expect(lawyer.lawfirms.representativelawfirm).toBeNull();
  });

  it('answers [] without querying when the customer has no companies', async () => {
    // No portfolio and no tenant database: nothing to scope by.
    await expect(service.lawyersForCustomer({ organisationId: 68, portfolios: [] })).resolves.toEqual([]);
    expect(repository.lawyersForCustomer).not.toHaveBeenCalled();
  });
});
