const express = require("express");

const route = express.Router();

const connection = require("../../config/db.config");

const request = require('request');

const fs = require('fs');

const { exec, spawn  } = require('child_process');

//require the Model
const { WebClient } = require('@slack/web-api')


const ResourceDocumentids = require("../../model/resources/DocumentIds");

const ResourceAssignments = require("../../model/resources/Assignments");

const AssetsTransfer = require("../../model/application/AssetsTransfer");

const Assets = require("../../model/application/Assets");

const AssetsForSale = require("../../model/application/AssetsForSale");

const Documentids = require("../../model/application/DocumentIds");

const Assignments = require("../../model/application/Assignments");

const Assignees = require("../../model/application/Assignees");

const Assignors = require("../../model/application/Assignors");

const AssignorAndAssignee = require("../../model/application/AssignorAndAssignee");

const Representatives = require("../../model/client/Representatives");

const RepresentativeTransactions = require('../../model/resources/RepresentativeTransactions');

const Repository = require("../../model/application/Repository");

const SheetsHelper = require('../../helpers/sheets');

const authJWT = require("../../helpers/verifyJwtToken");

const helpers = require("../../helpers/helper");

const clientDBConnection = require("../../helpers/clientDBConnection");

const {google} = require('googleapis');

const  AWS  = require('aws-sdk');
const { Console } = require("console");

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_SECRET_KEY,
    process.env.REDIRECT_URL
);

const findLayout = (layout) => {
    let layoutID = 15
    switch(layout) {
        case 'restore_ownership':
            layoutID = 1
            break
        case 'clear_encumbrances':
            layoutID = 2
            break
        case 'correct_details':
            layoutID = 4
            break
        default:
            layoutID = 15
    }
    return layoutID
}

route.get("/assets", [authJWT.verifyToken], async(req, res, next) => {

    Assets.findAll({
        where: {organisation_id: req.orgId}
    })
    .then((list)=>{
        res.status(200).json(list);
    }).catch((err)=>{
        console.log(err);
        res.status(500).json({message: "Unable to retrieve assets"})
    });
});

const findLawFirmName = async (props) => {
    let queryFillingLawFirm = ` SELECT lawfirm FROM dashboard_items WHERE organisation_id = :organisation_id  AND representative_id IN (:companies) AND type = :type `

    if(typeof props.assignments  != 'undefined' && props.assignments.length > 0) {  
        queryFillingLawFirm += ` AND rf_id IN (:assignments) ` 
    }

    queryFillingLawFirm += ` GROUP BY lawfirm `

    const assetsWithLawFirm =  await connection.applicationNew.query(queryFillingLawFirm, {
        type: connection.Sequelize.QueryTypes.SELECT,
        raw: true,
        logging: console.log,
        replacements: props,
    }); 

    const lawFirm = []

    if(assetsWithLawFirm.length > 0) {
        const promise = assetsWithLawFirm.map( row => {
            lawFirm.push(`${row.lawfirm}`)
        })

        await Promise.all(promise)
    }
    return lawFirm; 
}

route.post("/assets/categories_products", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => { 
    try {
        let { list } = req.body, getList = []

        if( list != '' ) {
            list = JSON.parse(list)

            if(list.length > 0) {
                const query = "SELECT * FROM (SELECT grant_doc_num, date_format(appno_date, '%Y') AS year FROM db_patent_application_bibliographic.application_grant WHERE grant_doc_num IN (:list) GROUP BY grant_doc_num UNION SELECT MAX(grant_doc_num) AS grant_doc_num, date_format(MAX(appno_date), '%Y') AS year FROM db_uspto.documentid WHERE grant_doc_num IN (:list) GROUP BY grant_doc_num) AS temp GROUP BY grant_doc_num "
                getList = await connection.application.query(query,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    logging: console.log,
                    replacements: {list},
                }); 
            }
        }
        res.status(200).json({list: getList});
    } catch (e) {
        console.log(e)
    }
});

