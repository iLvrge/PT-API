const express = require("express");

const route = express.Router();

//require the Model

const Errors = require("../../model/application/Errors");

/*const Activities = require("../../model/client/Activities");

const Professionals = require("../../model/client/Professionals");*/

const authJWT = require("../../helpers/verifyJwtToken");

const connection = require("../../config/db.config");

const clientDBConnection = require("../../helpers/clientDBConnection");

const helpers = require("../../helpers/helper");

route.get("/errors", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        const companyList = req.query.companies, tabList = req.query.tabs, customerList = req.query.customers, transactionList = req.query.transactions, offset = req.query.offset, limit = req.query.limit, patentList = req.query.patents, count = req.query.count;
        let errorList = [];
        
        //console.log(0);
        if( req.orgId > 0 && typeof req.connection_db != "undefined" && req.connection_db != null){            
            const where = {organisation_id: req.orgId};

            if(companyList != undefined && companyList != '') {
                const companies = JSON.parse(companyList);
                where.representative_id = companies;
            }
            
            let applicationNumber = [];
            if((tabList != undefined && tabList != '')  || (customerList != undefined && customerList != '')  || (transactionList != undefined && transactionList != '') || (patentList != undefined && patentList != '')) {
                let queryFindApplication = "SELECT d.appno_doc_num FROM documentid as d WHERE d.rf_id IN (SELECT rf_id FROM tree_parties_collection as tpc WHERE tpc.organisation_id = :organisation_id ";

                let representatives = [], rfIDS = [], customers = [], patents = [], tabs = [];

                if(companyList != undefined && companyList != '') {
                    representatives = JSON.parse(companyList);
                    if(representatives.length > 0) {
                        queryFindApplication += " AND tpc.representative_id IN (:companyList)";
                    }                    
                }

                if(tabList != undefined && tabList != '') {
                    tabs = JSON.parse(tabList);
                    if(tabs.length > 0) {
                        queryFindApplication += "  AND tpc.tab_id IN (:tabList)";
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
               

                queryFindApplication += " GROUP BY rf_id ) ";

                if(patentList != undefined && patentList != '') {
                    patents = JSON.parse(patentList);
                    if(patents.length > 0) {
                        queryFindApplication += " AND (d.grant_doc_num IN (:patList) OR d.appno_doc_num IN (:patList))";
                    }                    
                }

                queryFindApplication += "  GROUP BY d.appno_doc_num";


                const applicationWhere = {organisation_id: req.orgId};

                if(representatives.length > 0) {
                    applicationWhere.companyList = representatives;
                }

                if(tabs.length > 0) {
                    applicationWhere.tabList = tabs;
                }

                if(customers.length > 0) {
                    applicationWhere.customerList = customers;
                }

                if(rfIDS.length > 0) {
                    applicationWhere.rfIDList = rfIDS;
                }

                if(patents.length > 0) {
                    applicationWhere.patList = patents;
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
            where.status = 0;
            const conditionInError = { where: where};

            if(count == true || count == 'true') {
                console.log(conditionInError);
                conditionInError.distinct = 'appno_doc_num';
                errorList = await Errors.count(conditionInError);
            } else {
                if(offset != undefined && offset > 0) {
                    if(limit != undefined ) {
                        limit = limit > 0 ? parseInt(limit) : 100;
    
                        conditionInError.limit =  limit;
                        conditionInError.offset = offset;
                    }
                }
                conditionInError.attributes = ['error_id',['appno_doc_num', 'assetId'],['cname','name'],['caddress_1','lawyer_name'],[connection.application.fn('date_format', connection.application.col('record_dt'), '%b %d, %Y'), 'date'], 'type'];
                conditionInError.group = ['appno_doc_num'];
                errorList = await Errors.findAll(conditionInError);
            }
        }
        res.status(200).json(errorList);
    } catch ( err ) {
        console.log("ERRORS:"+err);
        res.status(500).send("Internal server error.");
    }
});

route.get("/errors/:type/:companyName", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    if(type == 'count') {  
        res.status(200).json({title: 0, address: 0, other: 0});        
    } else if(type == 'list') {        
        res.status(200).json({invent:[], assign: [], corr: [], address: [], security: []});
    }    
});

module.exports = route;