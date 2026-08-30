'use strict';

/**
 * Slack and Microsoft Teams.
 *
 * Both take the third-party credential per request, in headers, because the
 * tokens belong to the signed-in user's Slack/Microsoft account rather than to
 * this API.
 */

const h = require('../helpers');

const E = h.AUTH_ERRORS;

const msHeaders = [
  { name: 'x-microsoft-auth-token', in: 'header', required: true, description: 'Microsoft Graph access token.', schema: { type: 'string' } },
  { name: 'x-microsoft-refresh-token', in: 'header', required: true, description: 'Used to refresh the access token mid-request.', schema: { type: 'string' } },
];
const MS_ERRORS = {
  ...E,
  401: h.errorResponse('Missing PatenTrack token, or missing/expired Microsoft tokens.'),
};

// The Slack token is read from this header; the :token path segment is the
// deprecated fallback.
const slackHeader = {
  name: 'x-slack-token', in: 'header', required: false,
  description: 'Slack OAuth token. Preferred over the deprecated :token path segment.',
  schema: { type: 'string' },
};
const deprecatedToken = h.pathParam(
  'token',
  'DEPRECATED — pass the token in the x-slack-token header instead. A credential in a URL is written to access logs, proxy logs and browser history.'
);

const ms = ({ summary, description, params = [], body, ok, tag = 'Microsoft Teams' }) =>
  h.operation({ tag, summary, description, params: [...msHeaders, ...params], body, ok, errors: MS_ERRORS });

const slack = ({ summary, description, params = [], body, ok }) =>
  h.operation({
    tag: 'Slack',
    summary,
    description,
    params: [slackHeader, ...params],
    body,
    ok,
    errors: E,
  });

