'use strict';

/**
 * The two public patent APIs: USPTO PTAB proceedings, and PatentsView
 * citations. Both are slow and rate limited, so citation results are cached
 * back into the local tables as they arrive.
 */

const crypto = require('crypto');
const { env } = require('../../config/env');
const logger = require('../../utils/logger');
const { findLayout } = require('../../shared/layouts');
const clients = require('./external.clients');
const repository = require('./external.repository');

const yearFloor = () => new Date().getFullYear() - 24;

// Assignments recorded before 2000 are too old to be useful citation context.
const CITATION_YEAR_FLOOR = 1999;

/* ------------------------------------------------------------------- PTAB */

/** PTAB proceedings for one application number, as timeline events. */
const ptabEvents = async (asset) => {
  // Clients pass "US16123456"; the API wants the bare number.
  const applicationNumber = /^us/i.test(asset) ? asset.slice(2) : asset;

  let body;
  try {
    body = await clients.ptabProceedings(applicationNumber);
  } catch (err) {
    logger.warn('PTAB proceedings lookup failed', { asset, error: err.message });
    return [];
  }

  return (body.results || []).map((item) => ({
    id: crypto.randomUUID(),
    start: `${item.proceedingFilingDate} 00:00:00`,
    end: `${item.proceedingLastModifiedDate} 00:00:00`,
    name: `${item.respondentPartyName} / ${item.appellantPartyName}`,
    status: item.proceedingStatusCategory,
    otherInfo: item,
  }));
};

const ptabDocument = (identifier) => clients.ptabDocument(identifier);

/* -------------------------------------------------- citation cache writes */

/** The display name of an assignee row, organisation or individual. */
const assigneeName = (row) => {
  if (row.assignee_organization) return row.assignee_organization;
  if (row.assignee_individual_name_first && row.assignee_individual_name_last) {
    return `${row.assignee_individual_name_first} ${row.assignee_individual_name_last}`;
  }
  return null;
};

const applicationDate = (patent) => {
  const app = patent.application && patent.application[0];
  return (app && app.app_date) || patent.patent_date;
};

/**
 * Write newly seen assignees, cited patents and citing links back to the local
 * tables so the next lookup for this asset does not need the API.
 */
const cacheCitations = async (body, assetNumber) => {
  const patents = Array.isArray(body.patents) ? body.patents : [];
  if (!patents.length) return;

  const links = [];
  const names = new Set();

  patents.forEach((patent) => {
    (patent.assignees || []).forEach((row) => {
      if (!row.assignee_organization) return;
      const appDate = applicationDate(patent) || '0000-00-00';
      if (new Date(appDate).getFullYear() <= CITATION_YEAR_FLOOR) return;
      names.add(row.assignee_organization);
      links.push({
        patent_number: assetNumber,
        citing_patent_number: patent.patent_id,
        assignee_organization: row.assignee_organization,
        app_date: appDate,
        assignee_id: 0,
      });
    });
  });

  if (!names.size) return;

  const allNames = [...names];
  const known = await repository.knownAssignees(allNames);
  const knownLower = new Set(known.map((row) => row.assignee_organization.toLowerCase()));

  const unseen = allNames.filter((name) => !knownLower.has(name.toLowerCase()));
  if (unseen.length) {
    await repository.addAssignees(
      unseen.map((name) => ({ assignee_organization: name, assignee_query: name }))
    );
  }

  // Re-read so the rows inserted just now also carry ids.
  const resolved = unseen.length ? await repository.knownAssignees(allNames) : known;
  if (!resolved.length) return;

  const idByName = new Map(
    resolved.map((row) => [row.assignee_organization.toLowerCase(), row.assignee_id])
  );

  await repository.addCitedPatents(
    resolved.map((row) => ({ patent_number: assetNumber, assignee_id: row.assignee_id }))
  );
  await repository.addCitingPatents(
    links.map((link) => ({
      ...link,
      assignee_id: idByName.get(link.assignee_organization.toLowerCase()) || 0,
    }))
  );
};

/* ------------------------------------------------- citation event assembly */

