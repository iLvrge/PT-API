const express = require("express"),

    request = require('request'),

    rp = require('request-promise'),

    route = express.Router(),

    authJWT = require("../../helpers/verifyJwtToken"),

    connection = require("../../config/db.config"),

    OrganisationApplication = require("../../model/application/OrganisationApplication"),

    fileSystem = require('fs'),

    generatePdfThumbnails = require('pdf-thumbnail');
    
const { v4: uuidv4  } = require('uuid');

route.get("/ptab/:asset", [authJWT.verifyToken], async (req, res) => { 
    try {
        let {asset} = req.params
        const {counter} = req.query;  
        if(typeof asset !== 'undefined' && asset !== '' && asset !== null) {
            if(asset.toLowerCase().indexOf('us') !== -1){
                asset = asset.substr(2, asset.length)
            }
            const urlProceedings = `https://developer.uspto.gov/ptab-api/proceedings?applicationNumberText=${asset}`,
                  urlDocuments = `https://developer.uspto.gov/ptab-api/documents?applicationNumberText=${asset}`

           
            const optionProceedings = {
                method: 'GET',
                uri: urlProceedings,
                strictSSL: false
            },
            optionDocuments = {
                method: 'GET',
                uri: urlDocuments,
                strictSSL: false
            }
            const events = [], documents = []
            Promise.all([
                rp(optionProceedings)
                .then( body => {
                    let responseBody = JSON.parse(body);
                    console.log(responseBody)
                    const {results, recordTotalQuantity} = responseBody
                    if(results.length > 0) {
                        results.forEach( item => {
                            events.push({
                                id: uuidv4(),
                                start: item.proceedingFilingDate + ' 00:00:00',
                                end: item.proceedingLastModifiedDate + ' 00:00:00',
                                name: `${item.respondentPartyName} / ${item.appellantPartyName}`,
                                status: item.proceedingStatusCategory,
                                otherInfo: item
                            })
                        })
                    }
                })/* ,
                rp(optionDocuments)
                .then( body => {
                    let responseBody = JSON.parse(body);
                    console.log(responseBody)
                    const {results, recordTotalQuantity} = responseBody
                    if(results.length > 0) {
                        results.forEach( document => {
                            documents.push({
                                id: uuidv4(),
                                identifier: document.documentIdentifier,
                                start: document.documentFilingDate,
                                name: document.documentName,
                                status: document.documentCategory,
                                title: document.documentTitleText,
                                otherInfo: document
                            })
                        })
                    }
                }) */
            ]).then( requestComplete => {
                console.log(requestComplete)
                if(typeof counter !== 'undefined') {
                    res.status(200).send(`${events.length}`);
                } else {
                    res.status(200).json([...events, ...documents]);
                }
            })
        } else {
            console.log('ERROR => /ptab/')
            res.status(401).send('Invalid inputs')
        }
    } catch (e) {
        console.log('ERROR => /ptab/', error)
        res.status(500).send('Error while rendering asset details')
    }    
});

route.get("/ptab/document/:identifier",  async (req, res) => { 
    try {
        let {identifier} = req.params
        if(identifier != null) {
            const  urlDocuments = `https://developer.uspto.gov/ptab-api/documents/${identifier}/download`

           
            optionDocuments = {
                method: 'GET',
                uri: urlDocuments,
                accept: 'application/octet-stream',
                strictSSL: false
            }
/*202000274115163901Appeal2021-09-01-13:20:38*/
            rp(optionDocuments)
            .then( body => {
                res.set('Content-Type', 'application/octet-stream')
                res.format({
                    'application/octet-stream': function () {
                        res.send(body)
                    }
                })
            })

            



        } else {
            console.log('ERROR => /ptab/', )
            res.status(401).send('Invalid inputs')
        }
    } catch (e) {
        console.log('ERROR => /ptab/', e)
        res.status(500).send('Unable to retrieve document')
    }
})


