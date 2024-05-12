const express = require("express"),

    route = express.Router(),

    moment = require('moment'),

    rp = require('request-promise'),

    connection = require("../../config/db.config"),

    Address = require("../../model/client/Address"),

    helpers = require("../../helpers/helper"),

    authJWT = require("../../helpers/verifyJwtToken"),

    clientDBConnection = require("../../helpers/clientDBConnection");

const {distance, closest} = require('fastest-levenshtein')

//require the Model
const TreeParties = require("../../model/application/TreeParties");
const TreePartiesCollections = require("../../model/application/TreePartiesCollections");
const DocumentIds = require("../../model/application/DocumentIds");
const Representatives = require("../../model/application/Representatives");
const AssignorAndAssignee = require("../../model/application/AssignorAndAssignee");
const AssetsForSale = require("../../model/application/AssetsForSale");
const Timelines = require("../../model/application/Timelines");
const { ConsoleLogger } = require("@slack/logger");
//const Errors = require("../../model/application/Errors");
const TABS = [0,1,2,3,4,11,5,6,7,8,9,10];
const RECORD_LIMIT = 1000
const OFFSET = 0


/**
 * Find lifespan for all the company assets
 */

route.get("/events/", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
         
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

const findCollateralizedAssets = async(replacements, req) => {
    const getList = []
    try {
        const query = `SELECT di.application FROM dashboard_items AS di WHERE di.organisation_id = :organisation_id AND di.representative_id IN (:companies) AND di.type = :layout  ${req.orgType == 2 ? ' AND mode IN (:mode) ' : ''}  `
         
        const list =  await connection.applicationNew.query(query,{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            logging: console.log,
            replacements
        })
         
        if(list !== null && list.length > 0) {
            list.forEach( row => {
                getList.push(`${row.application}`)
            })
        }
        return getList
    } catch (e) {
        console.log(e)
    }
}

const getAllAssets = async (replacements, layout, companies) => {
    const getList = []
    try {
        let query = "SELECT assets.appno_doc_num FROM assets WHERE ( assets.organisation_id = :organisation_id OR assets.organisation_id IS NULL ) "
        
        
        if( typeof layout != 'undefined' ) {
            query += " AND assets.layout_id IN (:layout)" 
        }

        if( companies.length > 0 ) {
            query += " AND assets.company_id IN (:companies)" 
        } 

        query += " group by assets.appno_doc_num"
        const list =  await connection.applicationNew.query(query,{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            logging: console.log,
            replacements
        })
        
        if(list !== null && list.length > 0) {
            list.forEach( row => {
                getList.push(`${row.appno_doc_num}`)
            })
        }
    } catch (e) {
        console.log(e)
    }

    return getList
}

route.get("/timeline", [authJWT.verifyToken], async(req, res, next) => {
    let {companies, tabs, customers, rf_ids, layout, exclude, start, end, limit, offset } = req.query, list = [], groups = []
    try {                
        
        const replacements = { organisation_id:  0 /* req.orgId */, year: 1999, yearAsset: 1997 }

        if(typeof companies != 'undefined' && companies != '') {            
            companies = JSON.parse(companies)
        }

        if(typeof tabs != 'undefined' && tabs != '') {
            tabs = JSON.parse(tabs)
            tabs = helpers.checkTabs(tabs)
        }

        if(typeof customers != 'undefined' && customers != '') {
            customers = JSON.parse(customers);
        }

        if(typeof rf_ids != 'undefined' &&  rf_ids != '' ) {
            rf_ids = JSON.parse(rf_ids);
        }

        replacements.layout = helpers.findLayout(layout)  

        if(req.orgType == 2) {
            /**
             * Bank Mode
             */
            replacements.mode = 1
        }
        
       
        /*let transactionQuery = "SELECT documentid.appno_doc_num FROM db_uspto.documentid AS documentid WHERE documentid.rf_id =  activity_parties_transactions.rf_id ) AND assets.organisation_id = :organisation_id  "

        if( companies.length > 0 ) {
            transactionQuery += " AND assets.company_id IN (:companies)"
        }

        if( typeof layout != 'undefined' ) {
            transactionQuery += " AND assets.layout_id IN (:layout)"
        }

        let query = "SELECT activity_parties_transactions.rf_id as id, exec_dt, assignor_and_assignee.name AS customerName, activity_id AS tab_id, (CASE WHEN (activity_id = 8 OR activity_id = 9 OR activity_id = 14) THEN 1 WHEN (activity_id = 5 OR activity_id = 11 OR activity_id = 12 OR activity_id = 13) THEN 2 WHEN (activity_id = 3 OR activity_id = 4) THEN 3 WHEN (activity_id = 1 OR activity_id = 2 OR activity_id = 6 OR activity_id = 7) THEN 4 WHEN (activity_id = 10) THEN 5 END) AS `group`, company_id AS `company`, (SELECT count(distinct assets.appno_doc_num) FROM assets WHERE assets.appno_doc_num IN ( " + transactionQuery + " ) AS totalAssets FROM activity_parties_transactions INNER JOIN db_uspto.assignor_and_assignee AS assignor_and_assignee ON assignor_and_assignee.assignor_and_assignee_id = activity_parties_transactions.assignor_and_assignee_id WHERE activity_parties_transactions.organisation_id = :organisation_id "*/

        let transactionQuery = " "

        if( companies.length > 0 ) {
            transactionQuery += " AND assets.company_id IN (:companies)"
        }

        if( typeof layout != 'undefined' ) {
            transactionQuery += " AND assets.layout_id IN (:layout)"
        }

        /* let query = "SELECT activity_parties_transactions.rf_id as id, exec_dt, assignor_and_assignee.name AS customerName, activity_id AS tab_id, (CASE WHEN (activity_id = 8 OR activity_id = 9 OR activity_id = 14) THEN 1 WHEN (activity_id = 5 OR activity_id = 11 OR activity_id = 12 OR activity_id = 13) THEN 2 WHEN (activity_id = 3 OR activity_id = 4) THEN 3 WHEN (activity_id = 1 OR activity_id = 2 OR activity_id = 6 OR activity_id = 7) THEN 4 WHEN (activity_id = 10) THEN 5 END) AS `group`, company_id AS `company`, (SELECT count(distinct assets.appno_doc_num) FROM assets WHERE assets.rf_id = activity_parties_transactions.rf_id AND assets.organisation_id = :organisation_id " + transactionQuery + " ) AS totalAssets FROM activity_parties_transactions INNER JOIN db_uspto.assignor_and_assignee AS assignor_and_assignee ON assignor_and_assignee.assignor_and_assignee_id = activity_parties_transactions.assignor_and_assignee_id WHERE activity_parties_transactions.organisation_id = :organisation_id " */
        
        let query = "SELECT activity_parties_transactions.rf_id as id, CASE WHEN representative_law_firm.representative_name <> '' THEN representative_law_firm.representative_name WHEN law_firm.name <> '' THEN law_firm.name ELSE correspondent.cname END AS recorded_by, assignment.record_dt, activity_parties_transactions.exec_dt, release_rf_id, release_exec_dt, full_match AS partial_transaction, total_assets AS releaseAssets, all_release_ids, IF(representative.representative_name <> '', representative.representative_name, assignor_and_assignee.name)  AS customerName, GROUP_CONCAT(DISTINCT aor.or_name) AS assignors, assignor_and_assignee.assignor_and_assignee_id AS name_id,representative.representative_id as repID, activity_id AS tab_id, (CASE WHEN (activity_id = 8 OR activity_id = 9 OR activity_id = 14) THEN 1 WHEN (activity_id = 5 OR activity_id = 11 OR activity_id = 12 OR activity_id = 13 OR activity_id = 16) THEN 2 WHEN (activity_id = 3 OR activity_id = 4) THEN 3 WHEN (activity_id = 1 OR activity_id = 2 OR activity_id = 6 OR activity_id = 7) THEN 4 WHEN (activity_id = 10) THEN 5 END) AS `group`, company_id AS `company`, (SELECT count(asset) FROM ( SELECT dd.appno_doc_num AS asset FROM db_uspto.documentid AS dd WHERE dd.rf_id = activity_parties_transactions.rf_id GROUP BY asset ) AS temp) AS totalAssets FROM activity_parties_transactions INNER JOIN db_uspto.assignment AS assignment ON activity_parties_transactions.rf_id = assignment.rf_id INNER JOIN db_uspto.correspondent AS correspondent ON correspondent.rf_id = assignment.rf_id LEFT JOIN db_uspto.law_firm AS law_firm ON law_firm.name = correspondent.cname LEFT JOIN db_uspto.representative_law_firm AS representative_law_firm ON representative_law_firm.representative_id = law_firm.representative_id INNER JOIN db_uspto.assignor AS aor ON aor.rf_id = assignment.rf_id INNER JOIN db_uspto.assignor_and_assignee AS assignor_and_assignee ON assignor_and_assignee.assignor_and_assignee_id = activity_parties_transactions.assignor_and_assignee_id LEFT JOIN db_uspto.representative AS representative ON representative.representative_id = assignor_and_assignee.representative_id WHERE ( activity_parties_transactions.organisation_id = :organisation_id OR activity_parties_transactions.organisation_id IS NULL ) "
        
        if(replacements.layout != 15) {
            replacements.companies = companies
            if(replacements.layout == 34) { 
                const findList = await findCollateralizedAssets(replacements, req)
                replacements.convey_ty = ['security', 'restatedsecurity'];
                replacements.assets = findList;
                
                if(findList.length > 0) {

                    /* query = "SELECT assignment.rf_id as id, aor.exec_dt, '' AS release_rf_id, '' AS release_exec_dt, 0 AS partial_transaction, '' AS all_release_ids, 0 AS releaseAssets, IF(representative.representative_name <> '', representative.representative_name, assignor_and_assignee.name)  AS customerName,  assignor_and_assignee.assignor_and_assignee_id AS name_id, representative.representative_id as repID, 5 AS tab_id, '' AS `group`, '' AS `company`, COUNT(DISTINCT doc.appno_doc_num) AS totalAssets FROM db_uspto.assignment INNER JOIN db_uspto.documentid AS doc ON doc.rf_id = assignment.rf_id INNER JOIN db_uspto.representative_assignment_conveyance AS rac ON rac.rf_id = assignment.rf_id INNER JOIN db_uspto.assignor AS aor ON aor.rf_id = assignment.rf_id INNER JOIN db_uspto.assignee AS ee ON ee.rf_id = assignment.rf_id INNER JOIN db_uspto.assignor_and_assignee AS assignor_and_assignee ON assignor_and_assignee.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN db_uspto.representative AS representative ON representative.representative_id = assignor_and_assignee.representative_id WHERE rac.convey_ty IN (:convey_ty)  AND doc.appno_doc_num IN(:assets) " */
                    query = "SELECT apt.rf_id as id, aor.exec_dt, release_rf_id, release_exec_dt, apt.full_match AS partial_transaction, all_release_ids, apt.total_assets AS releaseAssets, assign1.reel_no AS release_reel_no, assign1.frame_no AS release_frame_no, IF(representative.representative_name <> '', representative.representative_name, assignor_and_assignee.name)  AS customerName,  assignor_and_assignee.assignor_and_assignee_id AS name_id, representative.representative_id as repID, 5 AS tab_id, '' AS `group`, '' AS `company`, COUNT(DISTINCT doc.appno_doc_num) AS totalAssets FROM db_new_application.activity_parties_transactions AS apt  LEFT JOIN db_uspto.assignment AS assign1 ON assign1.rf_id = apt.release_rf_id INNER JOIN db_uspto.documentid AS doc ON doc.rf_id = apt.rf_id INNER JOIN db_uspto.representative_assignment_conveyance AS rac ON rac.rf_id = apt.rf_id INNER JOIN db_uspto.assignor AS aor ON aor.rf_id = apt.rf_id INNER JOIN db_uspto.assignee AS ee ON ee.rf_id = apt.rf_id INNER JOIN db_uspto.assignor_and_assignee AS assignor_and_assignee ON assignor_and_assignee.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN db_uspto.representative AS representative ON representative.representative_id = assignor_and_assignee.representative_id WHERE (apt.organisation_id = :organisation_id OR apt.organisation_id IS NULL ) AND apt.company_id IN(:companies) AND rac.convey_ty IN (:convey_ty)  AND doc.appno_doc_num IN(:assets) "
                    
                    
                    if(typeof start != 'undefined' && start != '' && typeof end != 'undefined' && end != '') {
                        replacements.start = start
                        replacements.end = end
                        query += " AND  aor.exec_dt BETWEEN :start AND :end "
                    } else {
                        query += " AND date_format(aor.exec_dt, '%Y') > :year "
                    }
                    
                    query += " GROUP BY apt.rf_id ORDER BY aor.exec_dt DESC  LIMIT 0, 500" 
                } else {
                    query = ''
                }

            } else if(replacements.layout == 40) {
                /**LawFirm */
                /* query = "SELECT cor.rf_id as id, apt.exec_dt, release_rf_id, release_exec_dt, full_match AS partial_transaction, all_release_ids, total_assets AS releaseAssets, IF(cor.cname <> '', cor.cname, cor.caddress_1) AS lawfirm, cor.law_firm_id, cor.law_firm_id AS name_id, 0 AS repID, '' AS customerName, 0 AS tab_id, '' AS `group`, '' AS `company`, 0 AS totalAssets FROM db_uspto.correspondent AS cor INNER JOIN activity_parties_transactions AS apt ON apt.rf_id = cor.rf_id INNER JOIN db_uspto.assignee AS ass ON ass.assignor_and_assignee_id = apt.recorded_assignor_and_assignee_id INNER JOIN db_uspto.list1 AS li ON li.assignor_and_assignee_id = apt.recorded_assignor_and_assignee_id WHERE apt.organisation_id = :organisation_id AND apt.company_id IN (:companies) AND li.organisation_id = :organisation_id AND li.company_id IN (:companies) "  */

                /* query = "Select cor.rf_id as id, apt.exec_dt, release_rf_id, release_exec_dt, full_match AS partial_transaction, all_release_ids, total_assets AS releaseAssets, IF(cor.cname <> '', cor.cname, cor.caddress_1) AS lawfirm, cor.law_firm_id, cor.law_firm_id AS name_id, 0 AS repID, '' AS customerName,  0 AS tab_id, '' AS `group`, '' AS `company`, 0 AS totalAssets  FROM db_new_application.activity_parties_transactions AS apt  INNER JOIN db_uspto.assignee AS ass ON ass.rf_id = apt.rf_id INNER JOIN db_uspto.correspondent AS cor ON cor.rf_id = ass.rf_id WHERE apt.organisation_id = :organisation_id AND apt.company_id IN (:companies) AND ass.assignor_and_assignee_id IN (SELECT assignor_and_assignee_id FROM db_uspto.list1 WHERE organisation_id = :organisation_id AND company_id IN (:companies)) AND date_format(apt.exec_dt, '%Y') >= :year"; */
                
                query = "Select apt.rf_id as id, MAX(apt.exec_dt) AS exec_dt, release_rf_id, release_exec_dt, full_match AS partial_transaction, all_release_ids, total_assets AS releaseAssets, di.lawfirm, lf.law_firm_id AS name_id, rlf.representative_id AS repID, '' AS customerName, apt.activity_id AS tab_id,  '' AS `group`, '' AS company, 0 AS totalAssets FROM db_new_application.activity_parties_transactions AS apt INNER JOIN db_new_application.dashboard_items AS di ON di.rf_id = apt.rf_id INNER JOIN db_uspto.correspondent AS c ON c.rf_id = apt.rf_id LEFT JOIN db_uspto.law_firm  as lf ON c.cname = lf.name LEFT JOIN db_uspto.representative_law_firm AS rlf ON rlf.representative_id = lf.representative_id  WHERE (apt.organisation_id = :organisation_id OR apt.organisation_id IS NULL ) AND apt.company_id IN(:companies) AND di.organisation_id = :organisation_id AND di.representative_id IN(:companies) AND di.type = :layout  "

                if(req.orgType == 2) {
                    query += " AND mode IN (:mode)  "
                }
                
                if(typeof start != 'undefined' && start != '' && typeof end != 'undefined' && end != '') {
                    replacements.start = start
                    replacements.end = end
                    query += " AND  apt.exec_dt BETWEEN :start AND :end "
                } else {
                    query += " AND date_format(apt.exec_dt, '%Y') > :year "
                }

 


                if(rf_ids.length > 0) {

                    const findLawFirm = `SELECT cname, lf.name, rlf.representative_id, rlf.representative_name FROM db_uspto.correspondent AS c LEFT JOIN db_uspto.law_firm  as lf ON c.cname = lf.name
                    LEFT JOIN db_uspto.representative_law_firm AS rlf ON rlf.representative_id = lf.representative_id WHERE c.rf_id = :rfID`

                    const getLawFirmData = await connection.applicationNew.query(findLawFirm, {
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        plain: true,
                        logging: console.log,
                        replacements: {rfID: rf_ids[0]},
                    })  
                    if(getLawFirmData != null ) { 
                        if(getLawFirmData.representative_id > 0) {
                            replacements.representative_id = getLawFirmData.representative_id 
                        } else {
                            replacements.name = getLawFirmData.cname
                        }
        
                        let tempQuery = `SELECT c.rf_id  FROM db_uspto.correspondent AS c LEFT JOIN db_uspto.law_firm  as lf ON c.cname = lf.name
                        LEFT JOIN db_uspto.representative_law_firm AS rlf ON rlf.representative_id = lf.representative_id WHERE c.rf_id IN (SELECT rf_id FROM db_new_application.activity_parties_transactions WHERE ( organisation_id = :organisation_id OR organisation_id IS NULL) AND company_id IN (:companies)) `
        
                        if(typeof replacements.representative_id != 'undefined') {
                            tempQuery += ` AND rlf.representative_id = :representative_id`
                        } else {
                            tempQuery += ` AND c.cname = :name`
                        }
                        tempQuery += ` GROUP BY  c.rf_id`
                        query += ` AND apt.rf_id IN (${tempQuery}) ` 
                    } 

 
                    //replacements.rf_ids = rf_ids
                    /* query += " cor.rf_id IN (SELECT apt.rf_id FROM activity_parties_transactions AS apt INNER JOIN db_uspto.correspondent  AS c ON c.rf_id = apt.rf_id WHERE c.cname IN (SELECT cname FROM db_uspto.correspondent WHERE rf_id IN (:rf_ids)) AND apt.organisation_id = :organisation_id  AND apt.company_id IN (:companies)) " */

                    
                } else {
                    /* query += " cor.rf_id IN (SELECT rf_id FROM dashboard_items WHERE organisation_id = :organisation_id  AND representative_id IN (:companies) AND type = :layout GROUP BY rf_id) " */
                }
                query += " GROUP BY apt.rf_id ORDER BY apt.exec_dt DESC  LIMIT 0, 500"
                
            } else if (replacements.layout == 39) {
                /**
                 * Inventors
                 */

                /* query = "SELECT assignment.rf_id as id, MAX(aor.exec_dt) AS exec_dt, release_rf_id, release_exec_dt, full_match AS partial_transaction, all_release_ids, total_assets AS releaseAssets, IF(representative.representative_name <> '', representative.representative_name, assignor_and_assignee.name)  AS customerName, assignor_and_assignee.assignor_and_assignee_id AS name_id,representative.representative_id as repID, apt.activity_id AS tab_id, '' AS `group`, '' AS `company`, (SELECT count(asset) FROM ( SELECT IF(dd.grant_doc_num <> '', dd.grant_doc_num, dd.appno_doc_num) AS asset FROM db_uspto.documentid AS dd WHERE dd.rf_id = assignment.rf_id GROUP BY asset ) AS temp) AS totalAssets FROM db_uspto.assignment INNER JOIN activity_parties_transactions AS apt ON apt.rf_id = assignment.rf_id INNER JOIN db_uspto.assignor AS aor ON aor.rf_id = assignment.rf_id INNER JOIN db_uspto.assignor_and_assignee AS assignor_and_assignee ON assignor_and_assignee.assignor_and_assignee_id = aor.assignor_and_assignee_id LEFT JOIN db_uspto.representative AS representative ON representative.representative_id = assignor_and_assignee.representative_id WHERE assignment.rf_id IN (SELECT rf_id FROM dashboard_items WHERE organisation_id = :organisation_id  AND representative_id IN (:companies) AND type = :layout " */
                
                query = "Select di.application AS id, di.application, di.patent, IF (ag.appno_date = null, ap.appno_date, ag.appno_date) AS exec_dt, '' AS release_rf_id, '' AS release_exec_dt, 0 AS partial_transaction, '' AS all_release_ids, 0 AS releaseAssets, IF(representative.representative_name <> '', representative.representative_name, assignor_and_assignee.name) AS customerName, assignor_and_assignee.assignor_and_assignee_id AS name_id,representative.representative_id as repID, 10 AS tab_id, '' AS `group`, '' AS company, 0 AS totalAssets, GROUP_CONCAT(IF(representative.representative_name <> '', representative.representative_name, assignor_and_assignee.name)) AS all_inventors  FROM db_new_application.dashboard_items AS di LEFT JOIN db_patent_application_bibliographic.application_grant AS ag ON ag.appno_doc_num = di.application LEFT JOIN db_patent_grant_bibliographic.application_publication AS ap ON ap.appno_doc_num = di.application INNER JOIN db_patent_application_bibliographic.assignor_and_assignee AS assignor_and_assignee ON assignor_and_assignee.assignor_and_assignee_id = di.assignor_id LEFT JOIN db_uspto.representative AS representative ON representative.representative_id = assignor_and_assignee.representative_id WHERE di.organisation_id = :organisation_id  AND di.representative_id IN (:companies) AND di.type = :layout  "

                if(req.orgType == 2) {
                    query += " AND mode IN (:mode)  "
                }

                if(customers.length > 0) {
                    query += " AND di. assignor_id IN (:customers) "
                    replacements.customers = customers
                }

                if(typeof start != 'undefined' && start != '' && typeof end != 'undefined' && end != '') {
                    replacements.start = start
                    replacements.end = end
                    query += " AND  ( (ag.appno_date BETWEEN :start AND :end) OR (ap.appno_date BETWEEN :start AND :end)) "
                } else {
                    query += " AND (date_format(ag.appno_date, '%Y') > :year OR date_format(ap.appno_date, '%Y') > :year) "
                }
                

                query += " GROUP BY di.application ORDER BY exec_dt DESC  LIMIT 0, 500 "
            } else if (replacements.layout == 41) {
                replacements.activity_id = [5, 12];
                query = "SELECT assignment.rf_id as id, MAX(apt.exec_dt) AS exec_dt, release_rf_id, release_exec_dt, full_match AS partial_transaction, all_release_ids, total_assets AS releaseAssets, IF(representative.representative_name <> '', representative.representative_name, assignor_and_assignee.name)  AS customerName, assignor_and_assignee.assignor_and_assignee_id AS name_id,representative.representative_id as repID, apt.activity_id AS tab_id, '' AS `group`, '' AS company, (SELECT count(asset) FROM ( SELECT dd.appno_doc_num AS asset FROM db_uspto.documentid AS dd WHERE dd.rf_id = assignment.rf_id GROUP BY asset ) AS temp) AS totalAssets FROM db_uspto.assignment INNER JOIN activity_parties_transactions AS apt ON apt.rf_id = assignment.rf_id INNER JOIN dashboard_items AS di ON assignment.rf_id = di.rf_id INNER JOIN db_uspto.assignor_and_assignee AS assignor_and_assignee ON assignor_and_assignee.assignor_and_assignee_id = di.assignor_id LEFT JOIN db_uspto.representative AS representative ON representative.representative_id = assignor_and_assignee.representative_id WHERE apt.activity_id IN (:activity_id) AND di.organisation_id = :organisation_id AND di.representative_id IN (:companies) AND di.type = :layout  "

                if(req.orgType == 2) {
                    query += " AND mode IN (:mode)  "
                }
                
                if(typeof start != 'undefined' && start != '' && typeof end != 'undefined' && end != '') {
                    replacements.start = start
                    replacements.end = end
                    query += " AND  apt.exec_dt BETWEEN :start AND :end "
                } else {
                    query += " AND date_format(apt.exec_dt, '%Y') > :year "
                }
                
                query += " GROUP BY assignment.rf_id ORDER BY apt.exec_dt DESC  LIMIT 0, 500"  
            } else {
                query = `SELECT assignment.rf_id as id, CASE WHEN representative_law_firm.representative_name <> '' THEN representative_law_firm.representative_name WHEN law_firm.name <> '' THEN law_firm.name ELSE correspondent.cname END AS recorded_by, assignment.record_dt, ${replacements.layout == 25 ? ' MIN(aor.exec_dt) ' : ' MAX(aor.exec_dt) '} AS exec_dt, release_rf_id, release_exec_dt, full_match AS partial_transaction, all_release_ids, total_assets AS releaseAssets, ${replacements.layout == 26 ? ' assign1.reel_no AS release_reel_no, assign1.frame_no AS release_frame_no,' : ''} IF(representative.representative_name <> '', representative.representative_name, assignor_and_assignee.name)  AS customerName, GROUP_CONCAT(DISTINCT aor.or_name) AS assignors, assignor_and_assignee.assignor_and_assignee_id AS name_id,representative.representative_id as repID, apt.activity_id AS tab_id, '' AS company, ` 
                if(replacements.layout == 26) {
                    query += ` (SELECT count(asset) FROM ( SELECT  dd.application AS asset FROM db_new_application.dashboard_items AS dd WHERE dd.rf_id = assignment.rf_id AND type = :layout AND organisation_id = :organisation_id  ${req.orgType == 2 ? ' ANDdd. mode IN (:mode) ' : ''}   AND representative_id IN (:companies) GROUP BY asset ) AS temp) AS totalAssets `
                } else {
                    query += `(SELECT count(asset) FROM ( SELECT  dd.appno_doc_num AS asset FROM db_uspto.documentid AS dd WHERE dd.rf_id = assignment.rf_id GROUP BY asset ) AS temp) AS totalAssets `
                }
                query +=  ` FROM db_uspto.assignment INNER JOIN activity_parties_transactions AS apt ON apt.rf_id = assignment.rf_id ${replacements.layout == 26 ? 'LEFT JOIN db_uspto.assignment AS assign1 ON assign1.rf_id = apt.release_rf_id' : ''}  INNER JOIN db_uspto.correspondent AS correspondent ON correspondent.rf_id = assignment.rf_id LEFT JOIN db_uspto.law_firm AS law_firm ON law_firm.name = correspondent.cname LEFT JOIN db_uspto.representative_law_firm AS representative_law_firm ON representative_law_firm.representative_id = law_firm.representative_id INNER JOIN db_uspto.assignee AS ass ON ass.rf_id = assignment.rf_id INNER JOIN db_uspto.assignor AS aor ON aor.rf_id = assignment.rf_id INNER JOIN db_uspto.assignor_and_assignee AS assignor_and_assignee ON assignor_and_assignee.assignor_and_assignee_id = ass.assignor_and_assignee_id LEFT JOIN db_uspto.representative AS representative ON representative.representative_id = assignor_and_assignee.representative_id WHERE assignment.rf_id IN (SELECT rf_id FROM dashboard_items WHERE organisation_id = :organisation_id  ${req.orgType == 2 ? ' AND mode IN (:mode) ' : ''}   AND representative_id IN (:companies) AND type = :layout GROUP BY rf_id) `

                if(typeof start != 'undefined' && start != '' && typeof end != 'undefined' && end != '') {
                    replacements.start = start
                    replacements.end = end
                    query += " AND  aor.exec_dt BETWEEN :start AND :end "
                } else {
                    query += " AND date_format(aor.exec_dt, '%Y') > :year "
                }
                
                query += " GROUP BY assignment.rf_id ORDER BY aor.exec_dt DESC  LIMIT 0, 500"  
            }
        } else {
            let groupQuery = "SELECT activity_id AS `group` FROM activity_parties_transactions WHERE ( activity_parties_transactions.organisation_id = :organisation_id OR activity_parties_transactions.organisation_id IS NULL ) "               

            if( companies.length > 0 ) {
                query += " AND activity_parties_transactions.company_id IN (:companies)"
                groupQuery += " AND activity_parties_transactions.company_id IN (:companies)"
                replacements.companies = companies
            }
    
            if( tabs.length > 0 ) {
                query += " AND activity_parties_transactions.activity_id IN (:tabs)"
                groupQuery += " AND activity_parties_transactions.activity_id IN (:tabs)"
                replacements.tabs = tabs
            }
    
            if((tabs.length == 0 || !tabs.includes(10)) && exclude != 'true' && replacements.layout == 15) {
                query += " AND activity_parties_transactions.activity_id <> 10 "
                groupQuery += " AND activity_parties_transactions.activity_id <> 10 "
            }
    
            if( customers.length > 0 ) {
                query += " AND activity_parties_transactions.assignor_and_assignee_id IN (:customers)"
                groupQuery += " AND activity_parties_transactions.assignor_and_assignee_id IN (:customers)"
                replacements.customers = customers
            }
    
            if( rf_ids.length > 0 ) {
                query += " AND activity_parties_transactions.rf_id IN (:rf_ids)"
                groupQuery += " AND activity_parties_transactions.rf_id IN (:rf_ids)"
                replacements.rf_ids = rf_ids
            } else {                

                query += " AND (activity_parties_transactions.organisation_id = :organisation_id OR activity_parties_transactions.organisation_id IS NULL)  "
                groupQuery += " AND (activity_parties_transactions.organisation_id = :organisation_id OR activity_parties_transactions.organisation_id IS NULL)  "
                if( companies.length > 0 ) {
                    query += " AND activity_parties_transactions.company_id IN (:companies) "
                    groupQuery += " AND activity_parties_transactions.company_id IN (:companies) "
                } 

                

                /* const allAssets = await getAllAssets(replacements, layout, companies)
                replacements.allAssets = allAssets
                query += " AND activity_parties_transactions.rf_id IN (SELECT documentid.rf_id FROM db_uspto.documentid AS documentid WHERE documentid.appno_doc_num IN (:allAssets) GROUP BY documentid.rf_id ) "

                groupQuery += " AND activity_parties_transactions.rf_id IN (SELECT documentid.rf_id FROM db_uspto.documentid AS documentid WHERE documentid.appno_doc_num IN (:allAssets) GROUP BY documentid.rf_id ) "  */
                
            }

            if(typeof start != 'undefined' && start != '' && typeof end != 'undefined' && end != '') {
                replacements.start = start
                replacements.end = end
                query += " AND  aor.exec_dt BETWEEN :start AND :end "
            } else {
                query += " AND date_format(aor.exec_dt, '%Y') > :year "
            }
            
            query += " GROUP BY activity_parties_transactions.rf_id ORDER BY exec_dt DESC  LIMIT 0, 500"   
        }
 
        if(query != '') {

            if(['acquisition_transactions', 'divestitures_transactions', 'licensing_transactions', 'collateralization_transactions', 'litigation_transactions', 'due_dilligence', 'collaterlized', 'deflated_collaterals'].includes(layout)) {
                query = `SELECT temp.*, ao.logo_optimize AS logo FROM (${query}) AS temp LEFT JOIN db_new_application.organisations AS ao ON ao.organisation_name COLLATE utf8mb4_general_ci = temp.customerName COLLATE utf8mb4_general_ci OR (REPLACE(REPLACE(ao.organisation_name, ',', ''), '.', '') COLLATE utf8mb4_general_ci = REPLACE(REPLACE(temp.customerName, ',', ''), '.', '') COLLATE utf8mb4_general_ci)`
            } 

            list =  await connection.applicationNew.query(query, {
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    logging: console.log,
                    replacements: replacements,
                }
            ); 
        }

        

        /* groupQuery += " GROUP BY activity_id"
        groups =  await connection.applicationNew.query(groupQuery, {
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: replacements,
            }
        ); */ 
        res.status(200).json({list, groups});
        
    } catch ( err ) {
        console.log("Timeline:"+err);
        res.status(500).send("Internal server error.");
    }
})


route.get("/timeline/filling_assets", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        let {companies, rf_ids, lawfirm, start, end } = req.query, list = [], groups = []
        const replacements = { organisation_id:  0 /* req.orgId */, year: 1999 }

        if(typeof companies != 'undefined' && companies != '') {            
            companies = JSON.parse(companies)
            replacements.companies = companies
        }

        if(typeof rf_ids != 'undefined' && rf_ids != '') {            
            rf_ids = JSON.parse(rf_ids)
            replacements.rf_ids = rf_ids
        }

        if(req.orgType == 2) {
            /**
             * Bank Mode
             */
            replacements.mode = 1
        }

        const allAssets =  await helpers.findFillingAssets(req, 1)

        console.log(replacements)
  
        if(allAssets.length > 0) { 
            replacements.type = 40
            replacements.applications = allAssets 
            if(replacements.rf_ids.length > 0) {
                replacements.assignments = rf_ids
            }
            
            const lawfirmName = await helpers.findLawFirmName(replacements)

            replacements.lawfirmName = lawfirmName

            let queryFillingLawFirm = `SELECT temp.*, IF(exec_dt IS NULL,  another_exec_dt, exec_dt) AS exec_dt FROM ( SELECT l.id, l.id AS name_id, l.id AS law_firm_id, l.name AS lawfirm, 0 AS repID, l.appno_doc_num,  (SELECT appno_date FROM db_patent_grant_bibliographic.application_publication AS ap WHERE ap.appno_doc_num = l.appno_doc_num LIMIT 1) AS exec_dt, (SELECT appno_date FROM db_patent_application_bibliographic.application_grant AS ap WHERE ap.appno_doc_num = l.appno_doc_num LIMIT 1) AS another_exec_dt, '' AS release_rf_id, '' AS release_exec_dt, '' AS partial_transaction, '' AS all_release_ids, 0 AS releaseAssets, '' AS customerName, 0 AS tab_id, '' AS 'group', '' AS company, 0 AS asset, 1 AS type, '' AS patent, '' AS title FROM db_patent_application_bibliographic.lawfirm AS l  WHERE l.appno_doc_num IN (:applications) AND ( TRIM(BOTH  '.' FROM l.name) IN (:lawfirmName) OR l.name IN (:lawfirmName) ) GROUP BY l.appno_doc_num ) AS temp `

            if(typeof start != 'undefined' && start != '' && typeof end != 'undefined' && end != '') {
                replacements.start = start
                replacements.end = end
                queryFillingLawFirm += " WHERE exec_dt BETWEEN :start AND :end "
            }  
            queryFillingLawFirm += " ORDER BY exec_dt DESC LIMIT 0, 500 ";


            list =  await connection.applicationNew.query(queryFillingLawFirm, {
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: replacements,
            }); 

            const queryPatentWithTitle = `SELECT MAX(appno_doc_num) AS application, MAX(grant_doc_num) AS patent, title FROM db_uspto.documentid WHERE appno_doc_num IN (:applications) GROUP BY appno_doc_num`

            const patentWithTitle =  await connection.applicationNew.query(queryPatentWithTitle, {
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: replacements,
            }); 

            if(patentWithTitle.length > 0) {
                const promise = list.map( (item, index) => {
                    const findIndex = patentWithTitle.findIndex( row => row.application == item.appno_doc_num)

                    if(findIndex !== -1) {
                        const {title, patent} = patentWithTitle[findIndex]
                        list[index].title = title
                        list[index].patent = patent
                    }
                })
                await Promise.all(promise)
            }
        } 
        res.status(200).json(list);
    } catch (err) {
        console.log("Timeline Filling Assets:" +err);
        res.status(500).send("Internal server error.");
    } 
})

