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
  countOr(req, res, await service.familyForGrant(req.params.grantNumber)));

const familyForApplication = asyncHandler(async (req, res) =>
  countOr(req, res, await service.familyForApplication(req.params.applicationNumber)));

const abstract = asyncHandler(async (req, res) => {
  res.status(200).json({ abstract: await service.abstract(req.params.applicationNumber) });
});

const claims = asyncHandler(async (req, res) => {
  res.status(200).json(await service.claims(req.params.applicationNumber));
});

const specifications = asyncHandler(async (req, res) => {
  res.status(200).json(await service.specifications(req.params.applicationNumber));
});

const images = asyncHandler(async (req, res) => {
  res.status(200).json(await service.images(req.params.applicationNumber));
});

const single = asyncHandler(async (req, res) => {
  res.status(200).json(await service.single(req.params.applicationNumber));
});

module.exports = {
  familyForGrant, familyForApplication, abstract, claims, specifications, images, single,
};
