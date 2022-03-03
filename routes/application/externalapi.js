const express = require("express"),

    request = require('request'),

    route = express.Router(),

    authJWT = require("../../helpers/verifyJwtToken"),

    connection = require("../../config/db.config"),

    OrganisationApplication = require("../../model/application/OrganisationApplication");
    
const { v4: uuidv4  } = require('uuid');

route.get("/ptab/:asset", [authJWT.verifyToken], async (req, res) => { 
    try {
        const {asset} = req.params
        const {counter} = req.query;  
        if(typeof asset !== 'undefined' && asset !== '' && asset !== null) {
            const url = `https://developer.uspto.gov/ptab-api/proceedings?applicationNumberText=${asset}`

            request(url, (error, response, body) => {
                if (!error && response.statusCode == 200) {
                    const responseBody = JSON.parse(body)
                    const ptabEvents = []
                    if(responseBody.results.length > 0) {
                        responseBody.results.forEach( item => {
                            ptabEvents.push({
                                id: uuidv4(),
                                start: item.proceedingFilingDate + ' 00:00:00',
                                end: item.decisionDate + ' 00:00:00',
                                name: item.respondentPartyName,
                                status: item.proceedingStatusCategory,
                                otherInfo: item
                            })
                        })
                    }
                    if(typeof counter !== 'undefined') {
                        res.status(200).send(`${ptabEvents.length}`);
                    } else {
                        res.status(200).json(ptabEvents);
                    }
                } else {
                    console.log('ERROR => /ptab/', error)
                    if(typeof counter !== 'undefined') {
                        res.status(200).send(`0`);
                    } else {
                        res.status(200).json({});
                    }
                }
            })
        } else {
            console.log('ERROR => /ptab/', error)
            res.status(401).send('Asset number is empty')
        }
    } catch (e) {
        console.log('ERROR => /ptab/', error)
        res.status(500).send('Error while rendering asset details')
    }    
});


route.get("/citation/:asset", [authJWT.verifyToken], async (req, res) => { 
    try {
        const {asset} = req.params
        const {counter} = req.query; 
        if(typeof asset !== 'undefined' && asset !== '' && asset !== null) {
            const queryString = ``
            const url = `https://api.patentsview.org/patents/query?q={"cited_patent_number":"${asset}"}&f=["patent_number","patent_date","patent_num_combined_citations","patent_title","assignee_organization"]`

            request(url, async(error, response, body) => {
                if (!error && response.statusCode == 200) {
                    const responseBody = JSON.parse(body)
                    const citationEvents = []
                    if(responseBody !== null && responseBody.total_patent_count > 0) {
                        const allAssignee = []
                        responseBody.patents.forEach(item => {
                            let assignee = "";
                            if(item.assignees.length > 0) {
                                assignee = item.assignees[item.assignees.length - 1].assignee_organization
                            }
                            if(assignee !== '') {
                                allAssignee.push(assignee)
                            }
                            citationEvents.push({
                                id: uuidv4(),
                                start: item.patent_date + ' 00:00:00',
                                end: item.patent_date + ' 00:00:00',
                                title: item.patent_title,
                                number: item.patent_number,
                                combined: item.patent_num_combined_citations,
                                logo: '',
                                assignee,
                                all_assignee: item.assignees
                            })                            
                        })
                        if(allAssignee.length > 0) {
                            const getCompanyLogos = await OrganisationApplication.findAll({
                                where: {organisation_name: allAssignee},
                                group: ['organisation_name']
                            })
                            if(getCompanyLogos.length > 0) {
                                getCompanyLogos.forEach( company => {
                                    citationEvents.forEach( (item, index) => {
                                        if(item.assignee !== null && item.assignee != '' && item.assignee.toString().toLocaleLowerCase() == company.organisation_name.toString().toLocaleLowerCase()){
                                            citationEvents[index].logo = company.original_logo !== '' ? company.original_logo : company.logo_optimize
                                        }
                                    })
                                })
                            }
                        }
                    }
                    if(typeof counter !== 'undefined') {
                        res.status(200).send(`${citationEvents.length}`);
                    } else {
                        res.status(200).json(citationEvents);
                    }
                } else {
                    console.log('ERROR => /citation/', error)
                    if(typeof counter !== 'undefined') {
                        res.status(200).send(`0`);
                    } else {
                        res.status(200).json({});
                    }
                }
            })
        }  else {
            console.log('ERROR => /citation/', error)
            res.status(401).send('Asset number is empty')
        }   
    } catch (e) {
        console.log('ERROR => /citation/', error)
        res.status(500).send('Error while rendering asset details')
    } 
});