route.get("/timeline/security", [authJWT.verifyToken], async(req, res, next) => {
    let {companies, tabs, customers, rf_ids, layout, exclude, limit, offset } = req.query, list = [], groups = []
    try {                
        
        const replacements = { organisation_id:  0 /* req.orgId */, year: 1999 }

        if(typeof companies != 'undefined' && companies != '') {            
            companies = JSON.parse(companies)
        }

        if(typeof tabs != 'undefined' && tabs != '') {
            tabs = JSON.parse(tabs)
            tabs = helpers.checkTabs(tabs)
        }

        if(typeof customers != 'undefined' && customers != '') {
            customers = JSON.parse(customers);
        }

        if(typeof rf_ids != 'undefined' &&  rf_ids != '' ) {
            rf_ids = JSON.parse(rf_ids);
        }

        if(req.orgType == 2) {
            /**
             * Bank Mode
             */
            replacements.mode = 1
        }

        let transactionQuery = " "

        if( companies.length > 0 ) {
            transactionQuery += " AND assets.company_id IN (:companies)"
        }

        if( typeof layout != 'undefined' ) {
            transactionQuery += " AND assets.layout_id IN (:layout)"
        }
        
        let query = "SELECT activity_parties_transactions.rf_id as id, exec_dt, release_rf_id, release_exec_dt, IF(representative.representative_name <> '', representative.representative_name, assignor_and_assignee.name)  AS customerName, activity_id AS tab_id, (CASE WHEN (activity_id = 8 OR activity_id = 9 OR activity_id = 14) THEN 1 WHEN (activity_id = 5 OR activity_id = 11 OR activity_id = 12 OR activity_id = 13 OR activity_id = 16) THEN 2 WHEN (activity_id = 3 OR activity_id = 4) THEN 3 WHEN (activity_id = 1 OR activity_id = 2 OR activity_id = 6 OR activity_id = 7) THEN 4 WHEN (activity_id = 10) THEN 5 END) AS `group`, company_id AS `company`, (SELECT count(asset) FROM ( SELECT IF(dd.grant_doc_num <> '', dd.grant_doc_num, dd.appno_doc_num) AS asset FROM db_uspto.documentid AS dd WHERE dd.rf_id = activity_parties_transactions.rf_id GROUP BY asset ) AS temp) AS totalAssets FROM activity_parties_transactions INNER JOIN db_uspto.assignor_and_assignee AS assignor_and_assignee ON assignor_and_assignee.assignor_and_assignee_id = activity_parties_transactions.assignor_and_assignee_id LEFT JOIN db_uspto.representative AS representative ON representative.representative_id = assignor_and_assignee.representative_id WHERE ( activity_parties_transactions.organisation_id = :organisation_id OR activity_parties_transactions.organisation_id IS NULL ) "

        let groupQuery = "SELECT activity_id AS `group` FROM activity_parties_transactions WHERE ( activity_parties_transactions.organisation_id = :organisation_id OR activity_parties_transactions.organisation_id IS NULL ) "
                

        if( companies.length > 0 ) {
            query += " AND activity_parties_transactions.company_id IN (:companies)"
            groupQuery += " AND activity_parties_transactions.company_id IN (:companies)"
            replacements.companies = companies
        }

        if( tabs.length > 0 ) {
            query += " AND activity_parties_transactions.activity_id IN (:tabs)"
            groupQuery += " AND activity_parties_transactions.activity_id IN (:tabs)"
            replacements.tabs = tabs
        }

        if((tabs.length == 0 || !tabs.includes(10)) && exclude != 'true') {
            query += " AND activity_parties_transactions.activity_id <> 10 "
            groupQuery += " AND activity_parties_transactions.activity_id <> 10 "
        }

        if( customers.length > 0 ) {
            query += " AND activity_parties_transactions.assignor_and_assignee_id IN (:customers)"
            groupQuery += " AND activity_parties_transactions.assignor_and_assignee_id IN (:customers)"
            replacements.customers = customers
        }

        if( rf_ids.length > 0 ) {
            query += " AND activity_parties_transactions.rf_id IN (:rf_ids)"
            groupQuery += " AND activity_parties_transactions.rf_id IN (:rf_ids)"
            replacements.rf_ids = rf_ids
        } else {
            query += " AND activity_parties_transactions.rf_id IN (SELECT documentid.rf_id FROM db_uspto.documentid AS documentid WHERE date_format(documentid.appno_date, '%Y') > :year AND documentid.appno_doc_num IN (SELECT assets.appno_doc_num FROM assets WHERE ( assets.organisation_id = :organisation_id OR assets.organisation_id IS NULL ) "

            groupQuery += " AND activity_parties_transactions.rf_id IN (SELECT documentid.rf_id FROM db_uspto.documentid AS documentid WHERE date_format(documentid.appno_date, '%Y') > :year AND documentid.appno_doc_num IN (SELECT assets.appno_doc_num FROM assets WHERE ( assets.organisation_id = :organisation_id OR assets.organisation_id IS NULL) "


            if( typeof layout != 'undefined' ) {
                query += " AND assets.layout_id IN (:layout)"

                groupQuery += " AND assets.layout_id IN (:layout)"
            }

            if( companies.length > 0 ) {
                query += " AND assets.company_id IN (:companies)"

                groupQuery += " AND assets.company_id IN (:companies)"
            }

            query += " ) GROUP BY documentid.rf_id)"

            groupQuery += " ) GROUP BY documentid.rf_id)"
        }

        query += " GROUP BY activity_parties_transactions.rf_id ORDER BY exec_dt DESC "
        replacements.layout = helpers.findLayout(layout)   


       /*  list =  await connection.applicationNew.query(query, {
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: replacements,
            }
        );  */

        /* groupQuery += " GROUP BY activity_id"
        groups =  await connection.applicationNew.query(groupQuery, {
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: replacements,
            }
        ); */ 
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
        let {companies, layout, limit, offset } = req.query, result = []
        const {tab_id} = req.params;

        if(companies && companies != '') {
            companies = JSON.parse( companies )
        } 

        const replacements  = { companies, organisation_id:  0 /* req.orgId */, tab_id }
        replacements.layout = helpers.findLayout(layout)   
        
        const query = "SELECT activity_parties_transactions.assignor_and_assignee_id AS id, IF(representative.representative_name <> '', representative.representative_name, assignor_and_assignee.name) AS entityName FROM activity_parties_transactions INNER JOIN db_uspto.assignor_and_assignee AS assignor_and_assignee ON assignor_and_assignee.assignor_and_assignee_id = activity_parties_transactions.assignor_and_assignee_id LEFT JOIN db_uspto.representative AS representative ON representative.representative_id = assignor_and_assignee.representative_id WHERE activity_parties_transactions.company_id = :companies AND ( activity_parties_transactions.organisation_id = :organisation_id OR activity_parties_transactions.organisation_id IS NULL) AND rf_id IN ( SELECT documentid.rf_id FROM db_uspto.documentid AS documentid INNER JOIN db_new_application.assets AS assets  ON assets.appno_doc_num = documentid.appno_doc_num AND assets.grant_doc_num = documentid.grant_doc_num WHERE assets.layout_id = :layout AND activity_parties_transactions.company_id = :companies AND ( assets.organisation_id = :organisation_id  OR assets.organisation_id IS NULL) GROUP BY documentid.rf_id) AND activity_id = :tab_id GROUP BY entityName";

        result = await connection.applicationNew.query(query,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: replacements,
            }
        );

        res.status(200).json({list: result, tab_id, total_records: result.length });
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
            where: {representative_id: companies, organisation_id:  0 /* req.orgId */, tab_id: tabs}
        })
        
        if( total_records > 0 ) {
            result = await TreeParties.findAll({
                attributes:[['assignor_and_assignee_id', 'id'], 'name', [connection.Sequelize.fn('sum', connection.Sequelize.col('tree_parties.transaction_count')), 'totalTransactions']],
                where: {representative_id: companies, organisation_id:  0 /* req.orgId */, tab_id: tabs},
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

/**
 * List Assigments
 */
route.get("/asset_types/assignments", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        let {companies, tabs, customers, layout, limit, offset } = req.query, result = []

        if(companies && companies != '') {
            companies = JSON.parse( companies )
        } 

        if(tabs && tabs != '') {
            tabs = JSON.parse( tabs )
            tabs = helpers.checkTabs(tabs)
        }
        
        if( tabs == '' || tabs.length == 0 ){
            tabs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
        }

        if(customers && customers!= '') {
            customers = JSON.parse(customers)
        }
        
        const replacements  = { companies, organisation_id:  0 /* req.orgId */, tabs, customers }
        replacements.layout = helpers.findLayout(layout)   
       
        let query = `SELECT activity_parties_transactions.rf_id, date_format(activity_parties_transactions.exec_dt, '%m-%d-%y') AS date, (SELECT COUNT(distinct assets1.appno_doc_num) FROM assets AS assets1  INNER JOIN db_uspto.documentid AS documentid_1 ON assets1.appno_doc_num = documentid_1.appno_doc_num AND assets1.grant_doc_num = documentid_1.grant_doc_num WHERE documentid_1.rf_id = activity_parties_transactions.rf_id) AS assets FROM activity_parties_transactions AS activity_parties_transactions WHERE  ( activity_parties_transactions.organisation_id = :organisation_id  OR activity_parties_transactions.organisation_id IS NULL)  `
        
        if(Array.isArray(companies) && companies.length > 0 ) {
            query += `  AND activity_parties_transactions.company_id IN (:companies) `
        }
        
        
        query += ` AND rf_id IN (SELECT documentid.rf_id FROM db_uspto.documentid AS documentid INNER JOIN assets AS assets ON assets.appno_doc_num = documentid.appno_doc_num AND assets.grant_doc_num = documentid.grant_doc_num WHERE assets.layout_id = :layout  `
        
        if(Array.isArray(companies) && companies.length > 0 ) {
            query += `  AND activity_parties_transactions.company_id IN (:companies) `
        }
        
        query += ` AND ( assets.organisation_id = :organisation_id  OR assets.organisation_id IS NULL ) GROUP BY documentid.rf_id ) AND activity_parties_transactions.activity_id IN (:tabs) AND activity_parties_transactions.assignor_and_assignee_id IN (:customers) GROUP BY activity_parties_transactions.rf_id`;

        result =  await connection.applicationNew.query(query,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: replacements,
            }
        );

                 
        res.status(200).json({list: result, total_records: result.length });
    } catch ( err ) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
})

