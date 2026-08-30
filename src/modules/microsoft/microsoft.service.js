'use strict';

/**
 * Microsoft Teams: one private channel per tracked asset, under a single team
 * named after the product.
 */

const { env } = require('../../config/env');
const ApiError = require('../../utils/api-error');
const logger = require('../../utils/logger');
const { withRefresh } = require('./microsoft.client');
const repository = require('./microsoft.repository');

// The Graph API reports a new channel's file folder as "not ready" for a few
// seconds after creation.
const FOLDER_RETRIES = 5;
const FOLDER_RETRY_MS = 5000;

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/** The signed-in Microsoft user. */
const me = (tokens) => withRefresh(tokens, (client) => client.api('/me').get());

/** The id of the product team this account belongs to, or null. */
const findTeamId = async (tokens) => {
  const teams = await withRefresh(tokens, (client) => client.api('/me/joinedTeams').get());
  const team = (teams.value || []).find((t) => t.displayName === env.microsoft.teamName);
  return team ? team.id : null;
};

/** Record the team against the organisation, unless another already claims it. */
const rememberTeam = async (orgId, teamId) => {
  if (!teamId) return;
  const owner = await repository.organisationForTeam(teamId);
  if (!owner) await repository.setOrganisationTeam(orgId, teamId);
};

const team = async ({ tokens, orgId }) => {
  const teamId = await findTeamId(tokens);
  await rememberTeam(orgId, teamId);
  return { message: teamId ? 'Team found' : 'Team not found', teamId };
};

/** Create the product team if this account is not already in one. */
const createTeam = async ({ tokens, orgId }) => {
  let teamId = await findTeamId(tokens);

  if (!teamId) {
    const response = await withRefresh(tokens, (client) =>
      client.api('/teams').post({
        displayName: env.microsoft.teamName,
        description: 'This team created from PatenTrack application',
        visibility: 'Private',
      }));

    // Team creation is asynchronous: Graph answers with the new team's URL in
    // a header rather than a body.
    const location = response && response.headers
      && (response.headers.get('content-location') || response.headers.get('location'));
    const match = location && location.match(/teams\('(.+?)'\)/);
    if (!match) throw ApiError.internal('Microsoft did not return the new team id');
    [, teamId] = match;
  }

  await rememberTeam(orgId, teamId);
  return { message: 'Team created successfully', teamId };
};

/* --------------------------------------------------------------- channels */

const privateChannelsNamed = (client, teamId, displayName) =>
  client
    .api(`/teams/${teamId}/channels`)
    .filter(`membershipType eq 'private' and displayName eq '${displayName.replace(/'/g, "''")}'`)
    .get();

/** Find a private channel by name. */
const findChannel = async ({ tokens, teamId, name }) => {
  const channels = await withRefresh(tokens, (client) => privateChannelsNamed(client, teamId, name));
  const existing = (channels.value || []).find((c) => c.displayName === name);
  return { channelId: existing ? existing.id : null };
};

/** Find a private channel by name, creating it if it does not exist. */
const createChannel = async ({ tokens, teamId, name, description }) => {
  if (!name) throw ApiError.badRequest('A channel name is required');

  const channelId = await withRefresh(tokens, async (client) => {
    const channels = await privateChannelsNamed(client, teamId, name);
    const existing = (channels.value || []).find((c) => c.displayName === name);
    if (existing) return existing.id;

    const created = await client.api(`/teams/${teamId}/channels`).post({
      displayName: name,
      description,
      membershipType: 'private',
    });
    return created.id;
  });

  return { channelId };
};

const listChannels = async ({ tokens, teamId }) =>
  withRefresh(tokens, async (client) => {
    let response = await client
      .api(`/teams/${teamId}/channels`)
      .filter("membershipType eq 'private'")
      .get();
    let channels = response.value || [];
    while (response['@odata.nextLink']) {
      response = await client.api(response['@odata.nextLink']).get();
      channels = channels.concat(response.value || []);
    }
    return channels;
  });

const listMembers = async ({ tokens, teamId }) => {
  const response = await withRefresh(tokens, (client) =>
    client.api(`/teams/${teamId}/members`).get());
  return response.value || [];
};