route.post("/assets/cpc", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => { 
    try{
        let { list, total, type, selectedCompanies, tabs, customers, assignments, range, scope, year, other_mode, data_type, sale, license, primary, check, lawfirm } = req.body, getList = [], group = [], sales = []
        const replacements = { organisation_id: 0 /* req.orgId */, year: 2000 }
        if(req.orgType == 2) {
            /**
             * Bank Mode
             */
            replacements.mode = 1
        }
        let companies = []
        if(typeof selectedCompanies != 'undefined' && selectedCompanies != '') {            
            companies = JSON.parse(selectedCompanies)
        }

        if(typeof req.shareCode != 'undefined' && req.shareCode != '') {
            const getShareCodeData = await helpers.getShareListAssets(req.shareCode)
            if (getShareCodeData) {
                const patent = [], application = [] 
                getShareCodeData.forEach( item => { 
                    if(item.type == 4) {
                        patent.push(item.asset)
                    }
                    if(item.type == 5) {
                        application.push(item.asset)
                    }
                })
                const getNewConnection = await clientDBConnection.connectOnFly(req.orgId);
                if(getNewConnection) { 
                    const Representative = getNewConnection.define('Representatives', Representatives.mainStructure, Representatives.options);

                    const where = {
                        where: { parent_id: 0 },
                        attributes: ['representative_id', 'company_id', 'original_name', 'representative_name', 'type', 'status']
                    };

                    const list = await Representative.findAll( where )
                     
                    if(list.length > 0) { 
                        let representativeIDs = [], clientCompanies = []

                        list.forEach(representative => {
                            if (representative.company_id > 0) {
                                clientCompanies.push(representative.company_id);
                            } else {
                                representativeIDs.push(representative.representative_id);
                            }
                        });
                         
                        if(representativeIDs.length > 0) {
                            findChild = await Representative.findAll({
                                attributes: ['representative_id', 'company_id', 'parent_id', 'representative_name', 'original_name', 'status'],
                                where: {                            
                                    parent_id: representativeIDs, 
                                    child: 1
                                },
                                order: [
                                    ['type', 'ASC'],
                                    ['status', 'DESC'],
                                    ['original_name', 'ASC'],
                                    ['representative_name', 'ASC']
                                ]
                            })
        
                            list.map( representative => {
                                if(representative.type == 1) {
                                    const childCompanies = findChild.filter( row => row.parent_id == representative.representative_id).map(obj => obj.company_id > 0 ? obj.company_id : null )
                                    clientCompanies.push(...childCompanies);
                                }
                            }) 
                        }

                        let dashboardRepresentative = `SELECT representative_id FROM db_new_application.dashboard_items WHERE (organisation_id = 0 OR organisation_id IS NULL) AND representative_id IN (:clientCompanies)  `

                        if(patent.length > 0) {
                            dashboardRepresentative += ` AND patent IN (:patent) `
                        }

                        if(application.length > 0) {
                            dashboardRepresentative += ` AND application IN (:application) `
                        }

                        dashboardRepresentative += `GROUP BY representative_id ` 
                        const findRepresentatives = await connection.application.query(dashboardRepresentative,{
                            type: connection.Sequelize.QueryTypes.SELECT,
                            raw: true,
                            logging: console.log,
                            replacements: {clientCompanies, patent, application},
                        });  
                        if (findRepresentatives && findRepresentatives.length > 0) { 
                            findRepresentatives.map( row => {
                                companies.push(row.representative_id)
                            })  
                        }
                    }
                }
            }
        }

        if(list != '' && total > 0) {
            list = JSON.parse(list)
            if(list.length != total) {
                list = []
            } else {
                data_type = 1
            }
        } else {
            list = []
        }
        
        replacements.type = helpers.findLayout(type);  
        if(typeof type !== 'undefined' && type != 'due_dilligence' && list.length == 0) { 
            if(type == 'top_law_firms') { 
                let getFiilingAssets = []
                if(typeof primary != 'undefined'){ 
                    getFiilingAssets = await helpers.findFillingAssets(req) 
                } else {
                    
                    replacements.companies = companies
                    const ownedAssets = `SELECT application FROM db_new_application.dashboard_items WHERE organisation_id = :organisation_id AND representative_id IN (:companies) AND type = :type  ${req.orgType == 2 ? ' AND mode IN (:mode) ' : ''} GROUP BY application `;
    
                    const getAssetsData = await connection.application.query(ownedAssets,{
                            type: connection.Sequelize.QueryTypes.SELECT,
                            raw: true,
                            logging: console.log,
                            replacements: replacements,
                        }
                    ); 
                    if(getAssetsData != null && getAssetsData.length > 0) {
                        const promise = getAssetsData.map( row => {
                            getFiilingAssets.push(`${row.application}`)
                        })
    
                        await Promise.all(promise)
                    }
                }
 
    
                if(getFiilingAssets.length > 0) {  
                    replacements.applications = getFiilingAssets
                    replacements.companies = companies
                    if(assignments && assignments != '') {
                        assignments = JSON.parse( assignments )
                        replacements.assignments = assignments
                    }
                    const lawfirmName = await helpers.findLawFirmName(replacements)
    
                    replacements.lawfirm_name = lawfirmName
    
                    let queryFillingLawFirm = "SELECT l.appno_doc_num FROM db_patent_application_bibliographic.lawfirm AS l  WHERE l.appno_doc_num IN (:applications) AND TRIM(BOTH  '.' FROM l.name) IN (:lawfirm_name) GROUP BY l.appno_doc_num "
        
                    const assetsWithLawFirm =  await connection.applicationNew.query(queryFillingLawFirm, {
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        logging: console.log,
                        replacements: replacements,
                    }); 
    
                    if(assetsWithLawFirm != null && assetsWithLawFirm.length > 0) {
                        list = [] 
                        const promiseAssets = assetsWithLawFirm.map(row => {
                            list.push(`${row.appno_doc_num}`)
                        }) 
                        await Promise.all(promiseAssets)
                        total = list.length
                        list = JSON.stringify(list)
                    }
                } 
            } else {
                if(replacements.type == 38) {
                    replacements.type = 30
                }
                let queryAssets = `SELECT application FROM db_new_application.dashboard_items WHERE organisation_id = :organisation_id AND representative_id = :companies  ${req.orgType == 2 ? ' AND mode IN (:mode) ' : ''}   `
                replacements.companies = companies
                if(assignments && assignments != '') {
                    assignments = JSON.parse( assignments )
                    if(assignments.length > 0) { 
                        replacements.assignments = assignments
                        if(replacements.type == 30) {
                            queryAssets += ` AND application IN (SELECT application FROM db_new_application.dashboard_items WHERE organisation_id = :organisation_id AND representative_id = :companies AND rf_id IN (:assignments)  ${req.orgType == 2 ? ' AND mode IN (:mode) ' : ''}  ) `;
                        } else {
                            queryAssets += `  AND type = :type `
                            queryAssets += ` AND rf_id IN (:assignments) `;
                        } 
                    } else {
                        queryAssets += `  AND type = :type `
                    }
                } else {
                    queryAssets += `  AND type = :type `
                }

                if(customers && customers != '') {
                    customers = JSON.parse( customers )
                    replacements.customers = customers
                    if(customers.length > 0) {  
                        queryAssets += ` AND assignor_id IN (:customers) `;
                    }
                }

                queryAssets += `GROUP BY application `;
                const getAssetsData = await connection.application.query(queryAssets,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        logging: console.log,
                        replacements: replacements,
                    }
                ); 

                console.log(getAssetsData)
                if(getAssetsData != null && getAssetsData.length > 0) {
                    list = []
                    const promise = getAssetsData.map( row => {
                        list.push(`${row.application}`)
                    })
                    total = list.length
                    list = JSON.stringify(list)
                    await Promise.all(promise)
                }
            }
        } else if(((typeof data_type !== 'undefined' && data_type == 1) || typeof sale != 'undefined' || typeof license != 'undefined')) { 
            list = await helpers.findFilterAssets(req)
            total = list.length
        } 
        
        if( list != '' || list.length == 0 ) {
            if((typeof data_type == 'undefined') || (typeof data_type !== 'undefined' && data_type == 0)) {
                list = list != '' && list.length > 0 ? JSON.parse(list) : []
            }            

            let rangeConcat = 'CONCAT(section, class, sub_class)'

            if( range != undefined && range != 'undefined' && range != null) {
                switch(parseInt(range)) {
                    case 5:
                        rangeConcat = 'section'
                        break;                        
                    case 4:
                        rangeConcat = 'CONCAT(section, class)'
                        break;
                    case 2:
                        rangeConcat = 'CONCAT(section, class, sub_class, main_group, "/00")'
                        break;
                    case 1:
                        rangeConcat = 'CONCAT(section, class, sub_class, main_group, "/", sub_group)'
                        break;                            
                    case 3:
                    default:
                        rangeConcat = 'CONCAT(section, class, sub_class)' 
                        break;
                }
            }

            let query = '';
            
            if(parseInt(total) != list.length) {
                /**
                 * Get List
                 */

                const where = { year: 2000, organisationID: 0 /* req.orgId */, otherORGID: req.orgId}   

                if(typeof other_mode != 'undefined' && other_mode == 'true') {
                    query = `SELECT appno_doc_num FROM db_new_application.assets_for_sale AS assets WHERE assets.organisation_id = :otherORGID `
                } else {
                    if(typeof type !== 'undefined' ) {
                        const layoutID = helpers.findLayout(type) 
                        if(layoutID <= 15) {
                            where.layoutID = helpers.findLayout(type) 
                        } else {
                            where.layoutID = 15
                        }
                                
                    } else {
                        where.layoutID = 15
                    } 

                    const companies = JSON.parse(selectedCompanies)
                    if(companies.length > 0) {
                        where.company_id = companies
                    }

                    
                    if(tabs && tabs != '') {
                        tabs = JSON.parse( tabs )
                        tabs = helpers.checkTabs(tabs)
                        where.tabs = tabs
                    }

                    if(customers && customers != '') {
                        customers = JSON.parse( customers )
                        where.customers = customers
                    }

                    if(assignments && assignments != '') {
                        assignments = JSON.parse( assignments )
                        where.assignments = assignments
                    }

                    query = `SELECT appno_doc_num FROM db_new_application.assets AS assets `


                    query += ` WHERE date_format(assets.appno_date, '%Y') > :year AND assets.layout_id = :layoutID AND ( assets.organisation_id = :organisationID OR assets.organisation_id IS NULL ) `
                    

                    if(Array.isArray(companies) && companies.length > 0) {
                        query += ` AND assets.company_id IN (:company_id)`
                    }

                    if((Array.isArray(assignments) && assignments.length > 0 ) || (Array.isArray(tabs) && tabs.length > 0) || (Array.isArray(customers) && customers.length > 0)) {
                        query += ` AND assets.appno_doc_num IN ( SELECT documentid.appno_doc_num FROM db_uspto.documentid WHERE rf_id  IN ( SELECT activity_parties_transactions.rf_id  FROM db_new_application.activity_parties_transactions WHERE ( activity_parties_transactions.organisation_id = :organisationID OR activity_parties_transactions.organisation_id IS NULL ) `

                        if(Array.isArray(companies) && companies.length > 0 ) {
                            query += ` AND activity_parties_transactions.company_id IN (:company_id) `
                        }

                        if(Array.isArray(assignments) && assignments.length > 0 ) {
                            query += ` AND activity_parties_transactions.rf_id IN (:assignments)`
                        }

                        if(Array.isArray(tabs) && tabs.length > 0 ) {
                            query += ` AND activity_parties_transactions.activity_id IN (:tabs)`
                        } else {
                            /**exclude employees */
                            if(typeof type == 'undefined' || (typeof type !== 'undefined' && type != 'top_law_firms')) {
                                query += ' AND activity_parties_transactions.activity_id <> 10 ' 
                            }
                        } 

                        if(Array.isArray(customers) && customers.length > 0 ) {
                            query += ` AND activity_parties_transactions.assignor_and_assignee_id IN (:customers)`
                        }

                        query += ` GROUP BY activity_parties_transactions.rf_id ) GROUP BY documentid.appno_doc_num) `
                    } else  if(Array.isArray(tabs) && tabs.length === 0 && (typeof type !== 'undefined' && type !== 'top_law_firms')) {
                        /**exclude employees */
                        query += ` AND assets.appno_doc_num IN (  SELECT documentid.appno_doc_num FROM db_uspto.documentid WHERE rf_id  IN ( SELECT activity_parties_transactions.rf_id  FROM db_new_application.activity_parties_transactions WHERE activity_parties_transactions.organisation_id = :organisationID OR activity_parties_transactions.organisation_id IS NULL ) AND activity_parties_transactions.activity_id <> 10  ` 

                        if(Array.isArray(companies) && companies.length > 0 ) {
                            query += ` AND activity_parties_transactions.company_id IN (:company_id) `
                        }

                        query += ` GROUP BY activity_parties_transactions.rf_id )  GROUP BY documentid.appno_doc_num) `
                    }
                }
                
                query += ` GROUP BY appno_doc_num`;

                const appList =  await connection.applicationNew.query(query,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    logging: console.log,
                    replacements: where,
                })

                if(appList !== null && appList.length > 0) {
                    list = [];
                    appList.forEach( row => {
                        list.push(`${row.appno_doc_num}`)
                    })

                    if(typeof other_mode != 'undefined' && other_mode == 'true') {
                        sales = [...list]
                    } else {
                        const salesQuery = `SELECT appno_doc_num FROM db_new_application.assets_for_sale AS assets WHERE appno_doc_num IN (:list) AND assets.organisation_id = :organisationID  GROUP BY appno_doc_num`;
                        const salesList = await connection.applicationNew.query(salesQuery, {
                            type: connection.Sequelize.QueryTypes.SELECT,
                            replacements: {list, organisationID: req.orgId},
                            raw: true,
                            logging: console.log,
                        })

                        if(salesList.length > 0) {
                            salesList.forEach( row => {
                                sales.push(`${row.appno_doc_num}`)
                            })
                        }
                    }
                }
            }
                            
            let scopeCondition = '';
            const replacements = {date: connection.DEFAULT_YEAR}

            if( scope != undefined && scope != 'undefined' && scope != null) {
                replacements.scopeList = JSON.parse(scope)
                if(Array.isArray(replacements.scopeList) && replacements.scopeList.length > 0){
                    if(data_type == 1) {
                        scopeCondition = ` AND section IN (:scopeList) `
                    } else {
                        scopeCondition = ` AND ${rangeConcat} IN (:scopeList) `
                    }
                }
            }

            if(typeof year !== 'undefined' && year != null) {
                year = JSON.parse(year)

                if(year.length > 0) {
                    replacements.date = year
                }
            }
            let stringYear = ">= :date"

            if(Array.isArray(replacements.date)) {
                stringYear = "IN (:date)"
            }
            replacements.list = list
            const cpcCode = [];
            if(type == 'missed_monetization') {
                query = `SELECT REPLACE_STRING FROM ( SELECT application_cpc.grant_doc_num AS patent_number, application_cpc.application_number , date_format(ag.appno_date, '%Y') AS fillingYear, ${rangeConcat} AS cpc_code, section, class, sub_class, main_group, sub_group, (SELECT GROUP_CONCAT(distinct IF(representative_name <> '' , representative_name, aaa.name) SEPARATOR '@@ ') FROM db_patent_application_bibliographic.inventor AS inv INNER JOIN db_patent_application_bibliographic.assignor_and_assignee AS aaa ON aaa.assignor_and_assignee_id = inv.assignor_and_assignee_id LEFT JOIN db_uspto.representative ON representative.representative_id = aaa.representative_id WHERE inv.appno_doc_num  = application_cpc.application_number  ) AS origin FROM db_patent_application_bibliographic.patent_cpc AS application_cpc 
                INNER JOIN db_patent_application_bibliographic.application_grant AS ag ON ag.grant_doc_num =  application_cpc.grant_doc_num AND ag.appno_doc_num IN (:list)
                WHERE application_cpc.application_number IN (:list) AND application_cpc.type = 0  ${scopeCondition} ) AS temp1 GROUP_STRING `
            } else { 
                query = `SELECT REPLACE_STRING FROM ( Select temp3.* FROM (
                        SELECT temp.grant_doc_num AS patent_number, temp.appno_doc_num AS application_number, date_format(temp.appno_date, '%Y') AS fillingYear, ${rangeConcat} AS cpc_code, section, class, sub_class, main_group, sub_group, (SELECT GROUP_CONCAT(distinct IF(representative_name <> '' , representative_name, name) SEPARATOR '@@ ') FROM db_uspto.assignee INNER JOIN db_uspto.assignor_and_assignee ON assignor_and_assignee.assignor_and_assignee_id = assignee.assignor_and_assignee_id LEFT JOIN db_uspto.representative ON representative.representative_id = assignor_and_assignee.representative_id INNER JOIN db_uspto.representative_assignment_conveyance ON representative_assignment_conveyance.rf_id = assignee.rf_id WHERE assignee.rf_id IN (     SELECT rf_id FROM db_uspto.documentid WHERE documentid.appno_doc_num = application_cpc.application_number) AND representative_assignment_conveyance.employer_assign = 1 ) AS origin FROM db_patent_application_bibliographic.patent_cpc AS application_cpc INNER JOIN (SELECT documentid.appno_doc_num, documentid.grant_doc_num, documentid.appno_date FROM db_uspto.documentid AS documentid WHERE date_format(documentid.appno_date, '%Y') ${stringYear} AND documentid.appno_doc_num IN(:list) AND documentid.grant_doc_num <> ''  GROUP BY documentid.appno_doc_num) AS temp ON temp.appno_doc_num = application_cpc.application_number WHERE application_cpc.type = 0  ${scopeCondition} GROUP BY temp.appno_doc_num
                        UNION 
                        SELECT application_grant.grant_doc_num AS patent_number, application_grant.appno_doc_num AS application_number, date_format(application_grant.appno_date, '%Y') AS fillingYear, ${rangeConcat} AS cpc_code, section, class, sub_class, main_group, sub_group, '' AS origin
                        FROM db_patent_application_bibliographic.patent_cpc AS application_cpc 
                        INNER JOIN db_patent_application_bibliographic.application_grant AS application_grant ON application_grant.appno_doc_num = application_cpc.application_number AND application_cpc.application_number IN(:list)
                        WHERE date_format(application_grant.appno_date, '%Y') ${stringYear} AND application_grant.appno_doc_num IN(:list) AND application_grant.grant_doc_num <> ''
                        AND application_cpc.type = 0  ${scopeCondition} GROUP BY application_grant.appno_doc_num
                        UNION 
                        SELECT '' AS patent_number, application_publication.appno_doc_num AS application_number, date_format(application_publication.appno_date, '%Y') AS fillingYear, ${rangeConcat} AS cpc_code, section, class, sub_class, main_group, sub_group, '' AS origin
                        FROM db_patent_grant_bibliographic.application_cpc AS application_cpc 
                        INNER JOIN db_patent_grant_bibliographic.application_publication AS application_publication ON application_publication.appno_doc_num = application_cpc.application_number AND application_cpc.application_number IN(:list)
                        WHERE date_format(application_publication.appno_date, '%Y') ${stringYear} AND application_publication.appno_doc_num IN(:list) 
                        AND application_cpc.type = 0  ${scopeCondition} GROUP BY application_publication.appno_doc_num ) AS temp3 GROUP BY temp3.application_number
                ) AS temp1 GROUP_STRING `
            } 

            /*UNION SELECT temp.grant_doc_num AS patent_number, temp.appno_doc_num AS application_number, date_format(temp.appno_date, '%Y') AS fillingYear, ${rangeConcat} AS cpc_code, section, class, sub_class, main_group, sub_group, (SELECT GROUP_CONCAT(distinct IF(representative_name <> '' , representative_name, name) SEPARATOR '@@ ') FROM db_uspto.assignee INNER JOIN db_uspto.assignor_and_assignee ON assignor_and_assignee.assignor_and_assignee_id = assignee.assignor_and_assignee_id LEFT JOIN db_uspto.representative ON representative.representative_id = assignor_and_assignee.representative_id INNER JOIN db_uspto.representative_assignment_conveyance ON representative_assignment_conveyance.rf_id = assignee.rf_id WHERE assignee.rf_id IN (     SELECT rf_id FROM db_uspto.documentid WHERE documentid.appno_doc_num = application_cpc.application_number) AND representative_assignment_conveyance.employer_assign = 1 ) AS origin FROM db_patent_grant_bibliographic.application_cpc AS application_cpc INNER JOIN (SELECT documentid.appno_doc_num, documentid.grant_doc_num, documentid.appno_date FROM db_uspto.documentid AS documentid WHERE date_format(documentid.appno_date, '%Y') ${stringYear} AND documentid.appno_doc_num IN(:list) AND documentid.grant_doc_num = ''  GROUP BY documentid.appno_doc_num) AS temp ON temp.appno_doc_num = application_cpc.application_number WHERE application_cpc.type = 0  ${scopeCondition} GROUP BY temp.appno_doc_num  */

            /* const query = `SELECT REPLACE_STRING FROM ( SELECT temp.grant_doc_num AS patent_number, temp.appno_doc_num AS application_number, date_format(temp.appno_date, '%Y') AS fillingYear, ${rangeConcat} AS cpc_code, section, class, sub_class, main_group, sub_group, (SELECT GROUP_CONCAT(distinct ee_name SEPARATOR '@@ ') FROM db_uspto.assignee INNER JOIN db_uspto.assignment_conveyance ON assignment_conveyance.rf_id = assignee.rf_id WHERE assignee.rf_id IN (     SELECT rf_id FROM db_uspto.documentid WHERE documentid.appno_doc_num = application_cpc.application_number) AND assignment_conveyance.employer_assign = 1 ) AS origin FROM db_patent_grant_bibliographic.application_cpc AS application_cpc INNER JOIN (SELECT DISTINCT documentid.appno_doc_num, documentid.grant_doc_num, documentid.appno_date FROM db_uspto.documentid AS documentid WHERE date_format(documentid.appno_date, '%Y') ${stringYear} AND (documentid.appno_doc_num IN(:list) OR documentid.grant_doc_num IN(:list)) GROUP BY documentid.appno_doc_num) AS temp ON temp.appno_doc_num = application_cpc.application_number WHERE application_cpc.type = 0  ${scopeCondition} GROUP BY temp.appno_doc_num ) AS temp1 GROUP_STRING ` */

            
            if(replacements.list.length > 0) {
                let listQuery =  query.replace('REPLACE_STRING', "SUM(IF(patent_number != '' AND application_number >0, 1, 0)) AS patent_number, SUM(IF (patent_number = '' AND application_number > 0, 1, 0 )) AS application_number, GROUP_CONCAT(application_number) AS appNum, (SUM(if(patent_number != '' AND application_number >0, 1, 0)) + SUM(IF (patent_number = '' AND application_number > 0, 1, 0 ))) AS countAssets, fillingYear, cpc_code, section, class, sub_class, main_group, sub_group, GROUP_CONCAT(distinct origin SEPARATOR '@@ ') AS group_name").replace('GROUP_STRING', "GROUP BY fillingYear, cpc_code")
    
                listQuery += ` ORDER BY cpc_code DESC`
                getList = await connection.applicationNew.query(listQuery, {
                    type: connection.Sequelize.QueryTypes.SELECT,
                    replacements: replacements,
                    raw: true,
                    logging: console.log,
                })
                let remainigItems = [], k = 1;
                
                if(getList.length > 0) { 
                    let assetsInFirstQuery = []
                        
                    const promise = getList.map( item => {
                        const allAssets = item.appNum.split(',');
                        if(allAssets.length > 0) {
                            assetsInFirstQuery = [...assetsInFirstQuery, ...allAssets]
                        } 
    
                        if(!cpcCode.includes(item.cpc_code)){
                            cpcCode.push(item.cpc_code) 
                            group.push({
                                id: k,
                                cpc_code: item.cpc_code, 
                                section: item.section, 
                                class: item.class, 
                                sub_class: item.sub_class, 
                                main_group: item.main_group, 
                                sub_group: item.sub_group,
                                defination: ''
                            })
                            k++;
                        }
                    }) 
                    await Promise.all(promise);
                    const mainList = replacements.list;
                    remainigItems = mainList.filter(asset => !assetsInFirstQuery.includes(asset)) 
                    
                    //console.log(mainList.length, remainigItems.length, assetsInFirstQuery)
                } else {
                    remainigItems =list
                }
                    
                if(remainigItems.length > 0) {
                    replacements.list = remainigItems
    
                    if(type == 'missed_monetization') {
                        query = `SELECT REPLACE_STRING FROM ( SELECT '' AS patent_number, application_cpc.application_number AS application_number, date_format(ap.appno_date, '%Y') AS fillingYear, ${rangeConcat} AS cpc_code, section, class, sub_class, main_group, sub_group, (SELECT GROUP_CONCAT(distinct IF(representative_name <> '' , representative_name, aaa.name) SEPARATOR '@@ ') FROM db_patent_grant_bibliographic.inventor_new AS inv INNER JOIN db_patent_application_bibliographic.assignor_and_assignee AS aaa ON aaa.assignor_and_assignee_id = inv.assignor_and_assignee_id LEFT JOIN db_uspto.representative ON representative.representative_id = aaa.representative_id WHERE inv.appno_doc_num  = application_cpc.application_number ) AS origin FROM db_patent_grant_bibliographic.application_cpc AS application_cpc 
                        INNER JOIN db_patent_grant_bibliographic.application_publication AS ap ON ap.appno_doc_num =  application_cpc.application_number AND ap.appno_doc_num IN (:list)
                        WHERE application_cpc.application_number IN (:list) AND application_cpc.type = 0  ${scopeCondition} ) AS temp1 GROUP_STRING `
                    } else { 
                        query = `SELECT REPLACE_STRING FROM ( SELECT temp.grant_doc_num AS patent_number, temp.appno_doc_num AS application_number, date_format(temp.appno_date, '%Y') AS fillingYear, ${rangeConcat} AS cpc_code, section, class, sub_class, main_group, sub_group, (SELECT GROUP_CONCAT(distinct IF(representative_name <> '' , representative_name, name) SEPARATOR '@@ ') FROM db_uspto.assignee INNER JOIN db_uspto.assignor_and_assignee ON assignor_and_assignee.assignor_and_assignee_id = assignee.assignor_and_assignee_id LEFT JOIN db_uspto.representative ON representative.representative_id = assignor_and_assignee.representative_id INNER JOIN db_uspto.representative_assignment_conveyance ON representative_assignment_conveyance.rf_id = assignee.rf_id WHERE assignee.rf_id IN (     SELECT rf_id FROM db_uspto.documentid WHERE documentid.appno_doc_num = application_cpc.application_number) AND representative_assignment_conveyance.employer_assign = 1 ) AS origin FROM db_patent_grant_bibliographic.application_cpc AS application_cpc INNER JOIN (SELECT documentid.appno_doc_num, documentid.grant_doc_num, documentid.appno_date FROM db_uspto.documentid AS documentid WHERE date_format(documentid.appno_date, '%Y') ${stringYear} AND documentid.appno_doc_num IN(:list)  GROUP BY documentid.appno_doc_num) AS temp ON temp.appno_doc_num = application_cpc.application_number WHERE application_cpc.type = 0  ${scopeCondition} GROUP BY temp.appno_doc_num  ) AS temp1 GROUP_STRING `
                    }
    
                     
    
                    listQuery =  query.replace('REPLACE_STRING', "SUM(IF(patent_number != '' AND application_number >0, 1, 0)) AS patent_number, SUM(IF (patent_number = '' AND application_number > 0, 1, 0 )) AS application_number, GROUP_CONCAT(application_number) AS appNum, (SUM(if(patent_number != '' AND application_number >0, 1, 0)) + SUM(IF (patent_number = '' AND application_number > 0, 1, 0 ))) AS countAssets, fillingYear, cpc_code, section, class, sub_class, main_group, sub_group, GROUP_CONCAT(distinct origin SEPARATOR '@@ ') AS group_name").replace('GROUP_STRING', "GROUP BY fillingYear, cpc_code")
    
                    listQuery += ` ORDER BY cpc_code DESC`
    
                    const remainingList = await connection.applicationNew.query(listQuery, {
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: replacements,
                        raw: true,
                        logging: console.log,
                    })
    
                    if(remainingList.length > 0) {
                        getList = [...getList, ...remainingList]
                        getList = getList.sort(function(a,b) {
                            return a.cpc_code - b.cpc_code;
                        });
    
                        getList.sort((a, b) => {
                            const itemFirst = a['cpc_code'], itemSecond =  b['cpc_code'] 
                            if (itemFirst > itemSecond) {
                              return 1;
                            }
                            return 0;
                        });
                        //console.log('getList', getList)
                        const promise = remainingList.map( item => {  
                            if(!cpcCode.includes(item.cpc_code)){
                                cpcCode.push(item.cpc_code) 
                                group.push({
                                    id: k,
                                    cpc_code: item.cpc_code, 
                                    section: item.section, 
                                    class: item.class, 
                                    sub_class: item.sub_class, 
                                    main_group: item.main_group, 
                                    sub_group: item.sub_group,
                                    defination: ''
                                })
                                k++;
                            }
                        }) 
                        await Promise.all(promise);
                    }
                } 
            }

            if(getList.length > 0) {
                let titleQuery = `SELECT cpc_code, title AS defination  FROM db_patent_grant_bibliographic.cpc_defination AS cpc_defination WHERE cpc_defination.cpc_code IN (:code)`

                const titleData =  await connection.applicationNew.query(titleQuery,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    replacements: {code: cpcCode},
                    raw: true,
                    logging: console.log,
                })

                if(titleData.length > 0) {
                    const promise = titleData.map( item => {
                        const findIndex = group.findIndex( row => row.cpc_code == item.cpc_code)
                        if(findIndex !== -1) {
                            group[findIndex].defination = item.defination
                        }
                    })
                    await Promise.all(promise);
                }
            }
        }
        res.status(200).json({list: getList, group, sales});
    } catch(err) {
        console.log("CPC", err);
        res.status(500).send("Internal error");
    }
})

