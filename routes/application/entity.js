const express = require("express");

const route = express.Router();

const connection = require("../../config/db.config");

//require the Model

const authJWT = require("../../helpers/verifyJwtToken");

//const clientDBConnection = require("../../helpers/clientDBConnection");


route.get("/search/:search_string/:type", [ authJWT.verifyToken ], async (req, res, next) => {
    try {
        
        const { search_string, type } = req.params
        const limit = 1000
        let getList = []
        if(type == 1) {
            const customQuery = `SELECT assignor_and_assignee_id as id, name FROM assignor_and_assignee WHERE MATCH(name) AGAINST (:searchItem) GROUP BY name ORDER BY name ASC LIMIT :limit`

            getList = await connection.resources.query(customQuery,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    logging: console.log,
                    replacements: { searchItem: search_string, limit: limit },
                }
            );
        } else if( type == 2) {
            const customQuery = `SELECT rf_id as id, cname as name FROM assignment WHERE MATCH(cname) AGAINST (:searchItem) GROUP BY cname ORDER BY cname ASC LIMIT :limit`

            getList = await connection.resources.query(customQuery,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    logging: console.log,
                    replacements: { searchItem: search_string, limit: limit },
                }
            );
        }
        res.status(200).json(getList); 
    } catch ( err ) {
        console.log('entity=>search ', err )
        res.status(500).send("Error while search.");
    }    
});


module.exports = route;