module.exports = {
  /* ------------------------------------------------------ Microsoft Teams */
  '/microsoft/me': {
    get: ms({ summary: 'The linked Microsoft account', ok: h.objectResponse('The Graph user.') }),
  },
  '/microsoft/team': {
    get: ms({
      summary: 'Find the product team this account belongs to',
      description: 'Records the team against the organisation the first time it is seen.',
      ok: h.jsonResponse('The team id, or null.', {
        type: 'object',
        properties: { message: { type: 'string' }, teamId: { type: 'string', nullable: true } },
      }),
    }),
    post: ms({
      summary: 'Create the product team if it does not exist',
      ok: h.jsonResponse('The team id.', {
        type: 'object', properties: { message: { type: 'string' }, teamId: { type: 'string' } },
      }),
    }),
  },
  '/microsoft/channel/{teamID}': {
    post: ms({
      summary: 'Find or create a private channel',
      params: [h.pathParam('teamID', 'Teams team id.')],
      body: h.jsonBody({
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string' }, description: { type: 'string' } },
      }),
      ok: h.jsonResponse('The channel id.', {
        type: 'object', properties: { channelId: { type: 'string' } },
      }),
    }),
  },
  '/microsoft/channel/{teamID}/{name}': {
    get: ms({
      summary: 'Find a private channel by name',
      params: [h.pathParam('teamID', 'Teams team id.'), h.pathParam('name', 'Channel display name.')],
      ok: h.jsonResponse('The channel id, or null.', {
        type: 'object', properties: { channelId: { type: 'string', nullable: true } },
      }),
    }),
  },
  '/microsoft/{teamId}/channels': {
    get: ms({
      summary: 'Every private channel in the team',
      params: [h.pathParam('teamId', 'Teams team id.')],
      ok: h.listResponse('Channels.'),
    }),
  },
  '/microsoft/{teamId}/users': {
    get: ms({
      summary: 'Team members',
      params: [h.pathParam('teamId', 'Teams team id.')],
      ok: h.listResponse('Members.'),
    }),
  },
  '/microsoft/{teamId}/channels/{channelId}/filesFolder': {
    get: ms({
      summary: "A channel's SharePoint file folder",
      description: 'Graph reports a new channel\'s folder as not ready for a few seconds; this retries.',
      params: [h.pathParam('teamId', 'Teams team id.'), h.pathParam('channelId', 'Channel id.')],
      ok: h.jsonResponse('The folder.', { type: 'object', properties: { folder: { type: 'object' } } }),
    }),
  },
  '/microsoft/{teamId}/channels/{channelId}/messages': {
    get: ms({
      summary: 'Channel messages and members',
      params: [h.pathParam('teamId', 'Teams team id.'), h.pathParam('channelId', 'Channel id.')],
      ok: h.objectResponse('Messages and users.'),
    }),
    post: ms({
      summary: 'Post a message to a channel',
      description: 'Accepts an optional `file` attachment as multipart/form-data.',
      params: [h.pathParam('teamId', 'Teams team id.'), h.pathParam('channelId', 'Channel id.')],
      body: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                text: { type: 'string' },
                remote_file: { type: 'string', description: 'JSON array of { name, mimeType, webViewLink }.' },
                user: { type: 'string', description: 'Team member id to mention.' },
                file: { type: 'string', format: 'binary' },
              },
            },
          },
        },
      },
      ok: h.objectResponse('Sent.'),
    }),
  },

  /* ------------------------------------------------------------- Slack */
  '/slacks/auth/{code}': {
    get: h.operation({
      tag: 'Slack',
      summary: 'Complete the OAuth handshake and sign in',
      description:
        'Exchanges the code for Slack tokens and, when the workspace belongs to a known '
        + 'organisation, returns a PatenTrack session token for it.',
      params: [
        h.pathParam('code', 'OAuth authorisation code.'),
        h.queryParam('redirect_uri', 'Must match the one used to obtain the code.'),
      ],
      ok: h.objectResponse('The Slack tokens, and a session token when the workspace is known.'),
      errors: { 400: h.errorResponse('Slack rejected the code.'), 429: h.errorResponse('Rate limited.') },
      public: true,
    }),
  },
  '/slacks/conversations/auth/{code}': {
    get: h.operation({
      tag: 'Slack',
      summary: 'Complete the OAuth handshake only',
      params: [
        h.pathParam('code', 'OAuth authorisation code.'),
        h.queryParam('redirect_uri', 'Must match the one used to obtain the code.'),
      ],
      ok: h.objectResponse('The Slack tokens.'),
      errors: { 400: h.errorResponse('Slack rejected the code.'), 429: h.errorResponse('Rate limited.') },
      public: true,
    }),
  },
  '/slacks/team': {
    put: h.operation({
      tag: 'Slack',
      summary: 'Link a Slack workspace to the organisation',
      description: 'Managers only.',
      body: h.jsonBody({ type: 'object', required: ['team'], properties: { team: { type: 'string' } } }),
      ok: h.objectResponse('Linked.'),
      errors: { ...E, 403: h.errorResponse('Only a manager can link a workspace.') },
    }),
  },
  '/slacks/asset/{asset}': {
    get: h.operation({
      tag: 'Slack',
      summary: 'The channel tracking one asset',
      params: [h.pathParam('asset', 'Asset number.')],
      ok: h.objectResponse('The channel id, or {} when none is linked.'),
      errors: h.TENANT_ERRORS,
    }),
  },
  '/slacks/user/info/{token}/{userId}': {
    get: slack({
      summary: 'One Slack user',
      params: [deprecatedToken, h.pathParam('userId', 'Slack user id.')],
      ok: h.objectResponse('The user.'),
    }),
  },
  '/slacks/conversations/users/{token}': {
    get: slack({ summary: 'Workspace users', params: [deprecatedToken], ok: h.listResponse('Users.') }),
  },
  '/slacks/channels/{token}': {
    get: slack({
      summary: 'Every channel, following Slack\'s paging cursor',
      params: [deprecatedToken],
      ok: h.listResponse('Channels.'),
    }),
  },
  '/slacks/conversations/create/{token}': {
    post: slack({
      summary: 'Create the channel for an asset',
      description: "Sets the channel topic to the asset's title and invites the bot.",
      params: [deprecatedToken],
      body: h.jsonBody({
        type: 'object',
        required: ['asset'],
        properties: {
          asset: { type: 'string' },
          name: { type: 'string', description: 'Defaults to the asset number.' },
          is_private: { type: 'string', enum: ['true', 'false'] },
          bot_user_id: { type: 'string' },
        },
      }),
      ok: h.objectResponse('The created channel.'),
    }),
  },
  '/slacks/conversations/message/{token}': {
    post: slack({
      summary: 'Post or edit a message',
      description: 'Supplying `ts` edits that message instead of posting a new one.',
      params: [deprecatedToken],
      body: h.jsonBody({
        type: 'object',
        required: ['channel'],
        properties: {
          channel: { type: 'string' },
          text: { type: 'string' },
          thread_ts: { type: 'string', description: 'Reply into this thread.' },
          ts: { type: 'string', description: 'Edit this message.' },
        },
      }),
      ok: h.objectResponse('The Slack response.'),
    }),
  },
  '/slacks/conversations/message/{token}/{channelID}/{messageID}': {
    get: slack({
      summary: 'One message',
      params: [deprecatedToken, h.pathParam('channelID', 'Channel id.'), h.pathParam('messageID', 'Message timestamp.')],
      ok: h.listResponse('The message.'),
    }),
    delete: slack({
      summary: 'Delete a message',
      params: [deprecatedToken, h.pathParam('channelID', 'Channel id.'), h.pathParam('messageID', 'Message timestamp.')],
      ok: h.objectResponse('Deleted.'),
    }),
  },
  '/slacks/conversations/history/{token}/{channelID}': {
    get: slack({
      summary: 'Channel history and users',
      params: [deprecatedToken, h.pathParam('channelID', 'Channel id.')],
      ok: h.objectResponse('Messages and users.'),
    }),
  },
  '/slacks/conversations/search/assigned/{token}': {
    get: slack({
      summary: 'Every assignment message across the workspace',
      description: 'Follows Slack\'s search paging to the last page.',
      params: [deprecatedToken],
      ok: h.listResponse('Matching messages.'),
    }),
  },
};