route.post("/assets/cpc/:year/:cpcCode", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        let { list, total, type, selectedCompanies, tabs, customers, assignments, range, scope, year, other_mode, data_type, sale, license, primary } = req.body, getList = []
        const replacements = { organisation_id: 0 /* req.orgId */, year: 2000 }
        let companies = []
        if(typeof selectedCompanies != 'undefined' && selectedCompanies != '') {            
            companies = JSON.parse(selectedCompanies)
        }
        if(req.orgType == 2) {
            /**
             * Bank Mode
             */
            replacements.mode = 1
        }
        replacements.type = helpers.findLayout(type); 
        if(typeof type !== 'undefined' && type != 'due_dilligence') {
            if(type == 'top_law_firms') { 
                let getFiilingAssets = []
                if(typeof primary != 'undefined'){
                    getFiilingAssets = await helpers.findFillingAssets(req) 
                } else {
                    
                    replacements.companies = companies
                    const ownedAssets = `SELECT application FROM db_new_application.dashboard_items WHERE organisation_id = :organisation_id AND representative_id = :companies AND type = :type GROUP BY application  ${req.orgType == 2 ? ' AND mode IN (:mode) ' : ''} `;
    
                    const getAssetsData = await connection.application.query(ownedAssets,{
                            type: connection.Sequelize.QueryTypes.SELECT,
                            raw: true,
                            logging: console.log,
                            replacements: replacements,
                        }
                    ); 
                    if(getAssetsData != null && getAssetsData.length > 0) {
                        const promise = getAssetsData.map( row => {
                            getFiilingAssets.push(`${row.application}`)
                        })
    
                        await Promise.all(promise)
                    }
                }
    
                if(getFiilingAssets.length > 0) {  
                    replacements.applications = getFiilingAssets
                    replacements.companies = companies
                    if(assignments && assignments != '') {
                        assignments = JSON.parse( assignments )
                        replacements.assignments = assignments
                    }
                    const lawfirmName = await helpers.findLawFirmName(replacements)
    
                    replacements.lawfirm_name = lawfirmName
    
                    let queryFillingLawFirm = `SELECT l.appno_doc_num FROM db_patent_application_bibliographic.lawfirm AS l  WHERE l.appno_doc_num IN (:applications) AND l.name IN (:lawfirm_name) GROUP BY l.appno_doc_num `
        
                    const assetsWithLawFirm =  await connection.applicationNew.query(queryFillingLawFirm, {
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        logging: console.log,
                        replacements: replacements,
                    }); 
    
                    if(assetsWithLawFirm != null && assetsWithLawFirm.length > 0) {
                        list = [] 
                        const promiseAssets = assetsWithLawFirm.map(row => {
                            list.push(`${row.appno_doc_num}`)
                        }) 
                        await Promise.all(promiseAssets)
                        total = list.length
                        list = JSON.stringify(list)
                    }
                } 
            } else {
                if(replacements.type == 38) {
                    replacements.type = 30
                }
                const queryAssets = `SELECT application FROM db_new_application.dashboard_items WHERE organisation_id = :organisation_id AND representative_id = :companies AND type = :type ${req.orgType == 2 ? ' AND mode IN (:mode) ' : ''}  GROUP BY application `;
                replacements.companies = companies
                if(assignments && assignments != '') {
                    assignments = JSON.parse( assignments )
                    replacements.assignments = assignments
                }
                const getAssetsData = await connection.application.query(queryAssets,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        logging: console.log,
                        replacements: replacements,
                    }
                ); 
                if(getAssetsData != null && getAssetsData.length > 0) {
                    list = []
                    const promise = getAssetsData.map( row => {
                        list.push(`${row.application}`)
                    })
                    total = list.length
                    list = JSON.stringify(list)
                    await Promise.all(promise)
                }
            }
        } else if((typeof data_type !== 'undefined' && data_type == 1) || typeof sale != 'undefined' || typeof license != 'undefined') { 
            list = await helpers.findFilterAssets(req)
            total = list.length
        } 

        if( list != '' ) {
            if(typeof data_type == 'undefined' || (typeof data_type !== 'undefined' && data_type == 0)) {
                list = JSON.parse(list)
            }

            if( list.length > 0 ) {
                
                if(parseInt(total) != list.length) {
                    /**
                     * Get List
                     */
                    const where = {
                        [connection.Op.and]: [
                            connection.applicationNew.where(
								connection.applicationNew.fn('YEAR', connection.applicationNew.col('appno_date')), 
								{
									[connection.Op.gte]: connection.DEFAULT_YEAR
								}
							),
                            /* {organisation_id:  req.orgId} */
                        ]
                    }
                    const companies = JSON.parse(selectedCompanies)
                    if(companies.length > 0) {
                        where.company_id = companies
                    }
                    if(typeof type !== 'undefined') {
                        where.layout_id = helpers.findLayout(type)        
                    } else {
                        where.layout_id = 15
                    }
                    
                    const appList = await Assets.findAll({
                        attributes:['appno_doc_num'],
                        where,
                        group: ['appno_doc_num']
                    })

                    if(appList !== null && appList.length > 0) {
                        list = [];
                        appList.forEach( row => {
                            list.push(`${row.appno_doc_num}`)
                        })
                    }
                }


                let rangeConcat = 'CONCAT(section, class, sub_class)'

                if( range != undefined && range != 'undefined' && range != null) {
                    switch(parseInt(range)) {
                        case 5:
                            rangeConcat = 'section'
                            break;
                        case 4:
                            rangeConcat = 'CONCAT(section, class)'
                            break;
                        case 2:
                            rangeConcat = 'CONCAT(section, class, sub_class, main_group, "/00")'
                            break;
                        case 1:
                            rangeConcat = 'CONCAT(section, class, sub_class, main_group, "/", sub_group)'
                            break;
                        case 3:
                        default:
                            rangeConcat = 'CONCAT(section, class, sub_class)'
                            break;
                    }
                }

                let query = `SELECT ROW_NUMBER() OVER () AS id, CASE WHEN grant_doc_num != '' THEN grant_doc_num ELSE appno_doc_num END AS asset, CASE WHEN grant_doc_num = '' THEN 1 ELSE 0 END AS asset_type, grant_doc_num, appno_doc_num, title, temp1.cpc_code AS cpc_code, (SELECT title FROM db_patent_grant_bibliographic.cpc_defination AS cpc_defination WHERE cpc_defination.cpc_code = temp1.cpc_code) AS defination FROM ( SELECT temp.grant_doc_num , temp.appno_doc_num, temp.title, ${rangeConcat} AS cpc_code FROM db_patent_application_bibliographic.patent_cpc AS application_cpc INNER JOIN (SELECT documentid.grant_doc_num, documentid.appno_doc_num, documentid.appno_date, documentid.title FROM db_uspto.documentid AS documentid WHERE date_format(appno_date, '%Y') = :year AND documentid.appno_doc_num IN(:list) AND documentid.grant_doc_num <> '' GROUP BY documentid.appno_doc_num) AS temp ON temp.appno_doc_num = application_cpc.application_number WHERE application_cpc.type = 0 AND ${rangeConcat} = :cpcCode GROUP BY temp.appno_doc_num  UNION SELECT temp.grant_doc_num , temp.appno_doc_num, temp.title, ${rangeConcat} AS cpc_code FROM db_patent_grant_bibliographic.application_cpc AS application_cpc INNER JOIN (SELECT documentid.grant_doc_num, documentid.appno_doc_num, documentid.appno_date, documentid.title FROM db_uspto.documentid AS documentid WHERE date_format(appno_date, '%Y') = :year AND documentid.appno_doc_num IN(:list) AND documentid.grant_doc_num = '' GROUP BY documentid.appno_doc_num) AS temp ON temp.appno_doc_num = application_cpc.application_number WHERE application_cpc.type = 0 AND ${rangeConcat} = :cpcCode GROUP BY temp.appno_doc_num ) AS temp1 GROUP BY appno_doc_num`

                let replacements = { cpcCode: req.params.cpcCode, year: req.params.year, list }

                getList =  await connection.applicationNew.query( query ,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    replacements: replacements,
                    raw: true,
                    logging: console.log,
                })
            }
        }
        res.status(200).json({list: getList})
    } catch(err) {
        console.log("CPC", err);
        res.status(500).send("Internal error");
    }
})

