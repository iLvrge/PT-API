'use strict';

/**
 * Turning a set of assets into the year-by-year series the charts draw.
 *
 * Pure, so the shape of the series can be asserted without a database.
 */

const {
  PATENT_TERM_YEARS, DESIGN_TERM_YEARS, BAR_STYLE,
} = require('./events.constants');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const yearOf = (value) => {
  // new Date(null) is the epoch, not an error, so a missing date has to be
  // rejected before it is parsed — otherwise an asset with no filing date
  // draws a twenty-year term starting in 1970.
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getFullYear();
};

/**
 * The last year an asset is still alive.
 *
 * Twenty years from the filing date, or fifteen for a design patent - those
 * carry a leading D in the patent number (D123456) and have never run the full
 * utility term. A granted patent may also hold a term extension, recorded in
 * days, which is added on top; the original API read it from
 * db_patent_application_bibliographic.grant_extension and so does this.
 *
 * The term is added to the filing *date*, not the filing year, so an extension
 * only pushes the expiry into the next year when it actually crosses a new
 * year boundary.
 */
const expiryYear = ({ appno_date: filed, patent, extensionDays = 0 }) => {
  // new Date(null) is the epoch rather than an error, so a missing date has to
  // be rejected before it is parsed - the same trap yearOf guards against.
  if (filed === null || filed === undefined || filed === '') return null;
  const date = new Date(filed);
  if (Number.isNaN(date.getTime())) return null;

  const isDesign = typeof patent === 'string' && patent.includes('D');
  const end = new Date(date.getTime());
  end.setFullYear(end.getFullYear() + (isDesign ? DESIGN_TERM_YEARS : PATENT_TERM_YEARS));

  const extension = Number(extensionDays);
  if (Number.isFinite(extension) && extension > 0) {
    end.setTime(end.getTime() + extension * MS_PER_DAY);
  }
  return end.getFullYear();
};

/**
 * How many of the assets are alive in each year of their term.
 *
 * An asset counts from its filing year through to its expiry year, so the
 * series is the overlap of every asset's window. Each application is counted
 * once even if the selection lists it several times.
 */
const lifeSpan = (assets) => {
  const counts = new Map();
  const seen = new Set();

  assets.forEach((asset) => {
    const application = asset.application;
    if (!application || seen.has(application)) return;
    const start = yearOf(asset.appno_date);
    if (start === null) return;
    const end = expiryYear(asset);
    if (end === null) return;
    seen.add(application);

    for (let year = start; year <= end; year++) {
      counts.set(year, (counts.get(year) || 0) + 1);
    }
  });

  return [...counts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, count]) => ({ year, count }));
};

/**
 * The life-span chart's own table, which is not the same shape as the
 * abandonment charts' `yearlySeries`:
 *
 *  - four columns, the fourth an HTML tooltip role. The panel's column chart
 *    is configured for it, and a three-column table leaves every bar with the
 *    default tooltip.
 *  - only years from the current one onward. The chart answers "how many of
 *    these patents will still be alive in future years, if maintained", so the
 *    years already gone are dropped and what remains decays to zero. Charting
 *    the full history instead drew a hump over the past - the single most
 *    visible difference from production.
 *  - the final year is excluded, as the original loop's `i < max` did: that
 *    year is the tail where the last asset expires and its count is not a
 *    full year of life.
 *  - an empty result is `[]`, not a bare header row, which is what the panel
 *    checks before it renders anything at all.
 */
const lifeSpanTable = (rows, { currentYear = new Date().getFullYear() } = {}) => {
  const header = [
    'year',
    'count',
    { type: 'string', role: 'style' },
    { type: 'string', role: 'tooltip', p: { html: true } },
  ];
  if (!rows.length) return [];

  const years = rows.map((row) => Number(row.year)).filter(Number.isFinite);
  if (!years.length) return [];
  const max = Math.max(...years);

  const table = [header];
  rows.forEach(({ year, count }) => {
    const y = Number(year);
    if (!Number.isFinite(y) || y >= max || y < currentYear) return;
    table.push([y, count, BAR_STYLE, `Year: ${y}\nPatents Alive: ${count}`]);
  });

  return table.length > 1 ? table : [];
};

/**
 * A Google-Charts style table: a header row, then one row per year, with no
 * gaps between the first and last year that carry data.
 */
const yearlySeries = (rows, { valueKey = 'count', yearKey = 'year' } = {}) => {
  const table = [['year', 'count', { type: 'string', role: 'style' }]];
  if (!rows.length) return table;

  const byYear = new Map();
  rows.forEach((row) => {
    const year = Number(row[yearKey]);
    if (!Number.isFinite(year)) return;
    byYear.set(year, (byYear.get(year) || 0) + Number(row[valueKey] || 0));
  });
  if (!byYear.size) return table;

  const years = [...byYear.keys()];
  const min = Math.min(...years);
  const max = Math.max(...years);
  for (let year = min; year <= max; year++) {
    table.push([year, byYear.get(year) || 0, BAR_STYLE]);
  }
  return table;
};

module.exports = { lifeSpan, lifeSpanTable, yearlySeries, yearOf, expiryYear };
