'use strict';

// Box styling per transaction role. Two entries share id 3 (Security and
// Release) because they render identically; lookups are by `type`, not id.
const BOX_STYLES = [
  { id: 1, segment: 0, border_color: '#363636', border_px: '1', background_color: '#222222', dimension: '100x30', type: 'Inventor', shape: 'rectangle' },
  { id: 2, segment: 1, border_color: '#363636', border_px: '1', background_color: '#222222', dimension: '100x30', type: 'Ownership', shape: 'rectangle' },
  { id: 3, segment: 2, border_color: '#363636', border_px: '1', background_color: '#222222', dimension: '100x30', type: 'Security', shape: 'rectangle' },
  { id: 3, segment: 2, border_color: '#363636', border_px: '1', background_color: '#222222', dimension: '100x30', type: 'Release', shape: 'rectangle' },
  { id: 4, segment: 3, border_color: '#363636', border_px: '1', background_color: '#222222', dimension: '100x30', type: 'Licenses', shape: 'rectangle' },
  { id: 5, segment: 3, border_color: '#363636', border_px: '1', background_color: '#222222', dimension: '100x30', type: '3rdParties', shape: 'rectangle' },
];

// Connector styling per conveyance type. line_type 1 renders dashed.
const LINE_STYLES = [
  { id: 2, name: 'Ownership', tooltip: 'Ownership', color: '#E60000', line_type: 0, segment: 1, order_no: 1, explanation: '' },
  { id: 3, name: 'Name Change', tooltip: 'Name Change', color: '#2493f2', line_type: 0, segment: 1, order_no: 2, explanation: '' },
  { id: 4, name: 'Security', tooltip: 'Security', color: '#ffaa00', line_type: 0, segment: 2, order_no: 3, explanation: '' },
  { id: 5, name: 'License', tooltip: 'License', color: '#E6E600', line_type: 0, segment: 2, order_no: 4, explanation: '' },
  { id: 7, name: 'Release', tooltip: 'Release', color: '#70A800', line_type: 0, segment: 3, order_no: 5, explanation: '' },
  { id: 8, name: 'License End', tooltip: 'License End', color: '#E38B4F', line_type: 0, segment: 1, order_no: 6, explanation: '' },
  { id: 9, name: 'Correct', tooltip: 'Correct', color: '#FFFFFF', line_type: 1, segment: 1, order_no: 7, explanation: '' },
  { id: 9, name: 'Partial Release', tooltip: 'Partial Release', color: '#70A800', line_type: 1, segment: 3, order_no: 8, explanation: '' },
];

const BOX_MENU = {
  border_color: ['#e8665d', '#e8a41c', '#c1ed0e', '#ed0e2f'],
  background_color: ['#fae3e3', '#f5f5d7', '#d7f0f5', '#f5d7dc'],
};

// Conveyance code -> how each part of the diagram renders it.
//   assignorBox / assigneeBox : which BOX_STYLES entry supplies the colours
//   boxLabel                  : the assignee box's own `type` label
//   line                      : the connector's LINE_STYLES entry
// They are not all the same value: a partial release draws the assignor as an
// ownership box but the assignee as a release box, and a correction draws an
// ownership box with a "Correct" connector. This mirrors the three separate
// if-chains in the legacy createJSON.
const CONVEYANCE = {
  security: { assignorBox: 'Security', assigneeBox: 'Security', boxLabel: 'Security', line: 'Security' },
  release: { assignorBox: 'Release', assigneeBox: 'Release', boxLabel: 'Release', line: 'Release' },
  partialrelease: { assignorBox: 'Ownership', assigneeBox: 'Release', boxLabel: 'Partial Release', line: 'Partial Release' },
  namechg: { assignorBox: 'Ownership', assigneeBox: 'Ownership', boxLabel: 'Name Change', line: 'Name Change' },
  assignment: { assignorBox: 'Ownership', assigneeBox: 'Ownership', boxLabel: 'Ownership', line: 'Ownership' },
  correct: { assignorBox: 'Ownership', assigneeBox: 'Ownership', boxLabel: 'Ownership', line: 'Correct' },
};
const DEFAULT_CONVEYANCE = {
  assignorBox: 'Ownership', assigneeBox: 'Ownership', boxLabel: 'Ownership', line: 'Ownership',
};

// Where recorded assignment PDFs are served from. status 1 means we mirrored
// the document to our CDN; otherwise it is linked at the USPTO.
const CDN_URL = 'https://s3-us-west-1.amazonaws.com/static.patentrack.com/assignments/var/www/html/beta/resources/shared/data/';
const USPTO_URL = 'https://legacy-assignments.uspto.gov/assignments/';

module.exports = { BOX_STYLES, LINE_STYLES, BOX_MENU, CONVEYANCE, DEFAULT_CONVEYANCE, CDN_URL, USPTO_URL };
