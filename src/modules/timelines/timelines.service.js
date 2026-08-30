'use strict';

const ApiError = require('../../utils/api-error');
const { ymd, plusDays } = require('../../utils/dates');
const assignmentData = require('../../shared/assignment-data');
const repository = require('./timelines.repository');
const windows = require('./timelines.window');
const {
  GROUPS, GROUP_LABELS, DEPTH, DEPTH_CLASSNAMES, DEFAULT_LIMIT,
} = require('./timelines.constants');

/** GET / — the caller's recorded transactions. */
const list = ({ orgId, from, to, companies, tabs, parties, limit, offset }) =>
  repository.list({
    orgId,
    from: from ? ymd(from) : null,
    // The end of the range is exclusive of nothing: a whole final day is
    // included by moving the bound forward one day, as the legacy did.
    to: to ? ymd(plusDays(to, 1)) : null,
    companies,
    tabs,
    parties,
    limit,
    offset,
  });

/** GET /item/:rfId — the parties on one transaction, without its properties. */
const item = (rfId) => assignmentData.byRfId(rfId, false);

/** GET /standalone/:groupId — every point in one conveyance group. */
const standalone = async ({ orgId, groupId }) => {
  const group = GROUPS[groupId];
  if (!group) return { items: [], className: '' };
  const items = await repository.groupPoints({
    orgId, conveyTypes: group.conveyTypes, employerAssign: group.employerAssign,
  });
  return { items, className: group.className };
};

/** GET /:groupId — every point on one activity tab. */
const byTab = async ({ orgId, tab }) => {
  // Tab 8 holds employee assignments, where only the surname is drawn.
  const truncateNames = Number(tab) === 8;
  const items = await repository.tabPoints({ orgId, tab, truncateNames });
  return { className: truncateNames ? 'red' : '', items };
};

/**
 * Split the rows of a window into assignor / assignee buckets, and find the
 * date range they span. Rows repeat per party, so the first row for each
 * transaction defines the bucket and the extent.
 */
const summarise = (rows) => {
  const seen = new Set();
  const items = [];
  const assignors = [];
  const assignees = [];
  const firstAssignors = [];
  const firstAssignees = [];
  let minDate = '';
  let maxDate = '';

  rows.forEach((row) => {
    const isAssignor = row.type === 'Assignor';
    const rfId = Number(row.rf_id);
    if (!seen.has(rfId)) {
      seen.add(rfId);
      (isAssignor ? firstAssignors : firstAssignees).push(row);
      items.push(row);
      const at = row.exec_dt ? new Date(row.exec_dt).getTime() : '';
      if (at > 0) {
        maxDate = maxDate === '' || at > maxDate ? at : maxDate;
        minDate = minDate === '' || at < minDate ? at : minDate;
      }
    }
    (isAssignor ? assignors : assignees).push(row);
  });

  return { items, assignors, assignees, firstAssignors, firstAssignees, minDate, maxDate };
};

/**
 * The two filtered timelines. They differ only in projection and response
 * shape; the window search and bucketing are the same.
 */
const filtered = async ({ orgId, groupId, from, to, scrollRight, fetch }) => {
  const group = GROUPS[groupId];
  if (!group) return { summary: summarise([]), className: '' };

  const scope = {
    orgId, conveyTypes: group.conveyTypes, employerAssign: group.employerAssign,
  };
  const chosen = await windows.find({
    from,
    to,
    scrollRight,
    count: (w) => repository.countInWindow({ ...scope, ...w }),
  });

  const rows = chosen ? await fetch({ ...scope, ...chosen }) : [];
  return { summary: summarise(rows), className: group.className };
};

const standaloneFiltered = async (input) => {
  const { summary, className } = await filtered({ ...input, fetch: repository.standaloneWindow });
  return {
    items: summary.items,
    assignors: summary.assignors,
    assignees: summary.assignees,
    min_date: summary.minDate,
    max_date: summary.maxDate,
    className,
  };
};

const searchFiltered = async (input) => {
  const { summary, className } = await filtered({ ...input, fetch: repository.searchWindow });
  return {
    type: 9,
    assignment_assignors: summary.firstAssignors,
    assignment_assignee: summary.firstAssignees,
    assignors: summary.assignors,
    assignees: summary.assignees,
    min_date: summary.minDate,
    max_date: summary.maxDate,
    className,
    group: GROUP_LABELS,
  };
};

/**
 * GET /:organisation/:name/:depth/:groupId — drilling from a company down
 * through its counterparties, transactions and individual assets.
 */
const drillDown = async ({ tenant, orgId, organisation, name, depth, groupId }) => {
  const company = await repository.tenantCompany(tenant, organisation);
  if (!company) throw ApiError.notFound('Unknown company');

  const replacements = {
    name, tab: groupId, orgId, representativeId: company.representative_id,
  };
  let predicate;

  if (depth === DEPTH.ASSET) {
    // Try the number as a granted patent first, then as an application.
    const column = (await repository.isGrantNumber(name)) ? 'grant_doc_num' : 'appno_doc_num';
    predicate = `t.rf_id IN (SELECT rf_id FROM documentid WHERE ${column} IN (:name))`;
  } else if (depth === DEPTH.TRANSACTION) {
    predicate = 't.rf_id = :name';
  } else if (depth === DEPTH.PARTY) {
    predicate = '(r.representative_name = :name OR aa.name = :name)';
  } else {
    // The whole company: no extra predicate beyond tab / org / representative.
    predicate = '1 = 1';
  }

  const items = await repository.drillPoints({
    predicate,
    replacements,
    // Tab 9 is the employee tab, drawn with surnames only.
    truncateNames: Number(groupId) === 9,
  });
  return { className: DEPTH_CLASSNAMES[depth] || 'red', items };
};

module.exports = {
  list, item, standalone, byTab, standaloneFiltered, searchFiltered, drillDown,
  summarise, DEFAULT_LIMIT,
};
