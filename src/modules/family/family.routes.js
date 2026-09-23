'use strict';

const express = require('express');
const { z } = require('zod');
const { verifyToken } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const controller = require('./family.controller');

const router = express.Router();

// Asset numbers are digits, optionally with a country prefix and kind suffix.
const assetNumber = z.string().min(1).max(30).regex(/^[A-Za-z0-9]+$/, 'expected an asset number');

const grantSchema = z.object({ params: z.object({ grant_number: assetNumber }) });
const applicationSchema = z.object({ params: z.object({ application_number: assetNumber }) });

// Mounted at /. Literal segments before /family/:applicationNumber so it
// cannot swallow them.
router.get('/family/list/:grant_number', verifyToken, validate(grantSchema), controller.familyForGrant);
router.get('/family/abstract/:application_number', verifyToken, validate(applicationSchema), controller.abstract);
router.get('/family/claims/:application_number', verifyToken, validate(applicationSchema), controller.claims);
router.get('/family/specifications/:application_number', verifyToken, validate(applicationSchema), controller.specifications);
router.get('/family/images/:application_number', verifyToken, validate(applicationSchema), controller.images);
router.get('/family/single/:application_number', verifyToken, validate(applicationSchema), controller.single);
router.get('/family/:application_number', verifyToken, validate(applicationSchema), controller.familyForApplication);

// GET /family/single/file/ is deliberately not ported. It was unauthenticated
// and built a shell command from its own `link` query parameter:
//
//   exec(`php -f /var/www/html/trash/get_epo_thumbnail.php "${link}"`)
//
// which let any anonymous caller run commands as the API process user. It is a
// thumbnail helper; if it is needed, it should be reintroduced as an execFile
// call with an argument array, behind a token, with the URL checked against the
// EPO host. See TEST_REPORT.md section 3.
//
// GET /family/epo/grant/:grantDocNumber is also dropped: it kicked off an EPO
// fetch and then never sent a response, so every call leaked a socket.

module.exports = router;
