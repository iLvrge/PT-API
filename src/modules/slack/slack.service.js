'use strict';

/**
 * Slack: one channel per tracked asset, plus the conversation views the app
 * renders around it.
 */

const jwt = require('jsonwebtoken');
const { env } = require('../../config/env');
const ApiError = require('../../utils/api-error');
const logger = require('../../utils/logger');
const client = require('./slack.client');
const repository = require('./slack.repository');

// The marker the app writes into every assignment message, so they can be
// found again by search.
const ASSIGNED_QUERY = 'assigned to this asset via PatenTrack';

/**
 * Complete the OAuth handshake and, if we recognise the workspace, hand back a
 * PatenTrack session token for it.
 */
const signInWithSlack = async ({ code, redirectUri }) => {
  const accessSlackToken = await client.exchangeCode({ code, redirectUri });
  const token = { auth: false, accessToken: '', message: '', accessSlackToken };

  if (!accessSlackToken.team) return token;

  const organisation = await repository.organisationForTeam(accessSlackToken.team);
  if (!organisation) return token;

  const user = await repository.managerFor(organisation.organisation_id);
  if (!user) return token;

  token.auth = true;
  token.message = 'Login successfully!';
  token.accessToken = jwt.sign(
    { id: user.user_id, orgId: user.organisation_id },
    env.auth.secret,
    { expiresIn: env.auth.tokenExpiresInSeconds }
  );
  return token;
};

/** The OAuth handshake alone, without minting a session. */
const grantAccess = ({ code, redirectUri }) => client.exchangeCode({ code, redirectUri });

/** Link a Slack workspace to the caller's organisation. Managers only. */
const setTeam = async ({ userId, orgId, team }) => {
  if (!team) throw ApiError.badRequest('A team is required');
  if (!(await repository.isManager(userId))) {
    throw ApiError.forbidden('Only a manager can link a Slack workspace');
  }

  const current = await repository.currentTeam(orgId);
  if (current !== team) {
    await repository.setTeam(orgId, team);
    logger.info('slack workspace linked', { orgId });
  }
  return { team };
};

/* --------------------------------------------------------------- channels */

/** Slack channel names: lower case, no spaces or punctuation, 80 chars max. */
const channelName = (name) =>
  String(name).toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').slice(0, 80);

/**
 * Make sure the bot is a member of a channel, inviting it if not.
 * Returns false when the bot id is not a bot in this workspace.
 */
const ensureBotInChannel = async ({ token, botUserId, channelId }) => {
  const members = await client.usersList(token);
  const bot = members.find((user) => user.is_bot === true && user.id === botUserId);
  if (!bot) return false;

  const channelMembers = await client.channelMembers(token, channelId);
  if (channelMembers.includes(botUserId)) return true;

  await client.inviteToChannel(token, channelId, botUserId);
  return true;
};

/** Create the channel for an asset and record it against the tenant. */
const createChannelForAsset = async ({ token, tenant, asset, name, isPrivate, botUserId }) => {
  const channel = await client.createChannel(token, {
    name: channelName(name || asset),
    is_private: !!isPrivate,
  });

  const title = await repository.assetTitle(asset);
  if (title) {
    // A missing topic is cosmetic; it must not fail channel creation.
    await client.setTopic(token, channel.id, title).catch((err) =>
      logger.warn('could not set the Slack channel topic', { error: err.message }));
  }

  if (botUserId) {
    await ensureBotInChannel({ token, botUserId, channelId: channel.id }).catch((err) =>
      logger.warn('could not add the bot to the channel', { error: err.message }));
  }

  if (tenant) await repository.rememberAssetChannel(tenant, { asset, channelId: channel.id });
  return channel;
};

const channelForAsset = async (tenant, asset) => {
  if (!asset) return {};
  return (await repository.channelForAsset(tenant, asset)) || {};
};

const listChannels = (token) => client.allChannels(token);

/* --------------------------------------------------------------- messages */

const sendMessage = async ({ token, channelId, text, threadTs, messageTs }) => {
  if (!channelId) throw ApiError.badRequest('A channel is required');
  const params = { channel: channelId, text };
  if (threadTs) params.thread_ts = threadTs;

  // A message timestamp means this is an edit rather than a new message.
  if (messageTs) return client.updateMessage(token, { ...params, ts: messageTs });
  return client.postMessage(token, params);
};

const message = async ({ token, channelId, messageId }) => {
  const messages = await client.history(token, {
    channel: channelId, latest: messageId, inclusive: true, limit: 1,
  });
  return messages;
};

const deleteMessage = ({ token, channelId, messageId }) =>
  client.deleteMessage(token, { channel: channelId, ts: messageId });

const conversation = async ({ token, channelId }) => {
  const messages = await client.history(token, { channel: channelId });
  let users = [];
  try {
    users = await client.usersList(token);
  } catch (err) {
    logger.warn('could not list Slack users', { error: err.message });
  }
  return { messages, users };
};

const assignedMessages = (token) => client.searchAssigned(token, ASSIGNED_QUERY);

const users = (token) => client.usersList(token);

const userInfo = ({ token, userId }) => client.userInfo(token, userId);

module.exports = {
  signInWithSlack,
  grantAccess,
  setTeam,
  createChannelForAsset,
  channelForAsset,
  listChannels,
  sendMessage,
  message,
  deleteMessage,
  conversation,
  assignedMessages,
  users,
  userInfo,
  ensureBotInChannel,
  channelName,
  ASSIGNED_QUERY,
};
