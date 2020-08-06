const express = require("express");

const route = express.Router();

const connection = require("../../config/db.config");

const helpers = require("../../helpers/helper");

//require the Model
const TreeParties = require("../../model/application/TreeParties");
const TreePartiesCollections = require("../../model/application/TreePartiesCollections");
const DocumentIds = require("../../model/application/DocumentIds");
const Errors = require("../../model/application/Errors");


const authJWT = require("../../helpers/verifyJwtToken");

const clientDBConnection = require("../../helpers/clientDBConnection");


/**
 * List of all portfolio from new table
 */

route.get("/portfolios/", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        const tabID = req.query.tab_id, portfolioID = req.query.portfolio;
        let result = [], errors = [], inprocess = [], limit = req.query.limit, offset = req.query.offset;
        if(portfolioID != '' && portfolioID != null && portfolioID != 'undefined') {
            if(parseInt(tabID) >= 0) {
                limit = limit > 0 ? parseInt(limit) : 1000;
                offset = offset > 0 ? parseInt(offset) : 0;
                result = await TreeParties.findAll({
                    attributes:[['assignor_and_assignee_id', 'id'], 'name'],
                    where: {representative_id: portfolioID, organisation_id: req.orgId, tab_id: tabID},
                    include:[
                        {
                            model: TreePartiesCollections,
                            as: 'collections',
                            attributes: ['rf_id'],
                            where:{tab_id: tabID},
                            include: [
                                {
                                    model: DocumentIds,
                                    as: 'assets',
                                    attributes: [['appno_doc_num','application'], ['grant_doc_num', 'patent']],
                                }
                            ]
                        }
                    ],
                    limit: limit,
                    offset: offset,
                    order: [
                        ['name', 'ASC']
                    ]                    
                });
            }
        } else {
            if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
                const getCompaniesList = await helpers.getCompaniesList(req.connection_db);
                if(getCompaniesList.length > 0) {
                    const allPortfolioList = [];
                    getCompaniesList.forEach(p =>  allPortfolioList.push(p.representative_id));

                    result = await TreeParties.findAll({
                        attributes:['representative_id', 'representative_name','tab_id'],
                        where: {representative_id: allPortfolioList, organisation_id: req.orgId},
                        group: ['organisation_id', 'representative_id', 'tab_id'],
                        order: [
                            ['tab_id', 'ASC'],
                            ['representative_name', 'ASC']
                        ]
                    }) 
                }
            }
        }
        let conditions = {organisation_id: req.orgId};
        if(portfolioID != '' && portfolioID != null && portfolioID != 'undefined') {
            conditions.representative_id = portfolioID;            
        }
        /**
         * Query took more than 15 sec
         */
        /*errors = await Errors.findAll({
            attributes:['appno_doc_num','type'],
            where: conditions,
            include: [
                {
                    model: DocumentIds,
                    as: 'assets',
                    attributes: [['appno_date','date']],
                    group: ['appno_date']
                }
            ]
        })*/

        /**
         * 
         * Inner Join taking more time so thats why used this
         */
        
        const getErrors = await Errors.findAll({
            attributes:['appno_doc_num'],
            where: conditions
        });
        

        if(getErrors != null && getErrors.length > 0) {
            const getList = [];
            getErrors.map(e => getList.push(e.appno_doc_num));
            
            const queryErrorList = "SELECT d.appno_doc_num as asset, date_format(ass.record_dt,'%m/%d/%Y') as created_at, ass.cname as name, 0 as type FROM documentid as d LEFT JOIN assignment as ass ON ass.rf_id = d.rf_id WHERE d.appno_doc_num IN(:appNo) GROUP BY d.appno_doc_num ORDER BY ass.record_dt DESC";

            errors = await connection.application.query(queryErrorList,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                replacements: { appNo: getList },
                logging: console.log,
                }
            );
        }

        res.status(200).json({portfolios: result, errors: errors, inprocess: inprocess});
    }catch( err ) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
});



/**
 * List of all portfolio for the client
 */

