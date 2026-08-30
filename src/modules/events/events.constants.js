'use strict';

/**
 * Maintenance-fee event codes, grouped by which of the three payment windows
 * they belong to. A patent's fees fall due at 3.5, 7.5 and 11.5 years; each
 * window has a reminder (…551), a surcharge (…552) and an expiry (…553) code,
 * and the leading digit is the entity size (large, small, micro).
 */
const FIRST_WINDOW = ['M1551', 'M2551', 'M3551'];
const SECOND_WINDOW = ['M1552', 'M2552', 'M3552'];
const THIRD_WINDOW = ['M1553', 'M2553', 'M3553'];
const ALL_WINDOWS = [...FIRST_WINDOW, ...SECOND_WINDOW, ...THIRD_WINDOW];

/** Which window a code belongs to, or null. */
const windowOf = (code) => {
  if (FIRST_WINDOW.includes(code)) return 1;
  if (SECOND_WINDOW.includes(code)) return 2;
  if (THIRD_WINDOW.includes(code)) return 3;
  return null;
};

/** The USPTO status strings that mean an application or patent is dead. */
const ABANDONED_STATUSES = [
  'Patent Expired Due to NonPayment of Maintenance Fees Under 37 CFR 1.362',
  'Provisional Application Expired',
  'Final Rejection Mailed',
  'Expressly Abandoned  --  During Publication Process',
  'Expressly Abandoned  --  During Examination',
  "Abandoned  --  After Examiner's Answer or Board of Appeals Decision",
  'Abandoned  --  Failure to Pay Issue Fee',
  'Abandoned  --  File-Wrapper-Continuation Parent Application',
  'Abandoned  --  Failure to Respond to an Office Action',
  'Abandoned  --  Incomplete (Filing Date Under Rule 53 (b) - PreExam)',
  'Abandoned  --  Incomplete Application (Pre-examination)',
  'Abandonment for Failure to Correct Drawings/Oath/NonPub Request',
];

// The style the charting client expects on every bar.
const BAR_STYLE = 'stroke-width:1;stroke-color:#2196f3;fill-color:#1565C0;';

// A US patent runs twenty years from its filing date.
const PATENT_TERM_YEARS = 20;

// The code marking an event that has not been recorded with the USPTO yet.
const TO_RECORD_EVENT_CODE = '13';

// Expiry shows as this code in the maintenance table.
const EXPIRY_CODES = ['EXP.'];

module.exports = {
  FIRST_WINDOW,
  SECOND_WINDOW,
  THIRD_WINDOW,
  ALL_WINDOWS,
  windowOf,
  ABANDONED_STATUSES,
  BAR_STYLE,
  PATENT_TERM_YEARS,
  TO_RECORD_EVENT_CODE,
  EXPIRY_CODES,
};
