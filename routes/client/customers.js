const express = require("express"),

    route = express.Router(),

    moment = require('moment'),

    connection = require("../../config/db.config"),

    helpers = require("../../helpers/helper"),

    authJWT = require("../../helpers/verifyJwtToken"),

    clientDBConnection = require("../../helpers/clientDBConnection");

//require the Model
const TreeParties = require("../../model/application/TreeParties");
const TreePartiesCollections = require("../../model/application/TreePartiesCollections");
const DocumentIds = require("../../model/application/DocumentIds");
const Representatives = require("../../model/application/Representatives");
const AssignorAndAssignee = require("../../model/application/AssignorAndAssignee");
const Timelines = require("../../model/application/Timelines");
//const Errors = require("../../model/application/Errors");
const TABS = [0,1,2,3,4,11,5,6,7,8,9,10];
const RECORD_LIMIT = 1000
const OFFSET = 0

/**
 * Find lifespan for all the company assets
 */

route.get("/events/", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        console.log("EVENTSSSS");
        const tabID = req.query.tab_id, portfolioID = req.query.portfolio;
        let portfolioList = [], assetsLifeSpan = [];
        if(portfolioID != '' && portfolioID != null && portfolioID != 'undefined') {            
            portfolioList = JSON.parse(portfolioID);
        } else {
            const getCompaniesList = await helpers.getCompaniesList(req.connection_db);
            if(getCompaniesList.length > 0) {                   
                const promises = getCompaniesList.map(p => {
                    portfolioList.push(p.representative_id);
                    return p;
                });

                await Promise.all(promises);
            }
        }

        if(portfolioList.length > 0) {
            assetsLifeSpan = await helpers.findAssetsTimeSpan(portfolioList, tabID, 0, 0, req.orgId);            
        }
        res.status(200).json(assetsLifeSpan);
    } catch(err) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
});

route.get("/timeline", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    let {companies, tabs, customers, rf_ids, limit, offset } = req.query, list = [], groups = []
    try {                
        const organisationData = await helpers.findOrganisationbyID(req.orgId);
        //console.log(0);
        if(organisationData != null && organisationData.organisation_id > 0 && typeof req.connection_db != "undefined" && req.connection_db != null) {
            
           /*  if( search != undefined && search != null ) {

                 const { uniquerfIDs } = await helpers.findRfIDsBySearchString(search)

                if(uniquerfIDs.length > 0) {
                    rfIDs = [...uniquerfIDs]
                } 
            }  */
            
            
            const where = {organisation_id: req.orgId}, DATE_FORMAT = 'YYYY-MM-DD';
            
            if(companies != undefined && companies != '') {
                companies = JSON.parse(companies)
                if(companies.length > 0) {
                    where.representative_id = companies
                }
            }

            if(tabs != undefined && tabs != '') {
                tabs = JSON.parse(tabs)
                if(tabs.length > 0) {
                    where.tab = tabs
                }
            }

            if(customers != undefined && customers != '') {
                customers = JSON.parse(customers);
                if(customers.length > 0) {
                    where.assignor_and_assignee_id = customers
                }
            }

            if(rf_ids != undefined &&  rf_ids != '' ) {
                rf_ids = JSON.parse(rf_ids);
                if(rf_ids.length > 0) {
                    where.rf_id = rf_ids
                }
            }

            const whereConstraint = {
                attributes:[
                    ['rf_id', 'id'],
                    'exec_dt', 
                    ['original_name', 'customerName'], 
                    ['tab', 'tab_id'], 
                    [connection.Sequelize.literal(`CASE WHEN (tab = 7 OR tab = 8 OR tab = 10) THEN 1  
                        WHEN (tab = 4 OR tab = 11 OR tab = 12 OR tab = 13) THEN 2  
                        WHEN (tab = 2 OR tab = 3) THEN 3  
                        WHEN (tab = 0 OR tab = 1 OR tab = 5 OR tab = 6) THEN 4  
                        WHEN (tab = 9) THEN 5
                    END`), 'group'], 
                    ['assets_count', 'totalAssets'],
                    ['representative_id', 'company']
                ],
                where: where,
                group: ['rf_id']
            };


            const findGroupContraint = {
                attributes: [['tab', 'group']],
                where: where,
                group: ['tab']
            } 

            

           /*  if(limit != undefined && limit != null) {
                limit = limit > 0 ? parseInt(limit) : 5000
                offset = offset > 0 ? parseInt(offset) : 0
            } else {
                limit = 5000
                offset = 0
            }

            whereConstraint.limit = limit;
            whereConstraint.offset = offset; */

            whereConstraint.order = [['exec_dt', 'DESC']]
            list = await Timelines.findAll(whereConstraint)
            groups = await Timelines.findAll(findGroupContraint)

            //selected_companies = await helpers.findRepresentativeByIDs(req.connection_db, companies)
        }
        res.status(200).json({list, groups});
        
    } catch ( err ) {
        console.log("Timeline:"+err);
        res.status(500).send("Internal server error.");
    }
})

route.get("/asset_types", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        let {companies} = req.query, tabs = [];
        if(companies && companies != '') {
            companies = JSON.parse( companies )
        }

        if( !companies || companies.length == 0 ) {
            const getCompaniesList = await helpers.getCompaniesList(req.connection_db);
            companies = []
            if(getCompaniesList.length > 0) {                   
                getCompaniesList.forEach(p =>  companies.push(p.representative_id));
            }
        }

        if( companies.length > 0) {
            tabs = await TreeParties.findAll({
                attributes:['tab_id', [connection.Sequelize.literal('COUNT(DISTINCT(name))', 'assignor_and_assignee_id'), 'customer_count']],
                where: {representative_id: companies, organisation_id: req.orgId},
                group:['tab_id']
            });
        }
        res.status(200).json(tabs);
    } catch ( err ) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
})

