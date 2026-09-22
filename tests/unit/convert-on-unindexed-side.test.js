'use strict';

/**
 * A converted column cannot be read through its index.
 *
 * db_new_application.assets is utf8mb4 and db_uspto.documentid is latin1, so
 * every join between them has to convert one side. Which side is not cosmetic:
 * the converted column loses its index, and MySQL then picks the *other* table
 * to drive from. Convert the side the query filters on and the plan is fine.
 * Convert the side it looks up and MySQL has no key to look it up by, so it
 * scans that table instead - and `assets` has 13.4M rows.
 *
 * Both queries below filter on db_uspto.documentid and look `assets` up, so
 * `assets.appno_doc_num` has to stay bare. Both used to convert it:
 *
 *   events.filingDates           12,630,621 estimated rows -> 105
 *   share.assetsForTransactions  12,630,621 -> 4, and the hash join disappears
 *
 * filingDates is the one users saw: the life-span panel posts the whole visible
 * grid, so a flat 90 seconds regardless of how many applications were asked for
 * (10 took as long as 100). The request never returned and the panel stayed
 * empty.
 *
 * This asserts the shape of the SQL the builders actually emit, with the db
 * layer mocked, so it needs no database. It is deliberately narrow: converting
 * `assets.appno_doc_num` is correct where `assets` is the filtered table - as in
 * assets.repository's applicationsForMetric, which filters on layout_id and
 * company_id - so this is not a blanket ban on the expression.
 */

jest.mock('../../src/db/query');

const q = require('../../src/db/query');
const events = require('../../src/modules/events/events.repository');
const share = require('../../src/modules/share/share.repository');

/** The SQL string handed to the db layer by a single builder call. */
const sqlFrom = (run) => {
  q.selectAll.mockClear();
  q.selectAll.mockReturnValue(Promise.resolve([]));
  run();
  expect(q.selectAll).toHaveBeenCalledTimes(1);
  return q.selectAll.mock.calls[0][1];
};

describe('CONVERT() goes on the side whose index is not needed', () => {
  /*
   * filingDates ended up not needing the join at all - nothing in the life-span
   * series comes from db_new_application.assets - so the fix there was to drop
   * it rather than to convert the other side. Pinning its absence keeps the
   * 13.4M-row table from being joined back in for a column the chart does not
   * read.
   */
  it('events.filingDates does not join the 13.4M-row assets table', () => {
    const sql = sqlFrom(() => events.filingDates(['13456789'], 2000));

    expect(sql).not.toMatch(/db_new_application\.assets\b/i);
    expect(sql).not.toMatch(/CONVERT\(/i);
    // It filters on documentid's own indexed column instead.
    expect(sql).toMatch(/documentid\.appno_doc_num\s+IN\s*\(:applications\)/i);
  });

  /*
   * The divested exclusion is an anti-join, not a membership test. The original
   * fetched every divested application number and passed them as
   * `NOT IN (:divestedList)`; both that and `NOT IN (SELECT ...)` are banned
   * here - one grows an IN clause per divested asset, the other materialises
   * dashboard_items before a single row can be tested.
   */
  it('events.filingDates excludes divested assets by anti-join, never NOT IN', () => {
    const sql = sqlFrom(() => events.filingDates(['13456789'], 2000, {
      excludeDivested: true, companies: [859],
    }));

    expect(sql).toMatch(/LEFT JOIN\s+db_new_application\.dashboard_items\s+AS\s+divested/i);
    expect(sql).toMatch(/divested\.application\s+IS\s+NULL/i);
    expect(sql).not.toMatch(/NOT\s+IN/i);
    // The CONVERT() is on documentid, so dashboard_items keeps its index on
    // (application, type, organisation_id, representative_id).
    expect(sql).not.toMatch(/CONVERT\(\s*divested\.application/i);
    expect(sql).toMatch(/divested\.application\s*=\s*CONVERT\(\s*documentid\.appno_doc_num/i);
  });

  it('events.filingDatesFallback needs no CONVERT at all for that anti-join', () => {
    const sql = sqlFrom(() => events.filingDatesFallback(['13456789'], 2000, {
      excludeDivested: true, companies: [859],
    }));

    // application_grant.appno_doc_num and dashboard_items.application are both
    // utf8mb4_general_ci, so neither side has to be converted.
    expect(sql).toMatch(/divested\.application\s*=\s*ag\.appno_doc_num/i);
    expect(sql).not.toMatch(/CONVERT\(/i);
    expect(sql).not.toMatch(/NOT\s+IN/i);
  });

  it('adds no join at all when nothing is being excluded', () => {
    const sql = sqlFrom(() => events.filingDates(['13456789'], 2000));
    expect(sql).not.toMatch(/dashboard_items/i);
  });

  it('share.assetsForTransactions leaves assets.appno_doc_num bare', () => {
    const sql = sqlFrom(() => share.assetsForTransactions([12345]));

    expect(sql).not.toMatch(/CONVERT\(\s*assets\.appno_doc_num/i);
    expect(sql).toMatch(/assets\.appno_doc_num\s*=\s*CONVERT\(\s*doc\.appno_doc_num/i);
  });
});
