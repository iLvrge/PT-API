const express = require("express");

const route = express.Router();

//require the Model

const Errors = require("../../model/application/Errors");

const Activities = require("../../model/client/Activities");

const Professionals = require("../../model/client/Professionals");

const authJWT = require("../../helpers/verifyJwtToken");

const connection = require("../../config/db.config");

const clientDBConnection = require("../../helpers/clientDBConnection");

const helpers = require("../../helpers/helper");

route.get("/errors", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        const companyList = req.query.companies, tabList = req.query.tabs, customerList = req.query.customers, transactionList = req.query.transactions, offset = req.query.offset, limit = req.query.limit;
        let errorList = [];
        const organisationData = await helpers.findOrganisationbyID(req.orgId);
        //console.log(0);
        if(organisationData != null && organisationData.organisation_id > 0 && typeof req.connection_db != "undefined" && req.connection_db != null){            
            const where = {organisation_id: req.orgId};

            if(companyList != undefined && companyList != '') {
                const companies = JSON.parse(companyList);
                where.representative_id = companies;
            }
            
            let applicationNumber = [];
            if((customerList != undefined && customerList != '')  || (transactionList != undefined && transactionList != '') || (tabList != undefined && tabList != '')) {
                let queryFindApplication = "SELECT appno_doc_num FROM documentid WHERE rf_id IN (SELECT rf_id FROM tree_parties_collection as tpc INNER JOIN tree_parties as tp ON tp.assignor_and_assignee_id = tpc.assignor_and_assignee_id WHERE organisation_id = :organisation_id ";

                let representatives = [], rfIDS = [], customers = [], tabs = [];

                if(companyList != undefined && companyList != '') {
                    representatives = JSON.parse(companyList);
                    if(representatives.length > 0) {
                        queryFindApplication += " AND tpc.representative_id IN (:companyList)";
                    }                    
                }

                if(customerList != undefined && customerList != '') {
                    customers = JSON.parse(customerList);
                    if(customers.length > 0) {
                        queryFindApplication += "  AND tpc.assignor_and_assignee_id IN (:customerList)";
                    }                    
                }

                if(transactionList != undefined && transactionList != '') {
                    rfIDS = JSON.parse(transactionList);
                    if(rfIDS.length > 0) {
                        queryFindApplication += " AND tpc.rf_id IN (:rfIDList)";
                    }                    
                }

                if(tabList != undefined && tabList != '') {
                    tabs = JSON.parse(tabList);
                    if(tabs.length > 0) {
                        queryFindApplication += " AND tpc.tab_id IN (:tabList)";
                    }
                }

                queryFindApplication += " )";

                const applicationWhere = {organisation_id: req.orgId};

                if(representatives.length > 0) {
                    applicationWhere.companyList = representatives.join(',');
                }

                if(customers.length > 0) {
                    applicationWhere.customerList = customers.join(',');
                }

                if(rfIDS.length > 0) {
                    applicationWhere.rfIDList = rfIDS.join(',');
                }

                if(tabs.length > 0) {
                    applicationWhere.tabList = tabs.join(',');
                }

                const findApplications = await connection.application.query(queryFindApplication,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: applicationWhere,
                        raw: true,
                        logging: console.log,
                    }
                ); 

                if( findApplications != null ) {
                    const promises = findApplications.map(async application => {
                        applicationNumber.push(application.appno_doc_num);
                        return application;
                    });
                    await Promise.all(promises);
                }
            }

            if(applicationNumber.length > 0) {
                where.appno_doc_num = applicationNumber;
            }           


            const conditionInError = {attributes: ['appno_doc_num', 'type'], where: where};

            if(offset != undefined && offset > 0) {
                if(limit != undefined ) {
                    limit = limit > 0 ? parseInt(limit) : 100;

                    conditionInError.limit =  limit;
                    conditionInError.offset = offset;
                }
            }
            conditionInError.group = ['appno_doc_num'];

            
            const list = await Errors.findAll(conditionInError);

            if(list != null && list.length > 0) {
                const getList = [];
                list.map(e => getList.push(e.appno_doc_num));

                const queryErrorList = "SELECT d.appno_doc_num as assetId, CASE WHEN d.grant_doc_num = '' THEN 'patent' ELSE d.grant_doc_num END as grant_doc_num, date_format(ass.record_dt,'%m/%d/%Y') as date, date_format(ass.last_update_dt,'%m/%d/%Y') as updatedAt, ass.cname as name FROM documentid as d LEFT JOIN assignment as ass ON ass.rf_id = d.rf_id WHERE d.appno_doc_num IN(:appNo) GROUP BY d.appno_doc_num ORDER BY ass.record_dt DESC";

                const getErrorDetails = await connection.application.query(queryErrorList,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    replacements: { appNo: getList },
                    logging: console.log,
                    }
                );

                if(getErrorDetails != null && getErrorDetails.length > 0) {
                    /**Notes */
                    const Activity = req.connection_db.define('Activities', Activities.mainStructure, Activities.options);
                    const Professional = req.connection_db.define('Professionals', Professionals.mainStructure, Professionals.options);
    
                    Activity.belongsTo(Professional, { foreignKey: 'professional_id', as: 'creator' });

                    const getApplicationPatentList = [];
                    const mapAppPatentPromises = getErrorDetails.map(e => {
                        getApplicationPatentList.push(e.assetId);
                        if(e.grant_doc_num != 'patent') {
                            getApplicationPatentList.push(e.grant_doc_num);
                        }                        
                        return e;
                    });

                    await Promise.all(mapAppPatentPromises);

                    const notes = await Activity.findAll({
                        where: {subject: getApplicationPatentList, subject_type: [4, 5]},
                        attributes: [['comment', 'message'], ['created_at', 'date'], 'professional_id'],
                        include:[
                            {
                                model: Professional,
                                as: 'creator',    
                                attributes: [[connection.Sequelize.fn('concat', connection.Sequelize.col('first_name'), ' ', connection.Sequelize.col('last_name')), 'createdBy']]                          
                            }
                        ],
                        order: [
                            ['created_at', 'DESC'],
                        ],
                    });

                    const promises = list.map( async e => {       
                        let error = {};                
                        getErrorDetails.forEach(d => {
                            if(e.appno_doc_num == d.assetId){
                                error = {...d};
                                error.type = e.type;                                
                                return false;
                            }
                        });
                        
                        if(error.hasOwnProperty('type')) {
                            let notesList = [];                            
                            if(notes != null) {
                                const promise = notes.map( n => {                                   
                                    if(n.subject == e.appno_doc_num || n.subject == error.grant_doc_num){
                                        notesList.push(notes);
                                    }
                                    return n;
                                });
                                await Promise.all(promise);
                            }
                            error.notes = notesList
                            errorList.push(error);
                        }
                        return e;
                    });
                    await Promise.all(promises);    
                }                
            }
        }
        res.status(200).json(errorList);
    } catch ( err ) {
        console.log("ERRORS:"+err);
        res.status(500).send("Internal server error.");
    }
});

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
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {     
            if(companyName != 'undefined' && companyName != 0) {
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
                const errorCount = await Errors.count({
                    where: {organisation_id: req.orgId},
                    col: 'error_id',                            
                });
                res.status(200).json({uspto: errorCount, patent: 0});
            }
        } else {
            res.status(200).json({uspto: 0, patent: 0});
        }
    } else if(type == 'list') {        
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {

            if(companyName != 'undefined' && companyName != 0) {

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

                        const queryErrorList = "SELECT d.appno_doc_num as asset, date_format(ass.record_dt,'%m/%d/%Y') as created_at, ass.cname as name FROM documentid as d LEFT JOIN assignment as ass ON ass.rf_id = d.rf_id WHERE d.appno_doc_num IN(:appNo) GROUP BY d.appno_doc_num ORDER BY ass.record_dt DESC";

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
                const queryError = "SELECT appno_doc_num FROM error as e WHERE e.organisation_id = :organisationID  GROUP BY e.appno_doc_num";
                const getErrors= await connection.application.query(queryError,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    replacements: { organisationID: req.orgId},
                    logging: console.log,
                });  
                let getErrorList = [];
                if(getErrors != null && getErrors.length > 0) {
                    const getList = [];
                    getErrors.map(e => getList.push(e.appno_doc_num));

                    const queryErrorList = "SELECT d.appno_doc_num as asset, date_format(ass.record_dt,'%m/%d/%Y') as created_at, ass.cname as name FROM documentid as d LEFT JOIN assignment as ass ON ass.rf_id = d.rf_id WHERE d.appno_doc_num IN(:appNo) GROUP BY d.appno_doc_num ORDER BY ass.record_dt DESC";

                    getErrorList = await connection.application.query(queryErrorList,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        replacements: { appNo: getList },
                        logging: console.log,
                        }
                    );
                }       
                res.status(200).json({invent:getErrorList, assign: [], corr: [], address: [], security: []});    
            }
        } else {
            res.status(200).json({invent:[], assign: [], corr: [], address: [], security: []});
        }
    }    
});

module.exports = route;