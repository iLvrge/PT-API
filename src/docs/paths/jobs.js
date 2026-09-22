'use strict';

// Background jobs: the data-pipeline scripts, queued rather than spawned.
// See docs/BACKGROUND_JOBS.md for why these moved behind a queue.

const h = require('../helpers');

const ADMIN_ERRORS = { ...h.AUTH_ERRORS, 403: h.errorResponse('Admin access required.') };

const jobStatus = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'customer.provision:org:68' },
    name: { type: 'string', example: 'customer.provision' },
    state: {
      type: 'string',
      enum: ['waiting', 'active', 'completed', 'failed', 'delayed'],
      description: 'Where the job is in the queue.',
    },
    progress: {
      type: 'object',
      nullable: true,
      description: "The script's most recent line of output, and when it arrived.",
    },
    attemptsMade: { type: 'integer', example: 1 },
    attemptsAllowed: { type: 'integer', example: 3 },
    requestedBy: { type: 'integer', nullable: true, description: 'User who started it.' },
    requestedAt: { type: 'string', format: 'date-time', nullable: true },
    processedOn: { type: 'integer', nullable: true, description: 'Epoch ms when a worker picked it up.' },
    finishedOn: { type: 'integer', nullable: true },
    failedReason: { type: 'string', nullable: true },
  },
};

module.exports = {
  '/admin/jobs': {
    get: h.operation({
      tag: 'Background jobs',
      summary: 'Recent jobs and queue depth',
      description:
        'Newest first, across every state. `counts` is the number of jobs waiting, '
        + 'active, delayed, completed and failed.',
      params: [h.queryParam('limit', 'How many to return (1-200, default 50).', { type: 'integer' })],
      ok: h.jsonResponse('Recent jobs.', {
        type: 'object',
        properties: {
          jobs: { type: 'array', items: jobStatus },
          counts: { type: 'object', additionalProperties: { type: 'integer' } },
        },
      }),
      errors: ADMIN_ERRORS,
    }),
    post: h.operation({
      tag: 'Background jobs',
      summary: 'Start a job',
      description:
        'The name must appear in the catalogue and the payload must satisfy that '
        + "job's schema. Answers 202 with the job id; follow it at GET /admin/jobs/{id}. "
        + 'A job whose script is missing from this deployment is refused with 503 rather '
        + 'than queued.',
      body: h.jsonBody({
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', example: 'customer.publish-addresses' },
          payload: { type: 'object', example: { organisationId: 68 } },
        },
      }),
      ok: h.jsonResponse('Queued.', {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          deduped: { type: 'boolean', description: 'True when an identical job was already queued.' },
          inline: { type: 'boolean', description: 'True when run in-process because no queue is configured.' },
        },
      }),
      status: 202,
      errors: {
        ...ADMIN_ERRORS,
        503: h.errorResponse('The job cannot run here — usually a script missing from SCRIPT_PATH.'),
      },
    }),
  },

  '/admin/jobs/catalogue': {
    get: h.operation({
      tag: 'Background jobs',
      summary: 'Jobs this API can run',
      description:
        'Every declared job, with whether it could run right now. `runnable: false` '
        + 'means the script is absent from this deployment, and `reason` says so — the '
        + 'check that used to happen only when the interpreter failed, minutes later.',
      ok: h.listResponse('The job catalogue.', {
        type: 'object',
        properties: {
          name: { type: 'string', example: 'family.build-for-customer' },
          description: { type: 'string' },
          runtime: { type: 'string', enum: ['php', 'node'] },
          script: { type: 'string', example: 'assets_family.php' },
          timeoutMs: { type: 'integer' },
          attempts: { type: 'integer' },
          runnable: { type: 'boolean' },
          reason: { type: 'string', nullable: true },
          sources: {
            type: 'array',
            items: { type: 'string' },
            description: 'Pipeline repositories carrying a copy of this script.',
          },
        },
      }),
      errors: ADMIN_ERRORS,
    }),
  },

  '/admin/jobs/{id}': {
    get: h.operation({
      tag: 'Background jobs',
      summary: 'One job',
      description: 'State, progress, attempts, and the failure reason if it failed.',
      params: [h.pathParam('id', 'Job id, as returned when it was started.')],
      ok: h.jsonResponse('The job.', jobStatus),
      errors: { ...ADMIN_ERRORS, 404: h.errorResponse('No such job.') },
    }),
  },
};