route.get("/assets/:patentNumber/files/:channelID/slack/:token", [authJWT.verifyToken], async(req, res, next) => {
    let assets_files = [], document_files = [], type = 1, findNumber = null
    try {
        const { patentNumber, token, channelID } = req.params
        let { type, companies, layout, g, ga, activities, parties, rfIDs, patents, lawyers } = req.query
        

        if( patentNumber != '' && patentNumber != null && patentNumber != 'undefined' ) {
            findNumber = await ResourcesDocumentids.findOne({
                where:{grant_doc_num: patentNumber},
                attributes:['grant_doc_num', 'appno_doc_num'],
                group: ['grant_doc_num', 'appno_doc_num']
            })
    
            if( findNumber == null ) {
                type = 0
                findNumber = await ResourcesDocumentids.findOne({
                    where:{appno_doc_num: patentNumber},
                    attributes:['grant_doc_num', 'appno_doc_num'],
                    group: ['grant_doc_num', 'appno_doc_num']
                })
            }
        }        

        if( findNumber != null && type == 0) {
            const where = {}

            /* if( findNumber.grant_doc_num != '' && findNumber.grant_doc_num != null ) {
                where.grant_doc_num = findNumber.grant_doc_num 
            } else {
                where.appno_doc_num = findNumber.appno_doc_num 
            } */


            let query = 'SELECT assignment.rf_id as id, "usptodrive" as external_type, date_format(assignor.exec_dt, "%m-%d-%Y") as date, CASE WHEN representative_assignment_conveyance.convey_ty = "assignment" THEN "Ownership" WHEN representative_assignment_conveyance.convey_ty = "addresschg" THEN "Address Change" WHEN representative_assignment_conveyance.convey_ty = "namechg" THEN "Name Change" WHEN representative_assignment_conveyance.convey_ty = "partialassignment" THEN "Ownership" WHEN representative_assignment_conveyance.convey_ty = "release" THEN "Security Release"  ELSE representative_assignment_conveyance.convey_ty END as convey_ty, CASE WHEN assignment.status = 1 THEN CONCAT("https://s3-us-west-1.amazonaws.com/static.patentrack.com/assignments/var/www/html/beta/resources/shared/data/assignment-pat-",reel_no,"-",frame_no,".pdf") ELSE CONCAT("https://legacy-assignments.uspto.gov/assignments/assignment-pat-",reel_no,"-",frame_no,".pdf") END as url_private, (SELECT sum(no_of_parties) FROM report_representative_assets_transactions_parties WHERE report_representative_assets_transactions_parties.rf_id = assignment.rf_id GROUP BY report_representative_assets_transactions_parties.rf_id ) as count_parties, (SELECT assignee FROM report_representative_assets_transactions WHERE report_representative_assets_transactions.rf_id = assignment.rf_id LIMIT 1) as assignee, (SELECT assignor FROM report_representative_assets_transactions WHERE report_representative_assets_transactions.rf_id = assignment.rf_id LIMIT 1) as assignor FROM assignment INNER JOIN assignor ON assignor.rf_id = assignment.rf_id INNER JOIN documentid ON documentid.rf_id = assignment.rf_id INNER JOIN representative_assignment_conveyance ON representative_assignment_conveyance.rf_id = assignment.rf_id'

            if(type == 0) {
                query += ' WHERE appno_doc_num =:appno_doc_num '                
                where.appno_doc_num = findNumber.appno_doc_num 
            } else if(type == 1) {
                query += ' WHERE grant_doc_num =:grant_doc_num '
                where.grant_doc_num = findNumber.grant_doc_num 
            }

            query +=' GROUP BY assignment.rf_id ORDER BY date ASC'

            assets_files =  await connection.resources.query(query,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    replacements: where,
                    raw: true,
                    logging: console.log,
                }
            );
        } else if(type == 0){
            if( companies != '' ) {
                companies = JSON.parse(companies)
            }

            if( patents != '' ) {
                patents = JSON.parse(patents)
            }

            if( activities != '' ) {
                activities = JSON.parse(activities)
            }

            if( parties != '' ) {
                parties = JSON.parse(parties)
            }

            if( rfIDs != '' ) {
                rfIDs = JSON.parse(rfIDs)
            }

            const replacements = { organisation_id: 0 /* req.orgId */, year: connection.DEFAULT_YEAR }

            replacements.layout =  helpers.findLayout(layout); 
            if(req.orgType == 2) {
                /**
                 * Bank Mode
                 */
                replacements.mode = 1
            }

            let assetsList = []
            if( patents.length === 0 && activities.length === 0 && parties.length === 0 && rfIDs.length === 0 ) {
                let replacementAssets = { organisation_id: 0 /* req.orgId */, layout: replacements.layout }
                if(req.orgType == 2) {
                    /**
                     * Bank Mode
                     */
                    replacementAssets.mode = 1
                }
                let queryFindAssets = `SELECT assets.application AS appno_doc_num FROM db_new_application.dashboard_items as assets WHERE type = :layout AND organisation_id = :organisation_id  ${req.orgType == 2 ? ' AND mode IN (:mode) ' : ''} `
                if(companies.length > 0) {
                    replacementAssets.companies = companies
                    queryFindAssets += ' AND representative_id IN (:companies)'
                }
                
                queryFindAssets += '  GROUP BY assets.application '

                const getAssets =  await connection.resources.query(queryFindAssets,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    replacements: replacementAssets,
                    raw: true,
                    logging: console.log,
                });

                if(getAssets.length > 0) {
                    const promiseAssets = getAssets.map( asset => {
                        assetsList.push(`${asset.appno_doc_num}`)
                    })
                    await Promise.all(promiseAssets)
                }
            }
            

            
            let query = 'SELECT assignment.rf_id as id, "usptodrive" as external_type, date_format(assignor.exec_dt, "%m-%d-%Y") as date, CASE WHEN representative_assignment_conveyance.convey_ty = "assignment" THEN "Ownership" WHEN representative_assignment_conveyance.convey_ty = "addresschg" THEN "Address Change" WHEN representative_assignment_conveyance.convey_ty = "namechg" THEN "Name Change" WHEN representative_assignment_conveyance.convey_ty = "partialassignment" THEN "Ownership" WHEN representative_assignment_conveyance.convey_ty = "release" THEN "Security Release"  ELSE representative_assignment_conveyance.convey_ty END as convey_ty, CASE WHEN assignment.status = 1 THEN CONCAT("https://s3-us-west-1.amazonaws.com/static.patentrack.com/assignments/var/www/html/beta/resources/shared/data/assignment-pat-",reel_no,"-",frame_no,".pdf") ELSE CONCAT("https://legacy-assignments.uspto.gov/assignments/assignment-pat-",reel_no,"-",frame_no,".pdf") END as url_private, (SELECT sum(no_of_parties) FROM report_representative_assets_transactions_parties WHERE report_representative_assets_transactions_parties.rf_id = assignment.rf_id GROUP BY report_representative_assets_transactions_parties.rf_id ) as count_parties, (SELECT assignee FROM report_representative_assets_transactions WHERE report_representative_assets_transactions.rf_id = assignment.rf_id LIMIT 1) as assignee, (SELECT assignor FROM report_representative_assets_transactions WHERE report_representative_assets_transactions.rf_id = assignment.rf_id LIMIT 1) as assignor FROM assignment INNER JOIN assignor ON assignor.rf_id = assignment.rf_id INNER JOIN representative_assignment_conveyance ON representative_assignment_conveyance.rf_id = assignment.rf_id   '
            if( patents.length == 0) {
                query += ' INNER JOIN list2 ON list2.rf_id = assignment.rf_id '
            }
           
            
            query += ' WHERE date_format(assignor.exec_dt, "%Y") > :year ';

            if(companies.length > 0) { 
                replacements.companies = companies
            }

            if(assetsList.length > 0) {
                replacements.assetsList = assetsList 
                if([40, 41].includes(replacements.layout)) {
                    query += ` AND list2.rf_id IN ( SELECT assets.rf_id FROM db_new_application.dashboard_items as assets WHERE type = :layout AND organisation_id = :organisation_id   AND representative_id IN (:companies) AND type = :layout  ${req.orgType == 2 ? ' AND mode IN (:mode) ' : ''}  GROUP BY assets.rf_id) `
                } else {
                    query += ' AND list2.rf_id IN  ( SELECT documentid.rf_id FROM documentid WHERE documentid.appno_doc_num IN (:assetsList) GROUP BY documentid.rf_id )'
                }
            } else if ( patents.length > 0 ) {
                replacements.appno_doc_num = patents
                query += ' AND  assignment.rf_id IN ( SELECT documentid.rf_id FROM documentid WHERE appno_doc_num IN (:appno_doc_num) GROUP BY documentid.rf_id ) '
            } else {
                if(activities.length > 0 || parties.length > 0 || rfIDs.length > 0 ) {
                    let tap = false
                    if(activities.length > 0 || parties.length > 0){
                        tap = true
                        replacements.activities = activities
                        replacements.parties = parties
                        query += ' AND list2.rf_id IN ( SELECT rf_id FROM db_new_application.activity_parties_transactions WHERE organisation_id = :organisation_id  '
    
                        if(companies.length > 0) {
                            query += ' AND company_id IN (:companies) '
                        }
    
                        if(activities.length > 0) {
                            query += ' AND activity_id IN (:activities) '
                        }
    
                        if(parties.length > 0) {
                            query += ' AND assignor_and_assignee_id IN (:parties) '
                        }
                        query += ' GROUP BY rf_id )'
                    } 
    
                    if(rfIDs.length > 0) {
                        replacements.rfIDs = rfIDs
                        query += ' AND list2.rf_id IN (:rfIDs)'
                    }  
                } else {
                    query += ' AND organisation_id = :organisation_id  '

                    if(companies.length > 0) {
                        query += ' AND company_id IN (:companies) '
                    }
                }
            } 
  
            if(assetsList.length == 0 && patents.length == 0 && lawyers != '' && lawyers != null && lawyers != undefined && parseInt(lawyers) > 0) {
                
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
    
                    let tempQuery = `SELECT di.rf_id FROM db_uspto.law_firm  as lf  
                    INNER JOIN db_new_application.dashboard_items AS di ON di.lawfirm_id = lf.law_firm_id
                    LEFT JOIN db_uspto.representative_law_firm AS rlf ON rlf.representative_id = lf.representative_id WHERE   
                    organisation_id = :organisation_id AND di.representative_id IN (:companies)  ${req.orgType == 2 ? ' AND di.mode IN (:mode) ' : ''}  AND type = 40 `
                    if(typeof replacements.representative_id != 'undefined') {
                        tempQuery += ` AND rlf.representative_id = :representative_id`
                    } else {
                        tempQuery += ` AND lf.name = :name`
                    }
                    tempQuery += ` GROUP BY di.rf_id`

                    query += ` AND list2.rf_id IN (${tempQuery}) ` 
                } 
            } else if(replacements.layout > 15 && assetsList.length == 0 && patents.length == 0 ) {
                query = ''
            }

            /* if(companies.length > 0) {
                replacements.companies = companies
                query += ' AND company_id IN (:companies)'

                if(patents.length > 0) {
                    replacements.appno_doc_num = patents
                    replacements.grant_doc_num = patents
                    query += ' AND ( appno_doc_num IN (:appno_doc_num) OR grant_doc_num IN (:grant_doc_num)) '
                }
            }
            query += '  GROUP BY assets.appno_doc_num ) GROUP BY documentid.rf_id ) ' */

            if(query != '') {
                query += '   GROUP BY assignment.rf_id  ORDER BY date ASC'

                assets_files =  await connection.resources.query(query,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: replacements,
                        raw: true,
                        logging: console.log,
                    }
                );
            }  
        }

        if(type == 1 && token != '' && token != undefined && token != 'undefined' && channelID != '' && channelID != undefined && channelID != 'undefined') {
            
            const web = new WebClient(token);
            
            // channel name without space and no special characters
            const result = await web.files.list({
                channel: channelID
            })
            //console.log(result);

            if(result && result.ok === true) {
                const { files } = result;
                document_files = [...files]
            }
        } else if(type == 1){
            if( g != '' && g != null && g != 'undefined' && ga != '' && ga != null && ga != 'undefined'  ) {
                let getRepo = await Repository.findOne({
                    where: { organisation_id: req.orgId, user_account: ga}
                }) 

                if(getRepo != null && getRepo.container_id != '') {
                    let credentials = {"scope": process.env.GOOGLE_SCOPE}
                    credentials.access_token = g
                    oauth2Client.setCredentials(credentials)
                    const drive = google.drive({version: 'v3', auth:oauth2Client});

                    if(drive != null && drive != undefined) {
                
                        const params = {
                            pageSize: 1000,
                            fields: 'nextPageToken, files(id, name, mimeType, webContentLink, webViewLink, iconLink, thumbnailLink, exportLinks, createdTime, owners)',
                            q: `'${getRepo.container_id}' in parents and mimeType != 'application/vnd.google-apps.folder'`,
                            orderBy: 'folder,name'
                        }     
        
                        const {data} = await drive.files.list(params)
                        if(data.files.length > 0 ) {
                            const promise = data.files.map( file => {
                                const owners = file.owners
                                const documentFile = {...file, ...owners[0]}
                                delete documentFile.owners
                                document_files.push(documentFile)
                            })
                            await Promise.all(promise)
                        }
                    }
                }
            }
        }
        
        res.status(200).json({assets_files, document_files});
    } catch (err) {
        console.log(err);
        res.status(200).json({assets_files, document_files});
    }
});