/**
 * List Assets
 */
route.get("/asset_types/assignments/:rfID", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        let {rfID} = req.params, result = []
        let {layout, limit, offset} = req.query
        if(rfID > 0) {
            const replacements  = { organisation_id:  0 /* req.orgId */, rfID }
            replacements.layout = helpers.findLayout(layout)   
           
            const query = "SELECT case when assets.grant_doc_num = '' then assets.appno_doc_num else assets.grant_doc_num end as asset, case when assets.grant_doc_num = '' then 1 else 0 end as asset_type, assets.appno_doc_num, assets.grant_doc_num, 0 as child_count, '' as channel FROM db_new_application.assets AS assets INNER JOIN db_uspto.documentid as documentid ON assets.appno_doc_num = documentid.appno_doc_num AND assets.grant_doc_num = documentid.grant_doc_num WHERE layout_id = :layout AND ( assets.organisation_id = :organisation_id  OR assets.organisation_id IS NULL ) AND documentid.rf_id = :rfID GROUP BY asset";

            result =  await connection.applicationNew.query(query,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    logging: console.log,
                    replacements: replacements,
                }
            );

        }
        res.status(200).json({list: result, total_records: result.length });
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
            tabs = helpers.checkTabs(tabs)
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
        
        const where  = {representative_id: companies, organisation_id:  0 /* req.orgId */}

        if( tabs.length > 0 ) {
            where.tabs = tabs
        }

        if( customers.length > 0 ) {
            where.customers = customers
        }

        if( assignments.length > 0 ) {
            where.assignments = assignments
        }

        let query = "SELECT appno_doc_num, grant_doc_num, CASE WHEN grant_doc_num = '' OR grant_doc_num IS NULL THEN FORMAT(appno_doc_num,0) ELSE FORMAT(grant_doc_num,0) END AS format_asset, CASE WHEN grant_doc_num = '' THEN appno_doc_num ELSE  grant_doc_num END as asset, 0 as child_count FROM documentid WHERE rf_id IN (SELECT rf_id FROM tree_parties_collection WHERE REPLACE_WHERE ) GROUP BY appno_doc_num, grant_doc_num";

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

