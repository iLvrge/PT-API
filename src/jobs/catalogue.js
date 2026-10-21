'use strict';

/**
 * Every background job this API can start.
 *
 * The data-pipeline scripts take database names, organisation ids and JSON on
 * their command line, and they run with credentials in their environment. That
 * makes "which script, with which arguments" a security boundary, not just
 * bookkeeping — so it is declared here, once, and nothing else may name a
 * script. A request can only start work that appears in this file, with a
 * payload that passed this file's schema.
 *
 * Each entry declares:
 *   runtime     'php' | 'node'  — which interpreter runs it
 *   script      filename, resolved under SCRIPT_PATH
 *   schema      zod schema for the payload; rejected before anything is queued
 *   args        payload -> argv, in the order the script expects
 *   timeoutMs   killed after this; these range from seconds to a full rebuild
 *   attempts    retries, with exponential backoff between them
 *   dedupe      payload -> string, or null. Two jobs with the same name and
 *               dedupe key collapse into one while the first is still queued,
 *               so a double-clicked button cannot start two database rebuilds.
 *   sources     which sibling repositories carry a copy of this script
 *   missing     set when no repository has it at all (see below)
 */

const { z } = require('zod');

const orgId = z.coerce.number().int().positive();
/*
 * An id, or the empty string meaning "all of them".
 *
 * The empty literal has to come first: zod tries a union's options in order,
 * and z.coerce.number() turns '' into 0, so with the number first an "all
 * companies" request reached the script as `0` rather than the `""` the legacy
 * handler passed.
 */
const optionalId = z.union([z.literal(''), z.coerce.number().int()]).optional().default('');
const jsonArray = z.array(z.union([z.string(), z.number()])).default([]);

const MINUTE = 60 * 1000;