route.get("/asset_types/:tab_id/companies", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        let {companies, limit, offset } = req.query, result = []
        const {tab_id} = req.params;

        if(companies && companies != '') {
            companies = JSON.parse( companies )
        } 

        if( !companies || companies.length == 0 ) {
            const getCompaniesList = await helpers.getCompaniesList(req.connection_db);
            companies = []
            if(getCompaniesList.length > 0) {                   
                getCompaniesList.forEach(p =>  companies.push(p.representative_id));
            }
        }
        let total_records = 0;
        if( tab_id >= 0 ) {
            limit = limit > 0 ? parseInt(limit) : RECORD_LIMIT;
            offset = offset > 0 ? parseInt(offset) : OFFSET;
    
            total_records = await TreeParties.count({
                distinct: 'name',
                where: {representative_id: companies, organisation_id: req.orgId, tab_id: tab_id}
            })
            
            if( total_records > 0 ) {
                result = await TreeParties.findAll({
                    attributes:[['assignor_and_assignee_id', 'id'], 'name', ],
                    where: {representative_id: companies, organisation_id: req.orgId, tab_id: tab_id},
                    limit: limit,
                    offset: offset,
                    order: [
                        ['name', 'ASC']
                    ],
                    group: ['name']                  
                });
            }
        }
        res.status(200).json({list: result, tab_id, total_records });
    } catch ( err ) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
})

route.get("/asset_types/companies", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        let {companies, tabs, limit, offset } = req.query, result = []

        if(companies && companies != '') {
            companies = JSON.parse( companies )
        } 

        if( !companies || companies.length == 0 ) {
            const getCompaniesList = await helpers.getCompaniesList(req.connection_db);
            companies = []
            if(getCompaniesList.length > 0) {                   
                getCompaniesList.forEach(p =>  companies.push(p.representative_id));
            }
        }

        if(tabs && tabs != '') {
            tabs = JSON.parse( tabs )
        }

        if( !tabs || tabs.length == 0 ) {
            tabs = [...TABS]
        }

        limit = limit > 0 ? parseInt(limit) : RECORD_LIMIT;
        offset = offset > 0 ? parseInt(offset) : OFFSET;

        const total_records = await TreeParties.count({
            distinct: 'name',
            where: {representative_id: companies, organisation_id: req.orgId, tab_id: tabs}
        })
        
        if( total_records > 0 ) {
            result = await TreeParties.findAll({
                attributes:[['assignor_and_assignee_id', 'id'], 'name', [connection.Sequelize.fn('sum', connection.Sequelize.col('tree_parties.transaction_count')), 'totalTransactions']],
                where: {representative_id: companies, organisation_id: req.orgId, tab_id: tabs},
                limit: limit,
                offset: offset,
                order: [
                    ['name', 'ASC']
                ],
                group: ['name']                  
            });
        }
        res.status(200).json({list: result, total_records });
    } catch ( err ) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
})


route.get("/asset_types/assignments", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        let {companies, tabs, customers, limit, offset } = req.query, result = []

        if(companies && companies != '') {
            companies = JSON.parse( companies )
        } 

        if( !companies || companies.length == 0 ) {
            const getCompaniesList = await helpers.getCompaniesList(req.connection_db);
            companies = []
            if(getCompaniesList.length > 0) {                   
                getCompaniesList.forEach(p =>  companies.push(p.representative_id));
            }
        }

        if(tabs && tabs != '') {
            tabs = JSON.parse( tabs )
        } else {
            tabs = []
        }

        if(customers && customers!= '') {
            customers = JSON.parse(customers)
            if(customers.length > 0) {
                const findOtherNormaliseCustomers = await AssignorAndAssignee.findAll({
                    attributes: ['assignor_and_assignee_id'],
                    where: { assignor_and_assignee_id: customers, representative_id: {[connection.Op.gt]: 0}}
                })

                if( findOtherNormaliseCustomers.length > 0 ) {
                    const promise = findOtherNormaliseCustomers.map( customer => {
                        if( !customers.includes(customer.assignor_and_assignee_id) ) {
                            customers.push( customer.assignor_and_assignee_id )
                        }
                    })
                    await Promise.all(promise)
                }
            }            
        } else {
            customers = []
        }

        
        const where  = {representative_id: companies, organisation_id: req.orgId}

        if( tabs.length > 0 ) {
            where.tab_id = tabs
        }

        if( customers.length > 0 ) {
            where.assignor_and_assignee_id = customers
        }

        const total_records = await TreePartiesCollections.count({
            distinct: 'name',
            where: where
        })

        if( total_records > 0 ) {
            limit = limit > 0 ? parseInt(limit) : RECORD_LIMIT;
            offset = offset > 0 ? parseInt(offset) : OFFSET;
            result = await TreePartiesCollections.findAll({
                attributes:['rf_id', [connection.Sequelize.fn('date_format', connection.Sequelize.col('exec_dt'), '%m/%d/%Y'), 'date'], ['assets_count','assets']],
                where: where,
                limit: limit,
                offset: offset,
                order: [
                    ['exec_dt', 'ASC']
                ],
                group: ['rf_id']                  
            });
        }  
        res.status(200).json({list: result, total_records });
    } catch ( err ) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
})


route.get("/asset_types/assignments/:rfID", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        let {rfID} = req.params, result = [], total_records = 0
        let {limit, offset} = req.query
        if(rfID > 0) {
            /* total_records = await DocumentIds.count({
                distinct: ['grant_doc_num'],
                where: {rf_id: rfID}
            }) */

            total_records = await DocumentIds.count({
                where: {rf_id: rfID}
            })
            
            if( total_records > 0 ) {
                limit = limit > 0 ? parseInt(limit) : RECORD_LIMIT;
                offset = offset > 0 ? parseInt(offset) : OFFSET;
                result = await DocumentIds.findAll({
                    attributes:['appno_doc_num', 'grant_doc_num', [connection.Sequelize.literal(`CASE WHEN grant_doc_num = "" THEN appno_doc_num ELSE grant_doc_num END`), 'asset'],[connection.Sequelize.literal('0'),'child_count']],
                    where: {rf_id: rfID},
                    limit: limit, 
                    offset: offset,
                    order: [                        
                        [connection.Sequelize.literal('LENGTH(asset)'), 'ASC'],
                        [connection.Sequelize.literal('asset'), 'ASC']
                    ],
                    group: ['appno_doc_num', 'grant_doc_num']         
                });
            } 
        }
        res.status(200).json({list: result, total_records });
    } catch ( err ) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
})

