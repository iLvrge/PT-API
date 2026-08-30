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
router.post('/channel/:teamID', guard, controller.createChannel);
router.get('/channel/:teamID/:name', guard, controller.findChannel);

router.get('/:teamId/channels/:channelId/filesFolder', guard, controller.filesFolder);
router.post('/:teamId/channels/:channelId/messages', guard, controller.sendMessage);
router.get('/:teamId/channels/:channelId/messages', guard, controller.channelMessages);
router.get('/:teamId/channels', guard, controller.listChannels);
router.get('/:teamId/users', guard, controller.listMembers);

module.exports = router;