const JOBS = {
  /* ------------------------------------------------ customer provisioning */

  'customer.provision': {
    runtime: 'php',
    script: 'script_create_customer_db.php',
    description: "Create a new customer's database, user and grants.",
    schema: z.object({ organisationId: orgId }),
    args: (p) => [p.organisationId],
    timeoutMs: 30 * MINUTE,
    attempts: 3,
    // Provisioning twice would create a second database for the same customer.
    dedupe: (p) => `org:${p.organisationId}`,
    sources: ['customer-data-migrator', 'uspto-data-sync'],
  },

  'customer.publish-addresses': {
    runtime: 'php',
    script: 'update_client_companies_address.php',
    description: "Publish a customer's company addresses.",
    schema: z.object({ organisationId: orgId }),
    args: (p) => [p.organisationId, ''],
    timeoutMs: 30 * MINUTE,
    attempts: 2,
    dedupe: (p) => `org:${p.organisationId}`,
    sources: ['customer-data-migrator', 'uspto-data-sync'],
  },

  'customer.build-tree': {
    runtime: 'php',
    script: 'tree_script.php',
    description: "Rebuild a customer's corporate tree.",
    // The script takes the organisation NAME, not its id.
    schema: z.object({ organisationName: z.string().min(1) }),
    args: (p) => [p.organisationName],
    timeoutMs: 30 * MINUTE,
    attempts: 2,
    dedupe: (p) => `name:${p.organisationName}`,
    sources: ['uspto-data-sync'],
  },

  'customer.transfer-accounts': {
    runtime: 'php',
    script: 'transferred_data_from_one_account_to_another_accounts.php',
    description: 'Copy a group of companies from one account into others.',
    schema: z.object({ organisationId: orgId, accountIds: jsonArray }),
    args: (p) => [p.organisationId, p.accountIds.join(',')],
    timeoutMs: 60 * MINUTE,
    attempts: 2,
    dedupe: (p) => `org:${p.organisationId}`,
    sources: ['customer-data-migrator', 'uspto-data-sync'],
  },

  /* ----------------------------------------------------- company data sets */

  'company.add-representative-rfids': {
    runtime: 'php',
    script: 'add_representative_rfids.php',
    description: "Attach a company's transactions to a customer.",
    schema: z.object({ organisationId: orgId, companyId: z.coerce.number().int() }),
    args: (p) => [p.organisationId, p.companyId],
    timeoutMs: 30 * MINUTE,
    attempts: 3,
    dedupe: (p) => `org:${p.organisationId}:company:${p.companyId}`,
    sources: ['customer-data-migrator', 'uspto-data-sync'],
  },

  'company.build-application-data': {
    runtime: 'php',
    script: 'create_data_for_company_db_application.php',
    description: "Rebuild a customer's application data set.",
    schema: z.object({
      organisationId: orgId,
      companyId: optionalId,
      extra: z.union([z.string(), z.number()]).optional(),
    }),
    args: (p) => (p.extra === undefined
      ? [p.organisationId, p.companyId]
      : [p.organisationId, p.companyId, p.extra]),
    timeoutMs: 60 * MINUTE,
    attempts: 2,
    /*
     * Keyed by company as well as organisation. This job serves two shapes:
     * a whole-organisation rebuild (companyId '') and one company at a time,
     * which the console's Update button sends one per ticked portfolio row.
     * Keying on the organisation alone collapsed a ten-company selection onto
     * a single job and dropped the other nine.
     */
    dedupe: (p) => `org:${p.organisationId}:company:${p.companyId}`,
    sources: ['customer-data-migrator', 'uspto-data-sync'],
  },

  /* --------------------------------------------------------------- repairs */

  'repair.update-flag': {
    runtime: 'php',
    script: 'update_flag.php',
    description: 'Recompute conveyance flags for one company.',
    schema: z.object({ organisationId: orgId, companyId: optionalId }),
    args: (p) => [p.organisationId, p.companyId],
    timeoutMs: 60 * MINUTE,
    attempts: 2,
    dedupe: (p) => `org:${p.organisationId}:company:${p.companyId}`,
    sources: ['customer-data-migrator', 'uspto-data-sync', 'script_patent_application_bibliographic'],
  },

  'repair.update-flag-bulk': {
    runtime: 'php',
    script: 'run_script_for_update_flag.php',
    description: 'Recompute conveyance flags across several companies.',
    schema: z.object({ organisationId: orgId, companyIds: jsonArray }),
    args: (p) => [p.organisationId, JSON.stringify(p.companyIds)],
    timeoutMs: 120 * MINUTE,
    attempts: 2,
    dedupe: (p) => `org:${p.organisationId}`,
    sources: ['customer-data-migrator'],
  },

  'repair.missing-conveyance': {
    runtime: 'php',
    script: 'update_missing_type.php',
    description: 'Fill in transactions whose conveyance type is missing.',
    schema: z.object({ organisationId: orgId, companyId: optionalId }),
    args: (p) => [p.organisationId, p.companyId],
    timeoutMs: 60 * MINUTE,
    attempts: 2,
    dedupe: (p) => `org:${p.organisationId}:company:${p.companyId}`,
    sources: ['customer-data-migrator', 'uspto-data-sync', 'script_patent_application_bibliographic'],
  },

  'repair.missing-inventors': {
    runtime: 'php',
    script: 'find_missing_from_api_inventor_xml.php',
    description: 'Find assignments with a missing inventor, from the USPTO XML.',
    schema: z.object({ organisationId: orgId, representativeId: z.coerce.number().int() }),
    args: (p) => [p.organisationId, p.representativeId],
    timeoutMs: 120 * MINUTE,
    attempts: 1, // the console starts and stops this one explicitly
    dedupe: (p) => `org:${p.organisationId}:rep:${p.representativeId}`,
    sources: ['uspto-data-sync'],
  },

  /* ------------------------------------------------------ families & names */

  'family.persist-asset': {
    runtime: 'node',
    script: 'assets_family_single.js',
    description: "Persist one asset's patent family.",
    schema: z.object({ asset: z.union([z.string(), z.number()]) }),
    args: (p) => [p.asset],
    timeoutMs: 10 * MINUTE,
    attempts: 3,
    dedupe: (p) => `asset:${p.asset}`,
    sources: ['script_patent_application_bibliographic'],
  },

  'family.build-for-customer': {
    runtime: 'php',
    script: 'assets_family.php',
    description: "Build patent families across a customer's companies.",
    schema: z.object({
      customerId: z.coerce.number().int(),
      representativeIds: jsonArray,
      retrieveAll: z.union([z.string(), z.number()]).optional().default(''),
    }),
    args: (p) => [String(p.customerId), JSON.stringify(p.representativeIds), String(p.retrieveAll)],
    timeoutMs: 120 * MINUTE,
    attempts: 2,
    dedupe: (p) => `customer:${p.customerId}`,
    sources: ['customer-data-migrator', 'uspto-data-sync', 'script_patent_application_bibliographic'],
  },

  'names.normalise': {
    runtime: 'node',
    script: 'normalize_names.js',
    description: 'Normalise entity or inventor names for a customer.',
    schema: z.object({
      organisationId: orgId,
      representativeIds: jsonArray,
      type: z.union([z.string(), z.number()]),
      suggestions: z.union([z.string(), z.number()]).optional().default(''),
      fixedIdenticals: z.union([z.string(), z.number()]).optional().default(''),
    }),
    args: (p) => [
      p.organisationId,
      JSON.stringify(p.representativeIds),
      p.type,
      p.suggestions,
      p.fixedIdenticals,
    ],
    timeoutMs: 60 * MINUTE,
    attempts: 2,
    dedupe: (p) => `org:${p.organisationId}:type:${p.type}`,
    sources: ['script_patent_application_bibliographic'],
  },

  /* -------------------------------------------------------- cited patents */

  'cited.retrieve-assignees': {
    runtime: 'node',
    script: 'retrieve_cited_patents_assignees.js',
    description: 'Fetch the assignees citing a customer\'s patents.',
    schema: z.object({
      customerId: z.coerce.number().int(),
      companies: z.union([z.string(), z.number()]).optional().default(''),
      type: z.union([z.string(), z.number()]).optional().default(''),
    }),
    args: (p) => [p.customerId, p.companies, p.type],
    timeoutMs: 120 * MINUTE,
    attempts: 2,
    dedupe: (p) => `customer:${p.customerId}:type:${p.type}`,
    sources: ['customer-data-migrator', 'uspto-data-sync', 'script_patent_application_bibliographic'],
  },

  'cited.retrieve-domains': {
    runtime: 'node',
    script: 'name_to_domain_api.js',
    description: 'Look up company domains for cited assignees.',
    schema: z.object({
      customerId: z.coerce.number().int(),
      apiName: z.string().min(1),
      assignees: z.union([z.string(), z.number()]).optional().default(''),
    }),
    // The trailing 0 selects the domain mode of this script; 1 is logos below.
    args: (p) => [p.customerId, p.apiName, p.assignees, 0],
    timeoutMs: 60 * MINUTE,
    attempts: 2,
    dedupe: null, // called per assignee batch; collapsing would drop work
    sources: ['customer-data-migrator', 'uspto-data-sync', 'script_patent_application_bibliographic'],
  },

  'cited.retrieve-logos': {
    runtime: 'node',
    script: 'name_to_domain_api.js',
    description: 'Download logos for cited assignees.',
    schema: z.object({
      clientId: z.coerce.number().int(),
      apiName: z.string().min(1),
      assignees: z.union([z.string(), z.number()]).optional().default(''),
      companyId: z.union([z.string(), z.number()]).optional().default(''),
      all: z.union([z.string(), z.number(), z.boolean()]).optional().default(''),
      type: z.union([z.string(), z.number()]).optional().default(''),
      sourceData: z.union([z.string(), z.number()]).optional().default(''),
    }),
    args: (p) => [p.clientId, p.apiName, p.assignees, 1, p.companyId, p.all, p.type, p.sourceData],
    timeoutMs: 60 * MINUTE,
    attempts: 2,
    dedupe: null,
    sources: ['customer-data-migrator', 'uspto-data-sync', 'script_patent_application_bibliographic'],
  },

  'cited.download-assignee-logos': {
    runtime: 'node',
    script: 'download_assignees_logos.js',
    description: 'Download logos for a named set of assignees.',
    schema: z.object({ assigneeIds: jsonArray }),
    args: (p) => [JSON.stringify(p.assigneeIds)],
    timeoutMs: 60 * MINUTE,
    attempts: 2,
    dedupe: null,
    sources: ['script_patent_application_bibliographic'],
  },
};

/** Job names, for validation and for the catalogue endpoint. */
const JOB_NAMES = Object.freeze(Object.keys(JOBS));

/** Look a job up, or throw — callers must never reach a script by string. */
const jobDefinition = (name) => {
  const definition = JOBS[name];
  if (!definition) throw new Error(`Unknown job: ${name}`);
  return definition;
};

module.exports = { JOBS, JOB_NAMES, jobDefinition };
