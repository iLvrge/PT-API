const express = require("express");

const route = express.Router();

const connection = require("../../config/db.config");

const helpers = require("../../helpers/helper");

//require the Model
const TreeParties = require("../../model/application/TreeParties");
const TreePartiesCollections = require("../../model/application/TreePartiesCollections");
const DocumentIds = require("../../model/application/DocumentIds");



const authJWT = require("../../helpers/verifyJwtToken");

const clientDBConnection = require("../../helpers/clientDBConnection");

/**
 * Return list of companies with total number of Assets and Total Customer
 */

route.get("/:tabID", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        const tabID = req.params.tabID, result = [];
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const getCompaniesList = await helpers.getCompaniesList(req.connection_db), allPortfolioList = [];
            if(getCompaniesList.length > 0) {                   
                getCompaniesList.forEach(p =>  allPortfolioList.push(p.representative_id));
                if(allPortfolioList.length > 0){
                    const resultParties = await TreeParties.findAll({
                        attributes:[['representative_id','id'], ['representative_name','name'], [connection.Sequelize.fn('COUNT', 'assignor_and_assignee_id'), 'totalCustomers']],
                        where: {representative_id: allPortfolioList, organisation_id: req.orgId, tab_id: tabID},
                        group: ['organisation_id', 'representative_id'],  
                        /*include:[
                            {
                                model: TreePartiesCollections,
                                as: 'collections',
                                attributes:[[connection.Sequelize.fn('sum', 'assets_count'), 'totalAssets']],
                                where: {organisation_id: req.orgId, tab_id: tabID},
                                group:['organisation_id', 'representative_id', 'tab_id']
                            }
                        ], */                    
                        order: [
                            ['representative_name', 'ASC']
                        ]
                    });
                    if(resultParties.length > 0) {
                        const promises = resultParties.map(async portfolio => {
                            /**
                             * Get Count of all the Application number from all the rf_id from the parties collection table
                             */
                            //const findTotalAssets = 


                            const queryFindTotalAssets = "SELECT COUNT('appno_doc_num') as totalAssets FROM documentid WHERE rf_id IN (SELECT rf_id FROM tree_parties_collection WHERE representative_id = :representative_id AND tab_id = :tab_id AND organisation_id = :organisationID GROUP BY rf_id)";

                            const findCounter =  await connection.application.query(queryFindTotalAssets,{
                                type: connection.Sequelize.QueryTypes.SELECT,
                                raw: true,
                                logging: console.log,
                                plain: true,
                                replacements: { organisationID: req.orgId, representative_id: portfolio.get('id'), tab_id: tabID },
                              }
                            );
                            const portfolioJSON = portfolio.toJSON();
                            console.log(findCounter);
                            if(findCounter != null && findCounter.totalAssets > 0) {                                
                                portfolioJSON.totalAssets = findCounter.totalAssets;                               
                            } else {
                                portfolioJSON.totalAssets = 0;        
                            }
                            result.push(portfolioJSON);
                            return findCounter;
                        });
                        await Promise.all(promises);
                    }
                }
            }
        }
        res.status(200).json(result);
    } catch( err ) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
});

/**
 * Return list of customers under particular company with total number of Assets and Total Transactions
 */

