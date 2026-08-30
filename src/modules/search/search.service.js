'use strict';

const repository = require('./search.repository');

/**
 * Search transactions by counterparty name, recording correspondent, or asset
 * number. The three sources are queried in parallel (the legacy helper ran them
 * one after another) and de-duplicated by rf_id, first match winning.
 */
const transactions = async (searchString) => {
  const numeric = searchString !== '' && !Number.isNaN(Number(searchString));

  const [parties, correspondents, documents] = await Promise.all([
    repository.byParty(searchString, numeric),
    repository.byCorrespondent(searchString),
    repository.byDocument(searchString, numeric),
  ]);

  const seen = new Set();
  const list = [];
  [...parties, ...correspondents, ...documents].forEach((row) => {
    if (seen.has(row.rf_id)) return;
    seen.add(row.rf_id);
    list.push(row);
  });

  return { list, total_records: list.length, txn_ids: [...seen] };
};

module.exports = { transactions };