route.get("/asset_types/assets", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        let {companies, tabs, customers, assignments, limit, offset } = req.query, result = []

        if(companies && companies != '') {
            companies = JSON.parse( companies )
        } 

        if( !companies || companies.length == 0 ) {
            const getCompaniesList = await helpers.getCompaniesList(req.connection_db);
            companies = []
            if(getCompaniesList.length > 0) {                   
                getCompaniesList.forEach(p =>  companies.push(p.representative_id));
            }
        }

        if(tabs && tabs != '') {
            tabs = JSON.parse( tabs )
        } else {
            tabs = []
        }

        if(customers && customers!= '') {
            customers = JSON.parse(customers)
            const findOtherNormaliseCustomers = await AssignorAndAssignee.findAll({
                attributes: ['assignor_and_assignee_id'],
                where: { assignor_and_assignee_id: customers, representative_id: {[connection.Op.gt]: 0}}
            })

            if( findOtherNormaliseCustomers.length > 0 ) {
                const promise = findOtherNormaliseCustomers.map( customer => {
                    if( !customers.includes(customer.assignor_and_assignee_id) ) {
                        customers.push( customer.assignor_and_assignee_id )
                    }
                })
                await Promise.all(promise)
            }
        } else {
            customers = []
        }

        if(assignments && assignments != '') {
            assignments = JSON.parse( assignments )
        } else {
            assignments = []
        }
        
        const where  = {representative_id: companies, organisation_id: req.orgId}

        if( tabs.length > 0 ) {
            where.tabs = tabs
        }

        if( customers.length > 0 ) {
            where.customers = customers
        }

        if( assignments.length > 0 ) {
            where.assignments = assignments
        }

        let query = "SELECT appno_doc_num, grant_doc_num, CASE WHEN grant_doc_num = '' THEN appno_doc_num ELSE  grant_doc_num END as asset, 0 as child_count FROM documentid WHERE rf_id IN (SELECT rf_id FROM tree_parties_collection WHERE REPLACE_WHERE ) GROUP BY appno_doc_num, grant_doc_num";

        let whereCondition = ' representative_id IN (:representative_id)  AND organisation_id = :organisation_id';

        if(tabs.length > 0) {
            whereCondition += ' AND tab_id IN (:tabs) '
        }

        if(customers.length > 0) {
            whereCondition += ' AND assignor_and_assignee_id IN (:customers) '
        }

        if(assignments.length > 0) {
            whereCondition += ' AND rf_id IN (:assignments) '
        }


        const countQuery = `SELECT count(*) as counter FROM (${query.replace('REPLACE_WHERE', whereCondition)}) as temp`

        const countResult = await connection.application.query(countQuery,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: where,
                plain: true
            }
        ); 
        
        if( countResult != null ) {
            total_records = countResult.counter
            if( total_records > 0 ) {
                limit = limit > 0 ? parseInt(limit) : RECORD_LIMIT;
                offset = offset > 0 ? parseInt(offset) : OFFSET;
                result = await connection.application.query(`${query.replace('REPLACE_WHERE', whereCondition)} ORDER BY length(asset) ASC, asset ASC LIMIT ${offset}, ${limit}`,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        logging: console.log,
                        replacements: where,
                    }
                ); 
            }
        }
        res.status(200).json({list: result, total_records });
    } catch ( err ) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
})


/**
 * Restore Ownership
 * Broken chain of title
 * parameters 
 */
route.get("/:type/assets", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        let {companies, tabs, customers, assignments, limit, offset } = req.query,
            type = 0
            
        const replacements =  { 
                            companies: '', 
                            organisationID: req.orgId, 
                            tabs: '',
                            customers: '',
                            assignments: '',
                            type: type
                        },
            assets = {
                            list: [], 
                            total_records: 0
                        }
        
        switch(req.params.type) {
            case 'restore_ownership':
                replacements.type = 1
            break
            case 'clear_encumbrances':
                replacements.type = 2
            break
            default:
                replacements.type = 0
        }

        if(companies && companies != '') {
            companies = JSON.parse( companies )
            replacements.companies = companies.join(',')
        }

        if(tabs && tabs != '') {
            tabs = JSON.parse( tabs )
            replacements.tabs = tabs.join(',')
        }

        if(customers && customers != '') {
            customers = JSON.parse( customers )
            replacements.customers = customers.join(',')
        }

        if(assignments && assignments != '') {
            assignments = JSON.parse( assignments )
            replacements.assignments = assignments.join(',')
        }

        if(req.params.type = 'secure_a_loan') {
            connection.application.query("CALL `GetAssetsTableA`(:companies, :organisationID);",{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: {companies: replacements.companies, organisationID: req.orgId},
                }
            ).spread(result => {
                if (result) {
                    assets.list = Object.values(result)
                    assets.total_records = assets.list.length
                }
                res.status(200).json(assets);
            })
        } else if(req.params.type = 'reduce_interest_rate') {
            connection.application.query("CALL `GetAssetsTableB`(:companies, :organisationID);",{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: {companies: replacements.companies, organisationID: req.orgId},
                }
            ).spread(result => {
                if (result) {
                    assets.list = Object.values(result)
                    assets.total_records = assets.list.length
                }
                res.status(200).json(assets);
            })
        } else {
            connection.application.query("CALL `GetAssets`(:companies, :organisationID, :tabs, :customers, :assignments, :type);",{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: replacements,
                }
            ).spread(result => {
                if (result) {
                    assets.list = Object.values(result)
                    assets.total_records = assets.list.length
                }
                res.status(200).json(assets);
            })
        }
        
        

    } catch ( err ) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
})