route.post("/asset_types/assets/agents", [authJWT.verifyToken, clientDBConnection.connect ], async(req, res, next) => {
    try {
        let result = [['Year', 'Agent', 'filling']], getList = []

        let { list, total, type, selectedCompanies, tabs, customers, assignments, lawfirm, data_type, format_type, check } = req.body
 
        const startDate = moment(new Date()).subtract(11, 'year').format('YYYY')
        
        const where = { year: startDate, organisationID:  0 /* req.orgId */}  

        const companies = JSON.parse(selectedCompanies)
        if(companies.length > 0) {
            where.company_id = companies
        }

        if(assignments && assignments != '') {
            assignments = JSON.parse( assignments ) 
        } else {
            assignments = []
        }

        if( assignments.length > 0 ) {
            where.assignments = assignments
        }
 
        if(req.orgType == 2) {
            /**
             * Bank Mode
             */
            where.mode = 1
        }

        where.ownedType = helpers.findLayout(type); 
        let query = '';
        if(typeof data_type != 'undefined') { 
            let  assets = [];
            if(check == 1) {
                if(list != '') {
                    assets = JSON.parse(list)
                } 
            } else {

                if(data_type == 1) {
                    /**
                     * Filled
                     */
                    assets =  await helpers.findFillingAssets(req) 
                } else {
                    let ownedAssets = `SELECT application FROM db_new_application.dashboard_items WHERE organisation_id = :organisationID AND representative_id = :company_id AND type = :ownedType  ${req.orgType == 2 ? ' AND mode IN (:mode) ' : ''} `
    
    
    
                    ownedAssets += ` GROUP BY application `;
    
                    const getAssetsData = await connection.application.query(ownedAssets,{
                            type: connection.Sequelize.QueryTypes.SELECT,
                            raw: true,
                            logging: console.log,
                            replacements: where,
                        }
                    ); 
                    if(getAssetsData != null && getAssetsData.length > 0) {
                        const promise = getAssetsData.map( row => {
                            assets.push(`${row.application}`)
                        })
    
                        await Promise.all(promise)
                    }
                }
            }

            
            console.log(1)
            if(assets != null && assets.length > 0) { 

                if(data_type == 1) {
                    console.log(2)
                    /** 
                    * Filling 
                    */
                     if(check == 1) {
                         
                        query += `SELECT name, year, COUNT(appno_doc_num) AS counter FROM ( 
                            SELECT name, appno_doc_num, /*IF(appYear = null, grantyear, appYear)*/ appYear AS year FROM (  SELECT l.name, l.appno_doc_num, /*date_format(ag.appno_date, '%Y') AS grantyear,*/ date_format(ap.appno_date, '%Y') AS appYear  FROM db_patent_application_bibliographic.lawfirm AS l LEFT JOIN  db_patent_grant_bibliographic.application_publication AS ap ON ap.appno_doc_num = l.appno_doc_num WHERE l.appno_doc_num <> '' ` 
                    } else {
                        
                        query += `SELECT name, year, COUNT(appno_doc_num) AS counter FROM ( 
                            SELECT name, appno_doc_num, /*IF(appYear = null, grantyear, appYear)*/ appYear AS year FROM (  SELECT l.name, l.appno_doc_num, /*date_format(ag.appno_date, '%Y') AS grantyear,*/ date_format(ap.appno_date, '%Y') AS appYear  FROM db_patent_application_bibliographic.lawfirm AS l /*LEFT JOIN  db_patent_application_bibliographic.application_grant AS ag ON ag.appno_doc_num = l.appno_doc_num*/ LEFT JOIN  db_patent_grant_bibliographic.application_publication AS ap ON ap.appno_doc_num = l.appno_doc_num WHERE ( TRIM(BOTH  '.' FROM l.name) IN (SELECT lawfirm FROM db_new_application.dashboard_items WHERE organisation_id = :organisationID AND representative_id = :company_id  ${req.orgType == 2 ? ' AND mode IN (:mode) ' : ''}  AND type = :lawfirmType GROUP BY lawfirm) OR l.name IN (SELECT lawfirm FROM db_new_application.dashboard_items WHERE organisation_id = :organisationID AND representative_id = :company_id  ${req.orgType == 2 ? ' AND mode IN (:mode) ' : ''}  AND type = :lawfirmType GROUP BY lawfirm))` 
                    }
                    /* query = `SELECT name, year, COUNT(appno_doc_num) AS counter FROM (  SELECT l.name, l.appno_doc_num, date_format(ag.appno_date, '%Y') AS year  FROM db_patent_examiner_data.application_correspondence AS l INNER JOIN  db_patent_examiner_data.application_publication_grant AS ag ON ag.appno_doc_num = l.appno_doc_num WHERE l.name IN (SELECT lawfirm FROM db_new_application.dashboard_items WHERE organisation_id = :organisationID AND representative_id = :company_id AND type = :lawfirmType GROUP BY lawfirm) ` */


                    if( assignments.length > 0  || lawfirm > 0) {
                        let findLawFirm = `SELECT cname, lf.name, rlf.representative_id, rlf.representative_name FROM db_uspto.correspondent AS c LEFT JOIN db_uspto.law_firm  as lf ON c.cname = lf.name
                        LEFT JOIN db_uspto.representative_law_firm AS rlf ON rlf.representative_id = lf.representative_id WHERE `
                        
                        if( assignments.length > 0) {
                            findLawFirm += ` c.rf_id IN (:assignments)`
                        } else {
                            findLawFirm += ` c.rf_id IN (:lawfirm)`
                        }
                        const replacementLawfirm = {assignments: where.assignments,lawfirm}
                        if(req.orgType == 2) {
                            /**
                             * Bank Mode
                             */
                            replacementLawfirm.mode = 1
                        }
                        

                        const getLawFirmData = await connection.applicationNew.query(findLawFirm, {
                            type: connection.Sequelize.QueryTypes.SELECT,
                            raw: true,
                            logging: console.log,
                            replacements: replacementLawfirm,
                        })  
                         
                        if(getLawFirmData.length > 0) {
                            const lawfirmNames = []
                            const promise = getLawFirmData.map( item => {
                                if(item.name != '' && !lawfirmNames.includes(item.name)) {
                                    lawfirmNames.push(item.name)
                                }
                                lawfirmNames.push(item.name)
                                if(item.representative_name != '' && !lawfirmNames.includes(item.representative_name)) {
                                    lawfirmNames.push(item.representative_name)
                                }
                            })
                            await Promise.all(promise)
                            query += ` AND (TRIM(BOTH  '.' FROM l.name) IN (:lawfirms) OR l.name IN (:lawfirms)) `
                            
                            where.lawfirms = lawfirmNames
                        }
                    }
                    query += ` AND l.appno_doc_num IN (:assets) AND date_format(ap.appno_date, '%Y') > :year) AS tempData
                    ) AS temp GROUP BY name, year `
                } else {
                    console.log(3)
                    if(data_type == 3) {
                        /**
                         * Lenders
                         */
                        query = `SELECT name, year, COUNT(rf_id) AS counter FROM (
                            Select IF(r.representative_name <> '', r.representative_name, aaa.name) AS name, date_format(apt.exec_dt, '%Y') AS year, apt.rf_id from db_new_application.activity_parties_transactions AS apt
                            INNER JOIN db_uspto.representative_assignment_conveyance as cor ON cor.rf_id = apt.rf_id
                            INNER JOIN db_new_application.dashboard_items AS di ON di.rf_id = apt.rf_id
                            INNER JOIN db_uspto.assignor_and_assignee AS aaa ON aaa.assignor_and_assignee_id = di.assignor_id
                            LEFT JOIN db_uspto.representative AS r ON r.representative_id = aaa.representative_id
                            Where ( apt.organisation_id = :organisationID  OR apt.organisation_id IS NULL ) AND apt.company_id = :company_id AND date_format(apt.exec_dt, '%Y') > :year
                            AND di.organisation_id = :organisationID AND di.representative_id = :company_id  ${req.orgType == 2 ? ' AND di.mode IN (:mode) ' : ''} AND di.type = :ownedType AND apt.activity_id IN (:activity_id) `

                        if(customers && customers != '') {
                            customers = JSON.parse( customers ) 
                        } else {
                            customers = []
                        }
                
                        if(Array.isArray(customers) && customers.length > 0 ) {
                            where.customers = customers
                            query += `   AND assignor_id IN ( SELECT assignor_and_assignee_id FROM (SELECT assignor_and_assignee_id FROM db_uspto.assignor_and_assignee WHERE assignor_and_assignee_id = :customers 
                                UNION 
                                SELECT assignor_and_assignee_id FROM db_uspto.assignor_and_assignee WHERE representative_id IN (
                                    SELECT representative_id FROM db_uspto.assignor_and_assignee WHERE assignor_and_assignee_id = :customers
                                )) AS tempParties ) ` 

                        }
                        query += `    
                            GROUP BY cor.convey_ty, apt.rf_id
                        ) AS temp
                        GROUP BY name, year `

                        where.activity_id = [5, 12, 11, 13]
                    }  else {
                        console.log(4)
                        if(check == 1) {
                            query = `SELECT name, year, COUNT(DISTINCT rf_id) AS counter FROM (
                                Select IF(MAX(rlf.representative_name) <> '' , MAX(rlf.representative_name), l.name) AS name, di.rf_id, date_format(MAX(apt.exec_dt), '%Y') AS year from db_new_application.activity_parties_transactions AS apt
                                INNER JOIN db_new_application.dashboard_items AS di ON di.rf_id = apt.rf_id
                                INNER JOIN db_uspto.correspondent as cor ON cor.rf_id = apt.rf_id 
                                INNER JOIN db_uspto.law_firm AS l ON l.name = cor.cname
                                LEFT JOIN db_uspto.representative_law_firm AS rlf ON rlf.representative_id = l.representative_id
                                Where di.application IN (:assets)  ${req.orgType == 2 ? ' AND di.mode IN (:mode) ' : ''} AND date_format(apt.exec_dt, '%Y') > :year `
                        } else {
                            console.log(5)
                            /**
                             * Assignments
                             */ 
                            if( assignments.length > 0 ) {
                                query = `SELECT name,  year, COUNT(rf_id) AS counter FROM (
                                    Select CASE WHEN cor.convey_ty = 'assignment' THEN 'Acquisitions' WHEN cor.convey_ty = 'correct' THEN 'Corrections' WHEN cor.convey_ty = 'employee' THEN 'Employees' ELSE cor.convey_ty END AS name, date_format(MAX(apt.exec_dt), '%Y') AS year, apt.rf_id from db_new_application.activity_parties_transactions AS apt
                                    INNER JOIN db_uspto.representative_assignment_conveyance as cor ON cor.rf_id = apt.rf_id
                                    Where cor.rf_id IN (:assignments) AND ( apt.organisation_id = :organisationID  OR apt.organisation_id IS NULL ) AND apt.company_id = :company_id AND date_format(apt.exec_dt, '%Y') > :year
                                    GROUP BY cor.convey_ty, apt.rf_id
                                ) AS temp
                                GROUP BY name, year `
                            } else {  
                                console.log(6)
                                query = `SELECT name, year, COUNT(DISTINCT rf_id) AS counter FROM (
                                    Select IF(MAX(rlf.representative_name) <> '' , MAX(rlf.representative_name), l.name) AS name, di.rf_id, date_format(MAX(apt.exec_dt), '%Y') AS year from db_new_application.activity_parties_transactions AS apt
                                    INNER JOIN db_new_application.dashboard_items AS di ON di.rf_id = apt.rf_id
                                    INNER JOIN db_uspto.correspondent as cor ON cor.rf_id = apt.rf_id 
                                    INNER JOIN db_uspto.law_firm AS l ON l.name = cor.cname
                                    LEFT JOIN db_uspto.representative_law_firm AS rlf ON rlf.representative_id = l.representative_id
                                    Where ( apt.organisation_id = :organisationID  OR apt.organisation_id IS NULL ) AND apt.company_id = :company_id AND di.organisation_id = :organisationID  AND di.representative_id IN(:company_id)  ${req.orgType == 2 ? ' AND di.mode IN (:mode) ' : ''}  AND date_format(apt.exec_dt, '%Y') > :year `
        
                                    if(where.ownedType == 25) {
                                        query += ` AND di.type = :ownedType `
                                    } else {
                                        query += ` AND di.type = :lawfirmType `
                                    }
        
                                
                                if(lawfirm > 0) { 
    
                                    const findLawFirm = `SELECT cname, lf.name, rlf.representative_id, rlf.representative_name FROM db_uspto.correspondent AS c LEFT JOIN db_uspto.law_firm  as lf ON c.cname = lf.name
                                    LEFT JOIN db_uspto.representative_law_firm AS rlf ON rlf.representative_id = lf.representative_id WHERE c.rf_id = :lawfirm`
    
                                    const getLawFirmData = await connection.applicationNew.query(findLawFirm, {
                                        type: connection.Sequelize.QueryTypes.SELECT,
                                        raw: true,
                                        plain: true,
                                        logging: console.log,
                                        replacements: {lawfirm},
                                    })  
                                    if(getLawFirmData != null ) { 
                                        if(getLawFirmData.representative_id > 0) {
                                            query += ` AND l.representative_id  IN (:lrepresentative) ` 
                                            where.lrepresentative = getLawFirmData.representative_id 
                                        } else {
                                            query += ` AND l.name  IN (:lname) ` 
                                            where.lname = getLawFirmData.cname
                                        } 
                                    }  
                                } 
                            } 
                        }  
                        query += `   GROUP BY di.rf_id
                        ) AS temp
                        where name IS NOT NULL
                        GROUP BY name, year`
                    }
                }  
                getList = await connection.application.query(query,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        logging: console.log,
                        replacements: {...where, lawfirmType: 40, assets},
                    }
                ); 
            }
        }
        res.status(200).json(getList);
    } catch (err) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
})

route.post("/asset_types/assets/family", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        
        const {type} = req.body
        let list = await helpers.findFilterAssets(req, 1);
        
        let result = [['Country', 'Assets']]
        if(list != '' && Array.isArray(list) && list.length > 0) {
            /* const query = `SELECT application_country, SUM(country_count) AS number FROM( SELECT  application_number,application_country, COUNT(application_country)  AS country_count FROM db_uspto.assets_family             
            WHERE grant_doc_num IN (SELECT grant_doc_num FROM db_uspto.documentid WHERE appno_doc_num IN (:list) AND grant_doc_num <> '' GROUP BY grant_doc_num) AND application_country <> 'WO' GROUP BY application_number, application_country) AS temp GROUP BY application_country ORDER BY number DESC`; */



            
            let query = `SELECT name, COUNT(application_country) AS number FROM (SELECT grant_doc_num, application_number, application_country, cwc.name AS name FROM db_uspto.assets_family  AS af
                INNER JOIN db_uspto.country_with_codes AS cwc ON cwc.country_code = af.application_country          
                WHERE grant_doc_num IN ( `

                if(type == 'missed_monetization') {

                    const biblioQuery  = ` SELECT ag.grant_doc_num FROM db_patent_application_bibliographic.application_grant AS ag WHERE ag.appno_doc_num IN (:list) AND date_format(ag.appno_date, '%Y') > :year GROUP BY ag.grant_doc_num `
                    const getBiblioList = await connection.application.query(biblioQuery,{
                            type: connection.Sequelize.QueryTypes.SELECT,
                            raw: true,
                            logging: console.log,
                            replacements: {list, year: 1999},
                        }
                    ); 

                    
                    if(getBiblioList.length > 0) {
                        list = []
                        const promise = getBiblioList.map( item => list.push(`${item.grant_doc_num}`))
                        await Promise.all(promise) 
                    }
                    query += `  :list `
                } else {  
                    const assetsQuery = ` SELECT * FROM (SELECT grant_doc_num FROM db_uspto.documentid 
                    WHERE appno_doc_num IN (:list) 
                    AND grant_doc_num <> '' 
                    AND date_format(appno_date, '%Y') > :year
                    GROUP BY grant_doc_num UNION SELECT grant_doc_num FROM db_patent_application_bibliographic.application_grant
                    WHERE appno_doc_num IN (:list) 
                    AND grant_doc_num <> '' 
                    AND date_format(appno_date, '%Y') > :year
                    GROUP BY grant_doc_num) AS tempAssets GROUP BY grant_doc_num `

                    const getAssetsList = await connection.application.query(assetsQuery,{
                            type: connection.Sequelize.QueryTypes.SELECT,
                            raw: true,
                            logging: console.log,
                            replacements: {list, year: 1999},
                        }
                    ); 

                    if(getAssetsList.length > 0) {
                        list = []
                        const promise = getAssetsList.map( item => list.push(`${item.grant_doc_num}`))
                        await Promise.all(promise) 
                    } 
                    query += `  :list `
                }
                query += ` )
                AND application_country NOT IN ('WO', 'EP') 
                GROUP BY application_number) AS temp GROUP BY name`;



            const getList = await connection.application.query(query,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    logging: console.log,
                    replacements: {list, year: 1999},
                }
            ); 
           
            if( getList != null && getList.length > 0) {
                getList.forEach(row => {
                    result.push([row.name, parseInt(row.number)])
                })

                const findIndex = result.findIndex( item => item[0] == 'United States');
                if(findIndex !== -1){
                    result[findIndex][1] =  result[findIndex][1] + ( list.length - result[findIndex][1] )
                } else {
                    result.push(['United States', list.length ])
                }
            }

            


            /* const queryNoFamily = `SELECT COUNT(*) AS counter FROM (SELECT assets.*
                FROM db_new_application.assets AS assets
                LEFT OUTER JOIN db_uspto.assets_family AS af ON af.grant_doc_num = assets.grant_doc_num
                WHERE af.grant_doc_num IS NULL
                AND assets.appno_doc_num IN (:list)
                AND date_format(assets.appno_date, '%Y') > :year
                GROUP BY assets.appno_doc_num) AS temp;`


            const getNoFamilyCounter = await connection.application.query(queryNoFamily,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    logging: console.log,
                    replacements: {list, year: 1999},
                    plain: true
                }
            ); 
            if(getNoFamilyCounter != null && getNoFamilyCounter.counter > 0) {
                
            } */
        }
        /* result = [
            ['Country', 'Popularity'],
            ['Germany', 200],
            ['United States', 300],
            ['Brazil', 400],
            ['Canada', 500],
            ['France', 600],
            ['RU', 700]
        ] */
        res.status(200).json(result);
    } catch ( err ) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
})

route.post("/asset_types/inventors/location", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        

        const list = await helpers.findFilterAssets(req);
        console.log("OWNWNWNWNWNWNNWNNWNWNWNWN")
        let result = [['Country', 'Assets']]
        if(list != '' && Array.isArray(list) && list.length > 0) {
            /* const query = `SELECT application_country, SUM(country_count) AS number FROM( SELECT  application_number,application_country, COUNT(application_country)  AS country_count FROM db_uspto.assets_family             
            WHERE grant_doc_num IN (SELECT grant_doc_num FROM db_uspto.documentid WHERE appno_doc_num IN (:list) AND grant_doc_num <> '' GROUP BY grant_doc_num) AND application_country <> 'WO' GROUP BY application_number, application_country) AS temp GROUP BY application_country ORDER BY number DESC`; */




            const query = `SELECT name, COUNT(application_country) AS number FROM (SELECT grant_doc_num, application_number, application_country, cwc.name AS name FROM db_uspto.assets_family  AS af
                INNER JOIN db_uspto.country_with_codes AS cwc ON cwc.country_code = af.application_country          
                WHERE grant_doc_num IN (
                    SELECT grant_doc_num FROM db_uspto.documentid 
                    WHERE appno_doc_num IN (:list) 
                    AND grant_doc_num <> '' 
                    AND date_format(appno_date, '%Y') > :year
                    GROUP BY grant_doc_num
                )
                AND application_country NOT IN ('WO', 'EP') 
                GROUP BY application_number) AS temp GROUP BY name`;



            const getList = await connection.application.query(query,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    logging: console.log,
                    replacements: {list, year: 1999},
                }
            ); 
           
            if( getList != null && getList.length > 0) {
                getList.forEach(row => {
                    result.push([row.name, parseInt(row.number)])
                })
            }
 
        }
        /* result = [
            ['Country', 'Popularity'],
            ['Germany', 200],
            ['United States', 300],
            ['Brazil', 400],
            ['Canada', 500],
            ['France', 600],
            ['RU', 700]
        ] */
        res.status(200).json(result);
    } catch ( err ) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
})


