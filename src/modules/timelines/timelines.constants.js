'use strict';

/**
 * Timeline conveyance groups. The standalone and filtered timelines colour
 * their points by which of these four buckets a recording falls into.
 */
const GROUPS = {
  0: { conveyTypes: ['assignment', 'employee'], employerAssign: 1, className: 'red' },
  1: { conveyTypes: ['assignment', 'merger'], employerAssign: 0, className: 'blue' },
  2: { conveyTypes: ['security', 'release'], employerAssign: 0, className: 'yellow' },
  3: { conveyTypes: ['namechg', 'govern', 'other', 'missing', 'correct'], employerAssign: 0, className: 'green' },
};

const GROUP_LABELS = ['Employee', 'Acquisition', 'Security', 'Other'];

// Points drawn on one standalone timeline before it stops being readable.
const POINT_LIMIT = 5000;

// The most rows a filtered window may hold before it is narrowed.
const WINDOW_ROW_LIMIT = 10000;

// Drill-down levels for /:organisation/:name/:depth/:groupId.
const DEPTH = { ORGANISATION: 0, PARTY: 1, TRANSACTION: 2, ASSET: 3 };
const DEPTH_CLASSNAMES = { 0: 'red', 1: 'blue', 2: 'orange', 3: 'green' };

const DEFAULT_LIMIT = 100;

module.exports = {
  GROUPS, GROUP_LABELS, POINT_LIMIT, WINDOW_ROW_LIMIT, DEPTH, DEPTH_CLASSNAMES, DEFAULT_LIMIT,
};
