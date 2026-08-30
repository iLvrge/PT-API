'use strict';

/**
 * Slack Web API access.
 *
 * The legacy helpers each built their own WebClient and swallowed failures by
 * returning undefined, so a caller could not tell "no results" from "the call
 * failed". Here a failed call throws with Slack's own error string.
 */

const { WebClient } = require('@slack/web-api');
const { env } = require('../../config/env');
const ApiError = require('../../utils/api-error');

const clientFor = (token) => new WebClient(token);

/** Slack answers 200 with { ok: false, error }, so success has to be checked. */
const expectOk = (result, what) => {
  if (!result || result.ok !== true) {
    throw ApiError.badRequest(`Slack ${what} failed: ${(result && result.error) || 'unknown error'}`);
  }
  return result;
};

/** Exchange an OAuth code for the user and bot tokens. */
const exchangeCode = async ({ code, redirectUri }) => {
  const { clientId, clientSecret } = env.slack;
  if (!clientId || !clientSecret) throw ApiError.internal('Slack integration is not configured');

  const result = await new WebClient().oauth.v2.access({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri || env.slack.redirectUri,
  });
  expectOk(result, 'authorisation');

  return {
    access_token: result.authed_user.access_token,
    id: result.authed_user.id,
    team: result.team.id,
    bot_token: result.access_token,
    bot_user_id: result.bot_user_id,
  };
};

const usersList = async (token) =>
  expectOk(await clientFor(token).users.list({ limit: 1000 }), 'user list').members || [];

const userInfo = async (token, userId) =>
  expectOk(await clientFor(token).users.info({ user: userId }), 'user lookup').user;

const createChannel = async (token, params) =>
  expectOk(await clientFor(token).conversations.create(params), 'channel creation').channel;

const setTopic = (token, channel, topic) =>
  clientFor(token).conversations.setTopic({ channel, topic });

const channelMembers = async (token, channel) =>
  expectOk(await clientFor(token).conversations.members({ channel }), 'channel members').members || [];

const inviteToChannel = (token, channel, users) =>
  clientFor(token).conversations.invite({ channel, users });

const postMessage = async (token, params) =>
  expectOk(await clientFor(token).chat.postMessage(params), 'message send');

const updateMessage = async (token, params) =>
  expectOk(await clientFor(token).chat.update(params), 'message update');

const deleteMessage = async (token, { channel, ts }) =>
  expectOk(await clientFor(token).chat.delete({ channel, ts }), 'message delete');

const history = async (token, params) =>
  expectOk(await clientFor(token).conversations.history(params), 'history').messages || [];

const uploadFile = (token, params) => clientFor(token).files.uploadV2(params);

/** Every channel, following the cursor Slack pages with. */
const allChannels = async (token) => {
  const web = clientFor(token);
  let channels = [];
  let cursor;
  do {
    const page = await web.conversations.list({
      limit: 1000,
      types: 'public_channel,private_channel',
      ...(cursor ? { cursor } : {}),
    });
    expectOk(page, 'channel list');
    channels = channels.concat(page.channels || []);
    cursor = page.response_metadata && page.response_metadata.next_cursor;
  } while (cursor);
  return channels;
};

/**
 * Every message matching the assignment marker.
 *
 * The legacy recursion compared `page + 1 < pages`, so it stopped one page
 * early, and on the recursive branch it never invoked the callback — a search
 * spanning more than one page simply never answered.
 */
const searchAssigned = async (token, query) => {
  const web = clientFor(token);
  let matches = [];
  let page = 1;
  let pages = 1;
  do {
    const response = await web.search.messages(page > 1 ? { query, page } : { query });
    if (!response || response.ok !== true) break;
    const { paging, matches: found } = response.messages;
    matches = matches.concat(found || []);
    ({ pages } = paging);
    page += 1;
  } while (page <= pages);
  return matches;
};

module.exports = {
  clientFor,
  expectOk,
  exchangeCode,
  usersList,
  userInfo,
  createChannel,
  setTopic,
  channelMembers,
  inviteToChannel,
  postMessage,
  updateMessage,
  deleteMessage,
  history,
  uploadFile,
  allChannels,
  searchAssigned,
};