/* const getOWNEDAssets = async(replacements) => {
    let queryAssets = `SELECT application FROM db_new_application.dashboard_items WHERE organisation_id = :organisationID AND type = :layoutID  ${req.orgType == 2 ? ' AND mode IN (:mode) ' : ''} `;

    if(typeof replacements.companies != 'undefined' && Array.isArray(replacements.companies) && replacements.companies.length > 0) {
        queryAssets += ` AND representative_id IN (:companies) `
    }

    queryAssets += ` GROUP BY application `;

    const getAssetsList = await connection.applicationNew.query(queryAssets,{
        type: connection.Sequelize.QueryTypes.SELECT,
        raw: true,
        logging: console.log,
        replacements
    })

    const appNos = []

    if(getAssetsList != null && getAssetsList.length > 0) {
        getAssetsList.forEach( asset => {
            appNos.push(`${asset.application}`)
        })
    }
    return appNos
} */

/**
 * Restore Ownership
 * Broken chain of title
 * parameters 
 */
route.get("/:layout/assets", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        let { companies, tabs, customers, assignments, limit, offset, column, direction, other_mode, lawyers } = req.query,  layoutID = 15
        const replacements =  { 
            companies: '', 
            organisationID:  0 /* req.orgId */, 
            otherORGID: req.orgId ,
            tabs: '',
            customers: '',
            assignments: '',
            layoutID: layoutID,
            date: 1999,
            expiredEvents: ['EXP.', 'EXPX'],
        },
        assets = {
            list: [], 
            total_records: 0
        }

        if(req.orgType == 2) {
            /**
             * Bank Mode
             */
            replacements.mode = 1
        }

        if(typeof offset === 'undefined') {
            offset = 0
        }

        if(typeof limit === 'undefined') {
            limit = 1000
        } else {
            if(limit > 0) {
                limit = parseInt(limit) - parseInt(offset)
            }
            
        }
        if(parseInt(limit) !== 0) {
            replacements.offset = parseInt(offset)
            replacements.limit = parseInt(limit)
        } 
        
        if(typeof other_mode != 'undefined' && parseInt(other_mode) > 0) {
            let query = `SELECT STRING_COLUMNS FROM db_new_application.assets_for_sale AS assets  `
    
            const countReplace = ` CASE WHEN assets.grant_doc_num = '' OR assets.grant_doc_num IS NULL THEN assets.appno_doc_num ELSE assets.grant_doc_num END AS asset `
    
    
            const countquery = `SELECT COUNT(*) as total_records FROM (${query.replace('STRING_COLUMNS', countReplace)} WHERE ( organisation_id = :organisationID  OR organisation_id IS NULL ) AND type = :type ${req.orgType == 2 ? ' AND mode IN (:mode) ' : ''}  GROUP BY appno_doc_num ) AS temp `
            
            replacements.type = parseInt(other_mode) == 1 ? 2 : parseInt(other_mode) == 3 ? 4 : 0
           
            const countResult = await connection.applicationNew.query(countquery,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                plain: true,
                logging: console.log,
                replacements: replacements,
            })
    
            if(countResult !== null) {
                assets.total_records = countResult.total_records
            }
    
            if(assets.total_records > 0) {
                query += ` INNER JOIN db_business.organisation AS organisation ON organisation.organisation_id = assets.organisation_id`;
                if(typeof column === 'undefined' || column === 'undefined') {
                    column = 'asset'
                }
                if(typeof direction === 'undefined' || direction === 'undefined') {
                    direction = 'DESC'
                }
    
                query += `  WHERE organisation.organisation_id = :organisationID AND type = :type  ORDER BY asset_type ASC, ${column} ${direction} `;
                if(parseInt(limit) !== 0) {
                    query += `  LIMIT :offset, :limit`;
                }

                const  queryColumnReplace = `assets.organisation_id, organisation.name, 
                CASE WHEN assets.grant_doc_num = '' OR assets.grant_doc_num IS NULL THEN CONCAT(SUBSTRING(assets.appno_doc_num, 1, 2), '/', FORMAT(SUBSTRING(assets.appno_doc_num, 3), 0)) ELSE FORMAT(assets.grant_doc_num, 0) END AS format_asset,
                CASE WHEN assets.grant_doc_num = '' OR assets.grant_doc_num IS NULL THEN assets.appno_doc_num ELSE assets.grant_doc_num END AS asset, 
                CASE WHEN assets.grant_doc_num = '' OR assets.grant_doc_num IS NULL THEN 1 ELSE 0 END AS asset_type, assets.appno_doc_num, assets.grant_doc_num, 0 AS child_count, '' AS channel `
    
                assets.list = await connection.applicationNew.query(query.replace('STRING_COLUMNS', queryColumnReplace),{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    logging: console.log,
                    replacements: replacements,
                })
            }
            res.status(200).json(assets);
        } else {

            replacements.layoutID = helpers.findLayout(req.params.layout);

            let query = `SELECT STRING_COLUMNS FROM db_new_application.assets AS assets `

            if(companies && companies != '') {
                companies = JSON.parse( companies )
                replacements.companies = companies
            }

            if(customers && customers != '') {
                customers = JSON.parse( customers )
                replacements.customers = customers
            }
            console.log(replacements.layoutID);

            if(replacements.layoutID == 3) { 
                /**Maintainence */
                let query = `SELECT asset, asset_type, channel, appno_doc_num, grant_doc_num, grant_date, date_format(payment_due, '%b %d, %Y') AS payment_due, date_format(payment_grace, '%b %d, %Y') AS payment_grace, type, fee_code, fee_amount, fee_code_surcharge, fee_surcharge, remaining_year, source, fwd_citation, technology, child_count FROM maintainence_assets WHERE company_id IN (:representativeIDs) AND ( organisation_id = :organisationID OR organisation_id IS NULL ) AND appno_doc_num IN (SELECT application COLLATE utf8mb4_0900_ai_ci FROM dashboard_items where organisation_id = :organisationID AND representative_id IN (:representativeIDs)  ${req.orgType == 2 ? ' AND mode IN (:mode) ' : ''}  AND type = 35 GROUP BY application)  AND appno_doc_num NOT IN (SELECT appno_doc_num FROM db_application.assets_transfer WHERE appno_doc_num <> '' AND status = 0 AND layout_id = :layoutID AND ( organisation_id = :organisationID OR organisation_id IS NULL )) AND grant_doc_num NOT IN (SELECT grant_doc_num FROM db_application.assets_transfer WHERE appno_doc_num = '' AND grant_doc_num <> '' AND status = 0 AND layout_id = :layoutID AND ( organisation_id = :organisationID OR organisation_id IS NULL )) GROUP BY grant_doc_num, appno_doc_num, company_id`;

                if(typeof column === 'undefined' || column === 'undefined') {
                    column = 'asset'
                }
                if(typeof direction === 'undefined' || direction === 'undefined') {
                    direction = 'DESC'
                }
    
                if(column == 'asset') {
                    query += `   ORDER BY asset_type ASC, ABS(${column}) ${direction} `
                } else {
                    query += `   ORDER BY asset_type ASC, ${column} ${direction} `;
                }

                const FORMAT = 'YYYY-MM-DD'
                let currentDate = new Date()
                const graceDate = moment(currentDate).add(6, 'months').format(FORMAT)
                const expireDate = moment(currentDate).subtract(6, 'months').format(FORMAT)

                const assetsReplacements = {representativeIDs: companies, organisationID:  0 /* req.orgId */, layoutID: 3, dueDate: moment(currentDate).format(FORMAT), graceDate, expireDate}

                if(req.orgType == 2) {
                    /**
                     * Bank Mode
                     */
                    assetsReplacements.mode = 1
                }


                assets.list = await connection.applicationNew.query(query,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    logging: console.log,
                    replacements: assetsReplacements,
                });
                assets.total_records = assets.list.length;
                res.status(200).json(assets);
            } else if(replacements.layoutID == 37) { 

                /**
                 * Send api request for PTAB data
                 */
                const getRepresentativeName = await helpers.findCompanyName(req.connection_db, replacements.companies)
                if( getRepresentativeName != null) {
                    let ownedAssets = await helpers.getOwnedAssets(req, 1)
                    console.log(ownedAssets)
                    const company = getRepresentativeName.get('representative_name')
                    const url = `https://developer.uspto.gov/ptab-api/proceedings?patentOwnerName=%22${company.replace(/ /g,'%20')}%22`

                    const firstRequest = url + `&recordTotalQuantity=1`
                    //require('https').globalAgent.options.ca = require('ssl-root-cas').create();
                    const option = {
                        method: 'GET',
                        uri: firstRequest,
                        strictSSL: false
                    }
                    rp(option)
                    .then( async body => {
                        let responseBody = JSON.parse(body);
                        console.log(responseBody)
                        const {results, recordTotalQuantity} = responseBody
                        const number = [], other_number = [];
                        let listData = [];
                        if(recordTotalQuantity != undefined && parseInt(recordTotalQuantity) > 0) {
                            if( parseInt(recordTotalQuantity) > 1 ) {
                                const secondRequest = url + `&recordTotalQuantity=${responseBody.recordTotalQuantity}`
                                option.uri = secondRequest
                                const body = await rp(option)
                                responseBody = JSON.parse(body);
                                    
                                const {results} = responseBody
                                const promises =  results.map(item => {
                                    const {appellantApplicationNumberText, appellantPatentNumber} = item
                                    if(appellantPatentNumber != undefined && !number.includes(appellantPatentNumber) && ownedAssets.includes('appellantPatentNumber')) {
                                        number.push(appellantPatentNumber)
                                        listData.push(item)
                                    } else if (appellantApplicationNumberText != undefined && !other_number.includes(appellantApplicationNumberText) && ownedAssets.includes('appellantApplicationNumberText')) {
                                        other_number.push(appellantApplicationNumberText)
                                        listData.push(item)
                                    }
                                    return item
                                })
                                await Promise.all(promises)
                            } else {
                                console.log(ownedAssets)
                                listData = [...responseBody.results]
                                const {appellantApplicationNumberText, appellantPatentNumber} = listData[0]
                                if(appellantPatentNumber != undefined && ownedAssets.includes(appellantPatentNumber)) {
                                    number.push(appellantPatentNumber)
                                }
                                if(appellantApplicationNumberText != undefined && ownedAssets.includes(appellantApplicationNumberText)) {
                                    other_number.push(appellantApplicationNumberText)
                                }
                            }

                            if(number.length > 0 || other_number.length > 0) {
                                query = `SELECT ${req.orgId} AS organisation_id, CASE WHEN assets.grant_doc_num = '' OR assets.grant_doc_num IS NULL THEN CONCAT(SUBSTRING(assets.appno_doc_num, 1, 2), '/', FORMAT(SUBSTRING(assets.appno_doc_num, 3), 0)) ELSE FORMAT(assets.grant_doc_num, 0) END AS format_asset,
                                CASE WHEN assets.grant_doc_num = '' OR assets.grant_doc_num IS NULL THEN assets.appno_doc_num ELSE assets.grant_doc_num END AS asset, 
                                CASE WHEN assets.grant_doc_num = '' OR assets.grant_doc_num IS NULL THEN 1 ELSE 0 END AS asset_type, assets.appno_doc_num, assets.grant_doc_num, 0 AS child_count, '' AS channel FROM db_uspto.documentid AS assets WHERE `;
    
                                if(number.length > 0) {
                                    query +=` assets.grant_doc_num IN (:number)`
                                }
                                if(other_number.length > 0) {
                                    if(number.length > 0) {
                                        query +=` OR `;
                                    }
                                    query +=` assets.appno_doc_num IN (:other_number)`
                                }
                                query +=` GROUP BY assets.appno_doc_num `;
    
                                if(typeof column === 'undefined' || column === 'undefined') {
                                    column = 'asset'
                                }
                                if(typeof direction === 'undefined' || direction === 'undefined') {
                                    direction = 'DESC'
                                }
                    
                                if(column == 'asset') {
                                    query += `   ORDER BY asset_type ASC, ABS(${column}) ${direction} `
                                } else {
                                    query += `   ORDER BY asset_type ASC, ${column} ${direction} `;
                                }
    
                                assets.list = await connection.applicationNew.query(query,{
                                    type: connection.Sequelize.QueryTypes.SELECT,
                                    raw: true,
                                    logging: console.log,
                                    replacements: {number, other_number},
                                })
                                assets.total_records = assets.list.length
                                assets.other_data = listData
                                res.status(200).json(assets);
                            } else {
                                res.status(200).json(assets);
                            }
                        } else {
                            res.status(200).json(assets);
                        }
                    })
                } else {
                    res.status(200).json(assets);
                }
            }  /* else if(replacements.layoutID == 22 || replacements.layoutID == 31 ) { 
                
                 const appNos = await getOWNEDAssets(replacements)


                


                if(appNos.length > 0) {
                    replacements.assets = appNos
                    query = `SELECT ${req.orgId} AS organisation_id, FORMAT(ag.grant_doc_num, 0) AS format_asset, ag.grant_doc_num AS asset,  0 AS asset_type, ag.appno_doc_num, ag.grant_doc_num, 0 AS child_count, '' AS channel FROM db_patent_application_bibliographic.application_grant AS ag WHERE ag.appno_doc_num IN (:assets)  AND date_format(ag.appno_date, '%Y') > :date   GROUP BY appno_doc_num  UNION ALL SELECT ${req.orgId} AS organisation_id, CONCAT(SUBSTRING(ap.appno_doc_num, 1, 2), '/', FORMAT(SUBSTRING(ap.appno_doc_num, 3), 0)) AS format_asset, ap.appno_doc_num AS asset, 1 AS asset_type, ap.appno_doc_num, '' AS grant_doc_num, 0 AS child_count, '' AS channel FROM db_patent_grant_bibliographic.application_publication AS ap WHERE ap.appno_doc_num IN (:assets) AND date_format(ap.appno_date, '%Y') > :date  AND ap.appno_doc_num NOT IN (SELECT appno_doc_num FROM db_patent_application_bibliographic.application_grant WHERE appno_doc_num IN (:assets)) GROUP BY ap.appno_doc_num`;
                }

                assets.list = await connection.applicationNew.query(query,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    logging: console.log,
                    replacements
                })
                assets.total_records = assets.list.length 
                res.status(200).json(assets);
                
            } */ else {
                if(replacements.layoutID != 15) { 
                    if(replacements.layoutID == 30 || replacements.layoutID == 31 || replacements.layoutID == 22 ) { 
                        /**
                         * Owner Assets (Filled + Acquired)
                         */
                        
                        query = `SELECT * FROM (SELECT  CASE WHEN patent = '' OR patent IS NULL THEN CONCAT(SUBSTRING(application, 1, 2), '/', FORMAT(SUBSTRING(application, 3), 0)) ELSE FORMAT(patent, 0) END AS format_asset,
                        CASE WHEN patent = '' OR patent IS NULL THEN application ELSE patent END AS asset, 
                        CASE WHEN patent = '' OR patent IS NULL THEN 1 ELSE 0 END AS asset_type, application AS appno_doc_num, patent AS grant_doc_num, 0 AS child_count, '' AS channel  FROM db_new_application.dashboard_items WHERE organisation_id = :organisationID AND type = :layoutID  ${req.orgType == 2 ? ' AND mode IN (:mode) ' : ''}  `;

                        if(typeof replacements.companies != 'undefined' && Array.isArray(replacements.companies) && replacements.companies.length > 0) {
                            query += ` AND representative_id IN (:companies) `
                        }
                        if(Array.isArray(customers) && customers.length > 0){
                            query += ` AND `

                                if( customers.length == 2){
                                    query += ` ( `

                                }
                                
                            query += `  application IN ( SELECT documentid.appno_doc_num FROM db_uspto.documentid WHERE rf_id  IN ( SELECT activity_parties_transactions.rf_id  FROM db_new_application.activity_parties_transactions WHERE ( activity_parties_transactions.organisation_id = :organisationID OR activity_parties_transactions.organisation_id IS NULL ) `;

                            if(typeof replacements.companies != 'undefined' && Array.isArray(replacements.companies) && replacements.companies.length > 0) {
                                query += ` AND company_id IN (:companies) `
                            }

                            query += ` AND activity_parties_transactions.assignor_and_assignee_id IN (:customers) GROUP BY activity_parties_transactions.rf_id ) GROUP BY documentid.appno_doc_num) `;


                            if( customers.length == 2){
                                const allCustomers = replacements.customers = customers;
                                replacements.customers = allCustomers[0]
                                replacements.inventor = allCustomers[1]
                                query += ` OR application IN (  SELECT appno_doc_num COLLATE utf8mb4_0900_ai_ci  FROM (
                                    Select appno_doc_num, assignor_and_assignee_id  from db_patent_application_bibliographic.inventor
                                    where appno_doc_num COLLATE utf8mb4_0900_ai_ci IN (
                                    
                                            select application FROM db_new_application.dashboard_items 
                                            WHERE organisation_id = :organisationID AND type = :layoutID  
                                            AND representative_id IN (:companies)  ${req.orgType == 2 ? ' AND mode IN (:mode) ' : ''} 
                                        )
                                        UNION 
                                        Select appno_doc_num, assignor_and_assignee_id  from db_patent_grant_bibliographic.inventor_new
                                    where appno_doc_num COLLATE utf8mb4_0900_ai_ci IN (
                                    
                                            select application FROM db_new_application.dashboard_items 
                                            WHERE organisation_id = :organisationID AND type = :layoutID  
                                            AND representative_id IN (:companies)  ${req.orgType == 2 ? ' AND mode IN (:mode) ' : ''} 
                                        )) AS tempInventor
                                        where assignor_and_assignee_id IN (:inventor))) `;
                            }
                        }
                        query += ` GROUP BY application) AS queryTemp `;
                    } else if(replacements.layoutID == 45) {
                        query = `SELECT * FROM (SELECT  CASE WHEN patent = '' OR patent IS NULL THEN CONCAT(SUBSTRING(application, 1, 2), '/', FORMAT(SUBSTRING(application, 3), 0)) ELSE FORMAT(patent, 0) END AS format_asset,
                        CASE WHEN patent = '' OR patent IS NULL THEN application ELSE patent END AS asset, 
                        CASE WHEN patent = '' OR patent IS NULL THEN 1 ELSE 0 END AS asset_type, application AS appno_doc_num, patent AS grant_doc_num, 0 AS child_count, '' AS channel  FROM db_new_application.dashboard_items WHERE organisation_id = :organisationID  ${req.orgType == 2 ? ' AND mode IN (:mode) ' : ''}   `;

                        if(typeof replacements.companies != 'undefined' && Array.isArray(replacements.companies) && replacements.companies.length > 0) {
                            query += ` AND representative_id IN (:companies) `
                        }
                        query += ` AND type = 30  AND application NOT IN (SELECT application FROM db_new_application.dashboard_items WHERE organisation_id = :organisationID AND representative_id IN (:companies) ${customers != '' && customers.length > 0 ? ' AND assignor_id IN (:customers) ' : '' }  ${req.orgType == 2 ? ' AND mode IN (:mode) ' : ''}  AND type = 34 GROUP BY application)  `
                        
                        if(Array.isArray(customers) && customers.length > 0){
                            query += ` AND `

                            if( customers.length == 2){
                                query += ` ( `

                            }
                            
                            query += ` application IN ( SELECT documentid.appno_doc_num FROM db_uspto.documentid WHERE rf_id  IN ( SELECT activity_parties_transactions.rf_id  FROM db_new_application.activity_parties_transactions WHERE ( activity_parties_transactions.organisation_id = :organisationID OR activity_parties_transactions.organisation_id IS NULL ) `;

                            if(typeof replacements.companies != 'undefined' && Array.isArray(replacements.companies) && replacements.companies.length > 0) {
                                query += ` AND company_id IN (:companies) `
                            }

                            query += ` AND activity_parties_transactions.assignor_and_assignee_id IN (:customers)   GROUP BY activity_parties_transactions.rf_id ) GROUP BY documentid.appno_doc_num) `;

                            if( customers.length == 2){
                                const allCustomers = replacements.customers = customers;
                                replacements.customers = allCustomers[0]
                                replacements.inventor = allCustomers[1]
                                query += ` OR application IN (  SELECT appno_doc_num COLLATE utf8mb4_0900_ai_ci  FROM (
                                    Select appno_doc_num, assignor_and_assignee_id  from db_patent_application_bibliographic.inventor
                                    where appno_doc_num COLLATE utf8mb4_0900_ai_ci IN (
                                    
                                            select application FROM db_new_application.dashboard_items 
                                            WHERE organisation_id = :organisationID AND type = :layoutID  
                                            AND representative_id IN (:companies)  ${req.orgType == 2 ? ' AND mode IN (:mode) ' : ''} 
                                        )
                                        UNION 
                                        Select appno_doc_num, assignor_and_assignee_id  from db_patent_grant_bibliographic.inventor_new
                                    where appno_doc_num COLLATE utf8mb4_0900_ai_ci IN (
                                    
                                            select application FROM db_new_application.dashboard_items 
                                            WHERE organisation_id = :organisationID AND type = :layoutID  
                                            AND representative_id IN (:companies)  ${req.orgType == 2 ? ' AND mode IN (:mode) ' : ''} 
                                        )) AS tempInventor
                                        where assignor_and_assignee_id IN (:inventor))) `;
                            }
                        } 
                        query += ` GROUP BY application) AS queryTemp `
                    } else if(replacements.layoutID == 40) {
                        /* query += ` WHERE organisation_id = :organisationID and company_id  IN (:companies) and layout_id = 15 AND date_format(assets.appno_date, '%Y') > :date AND appno_doc_num IN (SELECT application COLLATE utf8mb4_0900_ai_ci FROM db_new_application.dashboard_items
                            where organisation_id = :organisationID and representative_id  IN (:companies) and type = 31 AND application IN (select appno_doc_num
                            from db_uspto.documentid where rf_id IN (
                            select rf_id from db_new_application.dashboard_items
                            where organisation_id = :organisationID and representative_id IN (:companies) and type = :layoutID ` */

                            query += ` WHERE ( organisation_id = :organisationID OR organisation_id IS NULL )  and company_id  IN (:companies) and layout_id = 15 AND date_format(assets.appno_date, '%Y') > :date AND appno_doc_num IN ( select appno_doc_num
                                from db_uspto.documentid where rf_id IN (
                                `

                            if(assignments && assignments != '') {
                                assignments = JSON.parse( assignments )
                                replacements.assignments = assignments
                            } 

                            if(Array.isArray(assignments) && assignments.length > 0) {
                                /* query += ` AND rf_id IN (:assignments) ` */
                                query += ` :assignments `
                            } else  {
                                query += ` SELECT rf_id FROM db_new_application.dashboard_items
                                WHERE organisation_id = :organisationID AND representative_id IN (:companies) AND type = :layoutID  ${req.orgType == 2 ? ' AND mode IN (:mode) ' : ''} `
                            }

                            if(lawyers != '' && lawyers != null && lawyers != undefined && parseInt(lawyers) > 0) {
                                const findLawFirm = `SELECT cname, lf.name, rlf.representative_id, rlf.representative_name FROM db_uspto.correspondent AS c LEFT JOIN db_uspto.law_firm  as lf ON c.cname = lf.name
                                    LEFT JOIN db_uspto.representative_law_firm AS rlf ON rlf.representative_id = lf.representative_id WHERE c.rf_id = :lawyers`
                    
                                const getLawFirmData = await connection.applicationNew.query(findLawFirm, {
                                    type: connection.Sequelize.QueryTypes.SELECT,
                                    raw: true,
                                    plain: true,
                                    logging: console.log,
                                    replacements: {lawyers},
                                })  
                                if(getLawFirmData != null ) { 
                                    if(getLawFirmData.representative_id > 0) {
                                        replacements.representative_id = getLawFirmData.representative_id 
                                    } else {
                                        replacements.name = getLawFirmData.cname
                                    }
                    
                                    let tempQuery = `SELECT lf.law_firm_id  FROM db_uspto.law_firm  as lf  
                                    LEFT JOIN db_uspto.representative_law_firm AS rlf ON rlf.representative_id = lf.representative_id WHERE   `
                    
                                    if(typeof replacements.representative_id != 'undefined') {
                                        tempQuery += ` rlf.representative_id = :representative_id`
                                    } else {
                                        tempQuery += ` lf.name = :name`
                                    }
                                    tempQuery += ` GROUP BY  lf.law_firm_id`

                                    query += ` AND lawfirm_id IN (${tempQuery}) ` 
                                } 
                            }

                            query += ` )) ` 
                        /* if(Array.isArray(customers) && customers.length > 0){
                            query += ` AND application IN ( SELECT documentid.appno_doc_num FROM db_uspto.documentid WHERE rf_id  IN ( SELECT activity_parties_transactions.rf_id  FROM db_new_application.activity_parties_transactions WHERE activity_parties_transactions.organisation_id = :organisationID `;

                            if(typeof replacements.companies != 'undefined' && Array.isArray(replacements.companies) && replacements.companies.length > 0) {
                                query += ` AND company_id IN (:companies) `
                            }

                            query += ` AND activity_parties_transactions.assignor_and_assignee_id IN (:customers)   GROUP BY activity_parties_transactions.rf_id ) GROUP BY documentid.appno_doc_num) `;
                        } */
                    } else {

                        query = `SELECT * FROM (SELECT  CASE WHEN patent = '' OR patent IS NULL THEN CONCAT(SUBSTRING(application, 1, 2), '/', FORMAT(SUBSTRING(application, 3), 0)) ELSE FORMAT(patent, 0) END AS format_asset,
                        CASE WHEN patent = '' OR patent IS NULL THEN application ELSE TRIM(LEADING '0' FROM patent) END AS asset, 
                        CASE WHEN patent = '' OR patent IS NULL THEN 1 ELSE 0 END AS asset_type, application AS appno_doc_num, TRIM(LEADING '0' FROM patent)  AS grant_doc_num, 0 AS child_count, '' AS channel  FROM db_new_application.dashboard_items WHERE organisation_id = :organisationID AND type = :layoutID  ${req.orgType == 2 ? ' AND mode IN (:mode) ' : ''} `;

                        if(typeof replacements.companies != 'undefined' && Array.isArray(replacements.companies) && replacements.companies.length > 0) {
                            query += ` AND representative_id IN (:companies) `
                        }

                        /* query += ` WHERE assets.layout_id = 15 AND assets.organisation_id = :organisationID `

                        if(replacements.layoutID != 24) {
                            query += ` AND date_format(assets.appno_date, '%Y') > :date `
                        }

                        if(Array.isArray(companies) && companies.length > 0) {
                            query += ` AND assets.company_id IN (:companies)`
                        } */
                        if (replacements.layoutID == 38) {
                            const getFamilyList = await helpers.getFamilyList(replacements)
                            
                            console.log(getFamilyList);
                            
                            replacements.assetList = getFamilyList

                            query = `SELECT * FROM (SELECT  CASE WHEN grant_doc_num = '' OR grant_doc_num IS NULL THEN CONCAT(SUBSTRING(appno_doc_num, 1, 2), '/', FORMAT(SUBSTRING(grant_doc_num, 3), 0)) ELSE FORMAT(grant_doc_num, 0) END AS format_asset,
                                CASE WHEN grant_doc_num = '' OR grant_doc_num IS NULL THEN grant_doc_num ELSE grant_doc_num END AS asset, 
                                CASE WHEN grant_doc_num = '' OR grant_doc_num IS NULL THEN 1 ELSE 0 END AS asset_type, appno_doc_num,  grant_doc_num, 0 AS child_count, '' AS channel  FROM db_patent_application_bibliographic.application_grant WHERE grant_doc_num IN (:assetList) GROUP BY grant_doc_num`
                        } else {
                            if(Array.isArray(customers) && customers.length > 0  && (replacements.layoutID == 32 || replacements.layoutID == 33 )) {
                                query += ` AND `

                                if( customers.length == 2){
                                    query += ` ( `

                                }
                                
                                query += ` application IN (
                                            SELECT documentid.appno_doc_num FROM db_uspto.documentid 
                                            WHERE rf_id  IN ( 
                                                SELECT activity_parties_transactions.rf_id  FROM db_new_application.activity_parties_transactions 
                                                WHERE ( activity_parties_transactions.organisation_id = :organisationID OR activity_parties_transactions.organisation_id IS NULL ) 
                                                AND activity_parties_transactions.company_id IN (:companies)  
                                                AND activity_parties_transactions.assignor_and_assignee_id IN (:customers) 
                                                GROUP BY activity_parties_transactions.rf_id
                                            ) 
                                            GROUP BY documentid.appno_doc_num
                                    )  `

                                    if( customers.length == 2){
                                        const allCustomers = replacements.customers = customers;
                                        replacements.customers = allCustomers[0]
                                        replacements.inventor = allCustomers[1]
                                        query += ` OR application IN (  SELECT appno_doc_num COLLATE utf8mb4_0900_ai_ci  FROM (
                                            Select appno_doc_num, assignor_and_assignee_id  from db_patent_application_bibliographic.inventor
                                            where appno_doc_num COLLATE utf8mb4_0900_ai_ci IN (
                                            
                                                    select application FROM db_new_application.dashboard_items 
                                                    WHERE organisation_id = :organisationID AND type = :layoutID  
                                                    AND representative_id IN (:companies) ${req.orgType == 2 ? ' AND mode IN (:mode) ' : ''} 
                                                )
                                                UNION 
                                                Select appno_doc_num, assignor_and_assignee_id  from db_patent_grant_bibliographic.inventor_new
                                            where appno_doc_num COLLATE utf8mb4_0900_ai_ci IN (
                                            
                                                    select application FROM db_new_application.dashboard_items 
                                                    WHERE organisation_id = :organisationID AND type = :layoutID  
                                                    AND representative_id IN (:companies) ${req.orgType == 2 ? ' AND mode IN (:mode) ' : ''} 
                                                )) AS tempInventor
                                                where assignor_and_assignee_id IN (:inventor)))  `;
                                    }
                            } else if(Array.isArray(customers) && customers.length > 0) {
                                query += ` AND `

                                if( customers.length == 2){
                                    query += ` ( `

                                }

                                if(replacements.layoutID == 41) {   
                                    query += `  assignor_id IN (
                                        SELECT assignor_and_assignee_id FROM (
                                        SELECT assignor_and_assignee_id FROM db_uspto.assignor_and_assignee WHERE assignor_and_assignee_id IN (:customers)
                                        UNION
                                        SELECT assignor_and_assignee_id FROM db_uspto.assignor_and_assignee WHERE representative_id IN (SELECT representative_id FROM db_uspto.assignor_and_assignee WHERE assignor_and_assignee_id IN (:customers) AND representative_id > 0)) As tempAssignorAndAssignee GROUP BY assignor_and_assignee_id

                                    ) `
                                } else {
                                    query += `  assignor_id IN (:customers) `
                                }
                                
                                

                                if( customers.length == 2){
                                    const allCustomers = replacements.customers = customers;
                                    replacements.customers = allCustomers[0]
                                    replacements.inventor = allCustomers[1]
                                    query += ` OR application IN (  SELECT appno_doc_num COLLATE utf8mb4_0900_ai_ci  FROM (
                                        Select appno_doc_num, assignor_and_assignee_id  from db_patent_application_bibliographic.inventor
                                        where appno_doc_num COLLATE utf8mb4_0900_ai_ci IN (
                                        
                                                select application FROM db_new_application.dashboard_items 
                                                WHERE organisation_id = :organisationID AND type = :layoutID  
                                                AND representative_id IN (:companies) ${req.orgType == 2 ? ' AND mode IN (:mode) ' : ''} 
                                            )
                                            UNION 
                                            Select appno_doc_num, assignor_and_assignee_id  from db_patent_grant_bibliographic.inventor_new
                                        where appno_doc_num COLLATE utf8mb4_0900_ai_ci IN (
                                        
                                                select application FROM db_new_application.dashboard_items 
                                                WHERE organisation_id = :organisationID AND type = :layoutID  
                                                AND representative_id IN (:companies) ${req.orgType == 2 ? ' AND mode IN (:mode) ' : ''} 
                                            )) AS tempInventor
                                            where assignor_and_assignee_id IN (:inventor))) `;
                                }
                            }

                            if(assignments && assignments != '') {
                                assignments = JSON.parse( assignments )
                                replacements.assignments = assignments

                                if(assignments.length > 0) {
                                    query += ` AND application IN (
                                            SELECT documentid.appno_doc_num FROM db_uspto.documentid 
                                            WHERE rf_id  IN ( :assignments ) 
                                            GROUP BY documentid.appno_doc_num
                                    )  `
                                }
                            }  
                        } 
                        query += `   ) AS queryTemp `
                    }           
                } else {                
            
                    if(tabs && tabs != '') {
                        tabs = JSON.parse( tabs )
                        tabs = helpers.checkTabs(tabs)
                        replacements.tabs = tabs
                    }
            
                    if(assignments && assignments != '') {
                        assignments = JSON.parse( assignments )
                        replacements.assignments = assignments
                    }        
                                
                    query += ` WHERE date_format(assets.appno_date, '%Y') > :date AND assets.layout_id = :layoutID AND  ( assets.organisation_id = :organisationID OR assets.organisation_id IS NULL )  `                
            
                    if(Array.isArray(companies) && companies.length > 0) {
                        query += ` AND assets.company_id IN (:companies)`
                    }
            
                
                    if((Array.isArray(assignments) && assignments.length > 0 ) || (Array.isArray(tabs) && tabs.length > 0) || (Array.isArray(customers) && customers.length > 0)) {
                        query += ` AND assets.appno_doc_num IN ( SELECT documentid.appno_doc_num FROM db_uspto.documentid WHERE rf_id  IN ( SELECT activity_parties_transactions.rf_id  FROM db_new_application.activity_parties_transactions WHERE ( activity_parties_transactions.organisation_id = :organisationID OR activity_parties_transactions.organisation_id IS NULL ) `
        
                        if(Array.isArray(companies) && companies.length > 0 ) {
                            query += `  AND activity_parties_transactions.company_id IN (:companies) `
                        }
            
                        if(Array.isArray(assignments) && assignments.length > 0 ) {
                            query += ` AND activity_parties_transactions.rf_id IN (:assignments)`
                        }
                        if(replacements.layoutID == 15) {
                            if(Array.isArray(tabs) && tabs.length > 0 ) {
                                query += ` AND activity_parties_transactions.activity_id IN (:tabs)`
                            } else {
                                /**exclude employees */
                                
                                //query += ' AND activity_parties_transactions.activity_id <> 10 ' 
                            } 
                        }
            
                        if(Array.isArray(customers) && customers.length > 0 ) {
                            query += ` AND activity_parties_transactions.assignor_and_assignee_id IN (:customers)`
                        }
            
                        query += ` GROUP BY activity_parties_transactions.rf_id ) GROUP BY documentid.appno_doc_num) `
                    } else   if(Array.isArray(tabs) && tabs.length === 0) {
                        /**exclude employees */
                        query += ` AND assets.appno_doc_num IN (  SELECT documentid.appno_doc_num FROM db_uspto.documentid WHERE rf_id  IN ( SELECT activity_parties_transactions.rf_id  FROM db_new_application.activity_parties_transactions WHERE ( activity_parties_transactions.organisation_id = :organisationID OR activity_parties_transactions.organisation_id IS NULL )  `
                        
                        if(Array.isArray(companies) && companies.length > 0 ) {
                            query += `  AND activity_parties_transactions.company_id IN (:companies) `
                        }
                        if(replacements.layoutID == 15) {
                            //query += `  AND activity_parties_transactions.activity_id <> 10   `
                        }        
                        query += `  GROUP BY activity_parties_transactions.rf_id )  GROUP BY documentid.appno_doc_num) `        
                    }
                }
                
                query += ` GROUP BY appno_doc_num`;

                const countReplace = ` CASE WHEN assets.grant_doc_num = '' OR assets.grant_doc_num IS NULL THEN assets.appno_doc_num ELSE assets.grant_doc_num END AS asset `
        
        
                const countquery = `SELECT COUNT(*) as total_records FROM (${query.replace('STRING_COLUMNS', countReplace)}) AS temp`
        
            
                const countResult = await connection.applicationNew.query(countquery,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    plain: true,
                    logging: console.log,
                    replacements: replacements,
                })
        
                if(countResult !== null) {
                    assets.total_records = countResult.total_records
                }
        
                if(assets.total_records > 0) {
                    if(typeof column === 'undefined' || column === 'undefined') {
                        column = 'asset'
                    }
                    if(typeof direction === 'undefined' || direction === 'undefined') {
                        direction = 'DESC'
                    }
        
                    if(column == 'asset') {
                        query += `   ORDER BY asset_type ASC, ABS(${column}) ${direction} `
                    } else {
                        query += `   ORDER BY asset_type ASC, ${column} ${direction} `;
                    }

                    if(parseInt(limit) !== 0) {
                        query += `  LIMIT :offset, :limit`;
                    }
        
        
                    
                    /**
                    for future
                        , (SELECT COUNT(fees.grant_doc_num) FROM ${process.env.DATABASE_MAINTAINENCE}.event_maintainence_fees AS fees WHERE fees.appno_doc_num = assets.appno_doc_num AND event_code IN (:expiredEvents)  ) AS expired 
                    */
        
                    const  queryColumnReplace = `assets.organisation_id,
                    CASE WHEN assets.grant_doc_num = '' OR assets.grant_doc_num IS NULL THEN CONCAT(SUBSTRING(assets.appno_doc_num, 1, 2), '/', FORMAT(SUBSTRING(assets.appno_doc_num, 3), 0)) ELSE FORMAT(assets.grant_doc_num, 0) END AS format_asset,
                    CASE WHEN assets.grant_doc_num = '' OR assets.grant_doc_num IS NULL THEN assets.appno_doc_num ELSE assets.grant_doc_num END AS asset, 
                    CASE WHEN assets.grant_doc_num = '' OR assets.grant_doc_num IS NULL THEN 1 ELSE 0 END AS asset_type, assets.appno_doc_num, assets.grant_doc_num, 0 AS child_count, '' AS channel `
        
                    assets.list = await connection.applicationNew.query(query.replace('STRING_COLUMNS', queryColumnReplace),{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        logging: console.log,
                        replacements: replacements,
                    })
                }
                res.status(200).json(assets);
            }
        }
        

        

        
        
        /* connection.applicationNew.query("CALL `routine_assets_count`(:companies, :organisationID, :tabs, :customers, :assignments, :layoutID);",{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: replacements,
            }
        ).spread(totalRows => {
            if (totalRows) {
                const checkRows = Object.values(totalRows)
                console.log(checkRows, checkRows.length, checkRows[0].total_records)
                if(checkRows.length > 0 && checkRows[0].total_records > 0) {
                    if(replacements.limit === 0) {
                        replacements.limit = checkRows[0].total_records
                    }
                    connection.applicationNew.query("CALL `routine_assets`(:companies, :organisationID, :tabs, :customers, :assignments, :layoutID, :offset, :limit);",{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        logging: console.log,
                        replacements: replacements,
                    }
                    ).spread(result => {
                        if (result) {
                            assets.list = Object.values(result)
                            assets.total_records = checkRows[0].total_records
                        }
                        res.status(200).json(assets);
                    })
                } else {
                    res.status(200).json(assets);
                }                
            } else {
                res.status(200).json(assets);
            }
        }) */


        
        
    } catch ( err ) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
})


