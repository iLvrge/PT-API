const express = require("express");

const route = express.Router();

//require the Model



const authJWT = require("../../helpers/verifyJwtToken");
const clientDBConnection = require("../../helpers/clientDBConnection");

route.get("/activities", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {

    res.status(200).json([]);
});

route.post("/activities", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {

    res.status(200).json([]);
});

route.put("/activities", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {

    res.status(200).json([]);
});

module.exports = route;