'use strict';

/** Split an array into fixed-size batches. Used to cap IN (...) list lengths. */
const chunk = (items, size) => {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/**
 * Group rows into a Map keyed by `key(row)`. The workhorse for collapsing the
 * legacy per-row queries into one grouped read.
 */
const groupBy = (rows, key) => {
  const map = new Map();
  rows.forEach((row) => {
    const k = key(row);
    const bucket = map.get(k);
    if (bucket) bucket.push(row);
    else map.set(k, [row]);
  });
  return map;
};

module.exports = { chunk, groupBy };