route.get("/citation/:asset", [authJWT.verifyToken], async (req, res) => { 
    try {
        const {asset} = req.params
        const {counter} = req.query; 
        if(typeof asset !== 'undefined' && asset !== '' && asset !== null) {
            const queryString = ``
            const url = `https://api.patentsview.org/patents/query?q={"cited_patent_number":"${asset}"}&f=["patent_number","patent_date","patent_num_combined_citations","patent_title","assignee_organization", "app_date"]`
            console.log(url)
            request(url, async(error, response, body) => { 
                if (!error && response.statusCode == 200) {
                    const responseBody = JSON.parse(body)
                    const citationEvents = []
                    if(responseBody !== null && responseBody.total_patent_count > 0) {
                        const allAssignee = [], assigneeNameMissing = '';
                        responseBody.patents.forEach(item => {
                            let assignee = "";
                            if(item.assignees.length > 0) {
                                assignee = item.assignees[item.assignees.length - 1].assignee_organization
                            }
                            if(assignee !== '') {
                                allAssignee.push(assignee)
                            } else {
                                assigneeNameMissing.push(item.patent_number)
                            }
                            let appDate = ''
                            if(item.applications !== null && item.applications.length > 0) {
                                appDate = item.applications[0].app_date + ' 00:00:00'
                            } else {
                                appDate = item.patent_date + ' 00:00:00'
                            }
                            
                            citationEvents.push({
                                id: uuidv4(),
                                start: appDate,
                                end: appDate,
                                title: item.patent_title,
                                number: item.patent_number,
                                combined: item.patent_num_combined_citations,
                                logo: '',
                                assignee,
                                all_assignee: item.assignees
                            })
                        })
                        if(assigneeNameMissing.length > 0) {
                            const queryAssginee = `SELECT ag.grant_doc_num, ee.name from db_patent_application_bibliographic.assignee AS ee INNER JOIN db_patent_application_bibliographic.application_grant AS ag ON ag.appno_doc_num = ee.appno_doc_num
                            where ag.grant_doc_num IN (:patentNumbers) `;

                            const findAssignees =  await connection.applicationNew.query(queryAssginee,{
                                type: connection.Sequelize.QueryTypes.SELECT,
                                raw: true,
                                logging: console.log,
                                replacements: {patentNumbers: assigneeNameMissing},
                            })
                
                            if(findAssignees !== null && findAssignees.length > 0) {
                                findAssignees.forEach( row => {
                                    const findIndex = citationEvents.findIndex( c => c.number == row.grant_doc_num)
                                    if(findIndex !== -1) {
                                        let oldAssignee = citationEvents[findIndex].assignee, oldAllAssignee = citationEvents[findIndex].all_assignee
                                        if(oldAllAssignee.length == 0) {
                                            oldAllAssignee = [row.name];
                                            oldAssignee = row.name
                                        } else {
                                            oldAllAssignee = [...oldAllAssignee, row.name]
                                            oldAssignee = row.name
                                        }
                                        citationEvents[findIndex].assignee = oldAssignee
                                        citationEvents[findIndex].all_assignee = oldAllAssignee

                                        allAssignee.push(row.name)
                                    }
                                })
                            }
                        }
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
        console.log('ERROR => /citation/', e)
        res.status(500).send('Error while rendering asset details')
    } 
});

route.post("/citation", [authJWT.verifyToken], async (req, res) => {  
    try{
        let { list, total, type, selectedCompanies, tabs, customers, assignments, other_mode, counter, start, end } = req.body, assetsLifeSpan = []
        let citedCompanies = []
        if( list != '' ) {
            list = JSON.parse(list)
            const where = { year: connection.DEFAULT_YEAR, organisationID: req.orgId, layoutID: 15, list}  
            if(typeof type !== 'undefined') {
                where.layoutID = helpers.findLayout(type)        
            }
            const companies = JSON.parse(selectedCompanies)
            if(companies.length > 0) {
                where.company_id = companies
            }
            let query = '' 
            console.log(parseInt(total), list.length)
            if(parseInt(total) != list.length) {
                /**
                 * Get List
                 */ 
                if(typeof other_mode != 'undefined' && other_mode == 'true') {
                    query = `SELECT grant_doc_num FROM db_new_application.assets_for_sale AS assets WHERE assets.organisation_id = :organisationID `
                    query += ` GROUP BY grant_doc_num`;
                } else {     
                    if(assignments && assignments != '') {
                        assignments = JSON.parse( assignments )
                        where.assignments = assignments
                    }           
                     
                    console.log('assignments', where)

                    if(where.layoutID <= 15) {
                        if(tabs && tabs != '') {
                            tabs = JSON.parse( tabs ) 
                            where.tabs = tabs
                        }
    
                        if(customers && customers != '') {
                            customers = JSON.parse( customers )
                            where.customers = customers
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
                        query += ` GROUP BY grant_doc_num`;
                    }  else {
                        query = `SELECT patent AS grant_doc_num FROM db_new_application.dashboard_items AS assets `
                        query += ` WHERE  assets.type = :layoutID AND assets.organisation_id = :organisationID AND patent <> "" `

                        if(Array.isArray(companies) && companies.length > 0) {
                            query += ` AND assets.representative_id IN (:company_id)`
                        } 

                        if(Array.isArray(assignments) && assignments.length > 0 ) {
                            query += ` AND assets.rf_id IN (:assignments)`
                        }
                        query += ` GROUP BY patent`;
                    }
                } 
            } else {
                if(where.layoutID <= 15) {
                    query = `SELECT grant_doc_num FROM db_new_application.assets AS assets `
                    query += ` WHERE date_format(assets.appno_date, '%Y') > :year AND assets.layout_id = :layoutID AND assets.organisation_id = :organisationID AND grant_doc_num <> "" `
                    query += ` AND assets.appno_doc_num IN (:list)`
                    query += ` GROUP BY grant_doc_num`;
    
                    where.layoutID = 15;
                } else {
                    query = `SELECT patent AS grant_doc_num FROM db_new_application.dashboard_items AS assets `
                    query += ` WHERE  assets.type = :layoutID AND assets.organisation_id = :organisationID AND patent <> "" `
                    if(Array.isArray(companies) && companies.length > 0) {
                        query += ` AND assets.representative_id IN (:company_id)`
                    } 

                    if(Array.isArray(assignments) && assignments.length > 0 ) {
                        query += ` AND assets.rf_id IN (:assignments)`
                    }
                    query += ` GROUP BY patent`;
                } 
            }
            const appList =  await connection.applicationNew.query(query,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: where,
            })
            list = [];
            if(appList !== null && appList.length > 0) { 
                appList.forEach( row => {
                    list.push(`${row.grant_doc_num}`)
                })
            }
            if( list.length > 0 ) {
                const replacements =  {list}
                let queryCitedLogo = "SELECT cpwa.citing_id AS id, cpwa.citing_patent_number AS number, MAX(o.organisation_name) AS assignee, MAX(o.logo_optimize) AS logo, COUNT(cpwa.citing_patent_number) AS combined, GROUP_CONCAT(o.organisation_name) AS all_assignee, cpwa.app_date AS start, cpwa.app_date AS end FROM cited_patents AS cp INNER JOIN assignee_organizations AS ao ON ao.assignee_id = cp.assignee_id INNER JOIN citing_patents_with_assignee AS cpwa ON cpwa.assignee_id = ao.assignee_id AND cpwa.patent_number = cp.patent_number LEFT JOIN organisations AS o ON o.organisation_id = ao.organisation_id WHERE cp.patent_number IN (:list) ";

                if(start != '' && end != '') {
                    replacements.start = start
                    replacements.end = end
                    queryCitedLogo = " AND cpwa.app_date BETWEEM :start AND :end "
                }


                queryCitedLogo += " GROUP BY cp.patent_number, cpwa.citing_patent_number ORDER BY cpwa.app_date DESC"

                if(typeof counter == 'undefined' ) { 
                    queryCitedLogo += " LIMIT 0, 500";
                }
                citedCompanies =  await connection.applicationNew.query(queryCitedLogo,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    logging: console.log,
                    replacements,
                })
                
                /* if(citedCompanies.length > 0) {
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
                } */
            }
        } 
        if(typeof counter != 'undefined' && counter == 1) {
            res.status(200).send(citedCompanies.length);
        } else {
            res.status(200).json(citedCompanies);
        }
        
    } catch(error) {
        console.log('ERROR => /citationall/', error)
        res.status(500).send('Error while rendering asset details')
    }
})


route.get('/generate_thumbnail', async (req, res) => {
    const pdfURL = req.query.file
    try {
        generatePdfThumbnails(fileSystem.readFileSync('/Users/vivekkapoor/Documents/assignment-pat-49940-821.pdf')).then( data => {
            console.log(data)
            const stream = data.pipe(fileSystem.createWriteStream("./previewBuffer.jpg"))
            stream.on('finish', function () { 
                res.status(200).send(`https://php.patentrack.com/assignment-pat-49940-821.png`);
            });
        });
        
    } catch (err) {
        console.error(err);
    }
})


module.exports = route;