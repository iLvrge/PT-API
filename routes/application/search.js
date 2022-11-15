const express = require("express");

const route = express.Router();

const connection = require("../../config/db.config");  

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


route.get("/:search_string/:type", [ authJWT.verifyToken, clientDBConnection.connect ], async (req, res, next) => {
    try {
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {

            const { uniquerfIDs } = await helpers.findRfIDsBySearchString(req)

            const list = [];

            if(uniquerfIDs.length > 0) {

                const findCompanyList = await req.connection_db.query(`SELECT original_name FROM representative GROUP BY original_name`,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    replacements: {},
                    raw: true,
                    logging: console.log,
                    }
                ); 

                if(findCompanyList.length > 0) {
                    const companyNames = []

                    const promise = findCompanyList.map( company => {
                        companyNames.push(company.original_name)
                    })

                    Promise.all(promise)

                    const queryParties = `Select a.or_name, a.assignor_and_assignee_id as assignorID, ra.representative_name, e.ee_name, a.assignor_and_assignee_id as assigneeID, re.representative_name  FROM assignor as a INNER JOIN assignee as e ON e.rf_id = a.rf_id LEFT JOIN representative as ra ON ra.representative_id = a.representative_id LEFT JOIN representative as re ON re.representative_id = e.representative_id WHERE (a.rf_id IN (:rfIDs) OR e.rf_id IN (:rfIDs)) AND (a.assignor_and_assignee_id NOT IN (SELECT assignor_and_assignee_id FROM assignor_and_assignee where name IN(:companyNames)) OR e.assignor_and_assignee_id NOT IN (SELECT assignor_and_assignee_id FROM assignor_and_assignee where name IN(:companyNames))) GROUP BY a.assignor_and_assignee_id, e.assignor_and_assignee_id`

                    const findParties = await req.connection_db.query(queryParties,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: {rfIDs: uniquerfIDs, companyNames },
                        raw: true,
                        logging: console.log,
                        }
                    );

                    if(findParties != null) {

                    }
                }
            }            
            res.status(200).json({list, total_records: list.length});
        } else {
            res.status(401).send("Invalid request");
        }
    } catch ( err ) {
        console.log( err )
        res.status(500).send("Error while search.");
    }    
});

module.exports = route;