route.get("/:tabID/companies/:companyID", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        const tabID = req.params.tabID, representativeID = req.params.companyID;
        let limit = req.query.limit, offset = req.query.offset, customerList = [];
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const whereConstraint = {
                attributes:[['assignor_and_assignee_id', 'id'], 'name', [connection.Sequelize.fn('sum', connection.Sequelize.col('tree_parties.transaction_count')), 'totalTransactions'], [connection.Sequelize.fn('sum', connection.Sequelize.col('tree_parties.assets_count')), 'totalAssets']],
                where: {representative_id: representativeID, organisation_id: req.orgId, tab_id: tabID},
                group:['organisation_id', 'representative_id', 'tab_id']
            };

            if(limit != undefined && limit != null) {
                limit = limit > 0 ? parseInt(limit) : 100;
                offset = offset > 0 ? parseInt(offset) : 0;

                whereConstraint.limit = limit;
                whereConstraint.offset = offset;
            }

            whereConstraint.order = [['name', 'ASC']];
            customerList = await TreeParties.findAll(whereConstraint);
            
            /*const list = await TreeParties.findAll(whereConstraint);
            console.log(list);
            if(list.length > 0) {
                const promises = list.map(async customer => {
                    // Get Count of all the Application number from all the rf_id from the parties collection table for particular customer
                    
                    const queryFindTotalAssets = "SELECT COUNT(rf_id) as totalTransactions, (SELECT COUNT('appno_doc_num') as totalAssets FROM documentid as d WHERE rf_id IN (SELECT rf_id FROM tree_parties_collection WHERE representative_id = :representative_id AND tab_id = :tab_id AND assignor_and_assignee_id = :customer_id GROUP BY rf_id)) as totalAssets FROM tree_parties_collection WHERE representative_id = :representative_id AND tab_id = :tab_id AND assignor_and_assignee_id = :customer_id AND organisation_id = :organisation_id  ";

                    const findCounter =  await connection.application.query(queryFindTotalAssets,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        logging: console.log,
                        plain: true,
                        replacements: {organisation_id: req.orgId, representative_id: representativeID, tab_id: tabID, customer_id: customer.get('id') },
                    }
                    );
                    const customerJSON = customer.toJSON();
                    console.log(customerJSON);
                    if(findCounter != null && findCounter.totalTransactions > 0) {                                
                        customerJSON.totalAssets = findCounter.totalAssets;  
                        customerJSON.totalTransactions = findCounter.totalTransactions;                                    
                    } else {
                        customerJSON.totalAssets = 0;      
                        customerJSON.totalTransactions = 0;    
                    }
                    customerList.push(customerJSON);
                    return findCounter;
                });
                await Promise.all(promises);
            }*/
        }
        res.status(200).json(customerList);
    } catch( err ) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
});

/**
 * List of all customers of selected tab i.e acquistions, security etc
 */

route.get("/:tabID/customers", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {

    try {
        const tabID = req.params.tabID, companies = JSON.parse(req.query.companiesIds);
        let customerList = [];
        let limit = req.query.limit, offset = req.query.offset;

        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            

            const whereConstraint = {
                attributes:[['assignor_and_assignee_id', 'customer_id'], ['representative_id', 'company_id'], 'name', [connection.Sequelize.fn('sum', connection.Sequelize.col('tree_parties.transaction_count')), 'transactionCount'], [connection.Sequelize.fn('sum', connection.Sequelize.col('tree_parties.assets_count')), 'assetsCount']],
                where: {representative_id: companies, tab_id: tabID, organisation_id: req.orgId},
                group: ['name']
            };

            if(limit != undefined && limit != null ) {
                limit = limit > 0 ? parseInt(limit) : 100;
                offset = offset > 0 ? parseInt(offset) : 0;

                whereConstraint.limit = limit;
                whereConstraint.offset = offset;
            }

            customerList = await TreeParties.findAll(whereConstraint);

            /* const list = await TreeParties.findAll(whereConstraint);

            if(list.length > 0) {
                const promises = list.map(async customer => {
                    const getTransactionCount = await TreePartiesCollections.count({
                        where: {organisation_id: req.orgId, representative_id: customer.get('company_id'), assignor_and_assignee_id: customer.get('customer_id'), tab_id: tabID}
                    });

                    // const getAssetsCount = await TreePartiesCollections.findAll({
                    //     subQuery: false,
                    //     attributes: { 
                    //         include: [[connection.Sequelize.fn('COUNT', connection.Sequelize.col('assets.appno_doc_num')), 'totalAssets']] 
                    //     }, 
                    //     where:{representative_id: customer.get('company_id'), assignor_and_assignee_id: customer.get('customer_id'), tab_id: tabID},
                    //     include: [{
                    //         model: DocumentIds, 
                    //         as: 'assets',
                    //         attributes: []
                    //     }],
                    //     group: ['assets.rf_id']
                    // });

                    const queryAssetsCount = 'SELECT count(distinct(appno_doc_num)) as assetsCount FROM documentid WHERE rf_id IN (SELECT rf_id FROM tree_parties_collection WHERE representative_id = :companyID AND assignor_and_assignee_id = :customerID AND tab_id = :tabID AND organisation_id = :organisationID)';

                    const getAssetsCount =  await connection.application.query(queryAssetsCount,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        logging: console.log,
                        plain: true,
                        replacements: { organisationID: req.orgId, tabID: tabID,  companyID: customer.get('company_id'), customerID: customer.get('customer_id')},
                    }
                    );

                    let assetsCount = 0;

                    if(getAssetsCount != null) {
                        assetsCount = getAssetsCount.assetsCount;
                    }

                    const customerJSON = customer.toJSON();
                    customerJSON.transactionCount = getTransactionCount;
                    customerJSON.assetsCount = assetsCount;
                    customerList.push(customerJSON);

                    return customer;
                });
                await Promise.all(promises);
            } */
        }
        res.status(200).json(customerList);
    } catch( err ) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
});

