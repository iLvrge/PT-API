'use strict';

const asyncHandler = require('../../utils/async-handler');
const ApiError = require('../../utils/api-error');
const service = require('./microsoft.service');

const parseList = (raw, label) => {
  if (raw === undefined || raw === null || raw === '') return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (_err) {
    throw ApiError.badRequest(`${label} must be a JSON array`);
  }
};

const me = asyncHandler(async (req, res) => {
  res.status(200).json({ message: 'Authenticated', user: await service.me(req.microsoft) });
});

const team = asyncHandler(async (req, res) => {
  res.status(200).json(await service.team({ tokens: req.microsoft, orgId: req.auth.orgId }));
});

const createTeam = asyncHandler(async (req, res) => {
  res.status(200).json(await service.createTeam({ tokens: req.microsoft, orgId: req.auth.orgId }));
});

const createChannel = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.createChannel({
      tokens: req.microsoft,
      teamId: req.params.teamID,
      name: req.body.name,
      description: req.body.description,
    })
  );
});

const findChannel = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.findChannel({
      tokens: req.microsoft, teamId: req.params.teamID, name: req.params.name,
    })
  );
});

const filesFolder = asyncHandler(async (req, res) => {
  res.status(200).json({
    folder: await service.filesFolder({
      tokens: req.microsoft, teamId: req.params.teamId, channelId: req.params.channelId,
    }),
  });
});

const sendMessage = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.sendMessage({
      tokens: req.microsoft,
      teamId: req.params.teamId,
      channelId: req.params.channelId,
      text: req.body.text,
      remoteFiles: parseList(req.body.remote_file, 'remote_file'),
      user: req.body.user,
      file: req.files && req.files.file,
    })
  );
});

const channelMessages = asyncHandler(async (req, res) => {
  res.status(200).json(
    await service.channelMessages({
      tokens: req.microsoft, teamId: req.params.teamId, channelId: req.params.channelId,
    })
  );
});

const listChannels = asyncHandler(async (req, res) => {
  res.status(200).json(await service.listChannels({ tokens: req.microsoft, teamId: req.params.teamId }));
});

const listMembers = asyncHandler(async (req, res) => {
  res.status(200).json(await service.listMembers({ tokens: req.microsoft, teamId: req.params.teamId }));
});

module.exports = {
  me, team, createTeam, createChannel, findChannel, filesFolder,
  sendMessage, channelMessages, listChannels, listMembers,
};