route.get("/:type", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        /**
         * Connect with client DB and find the list of the companies 
         * and then go to the application database and get the customer list 
         * of those companies
         * For the client connection use middleware function to get the DB connection
         */
        let subsidariesAndCustomer = [];
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const getCompaniesList = await helpers.getCompaniesList(req.connection_db);
            if(getCompaniesList.length > 0) {
                const customerType = req.params.type;					
                if(customerType != "") {                    
                    for(let i = 0; i < getCompaniesList.length; i++) {

                        let searchData = {};

                        if(customerType == 'employee') {
                            searchData = {tabId: 0, parent: 0, organisation_id: req.orgId, representative_id: getCompaniesList[i].representative_id};
                        } else if (customerType == 'ownership') {
                            searchData = {tabId: 1, parent: 0, organisation_id: req.orgId, representative_id: getCompaniesList[i].representative_id};
                        } else if (customerType == 'security') {
                            searchData = {tabId: 2, parent: 0, organisation_id: req.orgId, representative_id: getCompaniesList[i].representative_id};
                        } else if (customerType == 'other') {
                            searchData = {tabId: 3, parent: 0, organisation_id: req.orgId, representative_id: getCompaniesList[i].representative_id};
                        }

                        let customQuery = 'SELECT count(assignor_and_assignee_id) as counter FROM tree WHERE tab = :tabId AND parent = :parent AND organisation_id = :organisation_id AND representative_id = :representative_id GROUP BY name ORDER BY name ASC' ;

                        let getAllTransactionData = await connection.application.query(customQuery,{
                            type: connection.Sequelize.QueryTypes.SELECT,
                            raw: true,
                            logging: console.log,
                            replacements: searchData,
                            plain: true
                        });

                        if(getAllTransactionData != null && getAllTransactionData.counter > 0) {
                            subsidariesAndCustomer.push({id:getCompaniesList[i].representative_id, name: getCompaniesList[i].original_name, children:[], level: 0});
                        }                        
                    }
                }
            }
        }
        res.status(200).json(subsidariesAndCustomer);
    } catch( err ) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
});

/**
 * Find all parties according to the tab
 * 
 */

route.get("/:parentCompany/parties/:tabId", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        /**
         * Connect with client DB and find the list of the companies 
         * and then go to the application database and get the customer list 
         * of those companies
         * For the client connection use middleware function to get the DB connection
         */
        console.log("PARTIES");
        let subsidariesAndCustomer = [];
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const parentCompany = req.params.parentCompany, tabId = req.params.tabId;		
            const getCompaniesList = await helpers.checkCustomerCompany(req.connection_db, parentCompany);
            if(getCompaniesList != null) {
                const querytree =  "SELECT assignor_and_assignee_id as id, name,'Invented' as type, 1 as level, 'closed' as state, "+getCompaniesList.representative_id+" as parent_id FROM tree WHERE tab = :tabId AND parent = :parent AND organisation_id = :organisationID AND representative_id = :representativeID GROUP BY name ORDER BY name ASC";

                subsidariesAndCustomer = await connection.application.query(querytree,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    replacements: { organisationID: req.orgId, representativeID: getCompaniesList.representative_id, tabId: tabId, parent: 0 },
                    raw: true,
                    logging: console.log,
                    }
                );
            }
        }
        res.status(200).json(subsidariesAndCustomer);
    } catch( err ) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
});

/**
 * FInd all transaction according to the parties
 */

