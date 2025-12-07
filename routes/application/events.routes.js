/**
 * Events Routes
 * Route definitions for events - refactored from routes/application/events.js
 */

const express = require("express");
const router = express.Router();

// Middleware
const authJWT = require("../../helpers/verifyJwtToken");
const clientDBConnection = require("../../helpers/clientDBConnection");

// Controller
const eventsController = require("../../controllers/application/eventsController");

// GET routes
router.get("/events/tabs/:tabID", [authJWT.verifyToken, clientDBConnection.connect], eventsController.getEventsByTab);
router.get("/events/tabs/:tabID/companies/:companyID", [authJWT.verifyToken, clientDBConnection.connect], eventsController.getEventsByTabAndCompany);
router.get("/events/tabs/:tabID/companies/:companyID/customers/:customerID", [authJWT.verifyToken, clientDBConnection.connect], eventsController.getEventsByTabCompanyCustomer);
router.get("/events/tabs/:tabID/companies/:representativeID/customers/:customerID/transactions/:rfID", [authJWT.verifyToken, clientDBConnection.connect], eventsController.getEventsByTransaction);
router.get("/events/tabs", [authJWT.verifyToken], eventsController.getEventsTabs);
router.get("/events/tabs/:tabID/companies/:companyID/customers/:customerID/transactions/:rfID/assets/:applicationNumber", [authJWT.verifyToken, clientDBConnection.connect], eventsController.getEventsForAsset);
router.get("/events/all/assets/:category_type", [authJWT.verifyToken], eventsController.getAllAssetsByCategoryType);
router.get("/events/all/assets/to_record/detail/:application", [authJWT.verifyToken], eventsController.getToRecordDetail);
router.get("/events/:applicationNumber", [authJWT.verifyToken], eventsController.getEventsByApplicationNumber);
router.get("/events/:applicationNumber/:patentNumber", [authJWT.verifyToken], eventsController.getEventsByApplicationAndPatent);
router.get("/events/assets/status/:applicationNumber", [authJWT.verifyToken], eventsController.getAssetsStatus);
router.get("/events/assets/transactions/:rfID", [authJWT.verifyToken], eventsController.getEventsAssetTransactions);

// POST routes
router.post("/events/abandoned/maintainence/assets", [authJWT.verifyToken], eventsController.getAbandonedMaintenanceAssets);
router.post("/events/abandoned/yearly/assets", [authJWT.verifyToken], eventsController.getAbandonedYearlyAssets);
router.post("/events/assets", [authJWT.verifyToken], eventsController.getEventsAssets);

module.exports = router;
