'use strict';

jest.mock('../../src/modules/external/external.repository');
jest.mock('../../src/modules/external/external.clients');

const repo = require('../../src/modules/external/external.repository');
const clients = require('../../src/modules/external/external.clients');
const service = require('../../src/modules/external/external.service');
const sql = require('../../src/modules/external/external.sql');

beforeEach(() => jest.clearAllMocks());

describe('external.service.ptabEvents', () => {
  it('strips a US prefix before calling the API', async () => {
    clients.ptabProceedings.mockResolvedValue({ results: [] });
    await service.ptabEvents('US16123456');
    expect(clients.ptabProceedings).toHaveBeenCalledWith('16123456');

    await service.ptabEvents('16123456');
    expect(clients.ptabProceedings).toHaveBeenLastCalledWith('16123456');
  });

  it('maps proceedings to timeline events', async () => {
    clients.ptabProceedings.mockResolvedValue({
      results: [{
        proceedingFilingDate: '2020-01-01',
        proceedingLastModifiedDate: '2020-06-01',
        respondentPartyName: 'Acme',
        appellantPartyName: 'Beta',
        proceedingStatusCategory: 'Terminated',
      }],
    });
    const [event] = await service.ptabEvents('16123456');
    expect(event).toMatchObject({
      start: '2020-01-01 00:00:00',
      end: '2020-06-01 00:00:00',
      name: 'Acme / Beta',
      status: 'Terminated',
    });
    expect(event.id).toEqual(expect.any(String));
  });

  it('degrades to an empty list when the USPTO is unreachable', async () => {
    clients.ptabProceedings.mockRejectedValue(new Error('ETIMEDOUT'));
    expect(await service.ptabEvents('16123456')).toEqual([]);
  });
});

describe('external.service.buildCitationEvents', () => {
  const patent = (over = {}) => ({
    patent_id: '9446259',
    patent_title: 'A Widget',
    patent_date: '2016-09-20',
    application: [{ app_date: '2014-01-01' }],
    assignees: [{ assignee_organization: 'Acme Inc' }],
    ...over,
  });

  it('returns nothing for an empty response', async () => {
    expect(await service.buildCitationEvents({ count: 0 }, '111')).toEqual([]);
    expect(await service.buildCitationEvents(null, '111')).toEqual([]);
  });

  it('emits one event per assignee, dated from the application', async () => {
    repo.organisationLogos.mockResolvedValue([]);
    const events = await service.buildCitationEvents(
      { count: 1, patents: [patent({ assignees: [
        { assignee_organization: 'Acme Inc' }, { assignee_organization: 'Beta Corp' },
      ] })] },
      '111'
    );
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      start: '2014-01-01 00:00:00', number: '9446259', combined: '111_9446259',
    });
    expect(events[0].all_assignee).toEqual(['Acme Inc', 'Beta Corp']);
  });

  it('falls back to the patent date when there is no application date', async () => {
    repo.organisationLogos.mockResolvedValue([]);
    const [event] = await service.buildCitationEvents(
      { count: 1, patents: [patent({ application: [] })] },
      '111'
    );
    expect(event.start).toBe('2016-09-20 00:00:00');
  });

  it('names an individual assignee from their first and last name', async () => {
    repo.organisationLogos.mockResolvedValue([]);
    const [event] = await service.buildCitationEvents(
      { count: 1, patents: [patent({ assignees: [{
        assignee_organization: null,
        assignee_individual_name_first: 'Ada',
        assignee_individual_name_last: 'Lovelace',
      }] })] },
      '111'
    );
    expect(event.assignee).toBe('Ada Lovelace');
  });

  it('falls back to the inventors when nobody was assigned the patent', async () => {
    repo.assigneesForPatents.mockResolvedValue([]);
    repo.organisationLogos.mockResolvedValue([]);
    const [event] = await service.buildCitationEvents(
      { count: 1, patents: [patent({
        assignees: [], inventors: [{ inventor_name_first: 'Ada', inventor_name_last: 'Lovelace' }],
      })] },
      '111'
    );
    expect(event.assignee).toBe('Ada Lovelace');
  });

  it('fills a missing assignee from our own corpus', async () => {
    repo.assigneesForPatents.mockResolvedValue([{ grant_doc_num: '9446259', name: 'Found Co' }]);
    repo.organisationLogos.mockResolvedValue([]);

    const [event] = await service.buildCitationEvents(
      { count: 1, patents: [patent({ assignees: [], inventors: null })] },
      '111'
    );
    expect(repo.assigneesForPatents).toHaveBeenCalledWith(['9446259']);
    expect(event.assignee).toBe('Found Co');
    expect(event.all_assignee).toEqual(['Found Co']);
  });

  it('attaches a company logo, matched case-insensitively', async () => {
    repo.organisationLogos.mockResolvedValue([
      { organisation_name: 'ACME INC', logo_optimize: 'logos/acme.png', original_logo: '' },
    ]);
    const [event] = await service.buildCitationEvents({ count: 1, patents: [patent()] }, '111');
    expect(event.logo).toMatch(/logos\/acme\.png$/);
  });
});

