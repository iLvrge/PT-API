'use strict';

const asyncHandler = require('../../utils/async-handler');
const service = require('./slack.service');

const signIn = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.signInWithSlack({ code: req.params.code, redirectUri: req.query.redirect_uri })
  );
});

const grantAccess = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.grantAccess({ code: req.params.code, redirectUri: req.query.redirect_uri })
  );
});

const setTeam = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.setTeam({ userId: req.auth.userId, orgId: req.auth.orgId, team: req.body.team })
  );
});

const userInfo = asyncHandler(async (req, res) => {
  res.status(200).json(await service.userInfo({ token: req.slackToken, userId: req.params.userId }));
});

const users = asyncHandler(async (req, res) => {
  res.status(200).json(await service.users(req.slackToken));
});

const createChannel = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.createChannelForAsset({
      token: req.slackToken,
      tenant: req.tenant,
      asset: req.body.asset,
      name: req.body.name,
      isPrivate: String(req.body.is_private) === 'true',
      botUserId: req.body.bot_user_id,
    })
  );
});

const listChannels = asyncHandler(async (req, res) => {
  res.status(200).json(await service.listChannels(req.slackToken));
});

const channelForAsset = asyncHandler(async (req, res) => {
  res.status(200).json(await service.channelForAsset(req.tenant, req.params.asset));
});

const sendMessage = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.sendMessage({
      token: req.slackToken,
      channelId: req.body.channel,
      text: req.body.text,
      threadTs: req.body.thread_ts,
      messageTs: req.body.ts,
    })
  );
});

const message = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.message({
      token: req.slackToken, channelId: req.params.channelID, messageId: req.params.messageID,
    })
  );
});

const deleteMessage = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.deleteMessage({
      token: req.slackToken, channelId: req.params.channelID, messageId: req.params.messageID,
    })
  );
});

const conversation = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.conversation({ token: req.slackToken, channelId: req.params.channelID })
  );
});

const assignedMessages = asyncHandler(async (req, res) => {
  res.status(200).json(await service.assignedMessages(req.slackToken));
});

module.exports = {
  signIn, grantAccess, setTeam, userInfo, users, createChannel, listChannels,
  channelForAsset, sendMessage, message, deleteMessage, conversation, assignedMessages,
};