route.get("/assets/download/:itemID",[authJWT.verifyToken], async (req, res) =>{   
    let {itemID} = req.params, link = ''

    if(itemID > 0) {

        const assignmentData = await ResourceAssignments.findOne({
            attributes: ['reel_no', 'frame_no', 'status'],
            where:{
                rf_id: itemID
            }
        })
        /* const query = 'SELECT reel_no, frame_no FROM assignment WHERE rf_id = :itemID'
    
        const assignmentData =  await connection.resources.query(query,{
            type: connection.Sequelize.QueryTypes.SELECT,
            replacements: {itemID},
            raw: true,
            plain: true,
            logging: console.log,
        }) */
        console.log(assignmentData)
        if(assignmentData !== null) {
            const usptoLink = `https://legacy-assignments.uspto.gov/assignments/assignment-pat-${assignmentData.reel_no}-${assignmentData.frame_no}.pdf`
            const downloadFileProcess = new Promise( (resolve, reject) => {
                if(assignmentData.status == 1) {
                    link = `https://s3-us-west-1.amazonaws.com/static.patentrack.com/assignments/var/www/html/beta/resources/shared/data/assignment-pat-${assignmentData.reel_no}-${assignmentData.frame_no}.pdf`;
                    resolve('FROM CDN')  
                } else {
                    
                    request.head(usptoLink, (err, response, body) => {
                        console.log(usptoLink)
                        const path = usptoLink.split('/').pop(), pathDirectory = '/var/www/html/beta/resources/shared/data/'
                        console.log(`${pathDirectory}${path}`)
                        request(usptoLink)
                        .pipe(fs.createWriteStream(`${pathDirectory}${path}`))
                        .on('close', () => {
                            const pdfFile = fs.readFileSync(`${pathDirectory}${path}`, {flag:'r'});
                            if(pdfFile) {

                                const bucketConfig = connection.bucketConfig;              
                                const filename = path.replace(/\s+/g, '-');
                            
                                let s3 = new AWS.S3({
                                    credentials: {
                                        accessKeyId: bucketConfig.accessKeyId,
                                        secretAccessKey: bucketConfig.secretAccessKey,
                                    },
                                    region: bucketConfig.region
                                })
                                const serverDIR = 'assignments/var/www/html/beta/resources/shared/data/'
                                console.log(pdfFile)
                                console.log(`${serverDIR}${filename}`)

                                const params = {
                                    Key: `${serverDIR}${filename}`,
                                    Bucket: bucketConfig.bucketName,
                                    Body: pdfFile,
                                    ACL: 'public-read',
                                    ContentType: 'application/pdf',
                                    ContentDisposition: 'inline'
                                }
                                s3.putObject(params, async function(err, data) {
                                    console.log(err, data);
                                    if(err == null) {
                                        link = `https://s3-${bucketConfig.region}.amazonaws.com/${bucketConfig.bucketName}/${serverDIR}${filename}`;                                    
                                        //spawn('rm', [`${pathDirectory}${path}`]);

                                        ResourceAssignments.update({status: 1}, {where: {reel_no: assignmentData.reel_no, frame_no: assignmentData.frame_no}})
                                        
                                        resolve(`${pathDirectory}${path}`)  
                                    }  else {
                                        reject('DOWNLOADED/UPLOADED')
                                    }
                                });
                            }  else {
                                reject('DOWNLOADED/UPLOADED')
                            }
                        })
                    })
                }                    
            }) 
            downloadFileProcess
            .then(async (data) => {
                splitPDFFile(data)
                res.status(200).json({link})
            }).catch(function(err) {
                console.log(`File not downloaded: ${err}`)
            });
        }
    }
}) 