route.get("/:layout/transactions", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        let {companies, tabs, customers, lawfirm, limit, offset } = req.query,
            layoutID = 15
            
        const replacements =  { 
                            companies: '', 
                            organisationID:  0 /* req.orgId */, 
                            tabs: '',
                            customers: '',
                            assignments: '',
                            layoutID: layoutID
                        },
            transactions = {
                        list: [], 
                        total_records: 0
                    }
        
        replacements.layoutID = helpers.findLayout(req.params.layout)    
        if(req.orgType == 2) {
            /**
             * Bank Mode
             */
            replacements.mode = 1
        }
        if(companies && companies != '') {
            companies = JSON.parse( companies )            
        }

        if(customers && customers != '') {
            customers = JSON.parse( customers )            
        }
        
        if([17, 18, 19, 24, 25, 26, 39, 40, 41].includes(replacements.layoutID)) {
            if(companies.length > 0) {
                replacements.companies = companies
            }

            if(customers.length > 0) {
                replacements.customers = customers
            } 

            let query = `SELECT trans.rf_id, assignment.reel_no, assignment.frame_no, '' AS channel, trans.date, assets, sum(assets) OVER (ORDER BY trans.date) AS grand_total  FROM (SELECT documentid.rf_id, (SELECT date_format(exec_dt,'%m-%d-%Y') FROM db_uspto.assignor AS assignor WHERE assignor.rf_id = documentid.rf_id LIMIT 1) AS date, COUNT(distinct documentid.appno_doc_num) AS assets FROM db_uspto.documentid As documentid WHERE documentid.rf_id IN (SELECT rf_id FROM dashboard_items WHERE organisation_id = :organisationID AND representative_id IN (:companies) AND type = :layoutID  `
            
            if(replacements.layoutID == 41) {   
                if(customers.length > 0) { 
                    query += ` AND assignor_id IN (
                        SELECT assignor_and_assignee_id FROM (
                        SELECT assignor_and_assignee_id FROM db_uspto.assignor_and_assignee WHERE assignor_and_assignee_id IN (:customers)
                        UNION
                        SELECT assignor_and_assignee_id FROM db_uspto.assignor_and_assignee WHERE representative_id IN (SELECT representative_id FROM db_uspto.assignor_and_assignee WHERE assignor_and_assignee_id IN (:customers) AND representative_id > 0)) As tempAssignorAndAssignee GROUP BY assignor_and_assignee_id
    
                    ) `
                }
            } else {
                query += ` AND assignor_id IN (:customers) `
            }



            query += ` ${req.orgType == 2 ? ' AND mode IN (:mode) ' : ''}  GROUP BY rf_id) GROUP BY documentid.rf_id) AS trans INNER JOIN db_uspto.assignment AS assignment ON assignment.rf_id = trans.rf_id `
            
            if(lawfirm > 0) { 
                const findLawFirm = `SELECT cname, lf.name, rlf.representative_id, rlf.representative_name FROM db_uspto.correspondent AS c LEFT JOIN db_uspto.law_firm  as lf ON c.cname = lf.name
                LEFT JOIN db_uspto.representative_law_firm AS rlf ON rlf.representative_id = lf.representative_id WHERE c.rf_id = :lawfirm`

                const getLawFirmData = await connection.applicationNew.query(findLawFirm, {
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    plain: true,
                    logging: console.log,
                    replacements: {lawfirm},
                })  
                if(getLawFirmData != null ) { 
                    if(getLawFirmData.representative_id > 0) {
                        replacements.representative_id = getLawFirmData.representative_id 
                    } else {
                        replacements.name = getLawFirmData.cname
                    }
    
                    let tempQuery = `SELECT c.rf_id  FROM db_uspto.correspondent AS c LEFT JOIN db_uspto.law_firm  as lf ON c.cname = lf.name
                    LEFT JOIN db_uspto.representative_law_firm AS rlf ON rlf.representative_id = lf.representative_id WHERE c.rf_id IN (SELECT rf_id FROM db_new_application.activity_parties_transactions WHERE ( organisation_id = :organisationID OR organisation_id IS NULL )  AND company_id IN (:companies)) `
    
                    if(typeof replacements.representative_id != 'undefined') {
                        tempQuery += ` AND rlf.representative_id = :representative_id`
                    } else {
                        tempQuery += ` AND c.cname = :name`
                    }
                    tempQuery += ` GROUP BY  c.rf_id`
                    query += ` WHERE assignment.rf_id IN (${tempQuery}) ` 
                }  
            }
            
            query += " ORDER BY `date` DESC";

            transactions.list = await connection.applicationNew.query(query, {
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: replacements,
            })
            transactions.total_records = transactions.list.length
            res.status(200).json(transactions);
        } else {
            if(companies.length > 0) {
                replacements.companies = companies.join(',')
            }
            if(tabs && tabs != '') {
                tabs = JSON.parse( tabs )
                tabs = helpers.checkTabs(tabs)
                replacements.tabs = tabs.join(',')
            }
    
            if(customers.length > 0 && Array.isArray(customers)) { 
                replacements.customers = customers.join(',')
            }  
            
            const procedureName = req.params.layout == 'correct_details' ? 'routine_correct_details' : layoutID == 15 ? 'routine_transactions_full' : 'routine_transactions'
            
            connection.applicationNew.query(`CALL ${procedureName} (:companies, :organisationID, :tabs, :customers, :layoutID);`,{
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
        }

        
    } catch ( err ) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
})

