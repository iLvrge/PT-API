'use strict';

/**
 * Turning a set of assets into the year-by-year series the charts draw.
 *
 * Pure, so the shape of the series can be asserted without a database.
 */

const { PATENT_TERM_YEARS, BAR_STYLE } = require('./events.constants');

const yearOf = (value) => {
  // new Date(null) is the epoch, not an error, so a missing date has to be
  // rejected before it is parsed — otherwise an asset with no filing date
  // draws a twenty-year term starting in 1970.
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getFullYear();
};

/**
 * How many of the assets are alive in each year of their term.
 *
 * An asset counts from its filing year through the twenty years of its term,
 * so the series is the overlap of every asset's window. Each application is
 * counted once even if the selection lists it several times.
 */
const lifeSpan = (assets) => {
  const counts = new Map();
  const seen = new Set();

  assets.forEach((asset) => {
    const application = asset.application;
    if (!application || seen.has(application)) return;
    const start = yearOf(asset.appno_date);
    if (start === null) return;
    seen.add(application);

    for (let year = start; year <= start + PATENT_TERM_YEARS; year++) {
      counts.set(year, (counts.get(year) || 0) + 1);
    }
  });

  return [...counts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, count]) => ({ year, count }));
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

module.exports = { lifeSpan, yearlySeries, yearOf };
