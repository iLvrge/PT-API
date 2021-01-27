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
            const { search_string } = req.params;
            let list = [];
            let customQuery3rdParty = ''

            if(!isNaN(search_string)) {
                customQuery3rdParty = `SELECT tpc.rf_id as rf_id, tpc.exec_dt as date FROM tree_parties as tp INNER JOIN tree_parties_collection as tpc ON tp.assignor_and_assignee_id = tpc.assignor_and_assignee_id WHERE tpc.rf_id IN (SELECT rf_id FROM db_uspto.representative_transactions WHERE organisation_id = :orgId) AND tpc.rf_id = :searchItem GROUP BY tpc.rf_id`
            } else {
                customQuery3rdParty = `SELECT tpc.rf_id as rf_id, tpc.exec_dt as date FROM tree_parties as tp INNER JOIN tree_parties_collection as tpc ON tp.assignor_and_assignee_id = tpc.assignor_and_assignee_id WHERE tpc.rf_id IN (SELECT rf_id FROM db_uspto.representative_transactions WHERE organisation_id = :orgId) AND MATCH(tp.name) AGAINST (:searchItem) GROUP BY tpc.rf_id`
            }

            let getList = await connection.application.query(customQuery3rdParty,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    logging: console.log,
                    replacements: { searchItem: search_string, orgId: req.orgId },
                }
            );

            if( getList.length > 0) {
                list = [ ...list, ...getList]
            }

            const customQueryLawyer = `SELECT a.rf_id as rf_id, (SELECT exec_dt FROM assignor WHERE assignor.rf_id = a.rf_id LIMIT 1) as date  FROM assignment as a WHERE a.rf_id IN (SELECT rf_id FROM db_uspto.representative_transactions WHERE organisation_id = :orgId) AND MATCH(a.cname, a.caddress_1) AGAINST (:searchItem) GROUP BY a.rf_id`

            getList = await connection.application.query(customQueryLawyer,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    logging: console.log,
                    replacements: { searchItem: search_string, orgId: req.orgId },
                }
            );

            if( getList.length > 0) {
                list = [ ...list, ...getList]
            }

            let customQueryDocument = ''

            if(!isNaN(search_string)) {
                customQueryDocument = `SELECT d.rf_id as rf_id, (SELECT exec_dt FROM assignor WHERE assignor.rf_id = d.rf_id LIMIT 1) as date FROM documentid as d WHERE d.rf_id IN (SELECT rf_id FROM db_uspto.representative_transactions WHERE organisation_id = :orgId) AND (d.appno_doc_num = :searchItem OR d.grant_doc_num = :searchItem) GROUP BY d.rf_id` 
            } else {
                customQueryDocument = `SELECT d.rf_id as rf_id, (SELECT exec_dt FROM assignor WHERE assignor.rf_id = d.rf_id LIMIT 1) as date FROM documentid as d WHERE d.rf_id IN (SELECT rf_id FROM db_uspto.representative_transactions WHERE organisation_id = :orgId) AND d.grant_doc_num = :searchItem GROUP BY d.rf_id` 
            }

            getList = await connection.application.query(customQueryDocument,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    logging: console.log,
                    replacements: { searchItem: search_string, orgId: req.orgId},
                }
            );

            if( getList.length > 0) {
                list = [ ...list, ...getList]
            }
            res.status(200).json(list);
        } else {
            res.status(401).send("Invalid request");
        }
    } catch ( err ) {
        console.log( err )
        res.status(500).send("Error while search.");
    }    
});

module.exports = route;