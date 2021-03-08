const express = require("express");

const route = express.Router();

const connection = require("../../config/db.config");

//require the Model

const authJWT = require("../../helpers/verifyJwtToken");

const helpers = require("../../helpers/helper");

const clientDBConnection = require("../../helpers/clientDBConnection");

route.get("/:search_string", [ authJWT.verifyToken, clientDBConnection.connect ], async (req, res, next) => {
    try {
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {

            const { searchList, uniquerfIDs } = await helpers.findRfIDsBySearchString(req)
            
            res.status(200).json({list: searchList, total_records: searchList.length, txn_ids: uniquerfIDs});
        } else {
            res.status(401).send("Invalid request");
        }
    } catch ( err ) {
        console.log( err )
        res.status(500).send("Error while search.");
    }    
});

module.exports = route;