route.post("/transactions/groupids", [authJWT.verifyToken], async(req, res, next) => {
    try{
        let { group_ids } = req.body, transactions = {list: [], total_records: 0}
        
        if( group_ids != '') {
            const replacements = {}
            if(group_ids && group_ids != '') {
                group_ids = JSON.parse( group_ids )
                replacements.rfIDs = group_ids
            }

            transactions.list = await connection.applicationNew.query("	WITH trans AS (SELECT assignment.cname, assignment.caddress_1, assignor.rf_id, assignor.exec_dt AS `date`,  (SELECT COUNT(DISTINCT documentid.appno_doc_num) FROM db_uspto.documentid AS documentid  WHERE documentid.rf_id = assignor.rf_id) AS `assets` FROM db_uspto.assignor AS assignor INNER JOIN db_uspto.assignment AS assignment ON assignment.rf_id = assignor.rf_id  WHERE  assignor.rf_id IN (:rfIDs) GROUP BY assignor.rf_id ) SELECT rf_id, IF(cname != '', cname, caddress_1) AS name, `date`, `assets`, SUM(`assets`) OVER (ORDER BY rf_id) AS grand_total FROM trans;",{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: replacements,
            })
            transactions.total_records = transactions.list.length
            res.status(200).json(transactions);
        } else {
            res.status(200).json(transactions);
        }        
    } catch(err) {
        res.status(500).send("Internal server error.");
    }
})

