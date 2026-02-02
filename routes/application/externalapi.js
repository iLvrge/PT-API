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
const helper = require("../../helpers/helper");

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
                }).catch(error => {
                    console.log("Error", error)
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
            res.status(402).send('Invalid inputs')
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
            }).catch( error => {
                console.log('ERROR => /ptab/', error)
                res.send('')
            })

            



        } else {
            console.log('ERROR => /ptab/', )
            res.status(402).send('Invalid inputs')
        }
    } catch (e) {
        console.log('ERROR => /ptab/', e)
        res.status(500).send('Unable to retrieve document')
    }
}) 

async function processPatentResponse(responseBody, asset) {
    //console.log("I am in process");
    if (!responseBody || responseBody.count === 0 || !Array.isArray(responseBody.patents)) {
        return { counter: 0, list: [] };
    }

    let allAssignee = [], assigneeNameMissing = [], individualList = [], citationEvents = [];
    
    helper.saveMissingData(responseBody, asset);
    
    // Process each patent
    responseBody.patents.forEach(item => {
        const itemAssignees = processAssignees(item, individualList);

        // If no assignees, check inventors
        if (itemAssignees.length === 0 && Array.isArray(item.inventors)) {
            processInventors(item, itemAssignees, individualList);
        }

        const appDate = getAppDate(item);
        
        // Add citation events
        if (itemAssignees.length > 0) {
            allAssignee = [...allAssignee, ...itemAssignees];
            itemAssignees.forEach(assignee => addCitationEvent(citationEvents, item, assignee, itemAssignees, appDate, asset));
        } else {
            assigneeNameMissing.push(item.patent_id);
            addCitationEvent(citationEvents, item, '', [], appDate, asset);
        }
    });

    // Fetch missing assignees from the database
    if (assigneeNameMissing.length > 0) {
        await fetchMissingAssignees(assigneeNameMissing, citationEvents, allAssignee);
    }

    // Fetch company logos and update citation events
    if (allAssignee.length > 0) {
        await updateCompanyLogos(allAssignee, citationEvents, individualList);
    }

    return {
        counter: citationEvents.length,
        list: citationEvents
    };
}

function processAssignees(item, individualList) {
    return item.assignees?.map(row => {
        // Check if the organization name is valid
        let assignee = row.assignee_organization || (row.assignee_individual_name_first && row.assignee_individual_name_last ? `${row.assignee_individual_name_first} ${row.assignee_individual_name_last}` : null);
        
        // If the assignee is determined to be a name and it's valid, push to individualList
        if (assignee && assignee !== 'null') {
            if (row.assignee_organization === '') {
                individualList.push(assignee); // Push to individualList only if it's a name
            }
            return assignee; // Return the assignee name or organization
        }
        
        return null; // Return null if no valid assignee found
    }).filter(assignee => assignee !== null) || []; // Filter out null values
}

function processInventors(item, itemAssignees, individualList) {
    item.inventors.forEach(row => {
        const name = `${row.inventor_name_first} ${row.inventor_name_last}`;
        itemAssignees.push(name);
        individualList.push(name);
    });
}

function getAppDate(item) {
    return (item.application?.[0]?.app_date || item.patent_date) + ' 00:00:00';
}


function addCitationEvent(citationEvents, item, assignee, allAssignee, appDate, asset) {
    citationEvents.push({
        id: uuidv4(),
        start: appDate,
        end: appDate,
        title: item.patent_title,
        number: item.patent_id,
        combined: `${asset}_${item.patent_id}`,
        logo: '',
        assignee,
        all_assignee: allAssignee
    });
}

async function fetchMissingAssignees(assigneeNameMissing, citationEvents, allAssignee) {
    const queryAssginee = `SELECT ag.grant_doc_num, ee.name 
                           FROM db_patent_application_bibliographic.assignee AS ee 
                           INNER JOIN db_patent_application_bibliographic.application_grant AS ag 
                           ON ag.appno_doc_num = ee.appno_doc_num
                           WHERE ag.grant_doc_num IN (:patentNumbers)`;

    const findAssignees = await connection.applicationNew.query(queryAssginee, {
        type: connection.Sequelize.QueryTypes.SELECT,
        raw: true,
        replacements: { patentNumbers: assigneeNameMissing },
    });

    findAssignees?.forEach(row => {
        const index = citationEvents.findIndex(c => c.number === row.grant_doc_num);
        if (index !== -1) {
            const event = citationEvents[index];
            event.assignee = row.name; 
            event.all_assignee = event.all_assignee.length === 0 ? [row.name] : [...event.all_assignee, row.name];
            citationEvents[index] = event
            allAssignee.push(row.name);
        }
    });
}

