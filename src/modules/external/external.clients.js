'use strict';

/**
 * Outbound clients for the two public patent APIs.
 *
 * The legacy code used request-promise with `strictSSL: false`, which disabled
 * certificate verification on every call. These use fetch with verification
 * left on, a timeout, and errors that say which API failed.
 */

const { env } = require('../../config/env');
const ApiError = require('../../utils/api-error');

const withTimeout = async (url, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.external.timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const getJson = async (url, options, apiName) => {
  const res = await withTimeout(url, options);
  if (!res.ok) throw new Error(`${apiName} responded ${res.status}`);
  return res.json();
};

/* ------------------------------------------------------------------- PTAB */

const ptabUrl = (resource, params) =>
  `${env.external.ptabUrl.replace(/\/proceedings$/, '')}/${resource}?${new URLSearchParams(params)}`;

/** Proceedings recorded against one application number. */
const ptabProceedings = (applicationNumber) =>
  getJson(ptabUrl('proceedings', { applicationNumberText: applicationNumber }), {}, 'PTAB');

/** One PTAB document, as bytes. */
const ptabDocument = async (identifier) => {
  const url = ptabUrl(`documents/${encodeURIComponent(identifier)}/download`, {});
  const res = await withTimeout(url, { headers: { accept: 'application/octet-stream' } });
  if (!res.ok) throw ApiError.notFound('That PTAB document is not available');
  return Buffer.from(await res.arrayBuffer());
};

/* ------------------------------------------------------------ PatentsView */

const PATENTSVIEW = 'https://search.patentsview.org/api/v1';

const patentsViewHeaders = () => {
  const key = env.external.patentsViewApiKey;
  if (!key) throw ApiError.internal('The PatentsView API key is not configured');
  return { 'X-Api-Key': key };
};

/** Patents citing the given patent. */
const citationsOf = (patentId) => {
  const url = `${PATENTSVIEW}/patent/us_patent_citation/?`
    + `q=${encodeURIComponent(JSON.stringify({ patent_id: patentId }))}`
    + `&o=${encodeURIComponent(JSON.stringify({ page: 1, per_page: 10000 }))}`;
  return getJson(url, { headers: patentsViewHeaders() }, 'PatentsView');
};

const PATENT_FIELDS = [
  'inventors.inventor_name_first', 'inventors.inventor_name_last',
  'assignees.assignee_id', 'assignees.assignee_organization',
  'assignees.assignee_individual_name_first', 'assignees.assignee_individual_name_last',
  'applicants.applicant_name_first', 'applicants.applicant_name_last',
  'application.filing_date', 'patent_id', 'patent_date', 'patent_title',
];

/** Detail for a set of patent numbers. */
const patentDetails = (patentIds) => {
  const url = `${PATENTSVIEW}/patent/?`
    + `q=${encodeURIComponent(JSON.stringify({ patent_id: patentIds }))}`
    + `&f=${encodeURIComponent(JSON.stringify(PATENT_FIELDS))}`;
  return getJson(url, { headers: patentsViewHeaders() }, 'PatentsView');
};

module.exports = { ptabProceedings, ptabDocument, citationsOf, patentDetails, PATENT_FIELDS };