const splitPDFFile = (item) => {
    /**
     * Split PDF file with script
     */
    const splitFiles = spawn('php', ['-f', '/var/www/html/trash/split_pdf_files.php'])

    splitFiles.on("close", code => {
        //check Files exist
        const agreementFile = item.replace('.pdf', '_agreement.pdf'), formFile = item.replace('.pdf', '_form.pdf')
        if (fs.existsSync(agreementFile) || fs.existsSync(formFile)) {
            /**
             * Upload Files to S3
             */
            const uploadFiles = spawn('php', ['-f', '/var/www/html/trash/s3_upload_files.php'])
            uploadFiles.on("close", code => {
                spawn('rm', [item]);
            })
        }
    })
}

/*6*/
/**
 * Get patent JSON data
 */
route.get("/assets/:asset",[authJWT.verifyToken], async (req, res) =>{        
    let asset = req.params.asset, flag = req.query.flag;

    let where = {
        [connection.Op.or]:[{grant_doc_num: asset},{appno_doc_num: asset}]
    }
    if(typeof flag !== 'undefined' && flag >= 0) {
        if(flag == 1) {
            where = {
                grant_doc_num: asset
            }
        } else if(flag == 0) {
            where = {
                appno_doc_num: asset
            }
        }
    }

    let findDocument = await Documentids.findAll({
        where,
        attributes:['rf_id',['grant_doc_num','number'], ['appno_doc_num','application']],
    })
    if(findDocument.length == 0 && typeof flag !== 'undefined' && flag >= 0) {
        let queryDocument  = '';
        if(flag == 1) {
            queryDocument = "SELECT appno_doc_num, appno_date, grant_doc_num, grant_date, 0 AS rf_id  FROM db_patent_application_bibliographic.application_grant WHERE grant_doc_num = :asset " ;
        } else {
            queryDocument = "SELECT appno_doc_num, appno_date, '' AS grant_doc_num, '' AS grant_date, 0 AS rf_id, '' FROM db_patent_grant_bibliographic.application_publication WHERE appno_doc_num = :asset" ;
        }
        findDocument =  await connection.resources.query(queryDocument,{
            type: connection.Sequelize.QueryTypes.SELECT,
            replacements: {asset},
            raw: true,
            logging: console.log,
        });
    }
    if(findDocument != null && findDocument.length > 0){
        console.log(findDocument); 
        helpers.generateJSON(req, res);
    } else {
        res.status(400).send("Invalid number");
    } 
});

/**
 * route.get("/assets/:patentNumber/:type/outsource",[authJWT.verifyToken], async (req, res) =>{   
 */

route.get("/assets/:patentNumber/:type/outsource",[], async (req, res) =>{        
    let { patentNumber, type } = req.params, flag = req.query.flag;
    
    if(type == 1) {
        let type = "patNum";
        let where = {
            [connection.Op.or]:[{grant_doc_num: patentNumber},{appno_doc_num: patentNumber}]
        }
        if(typeof flag !== 'undefined' && flag >= 0) {
            if(flag == 1) {
                type = "patNum";
                where = {
                    grant_doc_num: patentNumber
                }
            } else if(flag == 0) {
                type = "applNum";
                where = {
                    appno_doc_num: patentNumber
                }
            }
        }

        let record = await Documentids.findOne({
            where,
            attributes:[['grant_doc_num','number']],
        }) 
        if(record == null) { 
            record =  await connection.resources.query(`SELECT grant_doc_num from db_patent_application_bibliographic.application_grant WHERE grant_doc_num = :number`,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    replacements: {number: patentNumber},
                    raw: true,
                    logging: console.log,
                }
            );

            if(record === null) {
                record =  await connection.resources.query(`SELECT appno_doc_num from db_patent_grant_bibliographic.application_publication WHERE grant_doc_num = :number`,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: {number: patentNumber},
                        raw: true,
                        logging: console.log,
                    }
                );
            }
        }
        if(record !== null) {            
            console.log('%j',record);                  
            res.status(200).json({url:`https://assignment.uspto.gov/patent/index.html#/patent/search/resultAbstract?id=${patentNumber}&type=${type}`});
        } else {
            res.status(200).send("");
        }
    } else if(type == 0){
        ResourceAssignments.findOne({
            where:{rf_id: patentNumber},
            attributes:['reel_no', 'frame_no']
        })
        .then( a => {
            if(a != null) {
                let frame = a.frame_no.toString();
                frame = frame.length == 1 ? '000'+frame : frame.length == 2 ? '00'+frame : frame.length == 3 ? '0'+frame : frame;
                let searchInput = `${a.reel_no}-${frame}`;
                let ID = `${a.reel_no}-${a.frame_no}`;
                res.status(200).json({url:`https://assignment.uspto.gov/patent/index.html#/patent/search/resultAssignment?searchInput=${searchInput}&id=${ID}`});
            } else {
                res.status(200).send("");
            }
        })
    }    
});

/**
 * Move asset to other layout
 */
route.post("/assets/move",[authJWT.verifyToken], async (req, res) => { 
    try{
        const { moved_assets } = req.body
        let addedData = []
        if( moved_assets != null  && moved_assets != 'undefined') {
            const list = JSON.parse(moved_assets)
            if( list.length > 0 ) {
                const assets = []
                let query = [], queryCondition = {}
                let a = 0;
                list.map( (row, index) => {
                    let layout_id = row.move_category == 0 ? row.currentLayout : row.move_category
                    let status = row.move_category == 0 ? 0 : 1
                    assets.push({
                        grant_doc_num: row.grant_doc_num,
                        appno_doc_num: row.appno_doc_num,
                        organisation_id: req.orgId,
                        layout_id,
                        status
                    })
                    if( row.move_category != 0 ) {
                        assets.push({
                            grant_doc_num: row.grant_doc_num,
                            appno_doc_num: row.appno_doc_num,
                            organisation_id: req.orgId,
                            layout_id: row.currentLayout,
                            status: 0
                        })
                    }
                    query.push(`(grant_doc_num = :grant${a} AND appno_doc_num = :appno${a} AND layout_id = :layout${a} AND status = :status${a}) `)
                    queryCondition[`grant${a}`] = row.grant_doc_num
                    queryCondition[`appno${a}`] = row.appno_doc_num
                    queryCondition[`layout${a}`] = layout_id
                    queryCondition[`status${a}`] = status
                    a++
                    if( row.move_category != 0 ) {
                        query.push(`(grant_doc_num = :grant${a} AND appno_doc_num = :appno${a} AND layout_id = :layout${a} AND status = :status${a}) `)
                        queryCondition[`grant${a}`] = row.grant_doc_num
                        queryCondition[`appno${a}`] = row.appno_doc_num
                        queryCondition[`layout${a}`] = row.currentLayout
                        queryCondition[`status${a}`] = 0
                        a++
                    }
                })
                addedBulkData = await AssetsTransfer.bulkCreate(assets)  
                if(addedBulkData) {                    
                    const findQuery = `SELECT asset_id FROM assets_transfer WHERE ${query.join(' OR ')}`
                    addedData = await connection.application.query(findQuery,{
                            type: connection.Sequelize.QueryTypes.SELECT,
                            replacements: queryCondition,
                            raw: true,
                            logging: console.log,
                        });
                    
                } 
            }                   
        }
        res.status(200).json(addedData);
    } catch (err) {
        console.log(err);
        res.status(400).send("Invalid data");
    }    
});

/**
 * Rollback assets
 */
route.delete("/assets/rollback",[authJWT.verifyToken], async (req, res) => { 
    try{
        const { revert } = req.query
        let deleted = false
        if( revert != null  && revert != 'undefined') {
            const assetIDs = JSON.parse(revert)
            if( assetIDs.length > 0 ) {                
                const deleteList = await AssetsTransfer.destroy({
                    where: { asset_id: assetIDs }
                })                
                if( deleteList ) {
                    deleted = true
                } 
            }                   
        }
        res.status(200).send(deleted);
    } catch (err) {
        console.log(err);
        res.status(400).send("Invalid data");
    }    
});

/**
 * Search value from company, customers, transaction, assets
 */

route.post("/assets/search",[authJWT.verifyToken, clientDBConnection.connect], async (req, res) => {        
    const query = req.body.value;

    if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
        const Representative = req.connection_db.define('Representatives', Representatives.mainStructure, Representatives.options);
        /**
         * Company
         */
        const customers = [];
        let transactions = [], assets = [];
        const companies = await Representative.findAll({
            attributes: [['representative_id', 'id'],'original_name', 'representative_name'],
            where: {
                [connection.Op.or] : [
                    {original_name: {[connection.Op.like]: '%' + query + '%'}},
                    {representative_name: {[connection.Op.like]: '%' + query + '%'}},
                ]
            }
        });

        

        const findRFIDs = await RepresentativeTransactions.findAll({
            attributes: ['rf_id'],
            where: {organisation_id: req.orgId}
        });

        if(findRFIDs != null) {
            const allRFIDs = [];
            const promises = findRFIDs.map( rfID => {
                allRFIDs.push(rfID.rf_id);
                return rfID;
            });

            await Promise.all(promises);

            const where = {name: {[connection.Op.like]: '%' + query + '%'}};

            const assignees = await Assignees.findAll({
                attributes: [connection.Sequelize.col('assignee.assignor_and_assignee_id'), connection.Sequelize.col('assignor_and_assignee.name')],
                where: {rf_id: allRFIDs},
                group: [connection.Sequelize.col('assignee.assignor_and_assignee_id')],
                include: [
                    {
                        model: AssignorAndAssignee,
                        as: 'assignor_and_assignee',
                        where: where
                    }
                ]
            });

            const assignors = await Assignors.findAll({
                attributes: [connection.Sequelize.col('assignor.assignor_and_assignee_id'), connection.Sequelize.col('assignor_and_assignee.name')],
                where: {rf_id: allRFIDs},
                group: [connection.Sequelize.col('assignor.assignor_and_assignee_id')],
                include: [
                    {
                        model: AssignorAndAssignee,
                        as: 'assignor_and_assignee',
                        attributes: ['assignor_and_assignee_id', 'name'],
                        where: where
                    }
                ]
            });

            const customerIDs = [];
            console.log(assignees);
            console.log(assignees.length);
            if(assignees.length > 0) {
                const promises = assignees.map( assignee => {
                    if(!customerIDs.includes(assignee.assignor_and_assignee.assignor_and_assignee_id)) {
                        customerIDs.push(assignee.assignor_and_assignee.assignor_and_assignee_id);
                        customers.push({id: assignee.assignor_and_assignee.assignor_and_assignee_id, name: assignee.assignor_and_assignee.name});
                    }
                    return assignee;
                });

                await Promise.all(promises);
            }
            
            if(assignors.length > 0) {
                
                const promises = assignors.map( assignor => {                   
                    if(!customerIDs.includes(assignor.assignor_and_assignee.assignor_and_assignee_id)) {
                        customerIDs.push(assignor.assignor_and_assignee.assignor_and_assignee_id);
                        customers.push({id: assignor.assignor_and_assignee.assignor_and_assignee_id, name: assignor.assignor_and_assignee.name});
                        console.log(customers);
                    }

                    return assignor;
                });

                await Promise.all(promises);
            }

            /**
             * Transactions
             */
            transactions = await Assignments.findAll({
                attributes: ['rf_id', 'record_dt'],
                where: {rf_id: allRFIDs, rf_id: query},
                order: [
                    ['record_dt', 'ASC']
                ]
            });

            /**
             * Assets
             */

            assets = await Documentids.findAll({
                attributes: ['appno_doc_num', 'grant_doc_num'],
                where: {rf_id: allRFIDs, [connection.Op.or] : [
                    {appno_doc_num: query},
                    {grant_doc_num: query},
                ]}
            });
        }
        res.status(200).json({companies: companies, customers: customers, transactions: transactions, assets: assets});
    }
})

