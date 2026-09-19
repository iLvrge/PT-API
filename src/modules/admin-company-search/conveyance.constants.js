'use strict';

/**
 * Conveyance types, as the admin console expects them.
 *
 * `CONVEYANCE_ORDINALS` is the console's own numbering: it posts an integer back
 * when a reviewer retypes a transaction, so the SQL maps the stored name to this
 * number and the response carries the map. The ordering is not alphabetical and
 * is not a sequence — it is the historical order the values were added in, and
 * changing it would silently retype existing transactions.
 */
const CONVEYANCE_ORDINALS = {
  assignment: 0,
  addresschg: 1,
  correct: 2,
  courtappointment: 3,
  courtorder: 4,
  employee: 5,
  govern: 6,
  license: 7,
  licenseend: 8,
  missing: 9,
  merger: 10,
  namechg: 11,
  option: 12,
  other: 13,
  partialassignment: 14,
  release: 15,
  restatedsecurity: 16,
  security: 17,
  correspondchange: 18,
  partialrelease: 19,
};

/** Every type the grid's filter offers. */
const CONVEYANCE_TYPES = [
  'assignment', 'addresschg', 'correspondchange', 'correct', 'courtappointment',
  'courtorder', 'employee', 'govern', 'license', 'licenseend', 'missing', 'merger',
  'namechg', 'option', 'other', 'partialassignment', 'partialrelease', 'release',
  'restatedsecurity', 'security',
].map((name) => ({ name, id: name }));

/** The shorter list the console offers when retyping a transaction. */
const CONVEYANCE_CHOICES = [
  'assignment', 'namechg', 'merger', 'other', 'security', 'correct',
  'missing', 'release', 'govern', 'employee', 'license',
].map((name) => ({ name }));

/** The CASE expression that turns the stored name into the console's number. */
const ordinalCase = (column) =>
  `CASE ${Object.entries(CONVEYANCE_ORDINALS)
    .map(([name, n]) => `WHEN ${column} = '${name}' THEN ${n}`)
    .join(' ')} ELSE '' END`;

module.exports = { CONVEYANCE_ORDINALS, CONVEYANCE_TYPES, CONVEYANCE_CHOICES, ordinalCase };