/**
 * List of all transaction of selected customer
 */

route.get("/:tabID/companies/:companyID/customers/:customerID", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        const tabID = req.params.tabID, representativeID = req.params.companyID, customerID = req.params.customerID;
        let limit = req.query.limit, offset = req.query.offset, transactionList = [];
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            limit = limit > 0 ? parseInt(limit) : 100;
            offset = offset > 0 ? parseInt(offset) : 0;
            const whereConstraint = {
                attributes:[['rf_id', 'id'], 'exec_dt', ['assets_count','totalAssets']],
                where: {organisation_id: req.orgId, representative_id: representativeID, assignor_and_assignee_id: customerID, tab_id: tabID}
            };

            if(limit != undefined && limit != null) {
                limit = limit > 0 ? parseInt(limit) : 100;
                offset = offset > 0 ? parseInt(offset) : 0;

                whereConstraint.limit = limit;
                whereConstraint.offset = offset;
            }

            whereConstraint.order = [['exec_dt', 'DESC']];

            transactionList = await TreePartiesCollections.findAll(whereConstraint);
            
            /* const list = await TreePartiesCollections.findAll(whereConstraint);
            if(list.length > 0) {
                const promises = list.map(async transaction => {

                    
                    //Get Count of all the Application number from all the rf_id from the parties collection table for particular customer
                    
                    const queryFindTotalAssets = "SELECT COUNT('appno_doc_num') as totalAssets FROM documentid WHERE rf_id = :rf_id";

                    const findCounter =  await connection.application.query(queryFindTotalAssets,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        logging: console.log,
                        plain: true,
                        replacements: { rf_id: transaction.get('id') },
                    }
                    );
                    let totalAssets = 0;
                    if(findCounter != null && findCounter.totalAssets > 0) {                                
                        totalAssets = findCounter.totalAssets;                               
                    }
                    const transactionJSON = transaction.toJSON();
                    transactionJSON.totalAssets = totalAssets;

                    transactionList.push(transactionJSON);

                    return findCounter;
                });
                await Promise.all(promises);
            } */
        }
        res.status(200).json(transactionList);
    } catch( err ) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
});

/**
 * Get list of patent with inthe transaction.
 */

route.get("/:tabID/companies/:companyID/customers/:customerID/transactions/:rfID", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        const tabID = req.params.tabID, representativeID = req.params.companyID, customerID = req.params.customerID, rfID = req.params.rfID;
        let assetList = [];
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            assetList = await DocumentIds.findAll({
                attributes: [['appno_doc_num', 'application'], ['grant_doc_num', 'patent']],
                where:{rf_id: rfID},
                order: [
                    ['appno_date', 'ASC']
                ]
            });
        }
        res.status(200).json(assetList);
    } catch( err ) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
});
module.exports = route;