/**
 * validate foreign assets
 */

const fixedAssetsUnWantedCharacters = async (assets) => {
    assets.forEach((asset, index) => {
        let number = asset.toString().toLocaleLowerCase()
        if(number.indexOf('us') !== -1) {
            number = number.replace('us', '')
        }
        if(number.indexOf('a') !== -1) {
            number = number.substring(0, number.indexOf('a'))
        }
        if(number.indexOf('b') !== -1) {
            number = number.substring(0, number.indexOf('b'))
        }
        number = number.replace(/,/g, "")
        number = number.replace(/\./g, "")
        number = number.replace(/\//g, "")
        number = number.trim()
        if(number != asset && number !== '') {
            assets[index] = number
        }   
    })
    return assets
}

route.post("/assets/validate",[authJWT.verifyToken], async (req, res) => { 
    try{
        const query = req.body, remainingAssets = [];

        if(query.foreign_assets !== null && query.foreign_assets !== '') {
            let assets = JSON.parse(query.foreign_assets)
            const originalAsset = [...assets]
            assets = await fixedAssetsUnWantedCharacters(assets)
            if(assets.length > 0) {
                const findAssets = await ResourceDocumentids.findAll({
                    where: {
                        [connection.Op.or]: [
                        {appno_doc_num: assets},
                        {grant_doc_num: assets}
                    ]},
                    group: ['grant_doc_num', 'appno_doc_num']
                })
                if(findAssets !== null) {
                    
                    const allAssets = []

                    const promise = findAssets.map( asset => {
                        allAssets.push(asset.grant_doc_num)
                        allAssets.push(asset.appno_doc_num)
                    })

                    await Promise.all(promise)

                    assets.forEach( (asset, index) => {
                        if(!allAssets.includes(asset)){
                            remainingAssets.push(originalAsset[index])
                        }
                    })
                    console.log('validated assets')
                    res.status(200).json(remainingAssets)
                } else {
                    res.status(200).json(assets)
                }
            } else {
                res.status(200).json(assets)
            }
        } else {
            res.status(200).json(remainingAssets)
        }
    } catch (e) {
        console.log('Error => "/assets/validate"', e)
        res.status(500).send('Error')
    }    
})

/**
 * Get Assets for Sale
 */

route.post("/assets/assets_for_sale",[authJWT.verifyToken, clientDBConnection.connect], async (req, res) => { 
    try{
        const result = { message: ''}
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const {appno_doc_num, grant_doc_num, type} = req.body

            if((typeof grant_doc_num !== 'undefined' && grant_doc_num !== '') || (typeof appno_doc_num !== 'undefined' && appno_doc_num !== '')) {
                const insertData = [{
                    appno_doc_num,
                    grant_doc_num,
                    type,
                    organisation_id: req.orgId
                }]
                const data = await AssetsForSale.bulkCreate(insertData, {ignoreDuplicates: true})

                if(data !== null ) {
                    /**
                     * Send Message to Slack 
                     */
                    result.message = "Assets moved for sale successfully"
                }
            } else {
                result.message = "Invalid inputs"
            }
        } else {
            result.message = "Invalid inputs"
        }
        res.status(200).json(result)
    } catch (error) {
        res.status(500).send('Error while retreiving data')
    }
})

/**
 * Get Assets for Sale
 */

route.post("/assets/assets_for_sale",[authJWT.verifyToken, clientDBConnection.connect], async (req, res) => { 
    try{
        const result = { message: ''}
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const {appno_doc_num, grant_doc_num, type} = req.body

            if((typeof grant_doc_num !== 'undefined' && grant_doc_num !== '') || (typeof appno_doc_num !== 'undefined' && appno_doc_num !== '')) {
                const insertData = [{
                    appno_doc_num,
                    grant_doc_num,
                    type,
                    organisation_id: req.orgId
                }]
                const data = await AssetsForSale.bulkCreate(insertData, {ignoreDuplicates: true})

                if(data !== null ) {
                    /**
                     * Send Message to Slack 
                     */
                    result.message = "Assets moved for sale successfully"
                }
            } else {
                result.message = "Invalid inputs"
            }
        } else {
            result.message = "Invalid inputs"
        }
        res.status(200).json(result)
    } catch (error) {
        res.status(500).send('Error while retreiving data')
    }
})


const buildRows = async(assets) => {
    return assets.map(function(asset) {        
        return {
            values: [
                {
                    userEnteredValue: {
                    stringValue: asset
                    }
                }
            ]
        };
    });
}

const addNewDataToSheet = async(sheetInstance, spreadsheetID, sheetID, index, assets, res) => {
    const rows = await buildRows(assets)

    const request = {
        spreadsheetId: spreadsheetID,
        resource: {
            requests: [
                {
                    updateCells: {
                        start: {
                            sheetId: sheetID,
                            rowIndex: index,
                            columnIndex: 0
                        },
                        rows,
                        fields: '*'
                    }
                }
            ]
        }
    };
    console.log('addNewDataToSheet', JSON.stringify(request))
    await sheetInstance.batchUpdate(request, function(updateData){
        console.log('addNewDataToSheet=>', updateData)
        res.status(200).json({error: '', message: "Foreign assets added"});   
    })
}
/**
 * Get sheet list
 */

route.post("/assets/external_assets/sheets",[authJWT.verifyToken, clientDBConnection.connect], async (req, res) => { 
    try{
        const result = {list: [], total_records: 0, message: ''}
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const {token, account} = req.body

            if(typeof token !== 'undefined' && typeof account !== 'undefined' && token !== '' && account !== '') {
                let getRepo = await Repository.findOne({
                    where: { organisation_id: req.orgId, user_account: account}
                })
                if( getRepo !== null && getRepo.foreign_assets_container_id !== null && getRepo.foreign_assets_container_id !== '') {
                    const sheetHelper = new SheetsHelper(token)
                    const request = {spreadsheetId: getRepo.foreign_assets_container_id, includeGridData: true}
                    const promise = new Promise((resolve, reject) =>{
                        sheetHelper.get(request, async (spreadsheetData) => {
                            if( spreadsheetData != null ) {
                                resolve(spreadsheetData)
                            } else {
                                reject('No list found!')
                            }
                        })
                    })
                    promise
                    .then( spreadsheetData => {
                        if(spreadsheetData.sheets.length > 0){
                            spreadsheetData.sheets.forEach( sheet => {
                                result.list.push({
                                    sheet_id: sheet.properties.sheetId,
                                    sheet_name: sheet.properties.title
                                })
                            })
                            result.total_records = spreadsheetData.sheets.length
                        }
                        res.status(200).json(result)
                    }).catch((e) => {
                        result.message = 'Unable to retreive list, Please login again';
                        res.status(200).json(result)
                    })
                }  else {
                    res.status(200).json(result)
                }
            } else {
                result.message = 'Invalid token, and account';
                res.status(200).json(result)
            }
        } else {
            result.message = 'No connection';
            res.status(200).json(result)
        }
    } catch (e) {
        console.log('/assets/foreign_assets/sheets', e)
        res.status(500).send('Error while retreiving data')
    }
})

/**
 * Get sheet assets
 */

route.post("/assets/external_assets/sheets/assets",[authJWT.verifyToken, clientDBConnection.connect], async (req, res) => { 
    try{
        const result = {list: [], total_records: 0, message: ''}
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const {token, account, sheet_names} = req.body
            if(typeof token !== 'undefined' && typeof account !== 'undefined' && token !== '' && account !== '') {
                let getRepo = await Repository.findOne({
                    where: { organisation_id: req.orgId, user_account: account}
                })
                if( getRepo !== null && getRepo.foreign_assets_container_id !== null && getRepo.foreign_assets_container_id !== '') {
                    const allSheets = JSON.parse(sheet_names)
                    const sheetHelper = new SheetsHelper(token)
                    const request = {
                        spreadsheetId: getRepo.foreign_assets_container_id, 
                        majorDimension: 'ROWS',
                        range: allSheets[0]}
                    const promise = new Promise((resolve, reject) =>{
                        sheetHelper.getData(request, async (spreadsheetData) => {
                            if( spreadsheetData != null ) {
                                resolve(spreadsheetData)
                            } else {
                                reject('No list found!')
                            }
                        })
                    })
                    promise
                    .then( list => {
                        if(typeof list.values !== 'undefined' && list.values.length > 0 && list.values[0].length > 0){  
                            const items = list.values
                            items.splice(0,1)
                            items.forEach( item => {
                                result.list.push({
                                    appno_doc_num: item[0],
                                    grant_doc_num: item[0],
                                    asset_type: 0,
                                    asset: item[0],
                                    child_count: 0
                                })
                            })
                            result.total_records = items.length
                        } else {
                            result.message = 'Invalid credentials';
                            res.status(200).json(result)
                        }
                        res.status(200).json(result)
                    }).catch((e) => {
                        console.log("/assets/foreign_assets/sheets/:sheetName/assets", e)
                        result.message = 'Unable to retreive list, Please login again';
                        res.status(200).json(result)
                    })
                }  else {
                    res.status(200).json(result)
                }
            } else {
                result.message = 'Invalid token, and account';
                res.status(200).json(result)
            }
        } else {
            result.message = 'No connection';
            res.status(200).json(result)
        }
    } catch (e) {
        console.log('/assets/foreign_assets/sheets', e)
        res.status(500).send('Error while retreiving data')
    }
})

route.post("/assets/external_assets/sheets/timeline",[authJWT.verifyToken], async (req, res) => { 
    try {
        const { assets } = req.body, results = { list: []}
        if(typeof assets !== 'undefined' && assets !== '') {
            const assetsList = JSON.parse(assets)
            if(assetsList.length > 0) {
                const findAssets = await ResourceDocumentids.findAll({
                    where: {
                        [connection.Op.or]: [
                        {appno_doc_num: assetsList},
                        {grant_doc_num: assetsList}
                    ]},
                    group: ['grant_doc_num', 'appno_doc_num']
                })
                if(findAssets !== null) { 
                    findAssets.forEach( asset => {
                        results.list.push({
                            exec_dt: asset.appno_date,
                            totalAssets: 1,
                            tab_id: 0,
                            customerName: asset.grant_doc_num != '' ? asset.grant_doc_num : asset.appno_doc_num,
                            id: asset.rf_id
                        })
                    })                    
                }
            }
        } 
        res.status(200).json(results)
    } catch (error) {
        console.log("/assets/foreign_assets/sheets/assets", error)
        res.status(500).send('Error')
    }
})

/**
 * save foreign assets
 */

const moveSheetToUtilitiesFolder = (repositoryObject, access_token, fileID) => {
    oauth2Client.setCredentials({ access_token})

    const drive = google.drive({version: 'v3', auth:oauth2Client});
    if(drive != null && drive != undefined) {
        drive.files.update({
            fileId: fileID,
            addParents: repositoryObject.utilities_container_id 
        })
    }

}