/** The channel's SharePoint folder, once Graph reports it ready. */
const filesFolder = async ({ tokens, teamId, channelId }) => {
  for (let attempt = 1; attempt <= FOLDER_RETRIES; attempt++) {
    try {
      return await withRefresh(tokens, (client) =>
        client.api(`/teams/${teamId}/channels/${channelId}/filesFolder`).get());
    } catch (err) {
      const notReady = String(err.message || '').includes('not ready yet');
      if (!notReady || attempt === FOLDER_RETRIES) throw err;
      logger.info('Teams channel folder not ready, retrying', { channelId, attempt });
      await wait(FOLDER_RETRY_MS);
    }
  }
  throw ApiError.internal('The channel file folder is still not ready');
};

/* --------------------------------------------------------------- messages */

// The editor sends HTML entity-encoded markup with its own placeholder tags.
const MARKUP = [
  [/&lt;p&gt;/g, ''],
  [/&lt;\/p&gt;/g, ''],
  [/&lt;br&gt;/g, '\n'],
  [/&lt;slackusermention&gt;/g, ''],
  [/&lt;\/slackusermention&gt;/g, ''],
  [/&lt;patentracklinebreak&gt;/g, '\n'],
  [/&lt;\/patentracklinebreak&gt;/g, ''],
  [/&amp;nbsp;/g, ' '],
];

const cleanMessage = (text) =>
  MARKUP.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text || '');

const uploadToChannel = async ({ tokens, teamId, channelId, file }) => {
  const folder = await filesFolder({ tokens, teamId, channelId });
  const name = file.name.replace(/\s+/g, '-');
  const url = `https://graph.microsoft.com/v1.0/drives/${folder.parentReference.driveId}`
    + `/items/${folder.id}:/${encodeURIComponent(name)}:/content`;
  return withRefresh(tokens, (client) =>
    client.api(url).put(file.data, { headers: { 'Content-Type': file.mimetype } }));
};

/** Post a message to a channel, with an optional attachment and mention. */
const sendMessage = async ({ tokens, teamId, channelId, text, remoteFiles, user, file }) => {
  const message = { body: { contentType: 'html', content: cleanMessage(text) } };

  if (remoteFiles.length) {
    message.attachments = remoteFiles.map((remote, index) => {
      message.body.content += ` <attachment id="${index}"></attachment>`;
      return {
        id: index,
        contentType: remote.mimeType,
        content: {
          title: remote.name,
          subtitle: 'Click to view the document',
          buttons: [{ title: remote.name, value: remote.webViewLink }],
        },
      };
    });
  }

  if (user) {
    const members = await listMembers({ tokens, teamId });
    // The legacy lookup used `=` instead of `===` inside find, so it always
    // matched the first member and mentioned the wrong person.
    const member = members.find((item) => item.userId === user);
    if (member) {
      message.mentions = [{
        id: 0,
        mentionText: member.displayName,
        mentioned: { user: { id: user, name: member.displayName } },
      }];
    }
  }

  if (file) {
    const mimetype = (file.mimetype || '').toLowerCase();
    if (!mimetype || mimetype.includes('.exe')) {
      throw ApiError.badRequest('That file type cannot be shared');
    }
    const uploaded = await uploadToChannel({ tokens, teamId, channelId, file });
    message.body.content += ` <attachment id="${uploaded.id}"></attachment>`;
    message.attachments = [
      ...(message.attachments || []),
      { id: uploaded.id, contentType: 'reference', contentUrl: uploaded.webUrl },
    ];
  }

  await withRefresh(tokens, (client) =>
    client.api(`/teams/${teamId}/channels/${channelId}/messages`).post(message));

  return { status: 'Message sent', teamId, channel: channelId };
};

const channelMessages = async ({ tokens, teamId, channelId }) => {
  const response = await withRefresh(tokens, (client) =>
    client.api(`/teams/${teamId}/channels/${channelId}/messages`).get());
  const users = await listMembers({ tokens, teamId });
  return { messages: response.value || [], users };
};

module.exports = {
  me,
  team,
  createTeam,
  findChannel,
  createChannel,
  listChannels,
  listMembers,
  filesFolder,
  sendMessage,
  channelMessages,
  cleanMessage,
  findTeamId,
};
