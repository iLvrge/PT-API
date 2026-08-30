'use strict';

const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const { attachTenant } = require('../../middleware/tenant');
const { publicLimiter } = require('../../middleware/security');
const controller = require('./slack.controller');
const { attachSlackToken } = require('./slack.middleware');

const router = express.Router();

// Every Slack call needs a PatenTrack token. In the legacy app most of these
// routes had no authentication at all, and took the Slack OAuth token as a URL
// path segment — which writes a live credential into access logs, proxy logs
// and browser history. Prefer the x-slack-token header; the :token path segment
// still works so the front end can migrate, and is marked deprecated in the
// API docs.
const guard = [verifyToken, attachSlackToken];
const tenantGuard = [verifyToken, attachTenant, attachSlackToken];

// Mounted at /slacks. The OAuth callbacks are reached before the user has a
// session, so they are public but rate limited.
router.get('/auth/:code', publicLimiter, controller.signIn);
router.get('/conversations/auth/:code', publicLimiter, controller.grantAccess);

router.put('/team', verifyToken, controller.setTeam);
router.get('/asset/:asset', [verifyToken, attachTenant], controller.channelForAsset);

router.get('/user/info/:token/:userId', guard, controller.userInfo);
router.get('/conversations/users/:token', guard, controller.users);
router.post('/conversations/create/:token', tenantGuard, controller.createChannel);
router.post('/conversations/message/:token', tenantGuard, controller.sendMessage);
router.get('/conversations/message/:token/:channelID/:messageID', guard, controller.message);
router.delete('/conversations/message/:token/:channelID/:messageID', guard, controller.deleteMessage);
router.get('/conversations/history/:token/:channelID', guard, controller.conversation);
router.get('/conversations/search/assigned/:token', guard, controller.assignedMessages);
router.get('/channels/:token', guard, controller.listChannels);

// GET /channel/:channelID/files/:token is not ported: it streamed a Slack file
// through the API onto local disk with a hardcoded path.

module.exports = router;