async function updateCompanyLogos(allAssignee, citationEvents, individualList) {
    const companyLogos = await OrganisationApplication.findAll({
        where: { organisation_name: allAssignee },
        group: ['organisation_name'],
    });

    if (companyLogos.length > 0) {
        updateEventLogos(citationEvents, companyLogos, 'organisation_name', 'company');
    }

    if (individualList.length > 0) {
        updateEventLogos(citationEvents, individualList, 'assignee', 'individual');
    }
}

function updateEventLogos(citationEvents, list, assigneeKey, type) {
    citationEvents.forEach((item, index) => {
        const match = list.find(assignee => item.assignee?.toLowerCase() === assignee[assigneeKey]?.toLowerCase());
        if (match) {
            citationEvents[index].logo = (type === 'company')
                ? process.env.STATIC_FILES_URL + (match.original_logo || match.logo_optimize)
                : process.env.STATIC_FILES_URL + 'images/psychology.svg';
        }
    });
}

const makeRequest = (url) => {
    return new Promise((resolve, reject) => {
        const headers = {
            'X-Api-Key': process.env.PATENTS_VIEW_API_KEYS
        };
        request({ url, headers }, (error, response, body) => {
            if (error || response.statusCode !== 200) {
                return reject(error || new Error(`Status Code: ${response.statusCode}`));
            }
            try {
                return resolve(JSON.parse(body));
            } catch (e) {
                return reject(e);
            }
        });
    });
};

route.get("/citation/:asset", [authJWT.verifyToken], async (req, res) => {
    const { asset } = req.params;
    const { counter } = req.query;

    if (!asset) {
        console.error('ERROR => /citation/: Asset number is empty');
        return res.status(400).send('Asset number is empty');
    }
 
    try {
        const citationUrl = `https://search.patentsview.org/api/v1/patent/us_patent_citation/?q=${encodeURIComponent(JSON.stringify({ patent_id: asset }))}&o=${encodeURIComponent(JSON.stringify({ page: 1, per_page: 10000 }))}`;
        const citationData = await makeRequest(citationUrl);
        const { us_patent_citations, count } = citationData;

        if (count === 0) {
            return counter !== undefined ? res.send("0") : res.json([]);
        }

        const citationIds = us_patent_citations.map(c => c.citation_patent_id);
        const query = { patent_id: citationIds };
        const fields = [
            "inventors.inventor_name_first", "inventors.inventor_name_last",
            "assignees.assignee_id", "assignees.assignee_organization",
            "assignees.assignee_individual_name_first", "assignees.assignee_individual_name_last",
            "applicants.applicant_name_first", "applicants.applicant_name_last",
            "application.filing_date", "patent_id", "patent_date", "patent_title"
        ];
        const detailUrl = `https://search.patentsview.org/api/v1/patent/?q=${encodeURIComponent(JSON.stringify(query))}&f=${encodeURIComponent(JSON.stringify(fields))}`;
        const detailData = await makeRequest(detailUrl);

        const { counter: total, list } = await processPatentResponse(detailData, asset);
        return counter !== undefined ? res.send(`${total}`) : res.json(list);

    } catch (err) {
        console.error('ERROR => /citation/:', err.message || err);
        return counter !== undefined ? res.send("0") : res.status(500).json([]);
    }
});

