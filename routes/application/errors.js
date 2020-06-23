const express = require("express");

const route = express.Router();

//require the Model

const Errors = require("../../model/application/Errors");

const authJWT = require("../../helpers/verifyJwtToken");

const connection = require("../../config/db.config");

route.get("/errors/:type", [authJWT.verifyToken], async(req, res, next) => {

    const type = req.params.type;

    if(type == 'count') {        
        const errorCount = await Errors.count({
                            where: {organisation_id: req.orgId},
                            col: 'error_id',                            
                        });
        res.status(200).json({uspto: errorCount, patent: 0});
    } else if(type == 'list') {
        const queryErrorList = "SELECT e.* , ass.record_dt, ass.cname as name FROM error as e INNER JOIN documentid as d ON d.appno_doc_num = e.appno_doc_num INNER JOIN assignment as ass ON ass.rf_id = d.rf_id WHERE e.organisation_id = :organisationID GROUP BY e.appno_doc_num ORDER BY ass.record_dt DESC";

        const getErrorList = await connection.application.query(queryErrorList,{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            replacements: { organisationID: req.orgId },
            logging: console.log,
          }
        );        
        res.status(200).json({invent:getErrorList, assign: [], corr: [], address: [], security: []});
    }
    
});

module.exports = route;