describe('external.service.cacheCitations', () => {
  it('inserts only assignees it has not seen before', async () => {
    repo.knownAssignees
      .mockResolvedValueOnce([{ assignee_id: 1, assignee_organization: 'Acme Inc' }])
      .mockResolvedValueOnce([
        { assignee_id: 1, assignee_organization: 'Acme Inc' },
        { assignee_id: 2, assignee_organization: 'Beta Corp' },
      ]);

    await service.cacheCitations({
      patents: [{
        patent_id: '9446259',
        application: [{ app_date: '2014-01-01' }],
        assignees: [{ assignee_organization: 'Acme Inc' }, { assignee_organization: 'Beta Corp' }],
      }],
    }, '111');

    expect(repo.addAssignees).toHaveBeenCalledWith([
      { assignee_organization: 'Beta Corp', assignee_query: 'Beta Corp' },
    ]);
    expect(repo.addCitingPatents).toHaveBeenCalledWith([
      expect.objectContaining({ assignee_organization: 'Acme Inc', assignee_id: 1 }),
      expect.objectContaining({ assignee_organization: 'Beta Corp', assignee_id: 2 }),
    ]);
  });

  it('ignores citations filed before 2000', async () => {
    await service.cacheCitations({
      patents: [{
        patent_id: '9446259',
        application: [{ app_date: '1995-01-01' }],
        assignees: [{ assignee_organization: 'Old Co' }],
      }],
    }, '111');
    expect(repo.knownAssignees).not.toHaveBeenCalled();
  });

  it('does nothing for an empty response', async () => {
    await service.cacheCitations({ patents: [] }, '111');
    expect(repo.addAssignees).not.toHaveBeenCalled();
  });
});

describe('external.service.citations', () => {
  it('returns nothing when the patent is cited by nobody', async () => {
    clients.citationsOf.mockResolvedValue({ count: 0 });
    expect(await service.citations('9446259')).toEqual([]);
    expect(clients.patentDetails).not.toHaveBeenCalled();
  });

  it('still answers when the cache write fails', async () => {
    clients.citationsOf.mockResolvedValue({
      count: 1, us_patent_citations: [{ citation_patent_id: '8480554' }],
    });
    clients.patentDetails.mockResolvedValue({
      count: 1,
      patents: [{
        patent_id: '8480554', patent_title: 'X', patent_date: '2013-01-01',
        application: [{ app_date: '2011-01-01' }],
        assignees: [{ assignee_organization: 'Acme Inc' }],
      }],
    });
    repo.knownAssignees.mockRejectedValue(new Error('table is read only'));
    repo.organisationLogos.mockResolvedValue([]);

    const events = await service.citations('9446259');
    expect(events).toHaveLength(1);
  });
});

describe('external.sql.buildGrantNumberQuery', () => {
  const base = {
    layoutId: 15, companies: [9], tabs: [], customers: [], assignments: [], list: [],
    listIsComplete: false, otherMode: false, bankMode: false, orgId: 118, year: 2002,
  };

  const boundNames = (statement) => {
    const found = new Set();
    const re = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;
    let m = re.exec(statement);
    while (m) { found.add(m[1]); m = re.exec(statement); }
    return found;
  };

  const expectFullyBound = (built) => {
    const missing = [...boundNames(built.sql)]
      .filter((n) => !Object.prototype.hasOwnProperty.call(built.replacements, n));
    expect(missing).toEqual([]);
  };

  it('binds every parameter across the branch matrix', () => {
    [
      base,
      { ...base, listIsComplete: true, list: ['16123456'] },
      { ...base, listIsComplete: true, list: ['16123456'], layoutId: 33 },
      { ...base, layoutId: 33 },
      { ...base, layoutId: 33, customers: [7] },
      { ...base, layoutId: 33, bankMode: true },
      { ...base, otherMode: true },
      { ...base, tabs: [1, 6], customers: [7], assignments: [500] },
    ].forEach((input) => expectFullyBound(sql.buildGrantNumberQuery(input)));
  });

  it('reads the for-sale list in other mode', () => {
    const built = sql.buildGrantNumberQuery({ ...base, otherMode: true });
    expect(built.sql).toContain('assets_for_sale');
  });

  it('unions both grant indexes when the caller supplied the assets', () => {
    const built = sql.buildGrantNumberQuery({ ...base, listIsComplete: true, list: ['16123456'] });
    expect(built.sql).toContain('UNION');
    expect(built.sql).toContain('application_grant');
    // The layout is forced to 15 for that lookup.
    expect(built.replacements.layoutId).toBe(15);
  });

  it('reads the precomputed metrics above layout 15', () => {
    const built = sql.buildGrantNumberQuery({ ...base, layoutId: 33 });
    expect(built.sql).toContain('dashboard_items');
    expect(built.sql).not.toContain('db_new_application.assets AS assets');
  });

  it('wraps the metric query when narrowing by counterparty', () => {
    const built = sql.buildGrantNumberQuery({ ...base, layoutId: 33, customers: [7] });
    expect(built.sql).toContain('apt.assignor_and_assignee_id IN (:customers)');
    expect(built.sql.indexOf('dashboard_items')).toBeGreaterThan(built.sql.indexOf('documentid'));
  });

  it('narrows the utf8mb4 asset key so the db_uspto index survives', () => {
    const built = sql.buildGrantNumberQuery({ ...base, tabs: [1] });
    expect(built.sql).toContain('CONVERT(assets.appno_doc_num USING latin1)');
  });

  it('excludes employee assignments when no tab was chosen', () => {
    const built = sql.buildGrantNumberQuery({ ...base, tabs: [] });
    expect(built.sql).toContain('activity_id <> 10');
  });
});