const citationEvent = ({ patent, assignee, allAssignee, appDate, asset }) => ({
  id: crypto.randomUUID(),
  start: appDate,
  end: appDate,
  title: patent.patent_title,
  number: patent.patent_id,
  combined: `${asset}_${patent.patent_id}`,
  logo: '',
  assignee,
  all_assignee: allAssignee,
});

/**
 * Turn a PatentsView detail response into citation timeline events, filling in
 * assignees we know locally but the API did not return, and attaching logos.
 */
const buildCitationEvents = async (body, asset) => {
  if (!body || body.count === 0 || !Array.isArray(body.patents)) return [];

  const events = [];
  const allAssignees = [];
  const individuals = [];
  const missing = [];

  body.patents.forEach((patent) => {
    let names = (patent.assignees || []).map(assigneeName).filter(Boolean);

    // Nobody was assigned it: fall back to the inventors, who are individuals.
    if (!names.length && Array.isArray(patent.inventors)) {
      names = patent.inventors.map((row) => `${row.inventor_name_first} ${row.inventor_name_last}`);
      individuals.push(...names);
    } else {
      (patent.assignees || []).forEach((row) => {
        if (row.assignee_organization === '') {
          const name = assigneeName(row);
          if (name) individuals.push(name);
        }
      });
    }

    const appDate = `${applicationDate(patent)} 00:00:00`;
    if (names.length) {
      allAssignees.push(...names);
      names.forEach((assignee) =>
        events.push(citationEvent({ patent, assignee, allAssignee: names, appDate, asset })));
    } else {
      missing.push(patent.patent_id);
      events.push(citationEvent({ patent, assignee: '', allAssignee: [], appDate, asset }));
    }
  });

  // Some citing patents have no assignee in the API but do in our own corpus.
  if (missing.length) {
    const found = await repository.assigneesForPatents(missing);
    found.forEach((row) => {
      const event = events.find((e) => e.number === row.grant_doc_num);
      if (!event) return;
      event.assignee = row.name;
      event.all_assignee = [...event.all_assignee, row.name];
      allAssignees.push(row.name);
    });
  }

  if (allAssignees.length) {
    const logos = await repository.organisationLogos([...new Set(allAssignees)]);
    const logoByName = new Map(
      logos.map((row) => [
        row.organisation_name.toLowerCase(),
        `${env.external.staticFilesUrl}/${(row.original_logo || row.logo_optimize || '').replace(/^\//, '')}`,
      ])
    );
    const individualSet = new Set(individuals.map((name) => name.toLowerCase()));

    events.forEach((event) => {
      if (!event.assignee) return;
      const key = event.assignee.toLowerCase();
      if (logoByName.has(key)) event.logo = logoByName.get(key);
      else if (individualSet.has(key)) event.logo = `${env.external.staticFilesUrl}/images/psychology.svg`;
    });
  }

  return events;
};

/** GET /citation/:asset — who cites this patent. */
const citations = async (asset) => {
  const citationData = await clients.citationsOf(asset);
  if (!citationData.count) return [];

  const citingIds = (citationData.us_patent_citations || []).map((c) => c.citation_patent_id);
  if (!citingIds.length) return [];

  const details = await clients.patentDetails(citingIds);
  // Caching is best effort: a write failure must not lose the response.
  await cacheCitations(details, asset).catch((err) =>
    logger.warn('citation cache write failed', { asset, error: err.message }));

  return buildCitationEvents(details, asset);
};

/** POST /citation — the companies citing a whole portfolio selection. */
const portfolioCitations = async (input) => {
  const {
    list, total, type, companies, tabs, customers, assignments,
    otherMode, bankMode, orgId, start, end, countOnly,
  } = input;

  if (!list.length && total === 0) return [];

  const patents = await repository.grantNumbers({
    layoutId: type === undefined ? 15 : findLayout(type),
    companies,
    tabs,
    customers,
    assignments,
    list,
    listIsComplete: total === list.length,
    otherMode,
    bankMode,
    orgId,
    year: yearFloor(),
  });

  if (!patents.length) return [];
  return repository.citingCompanies({ patents, start, end, limited: !countOnly });
};

module.exports = {
  ptabEvents,
  ptabDocument,
  citations,
  portfolioCitations,
  buildCitationEvents,
  cacheCitations,
  assigneeName,
  applicationDate,
};