route.get("/:type/transactions", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        let {companies, tabs, customers, limit, offset } = req.query,
            type = 0
            
        const replacements =  { 
                            companies: '', 
                            organisationID: req.orgId, 
                            tabs: '',
                            customers: '',
                            assignments: '',
                            type: type
                        },
            transactions = {
                            list: [], 
                            total_records: 0
                        }
        
        switch(req.params.type) {
            case 'restore_ownership':
                replacements.type = 1
            break
            case 'clear_encumbrances':
                replacements.type = 2
            break
            default:
                replacements.type = 0
        }

        if(companies && companies != '') {
            companies = JSON.parse( companies )
            replacements.companies = companies.join(',')
        }

        if(tabs && tabs != '') {
            tabs = JSON.parse( tabs )
            replacements.tabs = tabs.join(',')
        }

        if(customers && customers != '') {
            customers = JSON.parse( customers )
            replacements.customers = customers.join(',')
        }        
        
        connection.application.query("CALL `GetTransactions`(:companies, :organisationID, :tabs, :customers, :type);",{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            logging: console.log,
            replacements: replacements,
            }
        ).spread(result => {
            if (result) {
                transactions.list = Object.values(result)
                transactions.total_records = transactions.list.length
            }
            res.status(200).json(transactions);
        })
    } catch ( err ) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
})

route.get("/:type/parties", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        let {companies, tabs, limit, offset } = req.query,
            type = 0
            
        const replacements =  { 
                            companies: '', 
                            organisationID: req.orgId, 
                            tabs: '',
                            customers: '',
                            assignments: '',
                            type: type
                        },
                parties = {
                            list: [], 
                            total_records: 0
                        }
        
        switch(req.params.type) {
            case 'restore_ownership':
                replacements.type = 1
            break
            case 'clear_encumbrances':
                replacements.type = 2
            break
            default:
                replacements.type = 0
        }

        if(companies && companies != '') {
            companies = JSON.parse( companies )
            replacements.companies = companies.join(',')
        }

        if(tabs && tabs != '') {
            tabs = JSON.parse( tabs )
            replacements.tabs = tabs.join(',')
        }
        
        connection.application.query("CALL `GetParties`(:companies, :organisationID, :tabs, :type);",{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            logging: console.log,
            replacements: replacements,
            }
        ).spread(result => {
            if (result) {
                parties.list = Object.values(result)
                parties.total_records = parties.list.length
            }
            res.status(200).json(parties);
        })
    } catch ( err ) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
})

route.get("/:type/activites", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        let {companies, limit, offset } = req.query,
            type = 0, activites = []
            
        const replacements =  { 
                            companies: '', 
                            organisationID: req.orgId, 
                            tabs: '',
                            customers: '',
                            assignments: '',
                            type: type
                        }
        
        switch(req.params.type) {
            case 'restore_ownership':
                replacements.type = 1
            break
            case 'clear_encumbrances': 
                replacements.type = 2
            break
            default:
                replacements.type = 0
        }

        if(companies && companies != '') {
            companies = JSON.parse( companies )
            replacements.companies = companies.join(',')
        }
        
        connection.application.query("CALL `GetActivities`(:companies, :organisationID, :type);",{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            logging: console.log,
            replacements: replacements,
            }
        ).spread(result => {
            if (result) {
                activites = Object.values(result)
            }
            res.status(200).json(activites);
        })
    } catch ( err ) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
})

/**
 * List of all portfolio from new table
 */


