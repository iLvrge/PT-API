'use strict';

/**
 * Turns an EPO OPS family document into the flat member list the client draws.
 *
 * Pure: takes the parsed XML object and returns the members, so the shape of a
 * real OPS response can be asserted without a network call.
 *
 * The legal-event block appears twice in the source XML — once when a member
 * carries a single event and once when it carries several — and the legacy code
 * had two near-identical copies of the extraction. It is one function here.
 */

// EPO numbers each field of a legal event rather than naming it.
const LEGAL_FIELDS = {
  'ops:L001EP': 'country_code',
  'ops:L002EP': 'filling_published_doc',
  'ops:L003EP': 'document_number',
  'ops:L004EP': 'kind_code',
  'ops:L005EP': 'ipr_type',
  'ops:L007EP': 'gazette_date',
  'ops:L008EP': 'legal_event_code',
  'ops:L018EP': 'date_last_exchanged',
  'ops:L019EP': 'date_first_exchanged',
};

// The sub-fields of a legal event's free-text block.
const LESP_FIELDS = [
  'ops:L501EP', 'ops:L502EP', 'ops:L503EP',
  'ops:L504EP', 'ops:L505EP', 'ops:L506EP', 'ops:L507EP',
];

const firstValue = (node, key) => {
  const field = node[key];
  if (!Array.isArray(field) || !field.length) return '';
  return field[0]._ === undefined ? '' : field[0]._;
};

const lespEntries = (legalItem) => {
  const entries = [];
  const blocks = legalItem['ops:L500EP'];
  if (!Array.isArray(blocks)) return entries;

  blocks.forEach((block) => {
    LESP_FIELDS.forEach((field) => {
      if (!block[field] || !block[field][0]) return;
      entries.push({ desc: block[field][0].$.desc, data: block[field][0]._ });
    });
  });
  return entries;
};

/** One legal event. */
const legalEvent = (legalItem) => {
  const preLine = [];
  const pre = legalItem['ops:pre'];
  if (Array.isArray(pre)) pre.forEach((line) => preLine.push(line._));
  else if (pre) preLine.push(pre._);

  const event = { code: legalItem.$.code, desc: legalItem.$.desc, preLine };
  Object.entries(LEGAL_FIELDS).forEach(([key, name]) => {
    event[name] = firstValue(legalItem, key);
  });
  event.lespList = lespEntries(legalItem);
  return event;
};

const legalEvents = (member) => {
  const legal = member['ops:legal'];
  if (!legal) return [];
  return (Array.isArray(legal) ? legal : [legal]).map(legalEvent);
};

/**
 * The publication reference, preferring the DOCDB form. Members that only have
 * an application reference (nothing granted yet) fall back to that.
 */
const documentId = (member, preferApplication) => {
  if (preferApplication) {
    const application = member['application-reference'];
    return application && application[0]['document-id'][0];
  }
  const ids = member['publication-reference'][0]['document-id'];
  const docdb = ids.find((id) => id.$ && id.$['document-id-type'] === 'docdb');
  return docdb || ids[0];
};

const text = (node, key) => {
  const value = node && node[key];
  if (value === undefined || value === null) return '';
  return Array.isArray(value) ? String(value[0]) : String(value);
};

/** Every family member, as returned by OPS. */
const familyMembers = (xml) => {
  const world = xml && xml['ops:world-patent-data'];
  if (!world || !world['ops:patent-family']) return [];
  const family = world['ops:patent-family'][0];
  return (family && family['ops:family-member']) || [];
};

/**
 * @param {object} xml the parsed OPS document
 * @param {object} options
 * @param {string} options.asset the number the caller asked about
 * @param {boolean} options.useApplicationReference the asset has no grant number
 * @param {string} options.title the title we hold for the asset
 * @returns {Array} the members sharing the asset's family
 */
const parseFamily = (xml, { asset, useApplicationReference = false, title = '' } = {}) => {
  const members = familyMembers(xml);
  if (!members.length) return [];

  // First pass: find the family the caller's asset belongs to.
  let familyId = 0;
  members.forEach((member) => {
    if (familyId !== 0) return;
    const id = documentId(member, useApplicationReference);
    if (id && text(id, 'doc-number') === String(asset)) familyId = member.$['family-id'];
  });
  if (!familyId) return [];

  // Second pass: collect that family's members.
  const out = [];
  const seenApplicationDates = new Set();

  members.forEach((member) => {
    if (member.$['family-id'] !== familyId) return;

    const id = documentId(member, useApplicationReference);
    if (!id) return;
    const application = member['application-reference'][0]['document-id'][0];
    const applicationDate = text(application, 'date');
    const applicationNumber = text(application, 'doc-number');

    let legal = legalEvents(member);

    if (seenApplicationDates.has(applicationDate)) {
      // A second publication of the same application: a granted one (kind B)
      // supersedes the earlier entry, inheriting its legal events.
      if (text(id, 'kind').toLowerCase().includes('b')) {
        const index = out.findIndex((row) => row.application_number === applicationNumber);
        if (index !== -1) {
          if (!legal.length) legal = out[index].legal;
          out.splice(index, 1);
        }
      }
    } else {
      seenApplicationDates.add(applicationDate);
    }

    out.push({
      family_id: familyId,
      patent_number: text(id, 'doc-number'),
      publication_number: text(id, 'doc-number'),
      application_number: applicationNumber,
      application_date: applicationDate,
      publication_date: text(id, 'date'),
      application_country: text(id, 'country'),
      publication_country: text(id, 'country'),
      publication_kind: text(id, 'kind'),
      application_kind: text(application, 'kind'),
      classifications: null,
      assigments: null,
      images: null,
      abstracts: null,
      specification: null,
      claims: null,
      inventors: null,
      assignee: null,
      applicants: [],
      title,
      legal,
    });
  });

  return out;
};

module.exports = { parseFamily, legalEvent, legalEvents, documentId, familyMembers, LEGAL_FIELDS };