route.put("/assets/external_assets",[authJWT.verifyToken, clientDBConnection.connect], async (req, res) => { 
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const {foreign_assets, sheet_id, sheet_name, user_account, access_token, refresh_token } = req.body
            if(foreign_assets !== null && foreign_assets !== '' ) {
                let getRepo = await Repository.findOne({
                    where: { organisation_id: req.orgId, user_account: user_account}
                })

                if(getRepo !== null && getRepo.foreign_assets_container_id !== '' &&  getRepo.foreign_assets_container_id !== null) {
                    const sheetHelper = new SheetsHelper(access_token)
                    sheetHelper.getData({
                        spreadsheetId: getRepo.foreign_assets_container_id,
                        majorDimension: 'COLUMNS',
                        range: sheet_name
                    }, async function( sourceList ){
                        if(Object.keys(sourceList).length > 0 && typeof sourceList.values !== 'undefined' && sourceList.values.length > 0 && sourceList.values[0].length > 0) {
                            
                            const appendAssets = JSON.parse(foreign_assets)
                            if(appendAssets.length > 0) {
                                const filterItems = appendAssets.filter( item => !sourceList.values[0].includes(item) ? item : '')

                                if(filterItems.length > 0) {
                                    const findAssets = await ResourceDocumentids.findAll({
                                        attributes: ['grant_doc_num', 'appno_doc_num'],
                                        where: {
                                            [connection.Op.or]: [
                                            {appno_doc_num: filterItems},
                                            {grant_doc_num: filterItems}
                                        ]},
                                        group: ['grant_doc_num', 'appno_doc_num']
                                    })
                                    if(findAssets.length > 0) {
                                        const validAssets = []
                                        findAssets.forEach( asset => {
                                            if(asset.grant_doc_num !== '' || asset.appno_doc_num !== '') {
                                                validAssets.push(asset.grant_doc_num !== '' && asset.grant_doc_num !== null ? asset.grant_doc_num : asset.appno_doc_num)
                                            }                                            
                                        })
                                        await addNewDataToSheet(sheetHelper, getRepo.foreign_assets_container_id, sheet_id, sourceList.values[0].length, validAssets, res)
                                    } else {
                                        res.status(200).json({error: 'Assets not found in USPTO database'});   
                                    }                                    
                                } else {
                                    res.status(200).json({error: 'All items already in the list'});   
                                }
                            } else {
                                res.status(200).json({error: 'Items cannot be empty'});   
                            }
                        } else {
                            res.status(200).json({error: 'Source list is empty'});   
                        }
                    })
                } else {
                    res.status(200).json({error: 'External sheet not found'});   
                }
            } else {
                res.status(200).json({error: 'Update item cannot be empty'});   
            } 
        } else {
            res.status(200).json({error: 'Please try again'});   
        }
    } catch (error) {
        console.log("PATCH => /assets/external_assets", error)
        res.status(500).json({error: 'Please try again'});   
    }
})

route.patch("/assets/external_assets",[authJWT.verifyToken, clientDBConnection.connect], async (req, res) => { 
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const {new_item, update_item, sheet_id, sheet_name, user_account, access_token, refresh_token } = req.body
            if(update_item !== null && update_item !== '' && new_item !== null && new_item !== '') {
                let getRepo = await Repository.findOne({
                    where: { organisation_id: req.orgId, user_account: user_account}
                })

                if(getRepo !== null && getRepo.foreign_assets_container_id !== '' &&  getRepo.foreign_assets_container_id !== null) {
                    const sheetHelper = new SheetsHelper(access_token)
                    sheetHelper.getData({
                        spreadsheetId: getRepo.foreign_assets_container_id,
                        majorDimension: 'COLUMNS',
                        range: sheet_name
                    }, async function( sourceList ){
                        if(Object.keys(sourceList).length > 0 && typeof sourceList.values !== 'undefined' && sourceList.values.length > 0 && sourceList.values[0].length > 0) {
                            const findIndex = sourceList.values[0].findIndex( item => item == update_item)
                            if(findIndex !== -1) {
                                const requestDelete = {
                                    spreadsheetId: getRepo.foreign_assets_container_id,
                                    resource: {
                                        requests: [
                                            {
                                                updateCells: {
                                                    start: {
                                                        sheetId: sheet_id,
                                                        rowIndex: findIndex,
                                                        columnIndex: 0
                                                    },
                                                    rows:[
                                                        [
                                                            {
                                                                values: [
                                                                    {
                                                                        userEnteredValue: {
                                                                            stringValue: new_item
                                                                        }
                                                                    }
                                                                ]
                                                            }
                                                        ]
                                                    ],
                                                    fields: '*'
                                                }
                                            }
                                        ]
                                    }
                                }
                                await sheetHelper.batchUpdate(requestDelete, function(updateData){
                                    console.log('Update ITEM=>', updateData)
                                    res.status(200).json({error: '', message: 'Item updated'});   
                                })
                            } else {
                                res.status(200).json({error: 'Item not found'});   
                            }
                        } else {
                            res.status(200).json({error: 'Source list is empty'});   
                        }
                    })
                } else {
                    res.status(200).json({error: 'External sheet not found'});   
                }
            } else {
                res.status(200).json({error: 'Update item cannot be empty'});   
            } 
        } else {
            res.status(200).json({error: 'Please try again'});   
        }
    } catch (error) {
        console.log("PATCH => /assets/external_assets", error)
        res.status(500).json({error: 'Please try again'});   
    }
})

route.delete("/assets/external_assets",[authJWT.verifyToken, clientDBConnection.connect], async (req, res) => { 
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const {delete_item, sheet_id, sheet_name, user_account, access_token, refresh_token } = req.body
            if(delete_item !== null && delete_item !== '') {
                let getRepo = await Repository.findOne({
                    where: { organisation_id: req.orgId, user_account: user_account}
                })

                if(getRepo !== null && getRepo.foreign_assets_container_id !== '' &&  getRepo.foreign_assets_container_id !== null) {
                    const sheetHelper = new SheetsHelper(access_token)
                    sheetHelper.getData({
                        spreadsheetId: getRepo.foreign_assets_container_id,
                        majorDimension: 'COLUMNS',
                        range: sheet_name
                    }, async function( sourceList ){
                        if(Object.keys(sourceList).length > 0 && typeof sourceList.values !== 'undefined' && sourceList.values.length > 0 && sourceList.values[0].length > 0) {
                            const findIndex = sourceList.values[0].findIndex( item => item == delete_item)
                            if(findIndex !== -1) {
                                const requestDelete = {
                                    spreadsheetId: getRepo.foreign_assets_container_id,
                                    resource: {
                                        requests: [
                                            {
                                                deleteRange: {
                                                    range: {
                                                        sheetId: sheet_id,
                                                        startRowIndex: findIndex,
                                                        endRowIndex: findIndex + 1
                                                    },
                                                    shiftDimension: "ROWS"
                                                }
                                            }
                                        ]
                                    }
                                }
                                await sheetHelper.batchUpdate(requestDelete, function(updateData){
                                    console.log('DELETE ITEM=>', updateData)
                                    res.status(200).json({error: '', message: 'Row deleted'});   
                                })
                            } else {
                                res.status(200).json({error: 'Item not found'});   
                            }
                        } else {
                            res.status(200).json({error: 'Source list is empty'});   
                        }
                    })
                } else {
                    res.status(200).json({error: 'External sheet not found'});   
                }
            } else {
                res.status(200).json({error: 'Delete item cannot be empty'});   
            } 
        } else {
            res.status(200).json({error: 'Please try again'});   
        }
    } catch (error) {
        console.log("DELETE => /assets/external_assets", error)
        res.status(500).json({error: 'Please try again'});   
    }
})

route.post("/assets/external_assets",[authJWT.verifyToken, clientDBConnection.connect], async (req, res) => { 
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const {foreign_assets, sheet_name, user_account, access_token, refresh_token } = req.body
            if(foreign_assets !== null && foreign_assets !== '') {
                let getRepo = await Repository.findOne({
                    where: { organisation_id: req.orgId, user_account: user_account}
                })

                if(getRepo !== null && getRepo.utilities_container_id !== '' &&  getRepo.utilities_container_id !== null) {
                    let assets = JSON.parse(foreign_assets)
                    assets = await fixedAssetsUnWantedCharacters(assets)
                    if(assets.length > 0) {

                        const findAssets = await ResourceDocumentids.findAll({
                            attributes: ['grant_doc_num', 'appno_doc_num'],
                            where: {
                                [connection.Op.or]: [
                                {appno_doc_num: assets},
                                {grant_doc_num: assets}
                            ]},
                            group: ['grant_doc_num', 'appno_doc_num']
                        })

                        if(findAssets.length > 0) {
                            const validAssets = []
                            findAssets.forEach( asset => {
                                if(asset.grant_doc_num !== '' || asset.appno_doc_num !== '') {
                                    validAssets.push(asset.grant_doc_num !== '' && asset.grant_doc_num !== null ? asset.grant_doc_num : asset.appno_doc_num)
                                }
                                
                            })
                            
                            let foreign_assets_container_id = getRepo.foreign_assets_container_id;
                            const sheetHelper = new SheetsHelper(access_token), title =  'Lists of External Assets'
                            if(foreign_assets_container_id == null || foreign_assets_container_id == '') {
                                /**
                                 * File not created
                                 */
                                const sheets = [
                                    {
                                        properties: {
                                            title: sheet_name,
                                            gridProperties: {
                                                frozenRowCount: 1
                                            }
                                        }
                                    }
                                ]
                                const sheetHeaders = [
                                    [
                                        { field: 'assets', header: 'Asset' }
                                    ]
                                ]
                                sheetHelper.createProductSpreadsheet(title, sheets, sheetHeaders, async function(spreadsheet){
                                    if( spreadsheet !== null ) {
                                        moveSheetToUtilitiesFolder(getRepo, access_token, spreadsheet.spreadsheetId) // Move sheet to utilities folder
                                        
                                        getRepo.update({foreign_assets_container_id: spreadsheet.spreadsheetId})
                                        if(Object.keys(spreadsheet).length > 0) {
                                            await addNewDataToSheet(sheetHelper, spreadsheet.spreadsheetId, spreadsheet.sheets[0].properties.sheetId, 1, validAssets, res)
                                        } else {
                                            res.status(200).json({error: 'Error while adding data', message: ''})
                                        }                                 
                                    } else {
                                        res.status(200).json({error: 'Error while adding data', message: ''})
                                    }
                                })
                            } else {
                                const request = {
                                    spreadsheetId: foreign_assets_container_id, 
                                    resource: {
                                        requests: [
                                            {
                                                addSheet: {
                                                    properties: {
                                                        title: sheet_name,
                                                        gridProperties: {
                                                            frozenRowCount: 1
                                                        }
                                                    }
                                                }
                                            }
                                        ]
                                    }
                                }
                                sheetHelper.batchUpdate(request, async function(sheet) {
                                    if( sheet !== null ) {
                                        if(Object.keys(sheet).length > 0) {
                                            validAssets.splice(0,0, 'Asset')
                                            await addNewDataToSheet(sheetHelper, foreign_assets_container_id, sheet.replies[sheet.replies.length - 1].addSheet.properties.sheetId, 0, validAssets, res)
                                        } else {
                                            res.status(200).json({error: 'Error while adding data', message: ''})
                                        }
                                    } else {
                                        res.status(200).json({error: 'Error while adding data', message: ''})
                                    }
                                })
                            }
                        } else {
                            res.status(200).json({error: 'Invalid data', message: ''})
                        }
                    } else {
                        res.status(200).json({error: 'Invalid data', message: ''})
                    }
                } else {
                    res.status(200).json({error: 'Please assign a Utility Files Folder.', message: ''})
                }                
            } else {
                res.status(200).json({error: 'Invalid data', message: ''})
            } 
        } else {
            res.status(200).json({error: 'Invalid data', message: ''})
        } 
    } catch (e) {
        console.log('Error => "/assets/save_foreign_assets"', e)
        res.status(500).send('Error')
    }    
});

module.exports = route;