route.post("/citation", [authJWT.verifyToken], async (req, res) => {  
    try{
        let { list, total, type, selectedCompanies, tabs, customers, assignments, other_mode, counter, start, end } = req.body, assetsLifeSpan = []
        let citedCompanies = []
        if( list != '' ) {
            list = JSON.parse(list)
            const where = { year: connection.DEFAULT_YEAR, organisationID: 0 /* req.orgId */, orgID: req.orgId , layoutID: 15, list}  
            if(typeof type !== 'undefined') {
                where.layoutID = helpers.findLayout(type)        
            }
            const companies = JSON.parse(selectedCompanies)
            if(companies.length > 0) {
                where.company_id = companies
            }
            if(req.orgType == 2) {
                /**
                 * Bank Mode
                 */
                where.mode = 1
            }
            let query = '' 
            console.log(parseInt(total), list.length)

            if(assignments && assignments != '') {
                assignments = JSON.parse( assignments )
                where.assignments = assignments
            }     
            
            if(customers && customers != '') {
                customers = JSON.parse( customers )
                console.log(customers)
                where.customers = customers
            }
             
            console.log('assignments', where)
            if(parseInt(total) != list.length) {
                /**
                 * Get List
                 */ 
                if(typeof other_mode != 'undefined' && other_mode == 'true') {
                    query = `SELECT grant_doc_num FROM db_new_application.assets_for_sale AS assets WHERE assets.organisation_id = :orgID `
                    query += ` GROUP BY grant_doc_num`;
                } else {     
                    

                    if(where.layoutID <= 15) {
                        if(tabs && tabs != '') {
                            tabs = JSON.parse( tabs ) 
                            where.tabs = tabs
                        }
    
                        
    
                        query = `SELECT grant_doc_num FROM db_new_application.assets AS assets `
                        query += ` WHERE date_format(assets.appno_date, '%Y') > :year AND assets.layout_id = :layoutID AND ( assets.organisation_id = :organisationID OR assets.organisation_id IS NULL ) AND grant_doc_num <> "" `

                        if(Array.isArray(companies) && companies.length > 0) {
                            query += ` AND assets.company_id IN (:company_id)`
                        } 

                        if((Array.isArray(assignments) && assignments.length > 0 ) || (Array.isArray(tabs) && tabs.length > 0) || (Array.isArray(customers) && customers.length > 0)) {
                            query += ` AND assets.appno_doc_num IN ( SELECT documentid.appno_doc_num FROM db_uspto.documentid WHERE rf_id  IN ( SELECT activity_parties_transactions.rf_id  FROM db_new_application.activity_parties_transactions WHERE (activity_parties_transactions.organisation_id = :organisationID OR activity_parties_transactions.organisation_id IS NULL ) `

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
                            query += ` AND assets.appno_doc_num IN (  SELECT documentid.appno_doc_num FROM db_uspto.documentid WHERE rf_id  IN ( SELECT activity_parties_transactions.rf_id  FROM db_new_application.activity_parties_transactions WHERE (activity_parties_transactions.organisation_id = :organisationID OR activity_parties_transactions.organisation_id IS NULL )   AND activity_parties_transactions.activity_id <> 10   ` 

                            if(Array.isArray(companies) && companies.length > 0 ) {
                                query += ` AND activity_parties_transactions.company_id IN (:company_id) `
                            }

                            query += ` GROUP BY activity_parties_transactions.rf_id )  GROUP BY documentid.appno_doc_num) `
                        }
                        query += ` GROUP BY grant_doc_num`;
                    }  else {
                        query = `SELECT patent AS grant_doc_num FROM db_new_application.dashboard_items AS assets `
                        query += ` WHERE  assets.type = :layoutID AND (assets.organisation_id = :organisationID OR assets.organisation_id IS NULL) ${req.orgType == 2 ? ' AND mode IN (:mode) ' : ''}  AND patent <> "" `

                        if(Array.isArray(companies) && companies.length > 0) {
                            query += ` AND assets.representative_id IN (:company_id)`
                        } 

                        if(Array.isArray(assignments) && assignments.length > 0 ) {
                            query += ` AND assets.rf_id IN (:assignments)`
                        } 
                        query += ` GROUP BY patent`;

                        if(Array.isArray(customers) && customers.length > 0 ) {
                            query = ` SELECT grant_doc_num FROM db_uspto.documentid AS doc INNER JOIN db_new_application.activity_parties_transactions AS apt ON apt.rf_id = doc.rf_id
                            WHERE grant_doc_num IN (${query}) AND (apt.organisation_id = :organisationID OR apt.organisation_id IS NULL) `
                            if(Array.isArray(companies) && companies.length > 0) {
                                query += ` AND apt.company_id IN (:company_id)`
                            } 
    
                            if(Array.isArray(assignments) && assignments.length > 0 ) {
                                query += ` AND apt.rf_id IN (:assignments)`
                            } 

                            if(Array.isArray(customers) && customers.length > 0 ) {
                                query += ` AND apt.assignor_and_assignee_id IN (:customers)`
                            }

                            query += ` GROUP BY grant_doc_num`;  
                        }
                    }
                } 
            } else {
                if(where.layoutID <= 15) {
                    query = `SELECT grant_doc_num FROM db_new_application.assets AS assets `
                    query += ` WHERE date_format(assets.appno_date, '%Y') > :year AND assets.layout_id = :layoutID AND (assets.organisation_id = :organisationID OR assets.organisation_id IS NULL) AND grant_doc_num <> "" `
                    query += ` AND assets.appno_doc_num IN (:list)`
                    query += ` GROUP BY grant_doc_num UNION `;

                    query += `SELECT grant_doc_num COLLATE utf8mb4_general_ci FROM db_patent_application_bibliographic.application_grant AS assets `
                    query += ` WHERE date_format(assets.appno_date, '%Y') > :year AND grant_doc_num <> "" `
                    query += ` AND assets.appno_doc_num IN (:list)`
                    query += ` GROUP BY grant_doc_num `;
    
                    where.layoutID = 15;
                } else {
                    query = `SELECT patent AS grant_doc_num FROM db_new_application.dashboard_items AS assets `
                    query += ` WHERE  assets.type = :layoutID AND (assets.organisation_id = :organisationID OR assets.organisation_id IS NULL) AND patent <> "" `
                    if(Array.isArray(companies) && companies.length > 0) {
                        query += ` AND assets.representative_id IN (:company_id)`
                    } 

                    if(Array.isArray(assignments) && assignments.length > 0 ) {
                        query += ` AND assets.rf_id IN (:assignments)`
                    }
                    query += ` GROUP BY patent`;
                    console.log('customers', Array.isArray(customers), customers.length)
                    if(Array.isArray(customers) && customers.length > 0 ) {
                        query = ` SELECT grant_doc_num FROM db_uspto.documentid AS doc INNER JOIN db_new_application.activity_parties_transactions AS apt ON apt.rf_id = doc.rf_id
                        WHERE grant_doc_num IN (${query}) AND (apt.organisation_id = :organisationID OR apt.organisation_id IS NULL) `
                        if(Array.isArray(companies) && companies.length > 0) {
                            query += ` AND apt.company_id IN (:company_id)`
                        } 

                        if(Array.isArray(assignments) && assignments.length > 0 ) {
                            query += ` AND apt.rf_id IN (:assignments)`
                        } 

                        if(Array.isArray(customers) && customers.length > 0 ) {
                            query += ` AND apt.assignor_and_assignee_id IN (:customers)`
                        }

                        query += ` GROUP BY grant_doc_num`;  
                    }
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
                const replacements =  {
                    list,
                    baseUrl: (process.env.STATIC_FILES_URL || '').replace(/\/$/, '')
                } 

                let queryCitedLogo = "SELECT id, patent_number, number, assignee, logo, COUNT(number) AS combined, start, end, GROUP_CONCAT(assignee) AS all_assignee  FROM ( SELECT cpwa.citing_id AS id, cp.patent_number, cpwa.citing_patent_number AS number, IF(o.organisation_name <> '', o.organisation_name, ao.assignee_organization) AS assignee, cp.assignee_id, IF(o.logo_optimize IS NULL OR o.logo_optimize = '', '', CONCAT(:baseUrl, IF(o.logo_optimize LIKE '/%', o.logo_optimize, CONCAT('/', o.logo_optimize)))) AS logo, cpwa.app_date AS start, cpwa.app_date AS end FROM cited_patents AS cp INNER JOIN assignee_organizations AS ao ON ao.assignee_id = cp.assignee_id LEFT JOIN citing_patents_with_assignee AS cpwa ON cpwa.assignee_id = ao.assignee_id AND cpwa.patent_number = cp.patent_number LEFT JOIN organisations AS o ON o.organisation_id = ao.organisation_id WHERE cpwa.citing_id IS NOT NULL AND cp.patent_number IN (:list) ";

                if(start != '' && end != '') {
                    replacements.start = start
                    replacements.end = end
                    queryCitedLogo += " AND cpwa.app_date BETWEEN :start AND :end "
                } 

                queryCitedLogo += " ) AS temp GROUP BY patent_number, number, assignee_id ORDER BY start DESC "

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