'use strict';

// Four routes turned a missing request field into a 500 with a SQL error in the
// logs, instead of a 400 naming the field. Same class as the run_query bug:
// the value reached the query as NaN or undefined.
//
//   PUT /admin/company/assignments        -> Unknown column 'NaN' in 'where clause'
//   PUT /admin/customers/:id/buttons      -> Unknown column 'NaN' in 'where clause'
//   PUT /documents/repo_folder            -> WHERE parameter "user_account" has invalid "undefined" value
//   PUT /documents/template_folder        -> same
//
// A 500 here is worse than rude: it says "our fault" for a malformed request,
// and it puts a SQL fragment in the log for every occurrence.

jest.mock('../../src/modules/admin-company-search/admin-company-search.repository');
jest.mock('../../src/modules/admin-customers/admin-customers.repository');
jest.mock('../../src/modules/documents/documents.repository');
jest.mock('../../src/db/tenant-connections');
jest.mock('../../src/db/query');
jest.mock('../../src/utils/google');
jest.mock('../../src/jobs/queue');

const searchRepo = require('../../src/modules/admin-company-search/admin-company-search.repository');
const customersRepo = require('../../src/modules/admin-customers/admin-customers.repository');
const documentsRepo = require('../../src/modules/documents/documents.repository');

const searchService = require('../../src/modules/admin-company-search/admin-company-search.service');
const customersService = require('../../src/modules/admin-customers/admin-customers.service');
const documentsService = require('../../src/modules/documents/documents.service');

beforeEach(() => jest.clearAllMocks());

describe('PUT /admin/company/assignments', () => {
  it('400s without rf_id rather than querying for NaN', async () => {
    await expect(
      searchService.updateAssignment({ rfId: NaN, fields: { cname: 'x' } })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(searchRepo.rawAssignment).not.toHaveBeenCalled();
  });

  it('400s on a non-positive rf_id', async () => {
    for (const rfId of [0, -1]) {
      await expect(
        searchService.updateAssignment({ rfId, fields: { cname: 'x' } })
      ).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(searchRepo.rawAssignment).not.toHaveBeenCalled();
  });

  it('still works with a real rf_id', async () => {
    searchRepo.rawAssignment.mockResolvedValue({ rf_id: 500 });
    searchRepo.updateCorrespondent.mockResolvedValue([1]);
    await expect(
      searchService.updateAssignment({ rfId: 500, fields: { cname: 'Acme LLP' } })
    ).resolves.toMatchObject({ rf_id: 500 });
  });
});

describe('PUT /admin/customers/:id/buttons', () => {
  it('400s without button_id rather than querying for NaN', async () => {
    await expect(
      customersService.setSwitch({ organisationId: 68, buttonId: NaN, status: 1 })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(customersRepo.upsertAccountProcess).not.toHaveBeenCalled();
  });

  it('400s without status', async () => {
    await expect(
      customersService.setSwitch({ organisationId: 68, buttonId: 5, status: NaN })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(customersRepo.upsertAccountProcess).not.toHaveBeenCalled();
  });

  it('accepts status 0 — it is a real value, not a missing one', async () => {
    customersRepo.upsertAccountProcess.mockResolvedValue({ button_id: 5, status: 0 });
    await expect(
      customersService.setSwitch({ organisationId: 68, buttonId: 5, status: 0 })
    ).resolves.toBeDefined();
  });
});

describe('PUT /documents/repo_folder and /template_folder', () => {
  it('400 without user_account rather than passing undefined to the WHERE', async () => {
    await expect(
      documentsService.setRepoFolder(68, { container_id: 'c1' })
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      documentsService.setTemplateFolder(68, { template_container_id: 't1' })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(documentsRepo.findRepository).not.toHaveBeenCalled();
  });

  it('still looks the repository up when user_account is given', async () => {
    documentsRepo.findRepository.mockResolvedValue(null);
    documentsRepo.createRepository.mockResolvedValue({ id: 1 });
    await documentsService.setTemplateFolder(68, {
      template_container_id: 't1', user_account: 'someone@example.com',
    });
    expect(documentsRepo.findRepository).toHaveBeenCalledWith(68, 'someone@example.com');
  });
});
