'use strict';

const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const { attachTenant } = require('../../middleware/tenant');
const { publicLimiter } = require('../../middleware/security');
const controller = require('./slack.controller');
const { attachSlackToken } = require('./slack.middleware');

const { deprecated } = require('../../middleware/deprecation');

const router = express.Router();

// Every Slack call needs a PatenTrack token. In the legacy app most of these
// routes had no authentication at all, and took the Slack OAuth token as a URL
// path segment — which writes a live credential into access logs, proxy logs
// and browser history. Prefer the x-slack-token header; the :token path segment
// still works so the front end can migrate, and is marked deprecated in the
// API docs.
const guard = [verifyToken, attachSlackToken];
const tenantGuard = [verifyToken, attachTenant, attachSlackToken];

/*
 * The :token routes answer RFC 8594 deprecation headers, so a caller finds out
 * from its own logs rather than only from the API docs. They keep working.
 */
const legacyToken = deprecated({
  reason: 'The Slack token belongs in the x-slack-token header, not the URL. '
    + 'A token in a path is written to access logs, proxy logs and browser history.',
  successor: '/docs#tag/Slack',
});
const legacyGuard = [legacyToken, ...guard];
const legacyTenantGuard = [legacyToken, ...tenantGuard];

// Mounted at /slacks. The OAuth callbacks are reached before the user has a
// session, so they are public but rate limited.
router.get('/auth/:code', publicLimiter, controller.signIn);
router.get('/conversations/auth/:code', publicLimiter, controller.grantAccess);

router.put('/team', verifyToken, controller.setTeam);
router.get('/asset/:asset', [verifyToken, attachTenant], controller.channelForAsset);

router.get('/user/info/:token/:user_id', legacyGuard, controller.userInfo);
router.get('/conversations/users/:token', legacyGuard, controller.users);
router.post('/conversations/create/:token', legacyTenantGuard, controller.createChannel);
router.post('/conversations/message/:token', legacyTenantGuard, controller.sendMessage);
router.get('/conversations/message/:token/:channel_id/:message_id', legacyGuard, controller.message);
router.delete('/conversations/message/:token/:channel_id/:message_id', legacyGuard, controller.deleteMessage);
router.get('/conversations/history/:token/:channel_id', legacyGuard, controller.conversation);
router.get('/conversations/search/assigned/:token', legacyGuard, controller.assignedMessages);
router.get('/channels/:token', legacyGuard, controller.listChannels);

// GET /channel/:channelID/files/:token is not ported: it streamed a Slack file
// through the API onto local disk with a hardcoded path.

module.exports = router;
