const express = require("express");

const route = express.Router();

const connection = require("../../config/db.config");

const helpers = require("../../helpers/helper");

//require the Model
const Activities = require("../model/client/activities");


const authJWT = require("../../helpers/verifyJwtToken");

const clientDBConnection = require("../../helpers/clientDBConnection");

route.get("activites", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {

    const Activity = DBConnection.define('activity', Activities.mainStructure, Activities.options);
    
});

route.post("activites", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {

    const Representative = DBConnection.define('ClientRepesentative', ClientRepesentative.mainStructure, ClientRepesentative.options);
});

route.put("activites", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {

    const Representative = DBConnection.define('ClientRepesentative', ClientRepesentative.mainStructure, ClientRepesentative.options);
});