route.get("/:parentCompany/:name/collections/:tabId",[authJWT.verifyToken], async(req, res, next) => {    
    try{
        
        const organisationData = await helpers.findOrganisationbyID(req.orgId);
        let allFrames = [];
        if(organisationData != null && organisationData.organisation_id > 0){
            
            const customerName = req.params.name, parentCompany = req.params.parentCompany, tabId = req.params.tabId;					
            if(customerName != "") {
                
                let searchData = {};

                if(tabId == 0) {
                    searchData = {name: parentCompany, customer_name: customerName, convey_type: ['assignment', 'employee'], employer_assign: 1};
                } else if (tabId == 1) {
                    searchData = {name: parentCompany, customer_name: customerName, convey_type: ['assignment', 'merger' ], employer_assign: 0};
                } else if (tabId == 2) {
                    searchData = {name: parentCompany, customer_name: customerName, convey_type: ['security', 'release' ], employer_assign: 0};
                } else if (tabId == 3) {
                    searchData = {name: parentCompany, customer_name: customerName, convey_type: ['namechg', 'govern', 'other', 'missing', 'correct' ], employer_assign: 0};
                }

                
                let customQueryAssignee = "SELECT ac.rf_id, ac.rf_id as name, date_format(ac.exec_dt, '%m-%d-%Y') as exec_dt, (select count(d.appno_doc_num)  FROM documentid as d WHERE d.rf_id = ac.rf_id) as counter FROM assignor as ac INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as rr ON rr.representative_id = aa.representative_id INNER JOIN (SELECT a.rf_id FROM assignment as a INNER JOIN assignment_conveyance as ass ON ass.rf_id = a.rf_id INNER JOIN documentid as d ON ass.rf_id = d.rf_id INNER JOIN assignee as acc ON acc.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = acc.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE ass.convey_ty IN(:convey_type) AND ass.employer_assign = :employer_assign AND (aaa.name = :name OR r.representative_name = :name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id WHERE (aa.name = :customer_name OR rr.representative_name = :customer_name) GROUP BY ac.rf_id ORDER BY ac.rf_id ASC, exec_dt ASC";
                console.log(customQueryAssignee);
                let getAssignorData = await connection.application.query(customQueryAssignee,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    replacements: searchData,
                    raw: true,
                    logging: console.log,
                    }
                );

                let customQueryAssignor = "SELECT ac.rf_id, ac.rf_id as name,  (SELECT date_format(ap.exec_dt, '%m-%d-%Y') FROM assignor as ap WHERE ap.rf_id = ac.rf_id ORDER BY ap.exec_dt ASC LIMIT 1) as exec_dt, (select count(d.appno_doc_num)  FROM documentid as d WHERE d.rf_id = ac.rf_id) as counter  FROM assignee as ac INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as rr ON rr.representative_id = aa.representative_id INNER JOIN (SELECT a.rf_id FROM assignment as a INNER JOIN assignment_conveyance as ass ON ass.rf_id = a.rf_id INNER JOIN documentid as d ON ass.rf_id = d.rf_id INNER JOIN assignor as acc ON acc.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = acc.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE ass.convey_ty IN(:convey_type) AND ass.employer_assign = :employer_assign AND (aaa.name = :name OR r.representative_name = :name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id WHERE (aa.name = :customer_name OR rr.representative_name = :customer_name) GROUP BY ac.rf_id ORDER BY  ac.rf_id ASC, exec_dt ASC";
                console.log(customQueryAssignor);
                let getAssigneeData = await connection.application.query(customQueryAssignor,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    replacements: searchData,
                    raw: true,
                    logging: console.log,
                    }
                );
                
                let allReelFrames = [...getAssignorData, ...getAssigneeData];
                
                if(allReelFrames.length > 0) {
                    allReelFrames.sort(function (a, b) {
                        return a.name - b.name;
                    });
                    let allReel = [];
                    
                    if(allReelFrames.length > 0) {
                        allReelFrames.forEach( async reel => {									
                            if( !allReel.includes(reel.rf_id) ){
                                allReel.push( reel.rf_id );
                                const newReel = {...reel};
                                newReel.id = reel.rf_id;
                                newReel.level = 2;
                                await allFrames.push(newReel);
                            }
                        });
                    }
                }
                
            }
        }
        res.status(200).json(allFrames);				
    } catch ( err ) {
        console.log(err);
        res.status(500).send("Internal error");
    }
});	

/**
 * Find all assets in the Transaction ID
 */

route.get("/:rf_id/assets",[authJWT.verifyToken], async(req, res, next) => {   
    try{
        console.log("ASSETS");
        const organisationData = await helpers.findOrganisationbyID(req.orgId);
        let allPatents = [];
        if(organisationData != null && organisationData.organisation_id > 0){
            const rfID = req.params.rf_id;					
            if(rfID > 0) {
                let customQueryList = "Select CONCAT(appno_doc_num, grant_doc_num) as id, CASE WHEN grant_doc_num = '' THEN appno_doc_num ELSE grant_doc_num END as name, CASE WHEN grant_doc_num = '' THEN 1 ELSE 0 END as type,  appno_doc_num, grant_doc_num, 3 as level FROM documentid WHERE rf_id = :rf_id ORDER BY cast(name as unsigned) ASC";
                
                allPatents = await connection.application.query(customQueryList,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    replacements: { rf_id: rfID},
                    raw: true,
                    logging: console.log,
                    }
                );
            }
        }
        res.status(200).json(allPatents);				
    } catch ( err ) {
        console.log(err);
        res.status(500).send("Internal error");
    }
});

module.exports = route;