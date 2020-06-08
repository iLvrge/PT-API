const express = require("express");

const route = express.Router();

//require the Model

const Updates = require("../../model/application/Updates");

const authJWT = require("../../helpers/verifyJwtToken");

route.get("/updates", [authJWT.verifyToken], async(req, res, next) => {

    /*const customQuery = "SELECT count(rf_id) FROM assignment as a INNER JOIN assignor as `or` ON `or`.rf_id = a.rf_id WHERE `or`.exec_dt BETWEEN "*/
    
});

module.exports = route;