route.post("/citation", [authJWT.verifyToken], async (req, res) => { 
    try{
        let { list, total, type, selectedCompanies, tabs, customers, assignments, other_mode } = req.body, assetsLifeSpan = []
        let citedCompanies = []
        if( list != '' ) {
            list = JSON.parse(list)
            const where = { year: 1997, organisationID: req.orgId, layoutID: 15, list}  
            if(parseInt(total) != list.length) {
                /**
                 * Get List
                 */
                let query = '' 
                if(typeof other_mode != 'undefined' && other_mode == 'true') {
                    query = `SELECT grant_doc_num FROM db_new_application.assets_for_sale AS assets WHERE assets.organisation_id = :organisationID `
                } else {                
                    if(typeof type !== 'undefined') {
                        where.layoutID = helpers.findLayout(type)        
                    } 

                    const companies = JSON.parse(selectedCompanies)
                    if(companies.length > 0) {
                        where.company_id = companies
                    }

                
                    if(tabs && tabs != '') {
                        tabs = JSON.parse( tabs )
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

                    query = `SELECT grant_doc_num FROM db_new_application.assets AS assets `


                    query += ` WHERE date_format(assets.appno_date, '%Y') > :year AND assets.layout_id = :layoutID AND assets.organisation_id = :organisationID AND grant_doc_num <> "" `
                    

                    if(Array.isArray(companies) && companies.length > 0) {
                        query += ` AND assets.company_id IN (:company_id)`
                    }

                    if((Array.isArray(assignments) && assignments.length > 0 ) || (Array.isArray(tabs) && tabs.length > 0) || (Array.isArray(customers) && customers.length > 0)) {
                        query += ` AND assets.appno_doc_num IN ( SELECT documentid.appno_doc_num FROM db_uspto.documentid WHERE rf_id  IN ( SELECT activity_parties_transactions.rf_id  FROM db_new_application.activity_parties_transactions WHERE activity_parties_transactions.organisation_id = :organisationID  `

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
                            query += ' AND activity_parties_transactions.activity_id <> 10 ' 
                        } 

                        if(Array.isArray(customers) && customers.length > 0 ) {
                            query += ` AND activity_parties_transactions.assignor_and_assignee_id IN (:customers)`
                        }

                        query += ` GROUP BY activity_parties_transactions.rf_id ) GROUP BY documentid.appno_doc_num) `
                    } else  if(Array.isArray(tabs) && tabs.length === 0) {
                        /**exclude employees */
                        query += ` AND assets.appno_doc_num IN (  SELECT documentid.appno_doc_num FROM db_uspto.documentid WHERE rf_id  IN ( SELECT activity_parties_transactions.rf_id  FROM db_new_application.activity_parties_transactions WHERE activity_parties_transactions.organisation_id = :organisationID   AND activity_parties_transactions.activity_id <> 10   ` 

                        if(Array.isArray(companies) && companies.length > 0 ) {
                            query += ` AND activity_parties_transactions.company_id IN (:company_id) `
                        }

                        query += ` GROUP BY activity_parties_transactions.rf_id )  GROUP BY documentid.appno_doc_num) `
                    }
                }

                query += ` GROUP BY grant_doc_num`;
            } else  {
                query = `SELECT grant_doc_num FROM db_new_application.assets AS assets `
                query += ` WHERE date_format(assets.appno_date, '%Y') > :year AND assets.layout_id = :layoutID AND assets.organisation_id = :organisationID AND grant_doc_num <> "" `
                query += ` AND assets.appno_doc_num IN (:list)`
                query += ` GROUP BY grant_doc_num`;
            }
            const appList =  await connection.applicationNew.query(query,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: where,
            })

            if(appList !== null && appList.length > 0) {
                list = [];
                appList.forEach( row => {
                    list.push(`${row.grant_doc_num}`)
                })
            }
            if( list.length > 0 ) {
                let queryCitedLgo = "SELECT cp.cited_patent_id AS id, cp.patent_number AS number, o.organisation_name AS assignee, o.logo_optimize AS logo, '' AS combined, o.organisation_name AS all_assignee FROM cited_patents AS cp INNER JOIN assignee_organizations AS ao ON ao.assignee_id = cp.assignee_id LEFT JOIN organisations AS o ON o.organisation_id = ao.organisation_id WHERE cp.patent_number IN (:list) "
                citedCompanies =  await connection.applicationNew.query(queryCitedLgo,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    logging: console.log,
                    replacements: {list},
                })
                
                if(citedCompanies.length > 0) {
                    const uniquePatent = []
                    const promise = citedCompanies.map( c => uniquePatent.push(c.number))
                    await Promise.all(promise)

                    const queryDocumentID = "SELECT title, grant_doc_num, grant_date FROM documentid WHERE grant_doc_num IN (:patent) GROUP BY grant_doc_num"

                    const patentList = await connection.resources.query(queryDocumentID,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        logging: console.log,
                        replacements: {patent:uniquePatent },
                    })

                    if(patentList.length > 0) {
                        const patentPromise = patentList.map( async patent => {
                            const findList = citedCompanies.map( (company, index) => {
                                if(patent.grant_doc_num == company.number) {
                                    citedCompanies[index].start = patent.grant_date
                                    citedCompanies[index].end = patent.grant_date
                                    citedCompanies[index].title = patent.title
                                }
                            })
                            await Promise.all(findList)
                        })
                        await Promise.all(patentPromise)
                    }
                }
            }
        }
        res.status(200).json(citedCompanies);
    } catch(error) {
        console.log('ERROR => /citationall/', error)
        res.status(500).send('Error while rendering asset details')
    }
})

module.exports = route;