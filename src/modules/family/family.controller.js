'use strict';

const asyncHandler = require('../../utils/async-handler');
const service = require('./family.service');

/** ?counter asks for the size of the result rather than the result. */
const countOr = (req, res, rows) => {
  if (req.query.counter !== undefined) {
    return res.status(200).type('text/plain').send(`${rows.length}`);
  }
  return res.status(200).json(rows);
};

const familyForGrant = asyncHandler(async (req, res) =>
  countOr(req, res, await service.familyForGrant(req.params.grant_number)));

const familyForApplication = asyncHandler(async (req, res) =>
  countOr(req, res, await service.familyForApplication(req.params.application_number)));

const abstract = asyncHandler(async (req, res) => {
  res.status(200).json({ abstract: await service.abstract(req.params.application_number) });
});

const claims = asyncHandler(async (req, res) => {
  res.status(200).json(await service.claims(req.params.application_number));
});

const specifications = asyncHandler(async (req, res) => {
  res.status(200).json(await service.specifications(req.params.application_number));
});

const images = asyncHandler(async (req, res) => {
  res.status(200).json(await service.images(req.params.application_number));
});

const single = asyncHandler(async (req, res) => {
  res.status(200).json(await service.single(req.params.application_number));
});

module.exports = {
  familyForGrant, familyForApplication, abstract, claims, specifications, images, single,
};
