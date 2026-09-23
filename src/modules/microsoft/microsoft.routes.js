'use strict';

const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const controller = require('./microsoft.controller');
const { attachMicrosoftTokens } = require('./microsoft.middleware');

const router = express.Router();
// Every route needs both a PatenTrack token and the caller's Microsoft tokens,
// which arrive in the x-microsoft-auth-token / x-microsoft-refresh-token headers.
const guard = [verifyToken, attachMicrosoftTokens];

// Mounted at /microsoft. Literal segments before the parameterised team id.
router.get('/me', guard, controller.me);
router.get('/team', guard, controller.team);
router.post('/team', guard, controller.createTeam);
router.post('/channel/:team_id', guard, controller.createChannel);
router.get('/channel/:team_id/:name', guard, controller.findChannel);

router.get('/:team_id/channels/:channel_id/filesFolder', guard, controller.filesFolder);
router.post('/:team_id/channels/:channel_id/messages', guard, controller.sendMessage);
router.get('/:team_id/channels/:channel_id/messages', guard, controller.channelMessages);
router.get('/:team_id/channels', guard, controller.listChannels);
router.get('/:team_id/users', guard, controller.listMembers);

module.exports = router;
