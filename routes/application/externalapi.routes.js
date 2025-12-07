/**
 * External API Routes
 * Route definitions for external APIs - refactored from routes/application/externalapi.js
 */

const express = require("express");
const router = express.Router();

// Middleware
const authJWT = require("../../helpers/verifyJwtToken");

// Controller
const externalapiController = require("../../controllers/application/externalapiController");

// GET routes
router.get("/ptab/:asset", [authJWT.verifyToken], externalapiController.getPtabAsset);
router.get("/ptab/document/:identifier", externalapiController.getPtabDocument);
router.get("/citation/:asset", [authJWT.verifyToken], externalapiController.getCitationByAsset);
router.get("/generate_thumbnail", externalapiController.generateThumbnail);

// POST routes
router.post("/citation", [authJWT.verifyToken], externalapiController.postCitation);

module.exports = router;