route.get("/portfolios/", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        const tabID = req.query.tab_id, portfolioID = req.query.portfolio;
        let result = [],  limit = req.query.limit, offset = req.query.offset, tabs = [];
        //console.log("tabID", tabID);
        //console.log("portfolioID", portfolioID);
        if(portfolioID != '' && portfolioID != null && portfolioID != 'undefined' && parseInt(tabID) >= 0) {            
            limit = limit > 0 ? parseInt(limit) : 1000;
            offset = offset > 0 ? parseInt(offset) : 0;
            const portfolioList = JSON.parse(portfolioID);
            result = await TreeParties.findAll({
                attributes:[['assignor_and_assignee_id', 'id'], 'name'],
                where: {representative_id: portfolioList, organisation_id: req.orgId, tab_id: tabID},
                include:[
                    {
                        model: TreePartiesCollections,
                        as: 'collections',
                        attributes: ['rf_id', 'exec_dt'],
                        where:{tab_id: tabID, representative_id: portfolioList, organisation_id: req.orgId},
                        include: [
                            {
                                model: DocumentIds,
                                as: 'assets',
                                attributes: [['appno_doc_num','application'], ['grant_doc_num', 'patent']],
                            }
                        ],
                        group: ['rf_id']
                    }
                ],
                limit: limit,
                offset: offset,
                order: [
                    ['name', 'ASC']
                ]                    
            });     
            tabs = await TreeParties.findAll({
                attributes:['tab_id', [connection.Sequelize.literal('COUNT(DISTINCT(name))', 'assignor_and_assignee_id'), 'customer_count']],
                where: {representative_id: portfolioList, organisation_id: req.orgId, tab_id: TABS},
                group:['tab_id']
            });       
        } else {
            if(typeof req.connection_db != "undefined" && req.connection_db != null ) {                
                let allPortfolioList = [];
                if(portfolioID != '' && portfolioID != null && portfolioID != 'undefined') {            
                    allPortfolioList = JSON.parse(portfolioID);
                } else {
                    const getCompaniesList = await helpers.getCompaniesList(req.connection_db);
                    if(getCompaniesList.length > 0) {                   
                        getCompaniesList.forEach(p =>  allPortfolioList.push(p.representative_id));
                    }
                }

                if(allPortfolioList.length > 0){
                    result = await TreeParties.findAll({
                        attributes:['representative_id', 'representative_name','tab_id'],
                        where: {representative_id: allPortfolioList, organisation_id: req.orgId},
                        group: ['organisation_id', 'representative_id', 'tab_id'],                       
                        order: [
                            ['tab_id', 'ASC'],
                            ['representative_name', 'ASC']
                        ]
                    });
                    /**
                     * Customer Count
                     */ 
                    

                    tabs = await TreeParties.findAll({
                        attributes:['tab_id', [connection.Sequelize.literal('COUNT(DISTINCT(name))', 'assignor_and_assignee_id'), 'customer_count']],
                        where: {representative_id: allPortfolioList, organisation_id: req.orgId, tab_id: TABS},
                        group:['tab_id']
                    });
                    //if(resultParties.length > 0) {
                        
                        /*const tabsWithRepresentatives = [], tabs = [];

                        const promises = resultParties.map(async portfolio => {
                            let tabIndex = -1;
                            if(!tabs.includes(portfolio.tab_id)){
                                tabs.push(portfolio.tab_id);
                                tabIndex = tabs[tabs.length - 1];
                            } else {
                                tabIndex = tabs.findIndex(portfolio.tab_id);
                            }

                            if(tabIndex >= 0) {
                                if(tabsWithRepresentatives.length == 0) {
                                    tabsWithRepresentatives.push({tab_id: tabIndex, representative_ids:[portfolio.representative_id]});
                                } else {
                                    const list =  [...tabsWithRepresentatives[tabIndex].representative_ids];
                                    list.push(portfolio.representative_id);
                                    tabsWithRepresentatives[tabIndex].representative_ids = list;
                                }
                            }
                            return portfolio;
                        });

                        await Promise.all(promises);

                        if(tabsWithRepresentatives.length > 0) {
                            const portfolioPromises = tabsWithRepresentatives.map(async tab => {
                                const customQuery = "SELECT count(*) as transaction_count FROM (SELECT rf_id FROM tree_parties_collection WHERE organisation_id = :organisationID AND representative_id IN (:companiesID) AND tab_id = :tabID GROUP BY rf_id) as temp";

                                const getTransaction = await connection.application.query(customQuery,{
                                    type: connection.Sequelize.QueryTypes.SELECT,
                                    raw: true,
                                    replacements: { organisationID: req.orgId, companiesID: tab.representative_id, tabID: tab.tab_id},
                                    logging: console.log,
                                    plain: true
                                    }
                                );
                            });
                        }*/

                        /**
                         * Transactions Count
                         */    
                        /* const promises = resultParties.map(async portfolio => {

                            const customQuery = "SELECT count(*) as transaction_count FROM (SELECT rf_id FROM tree_parties_collection WHERE organisation_id = :organisationID AND representative_id IN (:companiesID) AND tab_id = :tabID GROUP BY rf_id) as temp";

                            const getTransaction = await connection.application.query(customQuery,{
                                type: connection.Sequelize.QueryTypes.SELECT,
                                raw: true,
                                replacements: { organisationID: req.orgId, companiesID: portfolio.representative_id, tabID: portfolio.tab_id},
                                logging: console.log,
                                plain: true
                                }
                            );
                            const portfolioJSON = portfolio.toJSON();
                            if(getTransaction != null) {                                
                                portfolioJSON.transaction_count = getTransaction.transaction_count;                          
                            } else {
                                portfolioJSON.transaction_count = 0;        
                            }
                            result.push(portfolioJSON);
                            return portfolio;
                        });
                        await Promise.all(promises); */

                        
                    //}
                }
            }
        }
        res.status(200).json({portfolios: result, tabs: tabs});
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

                        let searchData = {parent: 0, organisation_id: req.orgId, representative_id: getCompaniesList[i].representative_id};
                        switch(customerType){
                            case 'acquisitions':
                              searchData.tabId = 0; 
                                break;
                            case 'sales':
                                searchData.tabId = 1; 
                                break;
                            case 'licenseIn':
                                searchData.tabId = 2; 
                                break;
                            case 'licenseOut':
                                searchData.tabId = 3; 
                                break;
                            case 'securities':
                                searchData.tabId = 4; 
                                break;
                            case 'mergerin':
                                searchData.tabId = 5; 
                                break;
                            case 'mergerout':
                                searchData.tabId = 6; 
                                break;
                            case 'options':
                                searchData.tabId = 7; 
                                break;
                            case 'courtOrders':
                                searchData.tabId = 8; 
                                break;
                            case 'employees':
                                searchData.tabId = 9; 
                                break;
                            case 'other':
                                searchData.tabId = 10; 
                                break;
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
                let getAssignorData = [], getAssigneeData = [], customQueryAssignee = "";
                if(tabId == 0) {
                    searchData = {name: parentCompany, customer_name: customerName, convey_type: ["assignment", "partialassignment"], employer_assign: 0};
                    customQueryAssignee = "SELECT ac.rf_id, ac.rf_id as name, date_format(ac.exec_dt, '%m-%d-%Y') as exec_dt, (select count(d.appno_doc_num)  FROM documentid as d WHERE d.rf_id = ac.rf_id) as counter FROM assignor as ac INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as rr ON rr.representative_id = aa.representative_id INNER JOIN (SELECT a.rf_id FROM assignment as a INNER JOIN assignment_conveyance as ass ON ass.rf_id = a.rf_id INNER JOIN documentid as d ON ass.rf_id = d.rf_id INNER JOIN assignee as acc ON acc.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = acc.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE ass.convey_ty IN(:convey_type) AND ass.employer_assign = :employer_assign AND (aaa.name = :name OR r.representative_name = :name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id WHERE (aa.name = :customer_name OR rr.representative_name = :customer_name) GROUP BY ac.rf_id ORDER BY ac.rf_id ASC, exec_dt ASC";
                    getAssignorData = await connection.application.query(customQueryAssignee,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: searchData,
                        raw: true,
                        logging: console.log,
                        }
                    );
                } else if (tabId == 1) {
                    searchData = {name: parentCompany, customer_name: customerName, convey_type: ["assignment", "partialassignment"], employer_assign: 0};
                    customQueryAssignor = "SELECT ac.rf_id, ac.rf_id as name,  (SELECT date_format(ap.exec_dt, '%m-%d-%Y') FROM assignor as ap WHERE ap.rf_id = ac.rf_id ORDER BY ap.exec_dt ASC LIMIT 1) as exec_dt, (select count(d.appno_doc_num)  FROM documentid as d WHERE d.rf_id = ac.rf_id) as counter  FROM assignee as ac INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as rr ON rr.representative_id = aa.representative_id INNER JOIN (SELECT a.rf_id FROM assignment as a INNER JOIN assignment_conveyance as ass ON ass.rf_id = a.rf_id INNER JOIN documentid as d ON ass.rf_id = d.rf_id INNER JOIN assignor as acc ON acc.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = acc.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE ass.convey_ty IN(:convey_type) AND ass.employer_assign = :employer_assign AND (aaa.name = :name OR r.representative_name = :name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id WHERE (aa.name = :customer_name OR rr.representative_name = :customer_name) GROUP BY ac.rf_id ORDER BY  ac.rf_id ASC, exec_dt ASC";
                    console.log(customQueryAssignor);
                    getAssigneeData = await connection.application.query(customQueryAssignor,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: searchData,
                        raw: true,
                        logging: console.log,
                        }
                    );
                } else if (tabId == 2) {
                    searchData = {name: parentCompany, customer_name: customerName, convey_type: ["license", "licenseend", "govern"], employer_assign: 0};
                    customQueryAssignee = "SELECT ac.rf_id, ac.rf_id as name, date_format(ac.exec_dt, '%m-%d-%Y') as exec_dt, (select count(d.appno_doc_num)  FROM documentid as d WHERE d.rf_id = ac.rf_id) as counter FROM assignor as ac INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as rr ON rr.representative_id = aa.representative_id INNER JOIN (SELECT a.rf_id FROM assignment as a INNER JOIN assignment_conveyance as ass ON ass.rf_id = a.rf_id INNER JOIN documentid as d ON ass.rf_id = d.rf_id INNER JOIN assignee as acc ON acc.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = acc.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE ass.convey_ty IN(:convey_type) AND ass.employer_assign = :employer_assign AND (aaa.name = :name OR r.representative_name = :name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id WHERE (aa.name = :customer_name OR rr.representative_name = :customer_name) GROUP BY ac.rf_id ORDER BY ac.rf_id ASC, exec_dt ASC";
                    getAssignorData = await connection.application.query(customQueryAssignee,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: searchData,
                        raw: true,
                        logging: console.log,
                        }
                    );
                } else if (tabId == 3) {
                    searchData = {name: parentCompany, customer_name: customerName, convey_type: ["license", "licenseend", "govern" ], employer_assign: 0};
                    customQueryAssignor = "SELECT ac.rf_id, ac.rf_id as name,  (SELECT date_format(ap.exec_dt, '%m-%d-%Y') FROM assignor as ap WHERE ap.rf_id = ac.rf_id ORDER BY ap.exec_dt ASC LIMIT 1) as exec_dt, (select count(d.appno_doc_num)  FROM documentid as d WHERE d.rf_id = ac.rf_id) as counter  FROM assignee as ac INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as rr ON rr.representative_id = aa.representative_id INNER JOIN (SELECT a.rf_id FROM assignment as a INNER JOIN assignment_conveyance as ass ON ass.rf_id = a.rf_id INNER JOIN documentid as d ON ass.rf_id = d.rf_id INNER JOIN assignor as acc ON acc.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = acc.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE ass.convey_ty IN(:convey_type) AND ass.employer_assign = :employer_assign AND (aaa.name = :name OR r.representative_name = :name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id WHERE (aa.name = :customer_name OR rr.representative_name = :customer_name) GROUP BY ac.rf_id ORDER BY  ac.rf_id ASC, exec_dt ASC";
                    console.log(customQueryAssignor);
                    getAssigneeData = await connection.application.query(customQueryAssignor,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: searchData,
                        raw: true,
                        logging: console.log,
                        }
                    );
                } else if (tabId == 4) {
                    searchData = {name: parentCompany, customer_name: customerName, convey_type: ["security", "restatedsecurity" ], employer_assign: 0};
                    customQueryAssignor = "SELECT ac.rf_id, ac.rf_id as name,  (SELECT date_format(ap.exec_dt, '%m-%d-%Y') FROM assignor as ap WHERE ap.rf_id = ac.rf_id ORDER BY ap.exec_dt ASC LIMIT 1) as exec_dt, (select count(d.appno_doc_num)  FROM documentid as d WHERE d.rf_id = ac.rf_id) as counter  FROM assignee as ac INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as rr ON rr.representative_id = aa.representative_id INNER JOIN (SELECT a.rf_id FROM assignment as a INNER JOIN assignment_conveyance as ass ON ass.rf_id = a.rf_id INNER JOIN documentid as d ON ass.rf_id = d.rf_id INNER JOIN assignor as acc ON acc.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = acc.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE ass.convey_ty IN(:convey_type) AND ass.employer_assign = :employer_assign AND (aaa.name = :name OR r.representative_name = :name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id WHERE (aa.name = :customer_name OR rr.representative_name = :customer_name) GROUP BY ac.rf_id ORDER BY  ac.rf_id ASC, exec_dt ASC";
                    console.log(customQueryAssignor);
                    getAssigneeData = await connection.application.query(customQueryAssignor,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: searchData,
                        raw: true,
                        logging: console.log,
                        }
                    );
                    searchData = {name: parentCompany, customer_name: customerName, convey_type: ["release", "restatedsecurity" ], employer_assign: 0};
                    customQueryAssignee = "SELECT ac.rf_id, ac.rf_id as name, date_format(ac.exec_dt, '%m-%d-%Y') as exec_dt, (select count(d.appno_doc_num)  FROM documentid as d WHERE d.rf_id = ac.rf_id) as counter FROM assignor as ac INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as rr ON rr.representative_id = aa.representative_id INNER JOIN (SELECT a.rf_id FROM assignment as a INNER JOIN assignment_conveyance as ass ON ass.rf_id = a.rf_id INNER JOIN documentid as d ON ass.rf_id = d.rf_id INNER JOIN assignee as acc ON acc.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = acc.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE ass.convey_ty IN(:convey_type) AND ass.employer_assign = :employer_assign AND (aaa.name = :name OR r.representative_name = :name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id WHERE (aa.name = :customer_name OR rr.representative_name = :customer_name) GROUP BY ac.rf_id ORDER BY ac.rf_id ASC, exec_dt ASC";
                    getAssignorData = await connection.application.query(customQueryAssignee,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: searchData,
                        raw: true,
                        logging: console.log,
                        }
                    );
                } else if (tabId == 5) {
                    searchData = {name: parentCompany, customer_name: customerName, convey_type: ["merger"], employer_assign: 0};
                    customQueryAssignee = "SELECT ac.rf_id, ac.rf_id as name, date_format(ac.exec_dt, '%m-%d-%Y') as exec_dt, (select count(d.appno_doc_num)  FROM documentid as d WHERE d.rf_id = ac.rf_id) as counter FROM assignor as ac INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as rr ON rr.representative_id = aa.representative_id INNER JOIN (SELECT a.rf_id FROM assignment as a INNER JOIN assignment_conveyance as ass ON ass.rf_id = a.rf_id INNER JOIN documentid as d ON ass.rf_id = d.rf_id INNER JOIN assignee as acc ON acc.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = acc.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE ass.convey_ty IN(:convey_type) AND ass.employer_assign = :employer_assign AND (aaa.name = :name OR r.representative_name = :name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id WHERE (aa.name = :customer_name OR rr.representative_name = :customer_name) GROUP BY ac.rf_id ORDER BY ac.rf_id ASC, exec_dt ASC";
                    getAssignorData = await connection.application.query(customQueryAssignee,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: searchData,
                        raw: true,
                        logging: console.log,
                        }
                    );                    
                } else if (tabId == 6) {
                    searchData = {name: parentCompany, customer_name: customerName, convey_type: ["merger"], employer_assign: 0};                    
                    customQueryAssignor = "SELECT ac.rf_id, ac.rf_id as name,  (SELECT date_format(ap.exec_dt, '%m-%d-%Y') FROM assignor as ap WHERE ap.rf_id = ac.rf_id ORDER BY ap.exec_dt ASC LIMIT 1) as exec_dt, (select count(d.appno_doc_num)  FROM documentid as d WHERE d.rf_id = ac.rf_id) as counter  FROM assignee as ac INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as rr ON rr.representative_id = aa.representative_id INNER JOIN (SELECT a.rf_id FROM assignment as a INNER JOIN assignment_conveyance as ass ON ass.rf_id = a.rf_id INNER JOIN documentid as d ON ass.rf_id = d.rf_id INNER JOIN assignor as acc ON acc.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = acc.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE ass.convey_ty IN(:convey_type) AND ass.employer_assign = :employer_assign AND (aaa.name = :name OR r.representative_name = :name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id WHERE (aa.name = :customer_name OR rr.representative_name = :customer_name) GROUP BY ac.rf_id ORDER BY  ac.rf_id ASC, exec_dt ASC";
                    console.log(customQueryAssignor);
                    getAssigneeData = await connection.application.query(customQueryAssignor,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: searchData,
                        raw: true,
                        logging: console.log,
                        }
                    );
                } else if (tabId == 7) {
                    searchData = {name: parentCompany, customer_name: customerName, convey_type: ["option"], employer_assign: 0};
                    customQueryAssignee = "SELECT ac.rf_id, ac.rf_id as name, date_format(ac.exec_dt, '%m-%d-%Y') as exec_dt, (select count(d.appno_doc_num)  FROM documentid as d WHERE d.rf_id = ac.rf_id) as counter FROM assignor as ac INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as rr ON rr.representative_id = aa.representative_id INNER JOIN (SELECT a.rf_id FROM assignment as a INNER JOIN assignment_conveyance as ass ON ass.rf_id = a.rf_id INNER JOIN documentid as d ON ass.rf_id = d.rf_id INNER JOIN assignee as acc ON acc.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = acc.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE ass.convey_ty IN(:convey_type) AND ass.employer_assign = :employer_assign AND (aaa.name = :name OR r.representative_name = :name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id WHERE (aa.name = :customer_name OR rr.representative_name = :customer_name) GROUP BY ac.rf_id ORDER BY ac.rf_id ASC, exec_dt ASC";
                    getAssignorData = await connection.application.query(customQueryAssignee,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: searchData,
                        raw: true,
                        logging: console.log,
                        }
                    );
                    customQueryAssignor = "SELECT ac.rf_id, ac.rf_id as name,  (SELECT date_format(ap.exec_dt, '%m-%d-%Y') FROM assignor as ap WHERE ap.rf_id = ac.rf_id ORDER BY ap.exec_dt ASC LIMIT 1) as exec_dt, (select count(d.appno_doc_num)  FROM documentid as d WHERE d.rf_id = ac.rf_id) as counter  FROM assignee as ac INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as rr ON rr.representative_id = aa.representative_id INNER JOIN (SELECT a.rf_id FROM assignment as a INNER JOIN assignment_conveyance as ass ON ass.rf_id = a.rf_id INNER JOIN documentid as d ON ass.rf_id = d.rf_id INNER JOIN assignor as acc ON acc.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = acc.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE ass.convey_ty IN(:convey_type) AND ass.employer_assign = :employer_assign AND (aaa.name = :name OR r.representative_name = :name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id WHERE (aa.name = :customer_name OR rr.representative_name = :customer_name) GROUP BY ac.rf_id ORDER BY  ac.rf_id ASC, exec_dt ASC";
                    console.log(customQueryAssignor);
                    getAssigneeData = await connection.application.query(customQueryAssignor,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: searchData,
                        raw: true,
                        logging: console.log,
                        }
                    );
                } else if (tabId == 8) {
                    searchData = {name: parentCompany, customer_name: customerName, convey_type: ["courtorder"], employer_assign: 0};
                    customQueryAssignee = "SELECT ac.rf_id, ac.rf_id as name, date_format(ac.exec_dt, '%m-%d-%Y') as exec_dt, (select count(d.appno_doc_num)  FROM documentid as d WHERE d.rf_id = ac.rf_id) as counter FROM assignor as ac INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as rr ON rr.representative_id = aa.representative_id INNER JOIN (SELECT a.rf_id FROM assignment as a INNER JOIN assignment_conveyance as ass ON ass.rf_id = a.rf_id INNER JOIN documentid as d ON ass.rf_id = d.rf_id INNER JOIN assignee as acc ON acc.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = acc.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE ass.convey_ty IN(:convey_type) AND ass.employer_assign = :employer_assign AND (aaa.name = :name OR r.representative_name = :name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id WHERE (aa.name = :customer_name OR rr.representative_name = :customer_name) GROUP BY ac.rf_id ORDER BY ac.rf_id ASC, exec_dt ASC";
                    getAssignorData = await connection.application.query(customQueryAssignee,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: searchData,
                        raw: true,
                        logging: console.log,
                        }
                    );
                    customQueryAssignor = "SELECT ac.rf_id, ac.rf_id as name,  (SELECT date_format(ap.exec_dt, '%m-%d-%Y') FROM assignor as ap WHERE ap.rf_id = ac.rf_id ORDER BY ap.exec_dt ASC LIMIT 1) as exec_dt, (select count(d.appno_doc_num)  FROM documentid as d WHERE d.rf_id = ac.rf_id) as counter  FROM assignee as ac INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as rr ON rr.representative_id = aa.representative_id INNER JOIN (SELECT a.rf_id FROM assignment as a INNER JOIN assignment_conveyance as ass ON ass.rf_id = a.rf_id INNER JOIN documentid as d ON ass.rf_id = d.rf_id INNER JOIN assignor as acc ON acc.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = acc.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE ass.convey_ty IN(:convey_type) AND ass.employer_assign = :employer_assign AND (aaa.name = :name OR r.representative_name = :name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id WHERE (aa.name = :customer_name OR rr.representative_name = :customer_name) GROUP BY ac.rf_id ORDER BY  ac.rf_id ASC, exec_dt ASC";
                    console.log(customQueryAssignor);
                    getAssigneeData = await connection.application.query(customQueryAssignor,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: searchData,
                        raw: true,
                        logging: console.log,
                        }
                    );
                } else if (tabId == 9) {
                    searchData = {name: parentCompany, customer_name: customerName, convey_type: ["assignment", "partialassignment", "employee"], employer_assign: 1};
                    customQueryAssignee = "SELECT ac.rf_id, ac.rf_id as name, date_format(ac.exec_dt, '%m-%d-%Y') as exec_dt, (select count(d.appno_doc_num)  FROM documentid as d WHERE d.rf_id = ac.rf_id) as counter FROM assignor as ac INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as rr ON rr.representative_id = aa.representative_id INNER JOIN (SELECT a.rf_id FROM assignment as a INNER JOIN assignment_conveyance as ass ON ass.rf_id = a.rf_id INNER JOIN documentid as d ON ass.rf_id = d.rf_id INNER JOIN assignee as acc ON acc.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = acc.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE ass.convey_ty IN(:convey_type) AND ass.employer_assign = :employer_assign AND (aaa.name = :name OR r.representative_name = :name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id WHERE (aa.name = :customer_name OR rr.representative_name = :customer_name) GROUP BY ac.rf_id ORDER BY ac.rf_id ASC, exec_dt ASC";
                    getAssignorData = await connection.application.query(customQueryAssignee,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: searchData,
                        raw: true,
                        logging: console.log,
                        }
                    );
                } else if (tabId == 10) {
                    searchData = {name: parentCompany, customer_name: customerName, convey_type: ["missing", "other", "namechg"], employer_assign: 0};
                    customQueryAssignee = "SELECT ac.rf_id, ac.rf_id as name, date_format(ac.exec_dt, '%m-%d-%Y') as exec_dt, (select count(d.appno_doc_num)  FROM documentid as d WHERE d.rf_id = ac.rf_id) as counter FROM assignor as ac INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as rr ON rr.representative_id = aa.representative_id INNER JOIN (SELECT a.rf_id FROM assignment as a INNER JOIN assignment_conveyance as ass ON ass.rf_id = a.rf_id INNER JOIN documentid as d ON ass.rf_id = d.rf_id INNER JOIN assignee as acc ON acc.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = acc.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE ass.convey_ty IN(:convey_type) AND ass.employer_assign = :employer_assign AND (aaa.name = :name OR r.representative_name = :name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id WHERE (aa.name = :customer_name OR rr.representative_name = :customer_name) GROUP BY ac.rf_id ORDER BY ac.rf_id ASC, exec_dt ASC";
                    getAssignorData = await connection.application.query(customQueryAssignee,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: searchData,
                        raw: true,
                        logging: console.log,
                        }
                    );
                    customQueryAssignor = "SELECT ac.rf_id, ac.rf_id as name,  (SELECT date_format(ap.exec_dt, '%m-%d-%Y') FROM assignor as ap WHERE ap.rf_id = ac.rf_id ORDER BY ap.exec_dt ASC LIMIT 1) as exec_dt, (select count(d.appno_doc_num)  FROM documentid as d WHERE d.rf_id = ac.rf_id) as counter  FROM assignee as ac INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as rr ON rr.representative_id = aa.representative_id INNER JOIN (SELECT a.rf_id FROM assignment as a INNER JOIN assignment_conveyance as ass ON ass.rf_id = a.rf_id INNER JOIN documentid as d ON ass.rf_id = d.rf_id INNER JOIN assignor as acc ON acc.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = acc.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE ass.convey_ty IN(:convey_type) AND ass.employer_assign = :employer_assign AND (aaa.name = :name OR r.representative_name = :name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id WHERE (aa.name = :customer_name OR rr.representative_name = :customer_name) GROUP BY ac.rf_id ORDER BY  ac.rf_id ASC, exec_dt ASC";
                    console.log(customQueryAssignor);
                    getAssigneeData = await connection.application.query(customQueryAssignor,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: searchData,
                        raw: true,
                        logging: console.log,
                        }
                    );
                }
                                
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