route.get("/transactions/address", [authJWT.verifyToken], async(req, res, next) => {
    try {
        let {companies, tabs, customers, limit, offset } = req.query,
            layoutID = 15
            
        const replacements =  { 
                            companies: '', 
                            organisationID:  0 /* req.orgId */, 
                            tabs: '',
                            customers: '',
                            assignments: '',
                            layoutID: layoutID
                        },
            transactions = {
                        list: [], 
                        total_records: 0
                    }
        
        replacements.layoutID = helpers.findLayout(req.params.layout)        

        if(companies && companies != '') {
            companies = JSON.parse( companies )
            replacements.companies = companies.join(',')
        }

        if(tabs && tabs != '') {
            tabs = JSON.parse( tabs )
            tabs = helpers.checkTabs(tabs)
            replacements.tabs = tabs.join(',')
        }

        if(customers && customers != '') {
            customers = JSON.parse( customers )
            replacements.customers = customers.join(',')
        } 
        
        connection.applicationNew.query(`CALL routine_correct_address (:companies, :organisationID, :tabs, :customers, :layoutID);`,{
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

route.get("/transactions/name", [authJWT.verifyToken], async(req, res, next) => {
    try {
        let {companies, tabs, customers, limit, offset } = req.query           
            
        const replacements =  { 
                            companies: '', 
                            organisationID:  0 /* req.orgId */, 
                            tabs: '',
                            customers: '',
                            assignments: '',
                        },
            transactions = {
                        list: [], 
                        total_records: 0
                    }
        
        

        if(companies && companies != '') {
            companies = JSON.parse( companies )
            replacements.companies = companies.join(',')
        }

        if(tabs && tabs != '') {
            tabs = JSON.parse( tabs )
            tabs = helpers.checkTabs(tabs)
            replacements.tabs = tabs.join(',')
        }

        if(customers && customers != '') {
            customers = JSON.parse( customers )
            replacements.customers = customers.join(',')
        } 
        
        connection.applicationNew.query(`CALL routine_correct_names (:companies, :organisationID, :tabs, :customers);`,{
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

route.get("/incorrectnames", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        let {companies, id,  tabs, customers, limit, offset } = req.query           
            
        const replacements =  { 
                            companies: [], 
                            organisationID:  0 /* req.orgId */, 
                            tabs: [],
                            customers: [],
                            assignments: [],
                        };
        if(req.orgType == 2) {
            /**
                * Bank Mode
                */
            replacements.mode = 1
        }
                        
                        
        let getNamesData = [], representativeName = '';

        if(typeof id != undefined && id > 0) {
            replacements.id = id;
        }

        if(companies && companies != '') {
            companies = JSON.parse( companies )
            replacements.companies = companies

            const Representative = req.connection_db.define('Representatives', Representatives.mainStructure, Representatives.options);

            const findName = await Representative.findOne({
                attributes: ['representative_name'],
                where:{ company_id: companies}                        
            });

            if(findName != null) {
                representativeName = findName.get('representative_name')
            }

            if(tabs && tabs != '') {
                tabs = JSON.parse( tabs )
                tabs = helpers.checkTabs(tabs)
                replacements.tabs = tabs
            }
    
            if(customers && customers != '') {
                customers = JSON.parse( customers )
                replacements.customers = customers
            } 
            
            if(representativeName != '') {
                console.log(representativeName)

                const findOriginalRepresentativeName = `SELECT ee.original_name FROM db_uspto.assignee AS ee INNER JOIN db_uspto.assignor_and_assignee AS aaa ON aaa.assignor_and_assignee_id = ee.assignor_and_assignee_id WHERE name = :representativeName LIMIT 1`;

                const findName = await connection.applicationNew.query(findOriginalRepresentativeName,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    plain: true,
                    logging: console.log,
                    replacements: {representativeName},
                })

                if( findName != null ) {
                    representativeName = findName.original_name
                }

                const query = `SELECT name, assignor_and_assignee_id AS id, COUNT(application) AS count_assets, 0 AS distance FROM ( SELECT IF(assignee.original_name != '', assignee.original_name, assignee.ee_name) AS name, aaa.assignor_and_assignee_id, doc.appno_doc_num as application FROM db_uspto.assignee AS assignee INNER JOIN db_uspto.assignor_and_assignee AS aaa ON aaa.assignor_and_assignee_id = assignee.assignor_and_assignee_id INNER JOIN db_uspto.documentid AS doc ON doc.rf_id = assignee.rf_id INNER JOIN db_uspto.list1 ON list1.assignor_and_assignee_id = aaa.assignor_and_assignee_id AND ( list1.organisation_id = :organisationID OR list1.organisation_id IS NULL )  ${replacements.companies.length > 0 ? ' AND list1.company_id IN (:companies)' : ''} WHERE assignee.rf_id IN (SELECT rf_id FROM db_new_application.dashboard_items WHERE type = 17 AND organisation_id = :organisationID  ${req.orgType == 2 ? ' AND mode IN (:mode) ' : ''}   ${replacements.companies.length > 0 ? ' AND representative_id IN (:companies)' : ''} )  ${id != undefined && id > 0 ? ' AND aaa.assignor_and_assignee_id = :id' : ''} ) as temp GROUP BY name ORDER BY LENGTH(name) ASC`;
        
                const list = await connection.applicationNew.query(query,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        logging: console.log,
                        replacements: replacements,
                    }
                )
                const allNames = [];
                if(list != null && list.length > 0) {
                    const promise = list.map( (item, index) => {
                        let name = item.name
                        name = name.replace(/,/g, ' ').replace(/\./g, ' ');
                        console.log('name', name, allNames)
                        const checkName = name.replace(/\s/g,'');
                        if(!allNames.includes(checkName.trim())) {
                            allNames.push(checkName.trim())
                            list[index].distance = distance(representativeName, name.trim());
                            if(list[index].distance > 0) {
                                getNamesData.push(list[index])
                            }
                        } else {
                            const findIndex = getNamesData.findIndex(item => {
                                let name = item.name
                                name = name.replace(/,/g, ' ').replace(/\./g, ' ').replace(/\s/g,'');
                                return name == checkName
                            })

                            if(findIndex !== -1) {
                                getNamesData[findIndex].count_assets += list[index].count_assets
                            }
                        }
                    })
                    await Promise.all(promise)
                }
            }
        }
        res.status(200).json(getNamesData);
    } catch ( err ) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
})

route.post("/transactions/queues/address", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        let { group_ids, new_address, company_ids } = req.body, getList = []

        if( group_ids != '' ) {
            group_ids = JSON.parse(group_ids)
            company_ids = JSON.parse(company_ids)

            const Addresses = req.connection_db.define('Address', Address.mainStructure, Address.options);

            const getAddressData = await Addresses.findOne({
                attributes: ['address_id', 'street_address','suite','city','state','country','zip_code'],
                where:{ address_id: new_address}                        
            });

            if( getAddressData != null ) {
                const assigneeNewAddress = `${getAddressData.street_address} ${getAddressData.suite} ${getAddressData.city} ${getAddressData.state} ${getAddressData.zip_code} ${getAddressData.country}`.trim()
                const query = `SELECT assignment.rf_id AS id, ${new_address} AS new_address_id, IF( assignee.original_name != '', assignee.original_name, assignee.ee_name ) AS name, TRIM(CONCAT(assignee.ee_address_1, " ", assignee.ee_address_2, " ", assignee.ee_city, " ", assignee.ee_state, " ", assignee.ee_postcode, " ", assignee.ee_country )) AS current_address, "${assigneeNewAddress}" as new_address, assignment_conveyance.convey_ty, (SELECT date_format(assignor.exec_dt, "%b %d, %Y") FROM db_uspto.assignor AS assignor WHERE assignor.rf_id = assignment.rf_id LIMIT 1)  AS exec_dt, date_format(record_dt, "%b %d, %Y") AS record_dt, (SELECT COUNT(documentid.appno_doc_num) FROM db_uspto.documentid AS documentid WHERE documentid.rf_id =  assignment.rf_id) AS assets, IF(cname != '', cname, caddress_1) AS original_correspondence FROM db_uspto.assignment AS assignment INNER JOIN db_uspto.assignment_conveyance AS assignment_conveyance ON assignment_conveyance.rf_id = assignment.rf_id INNER JOIN db_uspto.assignee AS assignee ON assignee.rf_id = assignment.rf_id WHERE assignee.assignor_and_assignee_id IN (SELECT assignor_and_assignee_id FROM db_uspto.list1 WHERE company_id IN (:companyIDs) AND  ( organisation_id = :organisation_id OR organisation_id IS NULL ) ) AND assignment.rf_id IN (:rfIDs)`


                const replacements = { organisation_id:  0 /* req.orgId */, companyIDs: company_ids, rfIDs: group_ids}

                getList = await connection.applicationNew.query(query,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    logging: console.log,
                    replacements: replacements,
                    }
                )
            }
        }
        res.status(200).json(getList);
    } catch (err) {
        console.log("/transactions/queues/address", err)
        res.status(500).send("Internal server error.")
    }    
})

route.post("/transactions/queues/name", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        let { group_ids, new_name, company_ids } = req.body, getList = []

        if( group_ids != '' ) {
            group_ids = JSON.parse(group_ids)

            if( group_ids.length > 0) {
                if( new_name == undefined || new_name == 'undefined') {
                    const Representative = req.connection_db.define('Representatives', Representatives.mainStructure, Representatives.options);
    
                    const getNameData = await Representative.findOne({
                        attributes: ['representative_name'],
                        where:{ representative_id: company_ids}                        
                    });
                    if(getNameData != null) {
                        new_name = getNameData.get('representative_name')
                    }
                }            
                if( new_name != null && new_name != '' && new_name != 'undefined') {
                    
                    const query = `SELECT assignment.rf_id AS id, IF( assignee.original_name != '', assignee.original_name, assignee.ee_name ) AS name, TRIM(CONCAT(assignee.ee_address_1, " ", assignee.ee_address_2, " ", assignee.ee_city, " ", assignee.ee_state, " ", assignee.ee_postcode, " ", assignee.ee_country )) AS current_address, "${new_name.toString().toUpperCase()}" as new_name, assignment_conveyance.convey_ty, (SELECT date_format(assignor.exec_dt, "%b %d, %Y") FROM db_uspto.assignor AS assignor WHERE assignor.rf_id = assignment.rf_id LIMIT 1)  AS exec_dt, date_format(record_dt, "%b %d, %Y") AS record_dt, (SELECT COUNT(documentid.appno_doc_num) FROM db_uspto.documentid AS documentid WHERE documentid.rf_id =  assignment.rf_id) AS assets, IF(cname != '', cname, caddress_1) AS original_correspondence FROM db_uspto.assignment AS assignment INNER JOIN db_uspto.assignment_conveyance AS assignment_conveyance ON assignment_conveyance.rf_id = assignment.rf_id INNER JOIN db_uspto.assignee AS assignee ON assignee.rf_id = assignment.rf_id WHERE assignee.assignor_and_assignee_id IN (SELECT assignor_and_assignee_id FROM db_uspto.list1 WHERE company_id = :companyIDs AND ( organisation_id = :organisation_id OR organisation_id IS NULL )) AND assignment.rf_id IN (:rfIDs)`
    
    
                    const replacements = { organisation_id:  0 /* req.orgId */, companyIDs: company_ids, rfIDs: group_ids}
    
                    getList = await connection.applicationNew.query(query,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        logging: console.log,
                        replacements: replacements,
                        }
                    )
                }
            }
        }
        res.status(200).json(getList);
    } catch (err) {
        console.log("/transactions/queues/address", err)
        res.status(500).send("Internal server error.")
    }    
})

route.get("/lawfirm", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        let { companies, rfID  } = req.query;

        let replacements =  { 
            companies: '', 
            year: 1999,
            organisationID:  0 /* req.orgId */
        }

        if(companies && companies != '') {
            companies = JSON.parse( companies )
            replacements.companies = companies.join(',')
        }

        if(req.orgType == 2) {
            /**
                * Bank Mode
                */
            replacements.mode = 1
        }

        let tempQuery = `SELECT rf_id AS id, lawfirm, count(rf_id) AS distance, GROUP_CONCAT(rf_id) AS grp FROM db_new_application.dashboard_items
            WHERE  organisation_id = :organisationID AND type = 40  ${req.orgType == 2 ? ' AND mode IN (:mode) ' : ''} `

        if(companies.length > 0) {
            tempQuery += ` AND representative_id IN (:companies)`;
        }

        tempQuery += ` GROUP BY lawfirm `; 

        let distanceName = ''

        if(rfID != undefined && rfID != 'undefined' && parseInt(rfID) > 0 ) {
            const findLawFirm = `SELECT cname, lf.name, rlf.representative_id, rlf.representative_name FROM db_uspto.correspondent AS c LEFT JOIN db_uspto.law_firm  as lf ON c.cname = lf.name
            LEFT JOIN db_uspto.representative_law_firm AS rlf ON rlf.representative_id = lf.representative_id WHERE c.rf_id = :rfID`

            const getLawFirmData = await connection.applicationNew.query(findLawFirm, {
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                plain: true,
                logging: console.log,
                replacements: {rfID},
            }) 

            if(getLawFirmData != null ) { 

                if(getLawFirmData.representative_id > 0) {
                    replacements.representative_id = getLawFirmData.representative_id
                    distanceName = getLawFirmData.representative_name
                } else {
                    replacements.name = getLawFirmData.cname
                }

                tempQuery = `SELECT c.rf_id AS id, c.cname AS lawfirm, GROUP_CONCAT(rf_id) AS grp  FROM db_uspto.correspondent AS c LEFT JOIN db_uspto.law_firm  as lf ON c.cname = lf.name
                LEFT JOIN db_uspto.representative_law_firm AS rlf ON rlf.representative_id = lf.representative_id WHERE c.rf_id IN (SELECT rf_id FROM db_new_application.activity_parties_transactions WHERE ( organisation_id = :organisationID OR organisation_id IS NULL ) AND company_id IN (:companies)) `

                if(typeof replacements.representative_id != 'undefined') {
                    tempQuery += ` AND rlf.representative_id = :representative_id`
                } else {
                    tempQuery += ` AND c.cname = :name`
                }
                tempQuery += ` GROUP BY  c.cname`
            }
        }

        const getList = await connection.applicationNew.query(tempQuery, {
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            logging: console.log,
            replacements: replacements,
        })


        if(distanceName != '') {
            const allNames = [];
            if(getList != null && getList.length > 0) {
                const promise = getList.map( (item, index) => {
                    let name = item.lawfirm
                    name = name.replace(/,/g, ' ').replace(/\./g, ' ');
                     
                    const checkName = name.replace(/\s/g,'');
                    if(!allNames.includes(checkName.trim())) {
                        allNames.push(checkName.trim())
                        getList[index].distance = distance(distanceName, name.trim());
                    } 
                })
                await Promise.all(promise)
            }
        }
        res.status(200).json(getList);
    } catch(err) {
        console.log("/customers/lawfirm", err)
        res.status(500).send("Internal server error.")
    }
})


route.get("/lenders", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        let { companies, rfID  } = req.query;

        let replacements =  { 
            companies: '', 
            year: 1999,
            organisationID:  0 /* req.orgId */,
            type: 41
        }

        if(req.orgType == 2) {
            /**
                * Bank Mode
                */
            replacements.mode = 1
        }

        if(companies && companies != '') {
            companies = JSON.parse( companies )
            replacements.companies = companies.join(',')
        }

        let tempQuery = `SELECT IF(r.representative_name <> '', r.representative_name, aaa.name) AS name, assignor_id AS id, count(rf_id) AS counter FROM db_new_application.dashboard_items AS di INNER JOIN db_uspto.assignor_and_assignee AS aaa ON aaa.assignor_and_assignee_id = di.assignor_id LEFT JOIN db_uspto.representative AS r ON r.representative_id = aaa.representative_id WHERE  organisation_id = :organisationID AND type = :type  ${req.orgType == 2 ? ' AND mode IN (:mode) ' : ''} `

        if(companies.length > 0) {
            tempQuery += ` AND di.representative_id IN (:companies)`;
        }

        tempQuery += ` GROUP BY name `;  
        
        const getList = await connection.applicationNew.query(tempQuery, {
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            logging: console.log,
            replacements: replacements,
        })

        res.status(200).json(getList);
    } catch(err) {
        console.log("/customers/lawfirm", err)
        res.status(500).send("Internal server error.")
    }
})

route.get("/:layout/parties", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        let {companies, tabs, t, limit, offset } = req.query,
        layoutID = 15
            
        const replacements =  { 
                            companies: '', 
                            organisationID:  0 /* req.orgId */, 
                            tabs: '',
                            customers: '',
                            assignments: '',
                            layoutID: layoutID,
                            customerType: t
                        },
                parties = {
                            list: [], 
                            total_records: 0
                        }
        
        replacements.layoutID = helpers.findLayout(req.params.layout) 

        if(req.orgType == 2) {
            /**
                * Bank Mode
                */
            replacements.mode = 1
        }       

        if(companies && companies != '') {
            companies = JSON.parse( companies )
            replacements.companies = companies.join(',')
        }

        if(tabs && tabs != '') {
            tabs = JSON.parse( tabs )
            tabs = helpers.checkTabs(tabs) /**If it bank then check all the tabs should include */
            replacements.tabs = tabs.join(',')
        }
        console.log('layoutID', replacements.layoutID)
        if(parseInt(replacements.layoutID) != 15) {
            /* const query = `SELECT id, entityName, totalTransactions, totalAssets, sum(totalTransactions) OVER (ORDER BY id) AS grand_total, sum(totalAssets) OVER (ORDER BY id) AS grand_total_assets FROM ( SELECT id, entityName, SUM(assets) AS totalAssets, COUNT(DISTINCT rfID) AS totalTransactions  FROM (SELECT apt.assignor_id AS id, 
            IF(representative.representative_name <> '', representative.representative_name, assignor_and_assignee.name) AS entityName, 
            apt.rf_id AS rfID, 
            (SELECT COUNT(appno_doc_num) FROM db_uspto.documentid WHERE rf_id =  apt.rf_id) AS assets 
            FROM db_new_application.dashboard_items AS apt
            INNER JOIN db_patent_application_bibliographic.assignor_and_assignee AS assignor_and_assignee ON assignor_and_assignee.assignor_and_assignee_id = apt.assignor_id
            LEFT JOIN db_uspto.representative AS representative ON representative.representative_id = assignor_and_assignee.representative_id WHERE apt.organisation_id = :organisationID AND apt.representative_id IN (:companies) AND apt.type = :layoutID GROUP BY entityName, rfID) AS temp GROUP BY entityName) AS temp1`; */
            const query = `SELECT id, entityName, totalTransactions, totalAssets, sum(totalTransactions) OVER (ORDER BY id) AS grand_total, sum(totalAssets) OVER (ORDER BY id) AS grand_total_assets FROM ( 
                Select assignor_and_assignee.assignor_and_assignee_id AS id, IF(representative.representative_name <> '', representative.representative_name, assignor_and_assignee.name) AS entityName,
                COUNT(application) AS totalAssets, 0 AS totalTransactions, COUNT(application) AS assets
                FROM db_new_application.dashboard_items AS apt
               INNER JOIN db_patent_application_bibliographic.assignor_and_assignee AS assignor_and_assignee ON assignor_and_assignee.assignor_and_assignee_id = apt.assignor_id
               LEFT JOIN db_uspto.representative AS representative ON representative.representative_id = assignor_and_assignee.representative_id 
               WHERE ( apt.organisation_id = :organisationID OR apt.organisation_id IS NULL ) AND apt.representative_id IN (:companies) 
               AND apt.type = :layoutID  ${req.orgType == 2 ? ' AND apt.mode IN (:mode) ' : ''} 
               GROUP BY entityName) AS temp1;`

            const result = await connection.applicationNew.query(query, {
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: replacements,
            })
            if (result) {
                parties.list = result
                parties.total_records = parties.list.length
            }
            res.status(200).json(parties);
        } else {
            connection.applicationNew.query("CALL `routine_parties`(:companies, :organisationID, :tabs, :layoutID, :customerType);",{
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
        }
        
        
    } catch ( err ) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
})

route.get("/:layout/activites", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        let {companies, limit, offset } = req.query,
            layoutID = 15, activites = []
            
        const replacements =  { 
                            companies: '', 
                            organisationID:  0 /* req.orgId */, 
                            tabs: '',
                            customers: '',
                            assignments: '',
                            layoutID: layoutID
                        }
        
        replacements.layoutID = helpers.findLayout(req.params.layout)  
        
        

        if(companies && companies != '') {
            companies = JSON.parse( companies )
            replacements.companies = companies.join(',')
        }

        connection.applicationNew.query("CALL `routine_activities`(:companies, :organisationID, :layoutID);",{
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
                where: {representative_id: portfolioList, organisation_id:  0 /* req.orgId */, tab_id: tabID},
                include:[
                    {
                        model: TreePartiesCollections,
                        as: 'collections',
                        attributes: ['rf_id', 'exec_dt'],
                        where:{tab_id: tabID, representative_id: portfolioList, organisation_id:  0 /* req.orgId */},
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
                where: {representative_id: portfolioList, organisation_id:  0 /* req.orgId */, tab_id: TABS},
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
                        where: {representative_id: allPortfolioList, organisation_id:  0 /* req.orgId */},
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
                        where: {representative_id: allPortfolioList, organisation_id:  0 /* req.orgId */, tab_id: TABS},
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
                                    replacements: { organisationID:  req.orgId , companiesID: tab.representative_id, tabID: tab.tab_id},
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

                        let searchData = {parent: 0, organisation_id:  0 /* req.orgId */, representative_id: getCompaniesList[i].representative_id};
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
                    replacements: { organisationID:  0 /* req.orgId */, representativeID: getCompaniesList.representative_id, tabId: tabId, parent: 0 },
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
        
        const organisationData = await helpers.findOrganisationbyID( 0 /* req.orgId */);
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
                    searchData = {name: parentCompany, customer_name: customerName, convey_type: ["release", "restatedsecurity", "partialrelease" ], employer_assign: 0};
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