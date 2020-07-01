const express = require("express");

const route = express.Router();

//require the Model

const Errors = require("../../model/application/Errors");

const authJWT = require("../../helpers/verifyJwtToken");

const connection = require("../../config/db.config");

const clientDBConnection = require("../../helpers/clientDBConnection");

const helpers = require("../../helpers/helper");

route.get("/errors/:type/:companyName", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {

    const type = req.params.type;
    let companyName = req.params.companyName;
    if(companyName == 'undefined') {
        const findMainCompany = await helpers.findOrganisationbyID(req.orgId);
        if(findMainCompany != null) {
            companyName = findMainCompany.name;
        }
    }

    if(type == 'count') {     
        if(companyName != 'undefined') {
            if(typeof req.connection_db != "undefined" && req.connection_db != null ) {   
                const queryFindParent = "SELECT representative_id FROM representative WHERE (original_name = :name OR representative_name = :name) AND parent_id = 0";
            
                const findParent = await req.connection_db.query(queryFindParent,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    replacements: { name: companyName },
                    raw: true,
                    plain: true,
                    logging: console.log,
                    }
                ); 

                if(findParent != null && findParent.representative_id > 0) {
                    const errorCount = await Errors.count({
                                        where: {organisation_id: req.orgId, representative_id: findParent.representative_id},
                                        col: 'error_id',                            
                                    });
                    res.status(200).json({uspto: errorCount, patent: 0});
                } else {
                    res.status(200).json({uspto: 0, patent: 0});
                }
            } else {
                res.status(200).json({uspto: 0, patent: 0});
            }
        } else {
            res.status(200).json({uspto: 0, patent: 0});
        }
    } else if(type == 'list') {
        if(companyName != 'undefined') {
            if(typeof req.connection_db != "undefined" && req.connection_db != null ) {   

                const queryFindParent = "SELECT representative_id FROM representative WHERE (original_name = :name OR representative_name = :name) AND parent_id = 0";
                
                const findParent = await req.connection_db.query(queryFindParent,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    replacements: { name: companyName },
                    raw: true,
                    plain: true,
                    logging: console.log,
                    }
                ); 
                let getErrorList = [];
                if(findParent != null && findParent.representative_id > 0) {
                   
                    const queryError = "SELECT appno_doc_num FROM error as e WHERE e.organisation_id = :organisationID AND e.representative_id = :representative_id GROUP BY e.appno_doc_num";
                    const getErrors= await connection.application.query(queryError,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        replacements: { organisationID: req.orgId, representative_id: findParent.representative_id },
                        logging: console.log,
                    });  

                    if(getErrors != null && getErrors.length > 0) {
                        const getList = [];
                        getErrors.map(e => getList.push(e.appno_doc_num));

                        const queryErrorList = "SELECT d.appno_doc_num, ass.record_dt, ass.cname as name FROM documentid as d LEFT JOIN assignment as ass ON ass.rf_id = d.rf_id WHERE d.appno_doc_num IN(:appNo) ORDER BY ass.record_dt DESC";

                        getErrorList = await connection.application.query(queryErrorList,{
                            type: connection.Sequelize.QueryTypes.SELECT,
                            raw: true,
                            replacements: { appNo: getList },
                            logging: console.log,
                            }
                        );
                    }       
                    res.status(200).json({invent:getErrorList, assign: [], corr: [], address: [], security: []});
                } else {
                    res.status(200).json({invent:[], assign: [], corr: [], address: [], security: []});
                }
            } else {
                res.status(200).json({invent:[], assign: [], corr: [], address: [], security: []});
            }
        } else {
            res.status(200).json({invent:[], assign: [], corr: [], address: [], security: []});
        }
    }    
});

module.exports = route;