'use strict';

// Patent families and the readable content of the documents themselves.

const h = require('../helpers');

const E = h.AUTH_ERRORS;
const assetParam = (name, description) =>
  h.pathParam(name, description, { type: 'string', pattern: '^[A-Za-z0-9]+$', example: '9446259' });
const counterParam = h.queryParam(
  'counter',
  'Present at all: return just the count as text/plain.',
  { type: 'string' }
);

const content = (summary, description, ok) => ({
  get: h.operation({
    tag: 'Family',
    summary,
    description,
    params: [assetParam('applicationNumber', 'Application or patent number.')],
    ok,
    errors: E,
    extraResponses: { 404: h.errorResponse('No document for that asset.') },
  }),
});

module.exports = {
  '/family/list/{grantNumber}': {
    get: h.operation({
      tag: 'Family',
      summary: 'The worldwide family of a granted patent',
      description:
        'Fetched from the EPO and cached on disk. Each member carries its legal-event history.',
      params: [assetParam('grantNumber', 'Granted patent number.'), counterParam],
      ok: h.listResponse('Family members.'),
      errors: E,
    }),
  },
  '/family/{applicationNumber}': {
    get: h.operation({
      tag: 'Family',
      summary: 'The worldwide family of any asset',
      description:
        'Resolves the number to whatever we hold — grant, publication or application — and asks '
        + 'the EPO for that reference.',
      params: [assetParam('applicationNumber', 'Application or patent number.'), counterParam],
      ok: h.listResponse('Family members.'),
      errors: E,
    }),
  },
  '/family/abstract/{applicationNumber}': content(
    "An asset's abstract",
    'Read from the USPTO bulk XML on disk.',
    h.jsonResponse('The abstract.', {
      type: 'object', properties: { abstract: { type: 'string' } },
    })
  ),
  '/family/claims/{applicationNumber}': content(
    "An asset's claims",
    'Returned as markup, with claim tags rewritten to plain divs and spans for rendering.',
    h.listResponse('Claim blocks.', { type: 'object', properties: { text: { type: 'string' } } })
  ),
  '/family/specifications/{applicationNumber}': content(
    "An asset's description",
    'Returned as markup, for rendering.',
    h.listResponse('Description blocks.', { type: 'object', properties: { text: { type: 'string' } } })
  ),
  '/family/images/{applicationNumber}': content(
    "An asset's drawings",
    'Each drawing is returned with the bulk delivery batch it belongs to, which is needed to '
    + 'build its URL.',
    h.listResponse('Drawings.', {
      type: 'object',
      properties: { file: { type: 'string' }, batch: { type: 'string', nullable: true } },
    })
  ),
  '/family/single/{applicationNumber}': {
    get: h.operation({
      tag: 'Family',
      summary: 'Everything about one asset in a single call',
      description:
        'The family, abstract, claims, description and drawings together. Each part degrades to '
        + 'empty on its own rather than failing the whole response.',
      params: [assetParam('applicationNumber', 'Application or patent number.')],
      ok: h.objectResponse('Family, abstract, claims, specification and images.'),
      errors: E,
    }),
  },
};
