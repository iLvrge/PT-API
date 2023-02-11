
const connection = require("../config/db.config");

const request = require("request");

const rp = require('request-promise');

const FtsQuery = require("full-text-search-query");

const levenshtein = require('fast-levenshtein');

const natural = require("natural");

const levenshteinNatural = natural.LevenshteinDistance;

const { v4: uuidv4  } = require('uuid');

const Organisations = require("../model/business/Organisations");

const BusinessRoles = require("../model/business/Roles");

const Representatives = require("../model/resources/Representatives");

const AssignmentConveyance = require("../model/application/AssignmentConveyance");

const RepresentativeAssignmentConveyance = require("../model/resources/RepresentativeAssignmentConveyance");

const AssignorAndAssignee = require("../model/resources/AssignorAndAssignee");

const ApplicantAssignorAndAssignee = require('../model/resources/ApplicantAssignorAndAssignee'); 

const RepresentativeApplication = require("../model/resources/Representatives");

const Users = require("../model/business/Users");

const Roles = require("../model/client/Roles");

const ShareLink = require("../model/business/ShareLinks");

const Share = require("../model/application/Share");

const ShareLists = require("../model/application/ShareLists");

const ClientRepesentative = require("../model/client/Representatives");

const TreePartiesCollections = require("../model/application/TreePartiesCollections");

const DocumentIds = require("../model/application/DocumentIds");

const Inventors = require("../model/resources/Inventors");

const moment = require('moment');

const { create } = require('xmlbuilder2');

const ASSETS_LIFE_SPAN_DATE_FORMAT = 'YYYY';

const fs = require('fs');
 

/**
 * 
 * @param {*} correspondence 
 * @param {*} assignors
 * @param {*} assignees
 * @param {*} assets
 * 
 * 
 */

const getXML = async(correspondence, assignors, assignees, assets) => {
    const root = create({ version: '1.0' })
            .ele('pat-assignment-template')
                .ele('correspondent')
                    .ele('correspondent-name-address')
                        .ele('name').txt(correspondence.cname).up()
                        .ele('address-1').txt(correspondence.caddress_1 != '' ? correspondence.caddress_1 : 'Address-1').up()
                        .ele('address-2').txt(correspondence.caddress_2 != '' ? correspondence.caddress_2 : 'Address-2').up()
                        .ele('city').txt(correspondence.caddress_3 != '' ? correspondence.caddress_3 : 'City').up()
                        .ele('state').txt(correspondence.caddress_3 != '' ? correspondence.caddress_3 : 'State' ).up()
                        .ele('postal-code').txt(correspondence.caddress_4 != '' ? correspondence.caddress_4 : '00000').up()
                    .up()
                .ele('e-mail').txt(' ').up()
                .ele('fax').txt('000-000-0000').up()
                .ele('phone').txt('000-000-0000').up()
                .up();

    const patConveyingParties = root.ele('pat-conveying-parties')
    for( let i = 0; i < assignors.length; i++ ) {
        console.log('assignors', assignors[i])
        patConveyingParties
        .ele('pat-conveying-party')
            .ele('company')
                .ele('orgname').txt(assignors[i].original_name != '' ? assignors[i].original_name : or_name).up()
            .up()
            .ele('executed-date').txt(moment(new Date(assignors[i].exec_dt)).format('YYYY-MM-DD')).up()
        .up()
    }

    const patReceivingParties = root.ele('pat-receiving-parties')

    for( let i = 0; i < assignees.length; i++ ) {
        console.log('assignees', assignees[i])
        const receivingParty = patReceivingParties.ele('pat-receiving-party')
                                receivingParty
                                    .ele('company')
                                        .ele('orgname').txt(assignees[i].original_name != '' ? assignees[i].original_name : assignees[i].ee_name).up()
                                    .up()
                                receivingParty
                                    .ele('address')
                                        .ele('address-1').txt(assignees[i].ee_address_1).up()
                                        .ele('address-2').txt(assignees[i].ee_address_2).up()
                                        .ele('city').txt(assignees[i].ee_city != '' ? assignees[i].ee_city : 'City').up()
                                        .ele('state').txt(assignees[i].ee_state != '' ? assignees[i].ee_state : 'State').up()
                                        .ele('postal-code').txt(assignees[i].ee_postcode != '' ? assignees[i].ee_postcode.substr(0,5) : '0000').up()
                                    .up()
    }

    const patProperties = root.ele('pat-properties')

    for( let i = 0; i < assets.length; i++ ) {
        if(assets[i].grant_doc_num != '') {
            patProperties
            .ele('pat-property').att('patent', assets[i].grant_doc_num)
            .ele('pat-application-number').txt(assets[i].appno_doc_num).up()
            .up()
        } else {
            patProperties
            .ele('pat-property')
            .ele('pat-application-number').txt(assets[i].appno_doc_num).up()
            .up()
        } 
    }
    const xml = root.end({ prettyPrint: true });

    return xml;
}



/**
 * 
 * @param {SearchCompanies} search 
 */

 
let searchCompany = async(query, t) => {

    let searchTerm, queryCompany, searchResult = [], queryResult = [];

    const stringWithNewLineSplit = query.toString().split(/\r\n|\r|\n/), regex = /[.,]/g, regexFindAmp = /[&]/gm;

    if(stringWithNewLineSplit.length > 0) {
        const promises = stringWithNewLineSplit.map(async searchText => {
            const originalSearch = searchText.toString();
            const splitSearch = originalSearch.split(' ');
            /**
             * const search = originalSearch.replace(regex, '').toLowerCase().trim();
             */
            let search = originalSearch.replace(regex, '').toLowerCase();
            /*if(search.slice(-4) == 'corp' || search.slice(-4) == 'gmbh') {
                search = search.substr(0, search.length - 4);
            } else if(search.slice(-3) == 'ltd' || search.slice(-3) == 'inc'  || search.slice(-3) == ' sl') {
                search = search.substr(0, search.length - 3);
            } else if(search.slice(-2) == 'co') {
                search = search.substr(0, search.length - 2);
            }*/
            //search = search.replace(/\b(?:inc|llc|corp|llp|gmbh|lp|agent|sas|na|bank|co|states|ltd|kk|a\/s)\b/g,'').replace(/^\s+/,"");
            /* if(regexFindAmp.exec(originalSearch) === null){
                if(splitSearch.length > 1){				
                    if(splitSearch.length == 2) {
                        if(splitSearch[1] == '') {
                            searchTerm = `${search} *`;
                        } else {
                            const ftsQuery = new FtsQuery(true);			
                            searchTerm = ftsQuery.transform(search);
                            //searchTerm = `${searchTerm}*`;
                            searchTerm = searchTerm.replace(" AND ", " ");
                            searchTerm = searchTerm.replace(" OR ", " ");
                            searchTerm = searchTerm.replace(" NEAR ", " ");
                            searchTerm = searchTerm.split(' ');
                            searchTerm = searchTerm.join('* ')
                            searchTerm = searchTerm+'*';
                        }
                    } else {
                        const ftsQuery = new FtsQuery(true);			
                        searchTerm = ftsQuery.transform(search);                        
                        searchTerm = searchTerm.replace(" AND ", " ");
                        searchTerm = searchTerm.replace(" OR ", " ");
                        searchTerm = searchTerm.replace(" NEAR ", " ");
                        searchTerm = searchTerm.split(' ');
                        searchTerm = searchTerm.join('* ')
                        searchTerm = searchTerm+'*';
                    }				
                } else {
                    searchTerm = `"${search}"*`;
                }
            } else {
                searchTerm = `"${search}"`;
            } */
            
            console.log("SEARCH:",search);
            /* queryCompany = "SELECT a.assignor_and_assignee_id as id, a.assignor_and_assignee_id, a.name, a.instances as counter, c.representative_name as normalize_name, (select rr.representative_name FROM representative as rr WHERE rr.representative_name = a.name GROUP BY rr.representative_name) as representative_company, (SELECT concat(ass.reel_no,'-', ass.frame_no) FROM assignee as ee INNER JOIN assignment as ass ON ass.rf_id = ee.rf_id  WHERE ee.assignor_and_assignee_id = a.assignor_and_assignee_id  LIMIT 1) as assigneeRFID, (SELECT concat(asss.reel_no,'-', asss.frame_no) FROM assignor as assi INNER JOIN assignment as asss ON asss.rf_id = assi.rf_id WHERE assi.assignor_and_assignee_id = a.assignor_and_assignee_id LIMIT 1) as assignorRFID  FROM assignor_and_assignee as a LEFT JOIN representative as c ON c.representative_id = a.representative_id WHERE MATCH(a.name) AGAINST (:search IN BOOLEAN MODE) GROUP BY a.name ORDER BY counter DESC"; */


           /*  if(t == 0) {
                const queryInventor = `  SELECT given_name FROM db_patent_grant_bibliographic.inventor WHERE MATCH(name) AGAINST (:search IN BOOLEAN MODE) GROUP BY given_name`

                let searchInventor = await connection.resources.query(queryInventor,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    replacements: { search: search },
                    logging: console.log,
                }); 

                if(searchInventor.length > 0) {
                    const allInventor = []
                    const regEx = new RegExp(search.trim(), "ig");
                    const promiseInventor = searchInventor.map( inventor => {
                        const inventorName = inventor.given_name.replace(regEx, '')
                        if(inventorName.trim() !== '') {
                            allInventor.push(`-${inventorName.trim()}`)
                        }                        
                    })

                    const inventorJoin = [...new Set(allInventor)].join(' ')
                    search += ' '+inventorJoin
                }
            } */

            queryCompany = `SELECT a.assignor_and_assignee_id as id, a.assignor_and_assignee_id, a.name COLLATE utf8mb4_general_ci  AS name, a.instances COLLATE utf8mb4_general_ci as counter , c.representative_name as normalize_name, (select rr.representative_name FROM representative as rr WHERE rr.representative_name = a.name GROUP BY rr.representative_name) as representative_company, (SELECT concat(ass.reel_no,'-', ass.frame_no) FROM assignee as ee INNER JOIN assignment as ass ON ass.rf_id = ee.rf_id  WHERE ee.assignor_and_assignee_id = a.assignor_and_assignee_id  LIMIT 1) as assigneeRFID, (SELECT concat(asss.reel_no,'-', asss.frame_no) FROM assignor as assi INNER JOIN assignment as asss ON asss.rf_id = assi.rf_id WHERE assi.assignor_and_assignee_id = a.assignor_and_assignee_id LIMIT 1) as assignorRFID, 0 AS assigneeBibRFID, 0 AS assignorBibRFID, '1' AS flag  FROM assignor_and_assignee as a 
            LEFT JOIN representative as c ON c.representative_id = a.representative_id 
            INNER JOIN LATERAL (Select assignee.assignor_and_assignee_id from assignment
                INNER JOIN assignee ON assignee.rf_id = assignment.rf_id
                WHERE date_format(assignment.record_dt, '%Y') >= :year AND assignee.assignor_and_assignee_id = a.assignor_and_assignee_id
                GROUP BY assignee.ee_name                
                UNION 
                Select assignor.assignor_and_assignee_id from assignment
                INNER JOIN assignor ON assignor.rf_id = assignment.rf_id
                WHERE date_format(assignment.record_dt, '%Y') >= :year AND assignor.assignor_and_assignee_id = a.assignor_and_assignee_id
                GROUP BY assignor.or_name) as tempAssignorAndAssignee ` ;
                
            if(search.length == 1) {
                queryCompany += ` WHERE trim(a.name) = :search `
            } else {
                queryCompany += ` WHERE MATCH(a.name) AGAINST (:search IN BOOLEAN MODE) `
            }
            
            /* queryCompany += ` AND  a.assignor_and_assignee_id NOT IN ( SELECT a.assignor_and_assignee_id FROM db_uspto.assignor AS aor INNER JOIN db_uspto.assignor_and_assignee AS aaa ON aaa.assignor_and_assignee_id = a.assignor_and_assignee_id  INNER JOIN db_uspto.inventors AS inv ON aaa.assignor_and_assignee_id = inv.assignor_and_assignee_id `
            if(search.length == 1) {
                queryCompany += ` WHERE trim(aaa.name) = :search `
            } else {
                queryCompany += ` WHERE MATCH(aaa.name) AGAINST (:search IN BOOLEAN MODE) `
            }
            
            queryCompany += ` GROUP BY a.assignor_and_assignee_id ) ` */
            

            /* if( t == 0 ) {
                queryCompany += `  AND a.assignor_and_assignee_id NOT IN (SELECT assignor_and_assignee_id FROM db_uspto.inventors)`;
            } */

            queryCompany += ` GROUP BY a.name  `;

            /* let querySearchResult = await connection.resources.query(queryCompany,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                replacements: { search: search, year: connection.DEFAULT_YEAR },
                logging: console.log,
            });  */  
            /**
             * Query from Applicant 
             */

            queryApplicant = `SELECT a.assignor_and_assignee_id as id, a.assignor_and_assignee_id, a.name, a.instances as counter, c.representative_name as normalize_name, (select rr.representative_name FROM db_uspto.representative as rr WHERE rr.representative_name = a.name GROUP BY rr.representative_name) as representative_company, (SELECT appno_doc_num FROM db_patent_application_bibliographic.applicant WHERE assignor_and_assignee_id > 0 AND assignor_and_assignee_id = a.assignor_and_assignee_id  LIMIT 1) as assigneeRFID, (SELECT appno_doc_num FROM db_patent_grant_bibliographic.applicant WHERE assignor_and_assignee_id > 0 AND assignor_and_assignee_id = a.assignor_and_assignee_id  LIMIT 1) as assignorRFID, (SELECT appno_doc_num FROM db_patent_application_bibliographic.assignee WHERE assignor_and_assignee_id > 0 AND assignor_and_assignee_id = a.assignor_and_assignee_id LIMIT 1) as assigneeBibRFID, (SELECT appno_doc_num FROM db_patent_grant_bibliographic.assignee WHERE assignor_and_assignee_id > 0 AND assignor_and_assignee_id = a.assignor_and_assignee_id LIMIT 1) as assignorBibRFID, '2' AS flag  FROM db_patent_application_bibliographic.assignor_and_assignee as a 
            LEFT JOIN db_uspto.representative as c ON c.representative_id = a.representative_id ` ; 

            /* queryApplicant = `SELECT a.applicant_and_inventor_id as id, a.applicant_and_inventor_id AS assignor_and_assignee_id, a.name, a.instances as counter, c.representative_name COLLATE utf8mb4_general_ci as normalize_name, (select rr.representative_name FROM db_uspto.representative as rr WHERE rr.representative_name  COLLATE utf8mb4_general_ci = a.name  COLLATE utf8mb4_general_ci GROUP BY rr.representative_name) as representative_company, (
                SELECT appno_doc_num 
                FROM db_patent_examiner_data.application_applicant
                WHERE applicant_inventor_id > 0 
                AND applicant_inventor_id = a.applicant_and_inventor_id LIMIT 1
            ) as assigneeRFID, "" as assignorRFID, "" as assigneeBibRFID, "" as assignorBibRFID, '2' AS flag  FROM db_patent_examiner_data.applicant_and_inventor as a 
            LEFT JOIN db_uspto.representative as c ON c.representative_id  COLLATE utf8mb4_general_ci = a.representative_id  COLLATE utf8mb4_general_ci ` ; */
                 
            if(search.length == 1) {
                queryApplicant += `WHERE trim(a.name) = :search `
            } else {
                queryApplicant += `WHERE MATCH(a.name) AGAINST (:search IN BOOLEAN MODE) `
            }
            //queryApplicant += ` AND a.type = 1 `
            if(t == 1) {
                queryApplicant += ` AND a.type = 0 `
            }

            queryApplicant += ` GROUP BY a.name `;

            let applicantQueryResult = []

 
            let querySearchResult = await connection.resources.query(`SELECT * FROM (${queryCompany} UNION ${queryApplicant}) AS temp ORDER BY counter DESC`,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                replacements: { search: search, year: connection.DEFAULT_YEAR },
                logging: console.log,
            }); 





            let ptabParties = [], filterParties = [];

            const url = `https://developer.uspto.gov/ptab-api/proceedings?patentOwnerName=%22${search.replace(/ /g,'%20')}%22`

            const firstRequest = url + `&recordTotalQuantity=1`
            //require('https').globalAgent.options.ca = require('ssl-root-cas').create();
            /* const option = {
                method: 'GET',
                uri: firstRequest,
                strictSSL: false
            }

            const getRequest = await rp(option)

            console.log(getRequest)
            if(getRequest != '' && getRequest != null) {
               let responseBody = JSON.parse(getRequest);
               let {results, recordTotalQuantity} = responseBody
                if(recordTotalQuantity != undefined && parseInt(recordTotalQuantity) > 0) {
                    if( parseInt(recordTotalQuantity) > 1 ) {
                        const secondRequest = url + `&recordTotalQuantity=${responseBody.recordTotalQuantity}`
                        option.uri = secondRequest

                        const newRequest =  await rp(option)
                        if(newRequest != '' && newRequest != null) {
                            responseBody = JSON.parse(newRequest);
                            if(typeof responseBody.results != 'undefined') {
                                const getNameList = responseBody.results
                                getNameList.forEach(item => {
                                    const {respondentPartyName, appellantPartyName} = item
                                    ptabParties.push(respondentPartyName)
                                })
                            }
                        }
                    }
                }
            }
            ptabParties = [...new Set(ptabParties)] 
            

            const parties = [];

            if(ptabParties != null && ptabParties.length > 0) {
                const findQueryNormalizeParty = "SELECT pp.id, 0 AS assignor_and_assignee_id, pp.name, rr.representative_name AS normalize_name, (select r.representative_name FROM representative as r WHERE r.representative_name = pp.name GROUP BY r.representative_name limit 1) as representative_company, 1 AS counter, '3' AS flag FROM db_uspto.ptab_parties AS pp INNER JOIN db_uspto.representative AS rr ON rr.representative_id = pp.representative_id WHERE name IN (:ptabParties) GROUP BY name";

                const normalizePtabParty = await connection.resources.query(findQueryNormalizeParty,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    replacements: { ptabParties },
                    logging: console.log,
                });
                normalizePtabParty.forEach( row => {
                    parties.push(row.name)
                    filterParties.push(row)
                })

                ptabParties.forEach( party => {
                    if(!parties.includes(party)) {
                        filterParties.push({id: 0, assignor_and_assignee_id: 0, name: party, normalize_name: '', representative_company: '', counter: 0, flag: 3})
                    }
                })
            }*/
            //console.log(filterParties)
            /*
            rp(option)
            .then( body => {
                let responseBody = JSON.parse(body);
                const {results, recordTotalQuantity} = responseBody
                if(recordTotalQuantity != undefined && parseInt(recordTotalQuantity) > 0) {
                    if( parseInt(recordTotalQuantity) > 1 ) {
                        const secondRequest = url + `&recordTotalQuantity=${responseBody.recordTotalQuantity}`
                        option.uri = secondRequest
                        rp(option)
                        .then( body => {
                            responseBody = JSON.parse(body);
                            const {results} = responseBody
                            results.forEach(item => {
                                const {respondentPartyName, appellantPartyName} = item
                                ptabParties.push(respondentPartyName)
                            })
                            N@mish25121815
                        })
                    } else {
                        const {respondentPartyName, appellantPartyName} = responseBody.results[0]
                        ptabParties.push(respondentPartyName)
                    }
                }
            })
            */


            //let querySearchResult = [];
            /* if(querySearchResult.length == 0){
                queryCompany = `SELECT a.assignor_and_assignee_id as id, a.assignor_and_assignee_id, a.name, a.instances as counter, c.representative_name as normalize_name, (select rr.representative_name FROM representative as rr WHERE rr.representative_name = a.name GROUP BY rr.representative_name) as representative_company, (SELECT concat(ass.reel_no,'-', ass.frame_no) FROM assignee as ee INNER JOIN assignment as ass ON ass.rf_id = ee.rf_id WHERE ee.assignor_and_assignee_id = a.assignor_and_assignee_id LIMIT 1) as assigneeRFID, (SELECT concat(asss.reel_no,'-', asss.frame_no) FROM assignor as assi INNER JOIN assignment as asss ON asss.rf_id = assi.rf_id WHERE assi.assignor_and_assignee_id = a.assignor_and_assignee_id LIMIT 1) as assignorRFID  FROM assignor_and_assignee as a LEFT JOIN representative as c ON c.representative_id = a.representative_id WHERE a.name LIKE :search AND flag = :flag GROUP BY a.name`;
                
                querySearchResult = await connection.resources.query(queryCompany,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    replacements: { search: `${search}%`, flag: 0 },
                    logging: console.log,
                  }
                );
                if(querySearchResult.length == 0){
                    queryCompany = `SELECT a.assignor_and_assignee_id as id, a.assignor_and_assignee_id, a.name, a.instances as counter, c.representative_name as normalize_name, (select rr.representative_name FROM representative as rr WHERE rr.representative_name = a.name GROUP BY rr.representative_name) as representative_company, (SELECT concat(ass.reel_no,'-', ass.frame_no) FROM assignee as ee INNER JOIN assignment as ass ON ass.rf_id = ee.rf_id WHERE ee.assignor_and_assignee_id = a.assignor_and_assignee_id LIMIT 1) as assigneeRFID, (SELECT concat(asss.reel_no,'-', asss.frame_no) FROM assignor as assi INNER JOIN assignment as asss ON asss.rf_id = assi.rf_id WHERE assi.assignor_and_assignee_id = a.assignor_and_assignee_id LIMIT 1) as assignorRFID  FROM assignor_and_assignee as a LEFT JOIN representative as c ON c.representative_id = a.representative_id WHERE a.name LIKE :search AND flag = :flag GROUP BY a.name`;
                    
                    querySearchResult = await connection.resources.query(queryCompany,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        replacements: { search: `%${search}%`, flag: 0 },
                        logging: console.log,
                      }
                    );
                }
            } */
            if(querySearchResult.length > 0) {
                queryResult = [...queryResult, ...querySearchResult, ...applicantQueryResult, ...filterParties];
                /*console.log(queryResult);*/
            }
            return [...querySearchResult, ...applicantQueryResult, ...filterParties];
        });
        await Promise.all(promises);
        /*console.log(finalResultOfAllPromises);*/
    }

    /*if(getCompanyData.length > 0) {
        let assignorIDs = [];
        getCompanyData.map(a => assignorIDs.push(a.assignor_and_assignee_id));

        let queryAssignor = "SELECT a.assignor_and_assignee_id as id, a.assignor_and_assignee_id, a.name, a.instances as counter, c.representative_name as normalize_name, (select rr.representative_name FROM representative as rr WHERE rr.representative_name = a.name GROUP BY rr.representative_name) as representative_company  FROM assignor_and_assignee as a LEFT JOIN representative as c ON c.representative_id = a.representative_id WHERE a.assignor_and_assignee_id IN (SELECT a.assignor_and_assignee_id from assignor as a INNER JOIN documentid as d ON d.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aaa ON a.assignor_and_assignee_id = aaa.assignor_and_assignee_id WHERE a.assignor_and_assignee_id IN (:assignorIDs))";

        let assignorData = await connection.resources.query(queryAssignor,{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            replacements: { assignorIDs: assignorIDs },
            logging: console.log,
          }
        );

        let queryAssignee = "SELECT a.assignor_and_assignee_id as id, a.assignor_and_assignee_id, a.name, a.instances as counter, c.representative_name as normalize_name, (select rr.representative_name FROM representative as rr WHERE rr.representative_name = a.name GROUP BY rr.representative_name) as representative_company  FROM assignor_and_assignee as a LEFT JOIN representative as c ON c.representative_id = a.representative_id WHERE a.assignor_and_assignee_id IN (SELECT a.assignor_and_assignee_id from assignee as a INNER JOIN documentid as d ON d.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aaa ON a.assignor_and_assignee_id = aaa.assignor_and_assignee_id WHERE a.assignor_and_assignee_id IN (:assignorIDs))";

        let assigneeData = await connection.resources.query(queryAssignee,{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            replacements: { assignorIDs: assignorIDs },
            logging: console.log,
          }
        );
        let finalResult = [...assignorData, ...assigneeData], uniqueRFIDs = [];
        if(finalResult.length > 0) {
            console.log(finalResult.length);
            finalResult.map(c => {
                if(!uniqueRFIDs.includes(c.assignor_and_assignee_id)){
                    uniqueRFIDs.push(c.assignor_and_assignee_id);
                    queryResult.push(c);
                }
            })
        }   
    }*/
    


    console.log('TTTTT', t)

    if(t == 0) {
        if(queryResult.length > 0) {
            console.log(queryResult.length);
            let allNames = [];
            queryResult.map(company => {
                let companyData = {...company};
                companyData.children = [];
                searchResult.push(companyData);
                allNames.push(company.name)
            })
    
            queryChildCompany = `SELECT a.assignor_and_assignee_id as id, a.name, sum(a.instances) as counter, (SELECT representative_name FROM representative WHERE representative_id = a.representative_id) as normalize_name FROM assignor_and_assignee as a WHERE a.representative_id IN( SELECT representative_id FROM representative WHERE representative_name IN (:name)) GROUP BY a.name`;
    
            getChildCompanyData = await connection.resources.query(queryChildCompany,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                replacements: { name: allNames },
                logging: console.log,
                }
            );
            let parentAdded = [], children = [];
            if(getChildCompanyData.length > 0) {
                getChildCompanyData.map(c => {
                    
                    for(let i = 0; i < searchResult.length; i++) {  
                        if(searchResult[i].name == c.normalize_name){
                            if(!parentAdded.includes(searchResult[i].name)) {
                                parentAdded.push(searchResult[i].name);
                                let parentC = {...searchResult[i]};
                                delete parentC['children'];
                                searchResult[i].children.push(parentC);
                            }
                            if(searchResult[i].name != c.name) {
                                searchResult[i].children.push(c);
                                children.push(c.name);
                            }                            
                        }
                    }
                });
                if(children.length > 0) {
                    children.map(c => {
                        const findIndex = searchResult.findIndex( x => x.name == c);
                        if(findIndex >= 0 && searchResult[findIndex].children.length == 0) {
                            searchResult.splice(findIndex,1);
                        }
                    });
                }
                const promise = searchResult.map( (s, index) => {
                    if(s.children.length > 0) {
                        let total = 0;
                        s.children.map( c => {
                            total += parseInt(c.counter);
                        });
                        if(total > 0) {
                            searchResult[index].counter = total;
                        }
                    }
                });  
                await Promise.all(promise)              
            }
            console.log(searchResult.length)
            searchResult = await searchResult.filter(company => company.name == company.normalize_name || company.normalize_name == null)
            console.log(searchResult.length)
            return searchResult;
        } else {
            return searchResult;
        }
    } else {
        return queryResult;
    }
}

let searchLenders = async( search ) => {
    const queryLender = `SELECT a.assignor_and_assignee_id as id, a.assignor_and_assignee_id, a.name, COUNT(a.name) AS counter, c.representative_name AS normalize_name, (select rr.representative_name FROM representative as rr WHERE rr.representative_name = a.name GROUP BY rr.representative_name) as representative_company, concat(assignment.reel_no,'-', assignment.frame_no) as assigneeRFID, '' as assignorRFID  FROM assignor_and_assignee as a 
    LEFT JOIN representative as c ON c.representative_id = a.representative_id 
    INNER JOIN assignee ON assignee.assignor_and_assignee_id = a.assignor_and_assignee_id
    INNER JOIN assignment ON assignment.rf_id = assignee.rf_id
    INNER JOIN representative_assignment_conveyance ON assignment.rf_id = representative_assignment_conveyance.rf_id
    WHERE representative_assignment_conveyance.convey_ty IN (:conveyanceType) AND date_format(assignment.record_dt, '%Y') >= :year AND MATCH(a.name) AGAINST (:search IN BOOLEAN MODE) GROUP BY a.name ORDER BY counter DESC ` ;

    const querySearchResult = await connection.resources.query(queryLender,{
        type: connection.Sequelize.QueryTypes.SELECT,
        raw: true,
        replacements: { search: search, year: connection.DEFAULT_YEAR, conveyanceType: ['security', 'restatedsecurity'] },
        logging: console.log,
    });

    return querySearchResult;
}

let searchCompanyByAddress = async( address ) => {
    let searchResult = [];
    if(address.length > 1) {

        const queryCompany = "SELECT a.assignor_and_assignee_id as id, a.assignor_and_assignee_id, a.name, COUNT(a.name) AS counter, a.instances as total_occurences, c.representative_name as normalize_name, (select rr.representative_name FROM representative as rr WHERE rr.representative_name = a.name GROUP BY rr.representative_name) as representative_company, CONCAT(assignment.reel_no,'-', assignment.frame_no) AS assigneeRFID, null as assignorRFID  FROM assignor_and_assignee as a LEFT JOIN representative as c ON c.representative_id = a.representative_id INNER JOIN assignee as ass ON ass.assignor_and_assignee_id = a.assignor_and_assignee_id INNER JOIN assignment ON ass.rf_id = assignment.rf_id WHERE date_format(assignment.record_dt, '%Y') >= :year AND MATCH(ass.ee_address_1, ass.ee_address_2) AGAINST (:address IN BOOLEAN MODE)  GROUP BY a.name ORDER BY counter DESC ";

        searchResult = await connection.resources.query(queryCompany,{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            replacements: { address: address, flag: 0, year: connection.DEFAULT_YEAR},
            logging: console.log,
          }
        );
    }

    return searchResult;
}

let searchCompanyByCountry = async( name ) => {
    let searchResult = [];
    if(name.length > 1) {

        const queryCompany = "SELECT a.assignor_and_assignee_id as id, a.assignor_and_assignee_id, a.name, COUNT(a.name) AS counter, a.instances as total_occurences, c.representative_name as normalize_name, (select rr.representative_name FROM representative as rr WHERE rr.representative_name = a.name GROUP BY rr.representative_name) as representative_company, CONCAT(assignment.reel_no,'-', assignment.frame_no) AS assigneeRFID, null as assignorRFID  FROM assignor_and_assignee as a LEFT JOIN representative as c ON c.representative_id = a.representative_id INNER JOIN assignee as ass ON ass.assignor_and_assignee_id = a.assignor_and_assignee_id INNER JOIN assignment ON ass.rf_id = assignment.rf_id WHERE date_format(assignment.record_dt, '%Y') >= :year AND MATCH(ass.ee_country) AGAINST (:name IN BOOLEAN MODE)  GROUP BY a.name ORDER BY counter DESC ";

        searchResult = await connection.resources.query(queryCompany,{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            replacements: { name, flag: 0, year: connection.DEFAULT_YEAR},
            logging: console.log,
          }
        );
    }

    return searchResult;
}

let getAddressDataFromLastTransaction = async( ID, address1, address2 ) => {
    let latestTransaction = null ;
    if(ID > 0) {

        const query = `SELECT representative_id, name FROM assignor_and_assignee WHERE assignor_and_assignee_id = :ID`

        const representative = await connection.resources.query(query,{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            replacements: { ID },
            logging: console.log,
            plain: true
          }
        );
        const replacements = { ID: ID, address1, address2, year: connection.DEFAULT_YEAR, conveyanceType: ['security', 'restatedsecurity'] };
        let representativeQuery = ''
        if(representative !== null && representative.representative_id > 0) {
            const representativeNameQuery =  `SELECT representative_id FROM representative WHERE representative_name = :name`;
            const representativeName = await connection.resources.query(representativeNameQuery,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                replacements: { name: representative.name },
                logging: console.log,
                plain: true
              }
            );

            if(representativeName !== null && representativeName.representative_id > 0) {
                replacements.representativeID = representativeName.representative_id;

                representativeQuery = `SELECT assignor_and_assignee.assignor_and_assignee_id FROM  assignor_and_assignee WHERE
                assignor_and_assignee.representative_id = :representativeID GROUP BY assignor_and_assignee.assignor_and_assignee_id`


                const getLastTransaction = `SELECT assignee.*, ${replacements.representativeID} AS representativeID FROM assignee INNER JOIN assignor ON assignor.rf_id = assignee.rf_id WHERE assignee.assignor_and_assignee_id IN (${representativeQuery}) AND (ee_address_1 = :address1 OR ee_address_2 = :address2) ORDER BY exec_dt DESC LIMIT 1`;

                latestTransaction = await connection.resources.query(getLastTransaction,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    replacements: replacements,
                    logging: console.log,
                    plain: true
                });
            }
        }
    }  
    return  latestTransaction;
}

let getAddressWithTransactionsListByCompanyID = async( ID, type ) => {
    let addresses = [], latestTransaction = null;
    if(ID > 0) {
        const query = `SELECT representative_id, name FROM assignor_and_assignee WHERE assignor_and_assignee_id = :ID`

        const representative = await connection.resources.query(query,{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            replacements: { ID },
            logging: console.log,
            plain: true
          }
        );

        let representativeQuery = ''

        const replacements = { ID: ID, year: connection.DEFAULT_YEAR, conveyanceType: ['security', 'restatedsecurity'] };

        if(representative !== null && representative.representative_id > 0) {
            const representativeNameQuery =  `SELECT representative_id FROM representative WHERE representative_name = :name`;
            const representativeName = await connection.resources.query(representativeNameQuery,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                replacements: { name: representative.name },
                logging: console.log,
                plain: true
              }
            );
            if(representativeName !== null && representativeName.representative_id > 0) {
                replacements.representativeID = representativeName.representative_id
                representativeQuery = `SELECT assignor_and_assignee.assignor_and_assignee_id FROM  assignor_and_assignee WHERE
                assignor_and_assignee.representative_id = :representativeID GROUP BY assignor_and_assignee.assignor_and_assignee_id`
            } else {
                representativeQuery = `:ID`
            }
        } else {
            representativeQuery = `:ID`
        }

       /*  let queryFindIDS = `SELECT address, COUNT(rf_id) AS counter FROM (SELECT ee_address_1 as address, assignee.rf_id FROM assignee 
            INNER JOIN assignment ON assignment.rf_id = assignee.rf_id
            WHERE  date_format(assignment.record_dt, '%Y') >= :year AND ee_address_1 <> '' AND assignor_and_assignee_id IN (${representativeQuery})  
            UNION 
        SELECT ee_address_2 as address, assignee.rf_id FROM assignee 
            INNER JOIN assignment ON assignment.rf_id = assignee.rf_id
            WHERE  date_format(assignment.record_dt, '%Y') >= :year AND ee_address_2 <> '' AND assignor_and_assignee_id  IN (${representativeQuery}) 
            ) as temp GROUP BY address  ORDER BY address ASC`; */

        let queryFindIDS = `SELECT address, COUNT(rf_id) AS counter, ee_address_1, ee_address_2, ee_city, ee_state, ee_postcode, ee_country FROM (
        SELECT ee_address_1, ee_address_2, ee_city, ee_state, ee_postcode, ee_country, TRIM(CONCAT(ee_address_1, ee_address_2, ' ',ee_city, ' ',ee_state, ' ', ee_postcode, ' ', ee_country)) as address, assignee.rf_id FROM assignee 
            INNER JOIN assignment ON assignment.rf_id = assignee.rf_id
            WHERE  date_format(assignment.record_dt, '%Y') >= :year AND (ee_address_1 <> '' OR ee_address_2 <> '') AND assignor_and_assignee_id  IN (${representativeQuery}) 
            ) as temp GROUP BY address  ORDER BY address ASC`;

        if(isNaN(type) === false && type == 1) { 
            queryFindIDS = `SELECT address, COUNT(rf_id) AS counter  FROM (SELECT ee_address_1 as address, assignee.rf_id FROM assignee 
                INNER JOIN assignment ON assignment.rf_id = assignee.rf_id
                INNER JOIN representative_assignment_conveyance ON assignment.rf_id = representative_assignment_conveyance.rf_id
                WHERE representative_assignment_conveyance.convey_ty IN (:conveyanceType) AND date_format(assignment.record_dt, '%Y') >= :year AND ee_address_1 <> '' AND assignor_and_assignee_id IN (${representativeQuery}) 
                UNION 
            SELECT ee_address_2 as address, assignee.rf_id FROM assignee 
                INNER JOIN assignment ON assignment.rf_id = assignee.rf_id
                INNER JOIN representative_assignment_conveyance ON assignment.rf_id = representative_assignment_conveyance.rf_id
                WHERE representative_assignment_conveyance.convey_ty IN (:conveyanceType) AND date_format(assignment.record_dt, '%Y') >= :year AND ee_address_2 <> '' AND assignor_and_assignee_id IN (${representativeQuery}) 
                ) as temp GROUP BY address  ORDER BY address ASC`;
        }

        const getLastTransaction = `SELECT TRIM(CONCAT(ee_address_1, ee_address_2, ' ', ee_city, ' ', ee_state, ' ', ee_postcode, ' ', ee_country)) as address, ee_address_1, ee_address_2, ee_city, ee_state, ee_postcode, ee_country FROM assignee INNER JOIN assignor ON assignor.rf_id = assignee.rf_id WHERE assignee.assignor_and_assignee_id IN (${representativeQuery}) AND (ee_address_1 <> '' OR ee_address_2 <> '') ORDER BY exec_dt DESC LIMIT 1`;

        latestTransaction = await connection.resources.query(getLastTransaction,{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            replacements: replacements,
            logging: console.log,
            plain: true
          }
        );

        addresses = await connection.resources.query(queryFindIDS,{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            replacements: replacements,
            logging: console.log,
          }
        );
    }
    return {list: addresses, latestTransaction };
}

let getAddressListByApplicantID = async( ID ) => {
    let addresses = [];
    if(ID > 0) {
        const query = `SELECT representative_id, name FROM db_patent_application_bibliographic.assignor_and_assignee WHERE assignor_and_assignee_id = :ID`

        const representative = await connection.resources.query(query,{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            replacements: { ID },
            logging: console.log,
            plain: true
        });
        const replacements = { ID: ID};
        if(representative !== null && representative.representative_id > 0) {
            const representativeNameQuery =  `SELECT representative_id FROM db_uspto.representative WHERE representative_name = :name`;
            const representativeName = await connection.resources.query(representativeNameQuery,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                replacements: { name: representative.name },
                logging: console.log,
                plain: true
              }
            );
            if(representativeName !== null && representativeName.representative_id > 0) {
                replacements.representativeID = representativeName.representative_id
                representativeQuery = `SELECT assignor_and_assignee.assignor_and_assignee_id FROM db_patent_application_bibliographic.assignor_and_assignee WHERE
                assignor_and_assignee.representative_id = :representativeID GROUP BY assignor_and_assignee.assignor_and_assignee_id`
            } else {
                representativeQuery = `:ID`
            }
        } else {
            representativeQuery = `:ID`
        }
        let queryFindIDS = `SELECT address, appno_doc_num FROM (
                SELECT address_1 as address, appno_doc_num FROM db_patent_application_bibliographic.applicant 
                WHERE  address_1 <> '' AND assignor_and_assignee_id IN (${representativeQuery})  GROUP BY address_1
            UNION 
                SELECT address_2 as address, appno_doc_num FROM db_patent_application_bibliographic.applicant 
                WHERE address_2 <> '' AND assignor_and_assignee_id  IN (${representativeQuery}) 
                GROUP BY address_2
            UNION
                SELECT address_1 as address, appno_doc_num FROM db_patent_grant_bibliographic.applicant 
                WHERE  address_1 <> '' AND assignor_and_assignee_id IN (${representativeQuery})  GROUP BY address_1
            UNION 
                SELECT address_2 as address, appno_doc_num FROM db_patent_grant_bibliographic.applicant 
                WHERE address_2 <> '' AND assignor_and_assignee_id  IN (${representativeQuery}) 
                GROUP BY address_2
            UNION 
                SELECT address_1 as address, appno_doc_num FROM db_patent_application_bibliographic.assignee 
                WHERE  address_1 <> '' AND assignor_and_assignee_id IN (${representativeQuery})  GROUP BY address_1
            UNION 
                SELECT address_2 as address, appno_doc_num FROM db_patent_application_bibliographic.assignee 
                WHERE address_2 <> '' AND assignor_and_assignee_id  IN (${representativeQuery}) 
                GROUP BY address_2
            UNION
                SELECT address_1 as address, appno_doc_num FROM db_patent_grant_bibliographic.assignee 
                WHERE  address_1 <> '' AND assignor_and_assignee_id IN (${representativeQuery})  GROUP BY address_1
            UNION 
                SELECT address_2 as address, appno_doc_num FROM db_patent_grant_bibliographic.assignee 
                WHERE address_2 <> '' AND assignor_and_assignee_id  IN (${representativeQuery}) 
                GROUP BY address_2
            
        ) as temp GROUP BY address  ORDER BY address ASC`;

        addresses = await connection.resources.query(queryFindIDS,{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            replacements: replacements,
            logging: console.log,
            }
        );
    }
    return addresses
}

let getAddressListByCompanyID = async( ID, type ) => {
    let addresses = [];
    if(ID > 0) {
        const query = `SELECT representative_id, name FROM assignor_and_assignee WHERE assignor_and_assignee_id = :ID`

        const representative = await connection.resources.query(query,{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            replacements: { ID },
            logging: console.log,
            plain: true
          }
        );

        let representativeQuery = ''

        const replacements = { ID: ID, year: connection.DEFAULT_YEAR, conveyanceType: ['security', 'restatedsecurity'] };

        if(representative !== null && representative.representative_id > 0) {
            const representativeNameQuery =  `SELECT representative_id FROM representative WHERE representative_name = :name`;
            const representativeName = await connection.resources.query(representativeNameQuery,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                replacements: { name: representative.name },
                logging: console.log,
                plain: true
              }
            );
            if(representativeName !== null && representativeName.representative_id > 0) {
                replacements.representativeID = representativeName.representative_id
                representativeQuery = `SELECT assignor_and_assignee.assignor_and_assignee_id FROM  assignor_and_assignee WHERE
                assignor_and_assignee.representative_id = :representativeID GROUP BY assignor_and_assignee.assignor_and_assignee_id`
            } else {
                representativeQuery = `:ID`
            }
        } else {
            representativeQuery = `:ID`
        }

        let queryFindIDS = `SELECT address, rf_id FROM (SELECT ee_address_1 as address, assignee.rf_id FROM assignee 
            INNER JOIN assignment ON assignment.rf_id = assignee.rf_id
            WHERE  date_format(assignment.record_dt, '%Y') >= :year AND ee_address_1 <> '' AND assignor_and_assignee_id IN (${representativeQuery})  GROUP BY ee_address_1
            UNION 
        SELECT ee_address_2 as address, assignee.rf_id FROM assignee 
            INNER JOIN assignment ON assignment.rf_id = assignee.rf_id
            WHERE  date_format(assignment.record_dt, '%Y') >= :year AND ee_address_2 <> '' AND assignor_and_assignee_id  IN (${representativeQuery}) 
            GROUP BY ee_address_2) as temp GROUP BY address  ORDER BY address ASC`;

        if(isNaN(type) === false && type == 1) { 
            queryFindIDS = `SELECT address, rf_id FROM (SELECT ee_address_1 as address, assignee.rf_id FROM assignee 
                INNER JOIN assignment ON assignment.rf_id = assignee.rf_id
                INNER JOIN representative_assignment_conveyance ON assignment.rf_id = representative_assignment_conveyance.rf_id
                WHERE representative_assignment_conveyance.convey_ty IN (:conveyanceType) AND date_format(assignment.record_dt, '%Y') >= :year AND ee_address_1 <> '' AND assignor_and_assignee_id IN (${representativeQuery}) GROUP BY ee_address_1
                UNION 
            SELECT ee_address_2 as address, assignee.rf_id FROM assignee 
                INNER JOIN assignment ON assignment.rf_id = assignee.rf_id
                INNER JOIN representative_assignment_conveyance ON assignment.rf_id = representative_assignment_conveyance.rf_id
                WHERE representative_assignment_conveyance.convey_ty IN (:conveyanceType) AND date_format(assignment.record_dt, '%Y') >= :year AND ee_address_2 <> '' AND assignor_and_assignee_id IN (${representativeQuery}) 
                GROUP BY ee_address_2) as temp GROUP BY address  ORDER BY address ASC`;
        }

        addresses = await connection.resources.query(queryFindIDS,{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            replacements: replacements,
            logging: console.log,
          }
        );
    }
    return addresses;
}

const removeSpaces = (str) => {
    str = str.replace(/,/g, " ").trim();
    str = str.replace(/\s/g, " ").trim();
    str = str.replace(/ {2,}/g, ' ').trim();
    str = str.replace(/\./g, "").trim();
    str = str.replace(/!/g, " ").trim();
    return str
}


let getAddressListByLawfirmID = async( ID ) => {
    let addresses = [];
    if(ID > 0) {
        const query = `SELECT representative_id, name FROM law_firm WHERE law_firm_id = :ID`

        const representative = await connection.resources.query(query,{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            replacements: { ID },
            logging: console.log,
            plain: true
          }
        );

        let allLawFirms = []
        if(representative !== null){
            allLawFirms.push(representative.name)
            const name = removeSpaces(representative.name)
            allLawFirms.push(name)
            if(representative.representative_id > 0) {
                const representativeNameQuery =  `SELECT name FROM  law_firm WHERE
                representative_id IN (SELECT representative_id FROM representative_law_firm WHERE representative_name = :name) GROUP BY name`;
                const allNames = await connection.resources.query(representativeNameQuery,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    replacements: { name: representative.name },
                    logging: console.log, 
                });
                if(allNames.length > 0) {
                    const promise = allNames.map(item => {
                        if(!allLawFirms.includes(item.name)) {
                            allLawFirms.includes(item.name)
                            const name = removeSpaces(item.name)
                            allLawFirms.push(name)
                        }
                    })
                    await Promise.all(promise)
                }
            }
        } 
        const replacements = { ID: ID, year: connection.DEFAULT_YEAR, names: allLawFirms };  

        const queryFindIDS = `SELECT address, rf_id FROM (
            SELECT cor.caddress_7 as address, ass.rf_id FROM correspondent AS cor
            INNER JOIN assignment AS ass ON ass.rf_id = cor.rf_id
            WHERE  date_format(ass.record_dt, '%Y') >= :year AND (ass.cname IN (:names) OR ass.caddress_1 IN (:names))  AND cor.caddress_7 <> '' 
            GROUP BY address
            UNION
            SELECT cor.caddress_5 as address, ass.rf_id FROM correspondent  AS cor
            INNER JOIN assignment AS ass ON ass.rf_id = cor.rf_id
            WHERE  date_format(ass.record_dt, '%Y') >= :year AND (ass.cname IN (:names) OR ass.caddress_1 IN (:names))  AND cor.caddress_5 <> '' 
            GROUP BY address
            UNION
            SELECT cor.caddress_6 as address, ass.rf_id FROM correspondent  AS cor
            INNER JOIN assignment AS ass ON ass.rf_id = cor.rf_id
            WHERE  date_format(ass.record_dt, '%Y') >= :year AND (ass.cname IN (:names) OR ass.caddress_1 IN (:names))  AND cor.caddress_6 <> '' 
            GROUP BY address
            UNION
            SELECT cor.caddress_3 as address, ass.rf_id FROM correspondent  AS cor
            INNER JOIN assignment AS ass ON ass.rf_id = cor.rf_id
            WHERE  date_format(ass.record_dt, '%Y') >= :year AND (ass.cname IN (:names) OR ass.caddress_1 IN (:names))  AND cor.caddress_3 <> '' 
            GROUP BY address
            UNION
            SELECT cor.caddress_4 as address, ass.rf_id FROM correspondent  AS cor
            INNER JOIN assignment AS ass ON ass.rf_id = cor.rf_id
            WHERE  date_format(ass.record_dt, '%Y') >= :year AND (ass.cname IN (:names) OR ass.caddress_1 IN (:names))  AND cor.caddress_4 <> '' 
            GROUP BY address
            UNION
            SELECT cor.caddress_2 as address, ass.rf_id FROM correspondent  AS cor
            INNER JOIN assignment AS ass ON ass.rf_id = cor.rf_id
            WHERE  date_format(ass.record_dt, '%Y') >= :year AND (ass.cname IN (:names) OR ass.caddress_1 IN (:names))   AND cor.caddress_2 <> '' 
            GROUP BY address
            UNION
            SELECT cor.caddress_1 as address, ass.rf_id FROM correspondent  AS cor
            INNER JOIN assignment AS ass ON ass.rf_id = cor.rf_id
            WHERE  date_format(ass.record_dt, '%Y') >= :year AND (ass.cname IN (:names) OR ass.caddress_1 IN (:names))   AND cor.caddress_1 <> '' 
            GROUP BY address
        ) as temp GROUP BY address  ORDER BY address ASC`;

        addresses = await connection.resources.query(queryFindIDS,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                replacements: replacements,
                logging: console.log,
            }
        );
    }
    return addresses;
}

let searchLawfirmIDByAddress = async( addresses ) => {
    let searchResult = [];
    try{
        if(addresses.length > 0) {
            const listAddress = []
            if(typeof addresses.map === 'function' ) {
                const promise = addresses.map(address => listAddress.push('"'+ address + '"'))
                Promise.all(promise)
            } else {
                listAddress.push('"'+ addresses + '"')
            }
            

            const queryCompany = "SELECT law_firms.law_firm_id, name, assignment.rf_id AS rf_id, assignment.reel_no, assignment.frame_no, COUNT(law_firms.law_firm_id) AS counter, instances AS total_occurences, representative_law_firm.representative_id, representative_law_firm.representative_name FROM db_uspto.law_firm AS law_firms LEFT JOIN db_uspto.representative_law_firm AS representative_law_firm ON representative_law_firm.representative_id =  law_firms.representative_id INNER JOIN (SELECT rf_id, cname, caddress_1 FROM correspondent AS cor WHERE MATCH(cor.caddress_7, cor.caddress_5, cor.caddress_6, cor.caddress_3, cor.caddress_4, cor.caddress_2, cor.caddress_1) AGAINST (:address IN BOOLEAN MODE) GROUP BY rf_id ) as temp ON temp.cname = law_firms.name INNER JOIN assignment ON assignment.rf_id = temp.rf_id AND date_format(assignment.record_dt, '%Y') >= :year GROUP BY law_firms.name ORDER BY counter DESC ";
       
            searchResult = await connection.resources.query(queryCompany,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                replacements: { address: listAddress.join(' '), flag: 0, year: connection.DEFAULT_YEAR},
                logging: console.log,
                }
            );      
        }
    } catch (e) {
        console.log(e)
    }
    
    return searchResult;
}


let searchCompanyIDByAddress = async( addresses, type ) => {
    let searchResult = [];
    try{
        if(addresses.length > 0) {
            const listAddress = []
            if(typeof addresses.map === 'function' ) {
                const promise = addresses.map(address => listAddress.push('"'+ address + '"'))
                Promise.all(promise)
            } else {
                listAddress.push('"'+ addresses + '"')
            }
            let queryCompany = "SELECT a.assignor_and_assignee_id as id, a.assignor_and_assignee_id, a.name, a.instances AS counter, COUNT(name) AS total_occurences, c.representative_name AS normalize_name, (select rr.representative_name FROM representative AS rr WHERE rr.representative_name = a.name GROUP BY rr.representative_name) AS representative_company, concat(assignment.reel_no,'-', assignment.frame_no) AS assigneeRFID,  null AS assignorRFID  FROM assignor_and_assignee AS a LEFT JOIN representative AS c ON c.representative_id = a.representative_id INNER JOIN assignee AS ass ON ass.assignor_and_assignee_id = a.assignor_and_assignee_id INNER JOIN assignment ON ass.rf_id = assignment.rf_id WHERE date_format(assignment.record_dt, '%Y') >= :year AND MATCH(ass.ee_address_1, ass.ee_address_2) AGAINST (:address IN BOOLEAN MODE)  GROUP BY a.name ORDER BY counter DESC ";

            if(isNaN(type) === false && type == 1) {
                queryCompany = "SELECT a.assignor_and_assignee_id AS id, a.assignor_and_assignee_id, a.name, a.instances AS counter, COUNT(name) AS total_occurences, c.representative_name AS normalize_name, (select rr.representative_name FROM representative AS rr WHERE rr.representative_name = a.name GROUP BY rr.representative_name) AS representative_company, concat(assignment.reel_no,'-', assignment.frame_no) AS assigneeRFID, null AS assignorRFID FROM assignor_and_assignee AS a LEFT JOIN representative AS c ON c.representative_id = a.representative_id INNER JOIN assignee AS ass ON ass.assignor_and_assignee_id = a.assignor_and_assignee_id INNER JOIN assignment ON ass.rf_id = assignment.rf_id INNER JOIN representative_assignment_conveyance ON assignment.rf_id = representative_assignment_conveyance.rf_id WHERE representative_assignment_conveyance.convey_ty IN (:conveyanceType) AND date_format(assignment.record_dt, '%Y') >= :year AND MATCH(ass.ee_address_1, ass.ee_address_2) AGAINST (:address IN BOOLEAN MODE) GROUP BY a.name ORDER BY counter DESC ";
            }
        
            searchResult = await connection.resources.query(queryCompany,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                replacements: { address: listAddress.join(' '), flag: 0, year: connection.DEFAULT_YEAR, conveyanceType: ['security', 'restatedsecurity']},
                logging: console.log,
                }
            );   
            
            if(searchResult.length == 0) {
                let  replacements = {flag: 0, year: connection.DEFAULT_YEAR}

                if(isNaN(type) === false && type == 1) {
                    replacements.conveyanceType = ['security', 'restatedsecurity']
                }
                queryCompany = ''
                if(typeof addresses.map === 'function' ) {
                    const promise = addresses.map( (address, index) => {
                        replacements[`address${index}`] = address
                        if(isNaN(type) === false && type == 1) {
                            queryCompany += `SELECT a.assignor_and_assignee_id as id, a.assignor_and_assignee_id, a.name, a.instances AS counter, c.representative_name AS normalize_name, (select rr.representative_name FROM representative AS rr WHERE rr.representative_name = a.name GROUP BY rr.representative_name) AS representative_company, concat(assignment.reel_no,'-', assignment.frame_no) AS assigneeRFID,  null AS assignorRFID  FROM assignor_and_assignee AS a LEFT JOIN representative AS c ON c.representative_id = a.representative_id INNER JOIN assignee AS ass ON ass.assignor_and_assignee_id = a.assignor_and_assignee_id INNER JOIN assignment ON ass.rf_id = assignment.rf_id INNER JOIN representative_assignment_conveyance ON assignment.rf_id = representative_assignment_conveyance.rf_id WHERE representative_assignment_conveyance.convey_ty IN (:conveyanceType) AND date_format(assignment.record_dt, '%Y') >= :year AND (ass.ee_address_1 = :address${index} OR ass.ee_address_2 = :address${index}) UNION `
                        } else {
                            queryCompany += `SELECT a.assignor_and_assignee_id as id, a.assignor_and_assignee_id, a.name, a.instances AS counter, c.representative_name AS normalize_name, (select rr.representative_name FROM representative AS rr WHERE rr.representative_name = a.name GROUP BY rr.representative_name) AS representative_company, concat(assignment.reel_no,'-', assignment.frame_no) AS assigneeRFID,  null AS assignorRFID  FROM assignor_and_assignee AS a LEFT JOIN representative AS c ON c.representative_id = a.representative_id INNER JOIN assignee AS ass ON ass.assignor_and_assignee_id = a.assignor_and_assignee_id INNER JOIN assignment ON ass.rf_id = assignment.rf_id WHERE date_format(assignment.record_dt, '%Y') >= :year AND (ass.ee_address_1 = :address${index} OR ass.ee_address_2 = :address${index}) UNION `
                        }                   
                    })
                    Promise.all(promise)
                    
                } else {    
                    replacements[`address`] = addresses
                    if(isNaN(type) === false && type == 1) {
                        queryCompany += `SELECT a.assignor_and_assignee_id as id, a.assignor_and_assignee_id, a.name, a.instances AS counter, c.representative_name AS normalize_name, (select rr.representative_name FROM representative AS rr WHERE rr.representative_name = a.name GROUP BY rr.representative_name) AS representative_company, concat(assignment.reel_no,'-', assignment.frame_no) AS assigneeRFID,  null AS assignorRFID  FROM assignor_and_assignee AS a LEFT JOIN representative AS c ON c.representative_id = a.representative_id INNER JOIN assignee AS ass ON ass.assignor_and_assignee_id = a.assignor_and_assignee_id INNER JOIN assignment ON ass.rf_id = assignment.rf_id INNER JOIN representative_assignment_conveyance ON assignment.rf_id = representative_assignment_conveyance.rf_id WHERE representative_assignment_conveyance.convey_ty IN (:conveyanceType) AND date_format(assignment.record_dt, '%Y') >= :year AND (ass.ee_address_1 = :address OR ass.ee_address_2 = :address) UNION `
                    } else {
                        queryCompany += `SELECT a.assignor_and_assignee_id as id, a.assignor_and_assignee_id, a.name, a.instances AS counter, c.representative_name AS normalize_name, (select rr.representative_name FROM representative AS rr WHERE rr.representative_name = a.name GROUP BY rr.representative_name) AS representative_company, concat(assignment.reel_no,'-', assignment.frame_no) AS assigneeRFID,  null AS assignorRFID  FROM assignor_and_assignee AS a LEFT JOIN representative AS c ON c.representative_id = a.representative_id INNER JOIN assignee AS ass ON ass.assignor_and_assignee_id = a.assignor_and_assignee_id INNER JOIN assignment ON ass.rf_id = assignment.rf_id WHERE date_format(assignment.record_dt, '%Y') >= :year AND (ass.ee_address_1 = :address OR ass.ee_address_2 = :address) UNION `
                    } 
                }
                queryCompany = queryCompany.substr(0, queryCompany.length - 6)
                queryCompany = `SELECT id, assignor_and_assignee_id, name, counter, COUNT(name) AS total_occurences, normalize_name, representative_company, assigneeRFID, assignorRFID FROM (${queryCompany}) as temp GROUP BY name ORDER BY counter DESC`
                searchResult = await connection.resources.query(queryCompany,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    replacements: replacements,     
                    logging: console.log,
                    }
                );  

            }
        }
    } catch (e) {
        console.log(e)
    }
    
    return searchResult;
}

let getDifference = (arrayA, arrayB, result) =>{
    return arrayB.filter(function(item) {
            return arrayA.indexOf(item) === -1;    
    });
}

let allTransactionEntities = async( conveyanceType) => {

    let cType = ['security', 'restatedsecurity'];

    let queryTransaction = '';
    
    if(conveyanceType === 'borrowers') {
        queryTransaction = `SELECT aaa.assignor_and_assignee_id, aaa.name, count(distinct(a.rf_id)) as counter, r.representative_name as normalize_name, (SELECT rr.representative_name FROM representative as rr WHERE rr.representative_name = aaa.name GROUP BY rr.representative_name) as representative_company, '0' as count_assets FROM assignment as a INNER JOIN assignor as aa ON aa.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = aa.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE a.rf_id IN(SELECT rf_id FROM documentid as d WHERE rf_id IN (Select rf_id FROM representative_assignment_conveyance as rac WHERE  rac.convey_ty IN (:conveyanceType)) GROUP BY rf_id) GROUP BY aaa.name`;
    } else {
        queryTransaction = `SELECT aaa.assignor_and_assignee_id, aaa.name, count(distinct(a.rf_id)) as counter, r.representative_name as normalize_name, (SELECT rr.representative_name FROM representative as rr WHERE rr.representative_name = aaa.name GROUP BY rr.representative_name) as representative_company FROM assignment as a INNER JOIN assignee as aa ON aa.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = aa.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE a.rf_id IN(SELECT rf_id FROM documentid as d WHERE rf_id IN (Select rf_id FROM representative_assignment_conveyance as rac WHERE  rac.convey_ty IN (:conveyanceType)) GROUP BY rf_id) GROUP BY aaa.name`;
    }
    

    let getList = await connection.resources.query(queryTransaction,{
        type: connection.Sequelize.QueryTypes.SELECT,
        raw: true,
        replacements: { conveyanceType:  cType},
        logging: console.log,
        }
    );

    cType = ['release'];

    let getList2 = [];

    if(conveyanceType != 'borrowers') {
        queryTransaction = `SELECT aaa.assignor_and_assignee_id, aaa.name, count(distinct(a.rf_id)) as counter, r.representative_name as normalize_name, (SELECT rr.representative_name FROM representative as rr WHERE rr.representative_name = aaa.name GROUP BY rr.representative_name) as representative_company FROM assignment as a INNER JOIN assignor as aa ON aa.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = aa.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE a.rf_id IN(SELECT rf_id FROM documentid as d WHERE rf_id IN (Select rf_id FROM representative_assignment_conveyance as rac WHERE  rac.convey_ty IN (:conveyanceType)) GROUP BY rf_id) GROUP BY aaa.name`;

        getList2 = await connection.resources.query(queryTransaction,{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            replacements: { conveyanceType:  cType},
            logging: console.log,
            }
        );
    } 


    const customer_list = [...getList, ...getList2];  
    console.log(customer_list.length);
    let list = [];
    
    if(customer_list.length > 0) {
        let IDs = [];
        customer_list.forEach( async customer => {
            if(!IDs.includes(customer.assignor_and_assignee_id)){
                await IDs.push(customer.assignor_and_assignee_id);
            }
        })
        if(conveyanceType != 'borrowers') {            
            const promises = IDs.map(async id => {
                let getList = await customer_list.filter( customer => {
                    return id == customer.assignor_and_assignee_id ? customer : undefined;
                });
                if(getList != undefined && getList.length > 0){
                    let getCounter = await getList.reduce((a, b) => +a + +b.counter, 0);
                    list.push({id: getList[0].assignor_and_assignee_id, assignor_and_assignee_id: getList[0].assignor_and_assignee_id, name: getList[0].name, normalize_name: getList[0].normalize_name, counter: getCounter, representative_company: getList[0].representative_company});
                }
                return id;
            });
            await Promise.all(promises);
            console.log(IDs.length);
        } else {
            list = customer_list;
        }
    }
    console.log(list.length);
    return list;
};

let findEntityAssets = async (assignorAssigneeID) => {
    let countAssets = 0;
    const queryFindHoldingAssets = "Select count(*) as countAssets FROM (SELECT appno_doc_num FROM documentid WHERE rf_id IN (SELECT `ee`.rf_id  from assignee as `ee` INNER JOIN assignment_conveyance as ac ON ac.rf_id = ee.rf_id WHERE ee.assignor_and_assignee_id = :assignorAssigneeID AND ac.convey_ty IN (:conveyanceType)) AND appno_doc_num NOT IN (SELECT appno_doc_num FROM documentid WHERE rf_id IN (SELECT `or`.rf_id  FROM assignor as `or` INNER JOIN assignment_conveyance as ac ON ac.rf_id = or.rf_id WHERE or.assignor_and_assignee_id = :assignorAssigneeID AND ac.convey_ty IN (:conveyanceType)) GROUP BY appno_doc_num) GROUP BY appno_doc_num) as temp";


    let findCounter = await connection.resources.query(queryFindHoldingAssets,{
        type: connection.Sequelize.QueryTypes.SELECT,
        replacements: { conveyanceType: ["assignment","partialassignment","namechg","merger","employee", "courtappointment", "courtorder"], assignorAssigneeID: assignorAssigneeID },
        raw: true,
        plain: true,
        logging: console.log,
        }
    );

    if(findCounter != null && findCounter.countAssets > 0) {
        countAssets = findCounter.countAssets;
    }

    return countAssets;
    
}

let findOrganisationbyID = async (organisationID) => {
    return await Organisations.findOne({
                    where: {organisation_id: organisationID}
                });
}

let findRepresentative = async (OrganisationName) => {
    return await RepresentativeApplication.findOne({
        where:{representative_name: OrganisationName}
    });
}

let allAssignments = async (customerID, req) => {
    let queryAllAssignments = "", assignmentsList = [];
    console.log('allAssignments')
    if(parseInt(customerID) > 0) {        
        let org = await findOrganisationbyID( customerID );
        
        if(org != null && org.organisation_id > 0) {
            
            const findRepresentative = await getCompaniesList(req.connection_db);
            if(findRepresentative != null && findRepresentative.length > 0) {
                let representativeID = [];
                findRepresentative.map(e => representativeID.push(e.representative_id)); 
                queryAllAssignments = "Select a.rf_id as id, a.convey_text as text, (SELECT GROUP_CONCAT(or_name) FROM assignor WHERE assignor.rf_id = a.rf_id) as assingor, (SELECT GROUP_CONCAT(ee_name) FROM assignee WHERE assignee.rf_id = a.rf_id) as assingee, CONCAT(a.reel_no, '/', a.frame_no) as reel_frame, a.frame_no, a.reel_no , ac.convey_ty, rac.convey_ty as updated_convey_ty,  CASE  WHEN rac.convey_ty = 'assignment' THEN 0 WHEN rac.convey_ty = 'addresschg' THEN 1	 WHEN rac.convey_ty = 'correct' THEN 2	 WHEN rac.convey_ty = 'courtappointment' THEN 3	 WHEN rac.convey_ty = 'courtorder' THEN 4	 WHEN rac.convey_ty = 'employee' THEN 5	 WHEN rac.convey_ty = 'govern' THEN 6	 WHEN rac.convey_ty = 'license' THEN 7	 WHEN rac.convey_ty = 'licenseend' THEN 8	 WHEN rac.convey_ty = 'missing' THEN 9	 WHEN rac.convey_ty = 'merger' THEN 10	 WHEN rac.convey_ty = 'namechg' THEN 11	 WHEN rac.convey_ty = 'option' THEN 12	 WHEN rac.convey_ty = 'other' THEN 13	 WHEN rac.convey_ty = 'partialassignment' THEN 14	 WHEN rac.convey_ty = 'release' THEN 15	 WHEN rac.convey_ty = 'restatedsecurity' THEN 16	 WHEN rac.convey_ty = 'security' THEN 17  WHEN rac.convey_ty='correspondchange' THEN 18	WHEN rac.convey_ty='partialrelease' THEN 19 ELSE '' END as assignment_convey_ty FROM db_uspto.assignment as a INNER JOIN db_uspto.assignment_conveyance as ac ON ac.rf_id = a.rf_id LEFT JOIN db_uspto.representative_assignment_conveyance as rac ON rac.rf_id = a.rf_id INNER JOIN assignor AS aor ON aor.rf_id = a.rf_id AND date_format(aor.exec_dt, '%Y') > :year WHERE a.rf_id IN (SELECT rf_id FROM documentid WHERE appno_doc_num IN ( SELECT d.appno_doc_num FROM db_uspto.documentid as d WHERE appno_doc_num <> '' AND  d.rf_id IN (SELECT rf_id FROM db_uspto.list2 WHERE organisation_id = :organisationID ) GROUP BY d.appno_doc_num ) GROUP BY rf_id) GROUP BY a.rf_id"; 

                /* queryAllAssignments = "SELECT a.rf_id as id, a.convey_text as text, CONCAT(a.reel_no, '/', a.frame_no) as reel_frame, a.frame_no, a.reel_no , ac.convey_ty, rac.convey_ty as updated_convey_ty, CASE WHEN rac.convey_ty = 'assignment' THEN 0 WHEN rac.convey_ty = 'addresschg' THEN 1 WHEN rac.convey_ty = 'correct' THEN 2 WHEN rac.convey_ty = 'courtappointment' THEN 3 WHEN rac.convey_ty = 'courtorder' THEN 4 WHEN rac.convey_ty = 'employee' THEN 5 WHEN rac.convey_ty = 'govern' THEN 6 WHEN rac.convey_ty = 'license' THEN 7 WHEN rac.convey_ty = 'licenseend' THEN 8 WHEN rac.convey_ty = 'missing' THEN 9 WHEN rac.convey_ty = 'merger' THEN 10 WHEN rac.convey_ty = 'namechg' THEN 11 WHEN rac.convey_ty = 'option' THEN 12 WHEN rac.convey_ty = 'other' THEN 13 WHEN rac.convey_ty = 'partialassignment' THEN 14 WHEN rac.convey_ty = 'release' THEN 15  WHEN rac.convey_ty = 'restatedsecurity' THEN 16 WHEN rac.convey_ty = 'security' THEN 17 ELSE '' END as assignment_convey_ty FROM db_application.assignment as a INNER JOIN db_application.assignment_conveyance as ac ON ac.rf_id = a.rf_id LEFT JOIN db_uspto.representative_assignment_conveyance as rac ON rac.rf_id = a.rf_id WHERE a.convey_text <> '' AND a.convey_text IS NOT NULL AND a.rf_id IN (SELECT d.rf_id FROM db_application.documentid as d WHERE appno_doc_num <> '' AND d.rf_id IN (SELECT rf_id FROM assignee WHERE rf_id IN (SELECT rf_id FROM db_uspto.representative_transactions WHERE organisation_id = :organisationID AND representative_id IN (:representativeID))) OR d.rf_id IN(SELECT rf_id FROM assignor WHERE rf_id IN (SELECT rf_id FROM db_uspto.representative_transactions WHERE organisation_id = :organisationID AND representative_id IN (:representativeID))) GROUP BY d.rf_id)"; */

                assignmentsList =  await connection.resources.query(queryAllAssignments,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    replacements: { year: connection.DEFAULT_YEAR,  organisationID: org.organisation_id  },
                    raw: true,
                    logging: console.log,
                    }
                );

                /* const queryAllConveyance = "Select ac.convey_ty as name from assignment as a INNER JOIN assignment_conveyance as ac ON ac.rf_id = a.rf_id  WHERE a.convey_text <> '' AND a.convey_text IS NOT NULL AND a.rf_id IN (SELECT d.rf_id FROM documentid as d WHERE appno_doc_num <> '' AND  d.rf_id IN (SELECT rf_id FROM db_uspto.representative_transactions WHERE organisation_id = :organisationID AND representative_id IN (:representativeID)) GROUP BY d.rf_id) GROUP BY ac.convey_ty";

                conveyanceList =  await connection.resources.query(queryAllConveyance,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    replacements: { organisationID: org.organisation_id, representativeID: representativeID },
                    raw: true,
                    logging: console.log,
                    }
                ); */
                
                /* let queryFindMainCompany = "SELECT rf_id FROM representative_transactions WHERE organisation_id = :organisationID AND representative_id IN (:representativeID) ";

                let listIDs = await connection.resources.query(queryFindMainCompany,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    replacements: { organisationID: org.organisation_id, representativeID: representativeID },
                    raw: true,
                    logging: console.log,
                    }
                ); */
                //if(listIDs != null && listIDs.length > 0) {
                    /*let assgnorAssigneeIDS = [], names = [];*/
                    //let rawRfIDs = [];
                    //listIDs.map(e => rawRfIDs.push(e.rf_id));
                    
                    /*let queryAssigneeRFIDs = "SELECT rf_id FROM assignee as ac WHERE ac.rf_id IN (:IDs)";
            
                    assigneeRFIDs = await connection.application.query(queryAssigneeRFIDs,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: { IDs: rawRfIDs },
                        raw: true,
                        logging: console.log,
                        }
                    );
        
                    let queryAssignorRFIDs = "SELECT rf_id FROM assignor as ac WHERE ac.rf_id IN (:IDs)";
        
                    assignorRFIDs = await connection.application.query(queryAssignorRFIDs,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: { IDs: rawRfIDs },
                        raw: true,
                        logging: console.log,
                        }
                    );
        
                    rfIDsList = [...assigneeRFIDs, ...assignorRFIDs];    */
                        
        
                    //let rfIDs = [];
                    //rfIDsList.map( r => rfIDs.push(r.rf_id));

                    /* if(rawRfIDs.length > 0) {
                        queryAllAssignments = "Select a.rf_id as id, a.convey_text as text, CONCAT(a.reel_no, '/', a.frame_no) as reel_frame, a.frame_no, a.reel_no , ac.convey_ty, rac.convey_ty as updated_convey_ty,  CASE  WHEN rac.convey_ty = 'assignment' THEN 0 WHEN rac.convey_ty = 'addresschg' THEN 1	 WHEN rac.convey_ty = 'correct' THEN 2	 WHEN rac.convey_ty = 'courtappointment' THEN 3	 WHEN rac.convey_ty = 'courtorder' THEN 4	 WHEN rac.convey_ty = 'employee' THEN 5	 WHEN rac.convey_ty = 'govern' THEN 6	 WHEN rac.convey_ty = 'license' THEN 7	 WHEN rac.convey_ty = 'licenseend' THEN 8	 WHEN rac.convey_ty = 'missing' THEN 9	 WHEN rac.convey_ty = 'merger' THEN 10	 WHEN rac.convey_ty = 'namechg' THEN 11	 WHEN rac.convey_ty = 'option' THEN 12	 WHEN rac.convey_ty = 'other' THEN 13	 WHEN rac.convey_ty = 'partialassignment' THEN 14	 WHEN rac.convey_ty = 'release' THEN 15	 WHEN rac.convey_ty = 'restatedsecurity' THEN 16	 WHEN rac.convey_ty = 'security' THEN 17	 ELSE '' END as assignment_convey_ty from assignment as a INNER JOIN assignment_conveyance as ac ON ac.rf_id = a.rf_id LEFT JOIN representative_assignment_conveyance as rac ON rac.rf_id = a.rf_id WHERE a.convey_text <> '' AND a.convey_text IS NOT NULL AND a.rf_id IN (SELECT d.rf_id FROM documentid as d WHERE appno_doc_num <> '' AND  d.rf_id IN (:rfIDs) GROUP BY d.rf_id) ";
    
                        assignmentsList =  await connection.resources.query(queryAllAssignments,{
                            type: connection.Sequelize.QueryTypes.SELECT,
                            replacements: { rfIDs: rawRfIDs },
                            raw: true,
                            logging: console.log,
                            }
                        );
                    } */
                //}
            }
        }
    } else {
        /*queryAllAssignments = "Select a.rf_id as id, a.convey_text as text, null as reel_frame, count(a.convey_text) as counter, ac.convey_ty, rac.convey_ty as updated_convey_ty, CASE  WHEN rac.convey_ty = 'assignment' THEN 0  WHEN rac.convey_ty = 'addresschg' THEN 1 WHEN rac.convey_ty = 'correct' THEN 2	 WHEN rac.convey_ty = 'courtappointment' THEN 3	 WHEN rac.convey_ty = 'courtorder' THEN 4 WHEN rac.convey_ty = 'employee' THEN 5 WHEN rac.convey_ty = 'govern' THEN 6	 WHEN rac.convey_ty = 'license' THEN 7	 WHEN rac.convey_ty = 'licenseend' THEN 8	 WHEN rac.convey_ty = 'missing' THEN 9	 WHEN rac.convey_ty = 'merger' THEN 10	 WHEN rac.convey_ty = 'namechg' THEN 11	 WHEN rac.convey_ty = 'option' THEN 12	 WHEN rac.convey_ty = 'other' THEN 13	 WHEN rac.convey_ty = 'partialassignment' THEN 14	 WHEN rac.convey_ty = 'release' THEN 15	 WHEN rac.convey_ty = 'restatedsecurity' THEN 16	 WHEN rac.convey_ty = 'security' THEN 17 ELSE '' END as assignment_convey_ty FROM assignment as a INNER JOIN assignment_conveyance as ac ON ac.rf_id = a.rf_id INNER JOIN representative_assignment_conveyance as rac ON rac.rf_id = a.rf_id WHERE a.convey_text <> '' AND a.convey_text IS NOT NULL GROUP BY a.convey_text, updated_convey_ty";*/

        const search = req.query.search, replacements = {};

        queryAllAssignments = "SELECT id, text, reel_frame, counter, convey_ty, updated_convey_ty FROM assignment_group ";
        
        if(search != "" && search != undefined) {
            const splitSearch = search.toString().split(' ');
            /* if(splitSearch.length > 1){				
                if(splitSearch.length == 2) {
                    if(splitSearch[1] == '') {
                        searchTerm = `${search} *`;
                    } else {
                        const ftsQuery = new FtsQuery(true);			
                        searchTerm = ftsQuery.transform(search);
                        searchTerm = `${searchTerm}*`;
                        searchTerm = searchTerm.replace(" AND ", " ");
                        searchTerm = searchTerm.replace(" OR ", " ");
                        searchTerm = searchTerm.replace(" NEAR ", " ");
                    }
                } else {
                    const ftsQuery = new FtsQuery(true);			
                    searchTerm = ftsQuery.transform(search);
                    if(!!searchTerm.indexOf('"')){
                        searchTerm = `${searchTerm}*`;
                    }
                    searchTerm = searchTerm.replace(" AND ", " ");
                    searchTerm = searchTerm.replace(" OR ", " ");
                    searchTerm = searchTerm.replace(" NEAR ", " ");
                }				
            } else {
                searchTerm = `${search}*`;
            } */
            queryAllAssignments += " WHERE MATCH(text) AGAINST (:search IN BOOLEAN MODE) ";
            /* replacements.search =  searchTerm ; */
            replacements.search =  search ;

        }

        queryAllAssignments += " GROUP BY text, updated_convey_ty";

        
        
        assignmentsList =  await connection.resources.query(queryAllAssignments,{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            replacements: replacements,
            logging: console.log,
          }
        );

        /*if(assignmentsList.length == 0){
            queryAllAssignments = "SELECT id, text, reel_frame, counter, convey_ty, updated_convey_ty FROM assignment_group WHERE text = :search GROUP BY text, updated_convey_ty";
            assignmentsList =  await connection.resources.query(queryAllAssignments,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                replacements: { search: `${search}%` },
                logging: console.log,
              }
            );
            if(assignmentsList.length == 0){
                queryAllAssignments = "SELECT id, text, reel_frame, counter, convey_ty, updated_convey_ty FROM assignment_group WHERE text = :search GROUP BY text, updated_convey_ty";
            }
            assignmentsList =  await connection.resources.query(queryAllAssignments,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                replacements: { search: `%${search}%` },
                logging: console.log,
              }
            );

            /* const queryAllConveyance = "Select ac.convey_ty as name from assignment as a INNER JOIN assignment_conveyance as ac ON ac.rf_id = a.rf_id  WHERE a.convey_text <> '' AND a.convey_text IS NOT NULL AND a.rf_id IN (SELECT d.rf_id FROM documentid as d WHERE appno_doc_num <> '' AND  d.rf_id IN (SELECT rf_id FROM db_uspto.representative_transactions WHERE organisation_id = :organisationID AND representative_id IN (:representativeID)) GROUP BY d.rf_id) GROUP BY ac.convey_ty";

            conveyanceList =  await connection.resources.query(queryAllConveyance,{
                type: connection.Sequelize.QueryTypes.SELECT,
                replacements: { organisationID: org.organisation_id, representativeID: representativeID },
                raw: true,
                logging: console.log,
                }
            ); */
        /*}*/        
    } 
    return assignmentsList;
}

let findAllLawFirms = async (customerID, representativeIDs, req ) => {

   /* let queryAllLawFirms = "", lawFirmList = [];
    if(parseInt(customerID) > 0) {      

    } else {
        queryAllLawFirms = "SELECT law_firm_id, name, instances as counter,  FROM law_firm as l"
    }*/
}


let allAssignmentsByRepresentativeIDs = async (customerID, representativeIDs, req) => {
    let queryAllAssignments = "", assignmentsList = [], conveyanceList = [], updateConveyanceList = [];
    if(parseInt(customerID) > 0) {
        let org = await findOrganisationbyID( customerID );
    
        if(org != null && org.organisation_id > 0) {

            if(representativeIDs != null && representativeIDs.length > 0) {
                console.log("allAssignmentsByRepresentativeIDs")
                 
                let queryAssigneeAssignorRFIDs = "Select a.rf_id as id, a.convey_text as text, (SELECT GROUP_CONCAT(or_name) FROM assignor WHERE assignor.rf_id = a.rf_id) as assingor, (SELECT GROUP_CONCAT(ee_name) FROM assignee WHERE assignee.rf_id = a.rf_id) as assingee, CONCAT(a.reel_no, '/', a.frame_no) as reel_frame, a.frame_no, a.reel_no , ac.convey_ty, rac.convey_ty as updated_convey_ty,  CASE  WHEN rac.convey_ty = 'assignment' THEN 0 WHEN rac.convey_ty = 'addresschg' THEN 1	 WHEN rac.convey_ty = 'correct' THEN 2	 WHEN rac.convey_ty = 'courtappointment' THEN 3	 WHEN rac.convey_ty = 'courtorder' THEN 4	 WHEN rac.convey_ty = 'employee' THEN 5	 WHEN rac.convey_ty = 'govern' THEN 6	 WHEN rac.convey_ty = 'license' THEN 7	 WHEN rac.convey_ty = 'licenseend' THEN 8	 WHEN rac.convey_ty = 'missing' THEN 9	 WHEN rac.convey_ty = 'merger' THEN 10	 WHEN rac.convey_ty = 'namechg' THEN 11	 WHEN rac.convey_ty = 'option' THEN 12	 WHEN rac.convey_ty = 'other' THEN 13	 WHEN rac.convey_ty = 'partialassignment' THEN 14	WHEN rac.convey_ty = 'release' THEN 15	 WHEN rac.convey_ty = 'restatedsecurity' THEN 16 WHEN rac.convey_ty = 'security' THEN 17  WHEN rac.convey_ty='correspondchange' THEN 18	WHEN rac.convey_ty='partialrelease' THEN 19 ELSE '' END as assignment_convey_ty FROM assignment as a INNER JOIN assignment_conveyance as ac ON ac.rf_id = a.rf_id LEFT JOIN representative_assignment_conveyance as rac ON rac.rf_id = a.rf_id INNER JOIN assignor AS aor ON aor.rf_id = a.rf_id AND date_format(aor.exec_dt, '%Y') > :year WHERE a.convey_text <> '' AND a.convey_text IS NOT NULL AND a.rf_id IN (SELECT d.rf_id FROM documentid as d WHERE appno_doc_num IN (SELECT appno_doc_num FROM documentid WHERE appno_doc_num <> '' AND rf_id IN (SELECT rf_id FROM list2 WHERE organisation_id = :organisationID AND company_id IN (:representativeID)) GROUP BY appno_doc_num ) GROUP BY d.rf_id) GROUP BY a.rf_id";
            
                assignmentsList = await connection.resources.query(queryAssigneeAssignorRFIDs,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    replacements: {  year: connection.DEFAULT_YEAR, organisationID: org.organisation_id, representativeID: representativeIDs },
                    raw: true,
                    logging: console.log,
                    }
                );
    
                const queryAllConveyance = "SELECT ac.convey_ty as name FROM assignment_conveyance AS ac INNER JOIN assignor AS aor ON aor.rf_id = ac.rf_id AND date_format(aor.exec_dt, '%Y') > :year WHERE ac.rf_id IN (SELECT d.rf_id FROM documentid as d WHERE appno_doc_num IN (SELECT appno_doc_num FROM documentid WHERE appno_doc_num <> '' AND rf_id IN (SELECT rf_id FROM list2 WHERE organisation_id = :organisationID AND company_id IN (:representativeID)) GROUP BY appno_doc_num ) GROUP BY d.rf_id) GROUP BY ac.convey_ty";

                conveyanceList =  await connection.resources.query(queryAllConveyance,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    replacements: { year: connection.DEFAULT_YEAR, organisationID: org.organisation_id, representativeID: representativeIDs },
                    raw: true,
                    logging: console.log,
                    }
                );

                const queryAllUpdateConveyance = "SELECT ac.convey_ty as name FROM representative_assignment_conveyance AS ac INNER JOIN assignor AS aor ON aor.rf_id = ac.rf_id AND date_format(aor.exec_dt, '%Y') > :year WHERE ac.rf_id IN (SELECT d.rf_id FROM documentid as d WHERE appno_doc_num IN (SELECT appno_doc_num FROM documentid WHERE appno_doc_num <> '' AND rf_id IN (SELECT rf_id FROM list2 WHERE organisation_id = :organisationID AND company_id IN (:representativeID)) GROUP BY appno_doc_num ) GROUP BY d.rf_id) GROUP BY ac.convey_ty";

                updateConveyanceList =  await connection.resources.query(queryAllUpdateConveyance,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    replacements: { year: connection.DEFAULT_YEAR, organisationID: org.organisation_id, representativeID: representativeIDs },
                    raw: true,
                    logging: console.log,
                    }
                );
            }
        }
    }
    return {list: assignmentsList, conveyance: conveyanceList, update_conveyance: updateConveyanceList} ;
}

let getCompanyListByEmployee = async(companyName) => {

    let queryEmployee = "SELECT ac.or_name as name, c1.company_name as normalize_name, 'Invented' as type FROM assignor as ac INNER JOIN (SELECT a.rf_id FROM assignment as a INNER JOIN assignment_conveyance as ass ON ass.rf_id = a.rf_id INNER JOIN assignee as acc ON acc.rf_id = a.rf_id LEFT JOIN representative as c ON c.representative_id = acc.representative_id WHERE ass.convey_ty = :convey_type AND ass.employer_assign = 1 AND (acc.ee_name = :name OR c.company_name = :name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id LEFT JOIN representative as c1 ON c1.representative_id = ac.representative_id GROUP BY name, normalize_name ORDER BY normalize_name ASC, name ASC ";

    let allCustomers =  await connection.resources.query(queryEmployee,{
        type: connection.Sequelize.QueryTypes.SELECT,
        replacements: { name: companyName, convey_type: 'assignment' },
        raw: true,
        logging: console.log,
      }
    );

    return allCustomers;
}

let getCompanyListByOwnership = async(companyName) => {

    /*Merger, Employee, Assignment, Sale*/

    let allCustomers = [];

    let queryPurchase = "SELECT ac.or_name as name, c1.company_name as normalize_name, 'Purchased' as type FROM assignor as ac INNER JOIN (SELECT a.rf_id FROM assignment as a INNER JOIN assignment_conveyance as ass ON ass.rf_id = a.rf_id INNER JOIN assignee as acc ON acc.rf_id = a.rf_id LEFT JOIN representative as c ON c.representative_id = acc.representative_id WHERE ass.convey_ty = :convey_type AND ass.employer_assign = 0 AND (acc.ee_name = :name OR c.company_name = :name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id LEFT JOIN representative as c1 ON c1.representative_id = ac.representative_id GROUP BY name, normalize_name ORDER BY normalize_name ASC, name ASC ";

    let getPurchaseData = await csv.query(queryPurchase,{
        type: connection.Sequelize.QueryTypes.SELECT,
        replacements: { name: companyName, convey_type: 'assignment' },
        raw: true,
        logging: console.log,
      }
    );

    let querySale = "SELECT ac.ee_name as name, c1.company_name as normalize_name, 'Sale' as type FROM assignee as ac INNER JOIN (SELECT a.rf_id FROM assignment as a INNER JOIN assignment_conveyance as ass ON ass.rf_id = a.rf_id INNER JOIN assignor as acc ON acc.rf_id = a.rf_id LEFT JOIN representative as c ON c.representative_id = acc.representative_id WHERE ass.convey_ty = :convey_type AND (acc.or_name = :name OR c.company_name = :name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id LEFT JOIN representative as c1 ON c1.representative_id = ac.representative_id GROUP BY name, normalize_name ORDER BY normalize_name ASC, name ASC ";
									
    let getSaleData = await csv.query(querySale,{
        type: connection.Sequelize.QueryTypes.SELECT,
        replacements: { name: companyName, convey_type: 'assignment' },
        raw: true,
        logging: console.log,
        }
    );

    let queryMergerIn = "SELECT ac.or_name as name, c1.company_name as normalize_name, 'MergerIn' as type FROM assignor as ac INNER JOIN (SELECT a.rf_id FROM assignment as a INNER JOIN assignment_conveyance as ass ON ass.rf_id = a.rf_id INNER JOIN assignee as acc ON acc.rf_id = a.rf_id LEFT JOIN representative as c ON c.representative_id = acc.representative_id WHERE ass.convey_ty = :convey_type AND ass.employer_assign = 0 AND (acc.ee_name = :name OR c.company_name = :name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id LEFT JOIN representative as c1 ON c1.representative_id = ac.representative_id GROUP BY name, normalize_name ORDER BY normalize_name ASC, name ASC ";
									
    let getMergerInData = await csv.query(queryMergerIn,{
        type: connection.Sequelize.QueryTypes.SELECT,
        replacements: { name: companyName, convey_type: 'merger' },
        raw: true,
        logging: console.log,
        }
    );

    let queryMergerOut = "SELECT ac.ee_name as name, c1.company_name as normalize_name, 'MergerOut' as type FROM assignee as ac INNER JOIN (SELECT a.rf_id FROM assignment as a INNER JOIN assignment_conveyance as ass ON ass.rf_id = a.rf_id INNER JOIN assignor as acc ON acc.rf_id = a.rf_id LEFT JOIN representative as c ON c.representative_id = acc.representative_id WHERE ass.convey_ty = :convey_type AND (acc.or_name = :name OR c.company_name = :name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id LEFT JOIN representative as c1 ON c1.representative_id = ac.representative_id GROUP BY name, normalize_name ORDER BY normalize_name ASC, name ASC ";
									
    let getMergerOutData = await csv.query(queryMergerOut,{
        type: connection.Sequelize.QueryTypes.SELECT,
        replacements: { name: companyName, convey_type: 'merger' },
        raw: true,
        logging: console.log,
        }
    );
    
    allCustomers = [...getPurchaseData, ...getSaleData, ...getMergerInData, ...getMergerOutData];	

    return allCustomers;
}

let getCompanyListBySecurity = async(companyName) => {

    /*Security, Release */

    let allCustomers = [];

    let querySecurity = "SELECT ac.ee_name as name, c1.company_name as normalize_name, 'Security' as type FROM assignee as ac INNER JOIN (SELECT a.rf_id FROM assignment as a INNER JOIN assignment_conveyance as ass ON ass.rf_id = a.rf_id INNER JOIN assignor as acc ON acc.rf_id = a.rf_id LEFT JOIN representative as c ON c.representative_id = acc.representative_id WHERE ass.convey_ty = :convey_type AND (acc.or_name = :name OR c.company_name = :name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id LEFT JOIN representative as c1 ON c1.representative_id = ac.representative_id GROUP BY name, normalize_name ORDER BY normalize_name ASC, name ASC ";

    let getSecurityData =  await connection.resources.query(querySecurity,{
        type: connection.Sequelize.QueryTypes.SELECT,
        replacements: { name: companyName, convey_type: 'security' },
        raw: true,
        logging: console.log,
      }
    );

    let queryRelease = "SELECT ac.or_name as name, c1.company_name as normalize_name, 'Release' as type FROM assignors_copy as ac INNER JOIN (SELECT a.rf_id FROM assignments_copy as a INNER JOIN assignment_conveyances_copy as ass ON ass.rf_id = a.rf_id INNER JOIN assignees_copy as acc ON acc.rf_id = a.rf_id LEFT JOIN representative as c ON c.representative_id = acc.representative_id WHERE ass.convey_ty = :convey_type AND (acc.ee_name = :name OR c.company_name = :name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id LEFT JOIN representative as c1 ON c1.representative_id = ac.representative_id GROUP BY name, normalize_name ORDER BY normalize_name ASC, name ASC ";

    let getReleaseData =  await connection.resources.query(queryRelease,{
        type: connection.Sequelize.QueryTypes.SELECT,
        replacements: { name: companyName, convey_type: 'release' },
        raw: true,
        logging: console.log,
      }
    );

    allCustomers = [...getSecurityData, ...getReleaseData];

    return allCustomers;
}

let getCompanyListByOther = async(companyName) => {

    let allCustomers = [];

    let queryNameChange = "SELECT ac.or_name as name, c1.company_name as normalize_name, 'Name Change' as type FROM assignors_copy as ac INNER JOIN (SELECT a.rf_id FROM assignments_copy as a INNER JOIN assignment_conveyances_copy as ass ON ass.rf_id = a.rf_id INNER JOIN assignees_copy as acc ON acc.rf_id = a.rf_id LEFT JOIN representative as c ON c.representative_id = acc.representative_id WHERE ass.convey_ty = :convey_type AND (acc.ee_name = :name OR c.company_name = :name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id LEFT JOIN representative as c1 ON c1.representative_id = ac.representative_id GROUP BY name, normalize_name ORDER BY normalize_name ASC, name ASC ";
									
    let getNameChgData = await connection.resources.query(queryNameChange,{
        type: connection.Sequelize.QueryTypes.SELECT,
        replacements: { name: companyName, convey_type: 'namechg' },
        raw: true,
        logging: console.log,
        }
    );

    let queryGovernChange = "SELECT ac.or_name as name, c1.company_name as normalize_name, 'Govt.' as type FROM assignors_copy as ac INNER JOIN (SELECT a.rf_id FROM assignments_copy as a INNER JOIN assignment_conveyances_copy as ass ON ass.rf_id = a.rf_id INNER JOIN assignees_copy as acc ON acc.rf_id = a.rf_id LEFT JOIN representative as c ON c.representative_id = acc.representative_id WHERE ass.convey_ty = :convey_type AND (acc.ee_name = :name OR c.company_name = :name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id LEFT JOIN representative as c1 ON c1.representative_id = ac.representative_id GROUP BY name, normalize_name ORDER BY normalize_name ASC, name ASC ";

    let getGovernData = await connection.resources.query(queryGovernChange,{
        type: connection.Sequelize.QueryTypes.SELECT,
        replacements: { name: companyName, convey_type: 'govern' },
        raw: true,
        logging: console.log,
        }
    );		

    allCustomers = [...getNameChgData, ...getGovernData];

    return allCustomers;
}

let checkRepresentativeCompany = async(companyName) => {
    console.log("CHECKING REPRESENTATIVE COMPANY: "+companyName);
    return await Representatives.findOne({
        where: {representative_name: companyName}
    });
};

/**
 * Get all the users from the business database
 * @param {*} organisationID 
 */

let getAllUsers = async (organisationID) => {
    return await Users.findAll({
        where: {organisation_id: organisationID},
        attributes: [['user_id','id'], 'first_name', 'last_name','email_address', 'job_title' ,'linkedin_url','username','telephone', 'telephone1','status','created_at'],
        include:[
            {
                model: BusinessRoles,
                as: "role",
                attributes: ['name']
            }
        ]
    });
}


/**
 * Find Customer parent companies count
 * @param {} DBConnection 
 */

let getCompaniesCount = async (DBConnection) => {
    const Representative = DBConnection.define('ClientRepesentative', ClientRepesentative.mainStructure, ClientRepesentative.options);

    return await Representative.count({
        where: {parent_id: 0}
    });
}

/**
 * Find Customer parent companies list
 * @param {} DBConnection 
 */

let getCompaniesListWithReports = async (DBConnection, organisationID) => {
    const Representative = DBConnection.define('ClientRepesentative', ClientRepesentative.mainStructure, ClientRepesentative.options);
    /*
    const getList =  await Representative.findAll({
        where: {type: 0},

    });*/

    const queryRepresentatives = `SELECT representative_id, original_name, representative_name, status FROM representative
    WHERE parent_id IN (SELECT representative_id from representative WHERE type = :groupType)
    UNION
    SELECT representative_id, original_name, representative_name, status FROM representative 
    WHERE parent_id = :companyParentID AND type = :companyType ORDER BY original_name`

    let getList = await DBConnection.query(queryRepresentatives,{
            type: DBConnection.Sequelize.QueryTypes.SELECT,
            replacements: { companyType: 0, companyParentID: 0, groupType: 1},
            raw: true,
            logging: console.log,
        }
    ); 

    if(getList.length > 0) {

        const query = `SELECT organisation_id, company_id, companies, activities, entities AS no_of_entities, parties AS no_of_parties, employees AS no_of_employees, transactions AS no_of_transactions, assets AS assets, arrows AS product, 0 AS documents FROM db_uspto.summary WHERE organisation_id = :organisationID `;

        let reports = await connection.resources.query(query, {
            type: connection.Sequelize.QueryTypes.SELECT,
            replacements: { organisationID: organisationID },
            raw: true, 
            logging: console.log, 
        }) 
        const representativeList = [];
/* 

        const representativeList = [], representativeNames = []

        const promiseList = getList.map( representative => {
            representativeNames.push(representative.representative_name)
        })
        await Promise.all(promiseList)

        const queryRepresentativeReports = `SELECT representative_name, no_of_assets as assets, no_of_transactions, no_of_parties, (no_of_parties - no_of_transactions) as product FROM representative_reports WHERE representative_name IN (:representativeNames)`

        let reports = await connection.resources.query(queryRepresentativeReports,{
                type: connection.Sequelize.QueryTypes.SELECT,
                replacements: { representativeNames},
                raw: true,
                logging: console.log,
            }
        );  */

        if(reports.length > 0) {
            const updatePromise = getList.map( representative => {
               /*  const company = representative.toJSON() */
               const company = {...representative}
                const filter = reports.filter( row => row.company_id == representative.representative_id)
                if(filter.length > 0) {
                    company.assets = filter[0].assets
                    company.no_of_transactions = filter[0].no_of_transactions
                    company.no_of_entities = filter[0].no_of_entities
                    company.no_of_employees = filter[0].no_of_employees
                    company.no_of_parties = filter[0].no_of_parties
                    company.product = filter[0].product
                    company.arrow_assets = parseInt(filter[0].product / filter[0].assets)
                    company.arrow_transactions = parseInt(filter[0].product / filter[0].no_of_transactions)
                } else {
                    company.assets = 0
                    company.no_of_transactions = 0
                    company.no_of_entities = 0
                    company.no_of_employees = 0
                    company.no_of_parties = 0
                    company.product = 0
                    company.arrow_assets = 0
                    company.arrow_transactions = 0
                }
                representativeList.push(company)
            })
            await Promise.all(updatePromise)
            return representativeList
        } else {
            return getList
        }
    } else {
        return getList
    }
}



/**
 * Find Customer parent companies list
 * @param {} DBConnection 
 */

let getCompaniesListSumWithReports = async (DBConnection, organisationID) => {
    const Representative = DBConnection.define('ClientRepesentative', ClientRepesentative.mainStructure, ClientRepesentative.options);

    const getList =  await Representative.findAll({
        where: {type: 0}
    });

    if(getList.length > 0) { 

        const query = `SELECT organisation_id, companies, activities, SUM(entities) AS no_of_entities , SUM(parties) AS no_of_parties, employees, SUM(transactions) AS no_of_transactions, SUM(assets) AS assets, SUM(arrows) AS product, 0 AS documents FROM db_uspto.summary WHERE organisation_id = :organisationID `;

        let reports = await connection.resources.query(query, {
            type: connection.Sequelize.QueryTypes.SELECT,
            replacements: { organisationID: organisationID },
            raw: true, 
            logging: console.log,
            plain: true
        }) 
        /* 
        const representativeNames = []

        const promiseList = getList.map( representative => {
            representativeNames.push(representative.representative_name)
        })
        await Promise.all(promiseList)

        const queryRepresentativeReports = `SELECT representative_name, SUM(no_of_assets) AS assets, SUM(no_of_transactions) AS no_of_transactions, SUM(no_of_parties) AS no_of_parties, SUM(no_of_arrows) AS product FROM representative_reports WHERE representative_name IN (:representativeNames)`

        let reports = await connection.resources.query(queryRepresentativeReports,{
                type: connection.Sequelize.QueryTypes.SELECT,
                replacements: { representativeNames},
                raw: true,
                logging: console.log,
                plain: true
            }
        );  */

        const queryShareURL = await Share.findOne({
            where: {organisation_id: organisationID}
        })

        if( queryShareURL !== null ) {
            reports.share_url = 1
        }

        if(reports != null) {            
            return reports
        } else {
            return {}
        }
    } else {
        return {}
    }
}

/**
 * Find Customer parent companies list
 * @param {} DBConnection 
 */

let getCompaniesList = async (DBConnection) => {
    const Representative = DBConnection.define('ClientRepesentative', ClientRepesentative.mainStructure, ClientRepesentative.options);

    return await Representative.findAll({
        where: { type: 0}
    });
}

let getCompaniesAllList = async (DBConnection) => {
    const Representative = DBConnection.define('ClientRepesentative', ClientRepesentative.mainStructure, ClientRepesentative.options);
     
    const mainCompanies  = await Representative.findAll({
        attributes: ['representative_id', 'representative_name'],
        where: {type: 0, parent_id: 0},
        group: ['representative_name']
    });

    console.log(mainCompanies)

    let groupCompanies = []

    const groups  = await Representative.findAll({
        where: {type: 1, parent_id: 0}
    });

    if(groups !== null && groups.length > 0) {
        let getAllIDs = [];
        const mapGroups = await groups.map( c => getAllIDs.push(c.representative_id));
        await Promise.all(mapGroups)

        groupCompanies  = await Representative.findAll({
            attributes: ['representative_id', 'representative_name'],
            where: {parent_id: getAllIDs},
            group: ['representative_name']
        });
    }

    const allCompanies = [];
    if(mainCompanies.length > 0) {
        const cPromises = await mainCompanies.map( c => {
            const {representative_id, representative_name} = c
            allCompanies.push({representative_id, representative_name})
        });
        await Promise.all(cPromises)
    }
    if(groupCompanies.length > 0) {
        const cPromises = await groupCompanies.map( c => {
            const {representative_id, representative_name} = c
            allCompanies.push({representative_id, representative_name})
        });
        await Promise.all(cPromises)
    }
    console.log(allCompanies.length)
    return allCompanies;

    /* const findParentCompanies  = await Representative.findAll({
        attributes: ['parent_id'],
        where: {parent_id: {[connection.Op.gt] : 0}},
        group: ['parent_id']
    });

    console.log(findParentCompanies.length)
    if(findParentCompanies !== null && findParentCompanies.length > 0) {
        let getAllIDs = [];
        const mapGroups = await findParentCompanies.map( c => getAllIDs.push(c.parent_id));
        await Promise.all(mapGroups)

        representativeCompanies  = await Representative.findAll({
            attributes: ['representative_id', 'representative_name'],
            where: {representative_id: getAllIDs, type: 0, parent_id: 0},
            group: ['representative_name']
        });
    }

    return representativeCompanies; */

}

let findRepresentativeByID = async (DBConnection, representativeID) => {
    const Representative = DBConnection.define('ClientRepesentative', ClientRepesentative.mainStructure, ClientRepesentative.options);

    return await Representative.findOne({
        where: {representative_id: representativeID}
    });
}

let findRepresentativeByIDs = async (DBConnection, representativeIDs) => {
    const Representative = DBConnection.define('ClientRepesentative', ClientRepesentative.mainStructure, ClientRepesentative.options);

    return await Representative.findAll({
        where: {representative_id: representativeIDs}
    });
}


let getSubCompaniesList = async (DBConnection, companyID) => {
    const Representative = DBConnection.define('ClientRepesentative', ClientRepesentative.mainStructure, ClientRepesentative.options);

    return await Representative.findAll({
        where: {parent_id: companyID}
    });
}

/**
 * Find Customer all companies list
 * @param {} DBConnection 
 */

let getAllCompaniesList = async (DBConnection) => {
    const Representative = DBConnection.define('ClientRepesentative', ClientRepesentative.mainStructure, ClientRepesentative.options);

    return await Representative.findAll();
}


let getCompaniesWithChildren = async (DBConnection, organisationID) => {
    let companies = [];
    const parentCompanyQuery = "SELECT representative_id as id, '' AS slack, original_name, representative_name, instances, instances + (Select sum(instances) FROM representative as r1 WHERE r1.parent_id = r.representative_id) as counter, type, status FROM representative as r WHERE r.parent_id = 0";

    companies = await DBConnection.query(parentCompanyQuery,{
        type: connection.Sequelize.QueryTypes.SELECT,
        raw: true,
        logging: console.log,
        }
    ); 
    
    if(companies.length > 0) {
        let getAllIDs = [];
        companies.map( c => getAllIDs.push(c.id));
        /* let childCompaniesQuery = "SELECT representative_id as id, original_name, representative_name, instances as counter, parent_id FROM representative as r WHERE r.parent_id IN (:parentCompany) ORDER BY r.parent_id ASC, counter DESC"; */

        let childCompaniesQuery = "SELECT representative_id as id, '' AS slack, original_name, representative_name, instances as counter, parent_id, status FROM representative as r WHERE r.parent_id IN (:parentCompany) AND child = :child ORDER BY r.parent_id ASC, counter DESC";

        let childCompanies = await DBConnection.query(childCompaniesQuery,{
                type: connection.Sequelize.QueryTypes.SELECT,
                replacements: { parentCompany: getAllIDs, child: 1 },
                raw: true,
                logging: console.log,
            }
        ); 
        if(childCompanies.length == 0) {
            for(let i = 0; i < companies.length; i++) {
                /* let newC = {...companies[i]};
                newC.counter = newC.instances;
                companies[i]['children'] = [newC]; */
                companies[i]['children'] = []
            }
        } else {
            for(let i = 0; i < companies.length; i++) {
                let children = [];
                /* let newC = {...companies[i]};
                newC.counter = newC.instances;
                children.push(newC); */
                for(let j = 0; j< childCompanies.length; j++) {
                    if(parseInt(companies[i].id) === parseInt(childCompanies[j].parent_id)) {
                        children.push({...childCompanies[j]});
                    }                            
                }
                companies[i]['children'] = children;
            }
        }

        /*const queryCustomer = "SELECT tab_id, assignor_and_assignee_id as customer_id, name, representative_id as company_id FROM tree_parties WHERE organisation_id = :organisationID AND representative_id IN (:representativeID) GROUP BY organisation_id, representative_id, assignor_and_assignee_id, tab_id";

        let allCustomers = await connection.application.query(queryCustomer,{
            type: connection.Sequelize.QueryTypes.SELECT,
            replacements: { representativeID: getAllIDs, organisationID: organisationID },
            raw: true,
            logging: console.log,
        }); 

        if(allCustomers.length > 0) {
            const promises = companies.map((c, index) => {
                let allTabs = {};
                
                for(let i = 0; i <= 10; i++){
                    
                    const customers = allCustomers.filter( company => {
                        return company.company_id == c.id && company.tab_id == i ? company : undefined;
                    });
                    allTabs[i] = customers;
                }
                companies[index].tabs = allTabs;                
                return c;
            });

            await Promise.all(promises);
        }*/
    }
    return companies;
}

let checkCustomerCompany = async(DBConnection, companyName) => {
    const Representative = DBConnection.define('ClientRepesentative', ClientRepesentative.mainStructure, ClientRepesentative.options);
    return await Representative.findOne({
        where: {parent_id: 0, [connection.Op.or] : [{representative_name: companyName}, {original_name: companyName}]}
    });
};

let updateAllCustomerInventor = async(organisationID, inventors, flag, DBConnection ) => {
    const inventorsList = JSON.parse(inventors);
    let added = 0;
    if(inventorsList.length > 0) {
        let queryResourceUpdate, queryApplicationUpdate, where = { flag: flag, list: inventorsList};
        if( flag == 1) {
            queryResourceUpdate = "UPDATE representative_assignment_conveyance SET employer_assign = :flag, convey_ty = :conveyType WHERE rf_id IN (SELECT rf_id FROM assignor WHERE assignor_and_assignee_id IN (:list))";
            //queryApplicationUpdate = "UPDATE assignment_conveyance SET employer_assign = :flag, convey_ty = :conveyType WHERE rf_id IN (SELECT rf_id FROM assignor WHERE assignor_and_assignee_id IN (:list))";

            where.conveyType = 'employee';
        } else {
            queryResourceUpdate = "UPDATE representative_assignment_conveyance SET employer_assign = :flag WHERE rf_id IN (SELECT rf_id FROM assignor WHERE assignor_and_assignee_id IN (:list))";
            //queryApplicationUpdate = "UPDATE assignment_conveyance SET employer_assign = :flag WHERE rf_id IN (SELECT rf_id FROM assignor WHERE assignor_and_assignee_id IN (:list))";
        }

        added = await connection.resources.query(queryResourceUpdate,{
                type: connection.Sequelize.QueryTypes.UPDATE,
                replacements: where,
                raw: true,
                logging: console.log,
            }
        );

        const newInventors = [];
        const promise = inventorsList.map(inventor => newInventors.push({assignor_and_assignee_id: inventor}))
        await Promise.all(promise)

        const addNew = Inventors.bulkCreate(newInventors, { ignoreDuplicates: true })
            console.log('addNew', addNew)
        
        /* added = await connection.application.query(queryApplicationUpdate,{
                type: connection.Sequelize.QueryTypes.UPDATE,
                replacements: where,
                raw: true,
                logging: console.log,
            }
        ); */
    }

    /* const list = await getCompaniesList(DBConnection);
    let added = 0;
    if(list.length > 0) {
        const representativeNames = [];
        list.map(r => representativeNames.push(r.original_name));



        const findRepresentatives = await AssignorAndAssignee.findAll({
            where:{name: representativeNames, representative_id: {[connection.Op.gt]: 0}},
            attributes:['representative_id'],
            include:[
                {
                    model: Representatives,
                    as: "representative",
                    attributes: ['representative_name']
                }
            ]
        });
        let listIDs = [];

        if(findRepresentatives != null && findRepresentatives.length > 0) {
            const representativeList = [];
            findRepresentatives.map(r => {
                if(r  != null && r.representative.representative_name != null) {
                    representativeList.push(r.representative_id);
                }
            });

            const queryRepresentativeTransactions = "SELECT rf_id FROM representative_transactions where representative_id IN (:representative_list)";

            listIDs = await connection.resources.query(queryRepresentativeTransactions,{
                type: connection.Sequelize.QueryTypes.SELECT,
                replacements: { representative_list: representativeList },
                raw: true,
                logging: console.log,
                }
            );

            if(listIDs.length > 0) {
                const companyRFIDs = [];
                    listIDs.map( r => companyRFIDs.push(r.rf_id));
                let rfIDs = [];
                if(flag == 0 ) {
                    const queryFindAssignorAndAssigneeIDs = "SELECT ac.rf_id FROM assignor as aaa INNER JOIN representative_assignment_conveyance as ac ON ac.rf_id = aaa.rf_id WHERE aaa.rf_id IN(:rfIDs) AND ac.employer_assign = 1 AND aaa.or_name IN (:inventors) GROUP BY ac.rf_id";
                    let listIDs = await connection.resources.query(queryFindAssignorAndAssigneeIDs,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: { rfIDs: companyRFIDs, inventors: inventors },
                        raw: true,
                        logging: console.log,
                        }
                    );
                    if(listIDs != null && listIDs.length > 0) {
                        listIDs.map(l => rfIDs.push(l.rf_id));
                    }
                } else if(flag == 1 ){
                    const queryFindAssignorRFIDs = "SELECT ac.rf_id FROM assignor as aaa INNER JOIN representative_assignment_conveyance as ac ON ac.rf_id = aaa.rf_id WHERE aaa.rf_id IN(:rfIDs) AND ac.employer_assign = 0 AND aaa.or_name IN (:inventors) GROUP BY ac.rf_id";
                    const findAssignors = await connection.resources.query(queryFindAssignorRFIDs,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: { rfIDs: companyRFIDs, inventors: inventors },
                        raw: true,
                        logging: console.log,
                        }
                    );
        
                    const queryAssigneeRFIDs = "SELECT ac.rf_id FROM assignee as aaa INNER JOIN representative_assignment_conveyance as ac ON ac.rf_id = aaa.rf_id WHERE aaa.rf_id IN(:rfIDs) AND  aaa.ee_name IN (:inventors) GROUP BY ac.rf_id";
                    const findAssignees = await connection.resources.query(queryAssigneeRFIDs,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: { rfIDs: companyRFIDs, inventors: inventors },
                        raw: true,
                        logging: console.log,
                        }
                    );
        
                    const allIDs = [...findAssignors, ...findAssignees];
        
                    if(allIDs.length > 0) {
                        allIDs.map(l => rfIDs.push(l.rf_id));
                    }
                }
                console.log(rfIDs.length);
                if(rfIDs.length > 0) {
                    
                    added = await AssignmentConveyance.update({employer_assign: flag},{where: {rf_id: rfIDs}});
                    added = await RepresentativeAssignmentConveyance.update({employer_assign: flag},{where: {rf_id: rfIDs}});
                }
            }
        }
    } */
    return added;
}

/**
 * 
 * @param {
 * } companyName 
 * @param {*} type 
 */
/*
 let findCompanyEntitiesByAccountID = async(orgID, type, DBConnection) => {
    const list = await getCompaniesList(DBConnection);
    let entitiesList = [];
    if(list.length > 0) {
        const representativeNames = [], IDs;
        list.map(r => {
            representativeNames.push(r.original_name);
            IDs.push(r.representative_id);
        });



        const findRepresentatives = await AssignorAndAssignee.findAll({
            where:{name: representativeNames, representative_id: {[connection.Op.gt]: 0}},
            attributes:['representative_id'],
            include:[
                {
                    model: Representatives,
                    as: "representative",
                    attributes: ['representative_name']
                }
            ]
        });

        let listIDs = [];

        if(findRepresentatives != null && findRepresentatives.length > 0) {
            const representativeList = [];
            findRepresentatives.map(r => {
                if(r  != null && r.representative.representative_name != null) {
                    representativeList.push(r.representative_id);
                }
            });

            const queryRepresentativeTransactions = "SELECT rf_id FROM representative_transactions where representative_id IN (:representative_list)";

            listIDs = await connection.resources.query(queryRepresentativeTransactions,{
                type: connection.Sequelize.QueryTypes.SELECT,
                replacements: { representative_list: representativeList },
                raw: true,
                logging: console.log,
                }
            );

            if(listIDs.length > 0) {
                const rfIDs = [];
                    listIDs.map( r => rfIDs.push(r.rf_id));
                    entitiesList = await findAssignorAndAssigneeListFromRFIDs(rfIDs, type);
            }
        }
    }
    return entitiesList;
}
*/

let findCompanyEntitiesByAccountID = async(orgID, type, DBConnection, suggestions, fixed_identicals) => {
    const list = await getCompaniesList(DBConnection);
    let entitiesList = [];
    if(list.length > 0) {
        const IDs = [];
        list.map(r => IDs.push(r.representative_id));
        let listIDs = [];
        if(IDs.length > 0) {
            const queryRepresentativeTransactions = "SELECT rf_id FROM list2 where organisation_id = :organisationID AND company_id IN (:representativeIDs) GROUP BY rf_id";

            listIDs = await connection.resources.query(queryRepresentativeTransactions,{
                type: connection.Sequelize.QueryTypes.SELECT,
                replacements: { representativeIDs: IDs, organisationID: orgID },
                raw: true,
                logging: console.log,
                }
            );

            if(listIDs.length > 0) {
                const rfIDs = [];
                listIDs.map( r => rfIDs.push(r.rf_id));
                entitiesList = await findAssignorAndAssigneeListFromRFIDs(rfIDs, type);
                console.log('suggestions', suggestions)
                if(typeof suggestions != 'undefined' && suggestions == 1) {
                    if(type == 1) {
                        entitiesList = groupSuggestions(entitiesList)
                    } else {
                        entitiesList = groupOrganisationSuggestions(entitiesList)
                    }
                }
                if(typeof fixed_identicals != 'undefined' && fixed_identicals == 1) {
                    if(type == 1) {
                        entitiesList = groupFixIdentical(entitiesList)
                    }
                }
            }
        }
    }
    return entitiesList;
}

const groupFixIdentical = async (entitiesList) => {
    const getIdenticalList = await groupSuggestions(entitiesList, 1);
    console.log('getIdenticalList', getIdenticalList.length)
    if(Object.keys(getIdenticalList).length > 0 ) {
        let i = 0;
        for (const name in getIdenticalList) {
            if(i == 0 ) {
                const {main, groups} = getIdenticalList[name];

                console.log('main, groups', main, groups);

                if(groups.length > 0) {
                    let representativeName = '', representativeID = 0;
                    if(main.representative_company != null) {
                        representativeName = main.representative_company 
                    } else {
                        const allNames = []
                        allNames.push(main.name)
                        groups.forEach( item => {
                            allNames.push(item.name)
                        })
                        if(allNames.length > 0) {
                            const findRepresentative = await Representatives.findOne({
                                where: {representative_name: allNames}
                            })
                            if(findRepresentative != null) {
                                representativeName = findRepresentative.representative_name
                                representativeID = findRepresentative.representative_id
                            } else {
                                /**
                                 * Create Representative
                                 */
                                let createRepresentativeName = main.name, highestDistance = main.counter
    
                                groups.forEach( item => {
                                    if(item.counter > highestDistance) {
                                        createRepresentativeName = item.name
                                        highestDistance = item.counter
                                    }
                                })
    
                                if(createRepresentativeName != '') {
                                    const representativeCompany = await Representatives.create({
                                        representative_name: createRepresentativeName
                                    });
                                    if(representativeCompany != null) {
                                        representativeName = representativeCompany.representative_name
                                        representativeID = representativeCompany.representative_id
                                    }
                                } 
                            }
                        }
                    }
                    if(representativeName != '' && groups.length > 0) {
                        if(representativeID == 0) {
                            const findRepresentative = await Representatives.findOne({
                                where: {representative_name: representativeName}
                            })
                            if(findRepresentative != null) {
                                representativeID = findRepresentative.representative_id
                            }
                        }
                        const allAssignorAndAssignee = [], allApplicantAssignorAndAssignee = []
    
                        if(main.flag == 1) {
                            allAssignorAndAssignee.push(main.id)
                        } else {
                            allApplicantAssignorAndAssignee.push(main.id)
                        }
    
                        groups.forEach( item => {
                            if(item.flag == 1) {
                                allAssignorAndAssignee.push(main.id)
                            } else {
                                allApplicantAssignorAndAssignee.push(main.id)
                            }
                        })
    
                        if(representativeID > 0 && (allAssignorAndAssignee.length > 0 || allApplicantAssignorAndAssignee.length > 0)) {
                            const item = {representative_id: representativeID};
    
                            if(allAssignorAndAssignee.length > 0) {
                                await AssignorAndAssignee.update(item, {where: {assignor_and_assignee_id: allAssignorAndAssignee}}); 
                            }
    
                            if(allApplicantAssignorAndAssignee.length > 0) {
                                await ApplicantAssignorAndAssignee.update(item, {where: {assignor_and_assignee_id: allApplicantAssignorAndAssignee}}); 
                            }
                        } 
                    }  
                }
            } 
            i++;
        }
    } 
}

const groupSuggestions = async (entitiesList, identical = 0) => {
    const names = [...entitiesList] ; 

    const suggestedGroups = {}; 
    // Check for similar names and group them
    let otherSuggested = []
    for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
            const distance1 = levenshtein.get(names[i].name.toLowerCase(), names[j].name.toLowerCase())
            const name1 = names[i].name.split(" ").reverse().join(" ")
            const name2  = names[j].name.split(" ").reverse().join(" ")
            const distance2 = levenshtein.get(names[i].name.toLowerCase(), name2.toLowerCase())
            const distance3 = levenshtein.get(name1.toLowerCase(), name2.toLowerCase())
            const distance4 = levenshtein.get(name1.toLowerCase(), names[j].name.toLowerCase())
            const distance = Math.min(distance1, distance2, distance3, distance4)
            /* console.log(`INVENTOR: ${distance} - ${names[i].name} - ${names[j].name}`) */

            if(distance < 3) {
                let nameSimilar = names[j].name, nameChecked = names[i].name;
                if(identical === 1) {
                    /* console.log(`INVENTOR: ${distance} - ${distance1} - ${distance2} - ${distance3} - ${distance4} - ${nameChecked} - ${nameSimilar} - ${name1} - ${name2}`)  */
                    let entered = false
                    if(distance2 == distance && nameChecked.toLowerCase() == name2.toLowerCase()) {
                        entered = true
                    } else if(distance3 == distance && name1.toLowerCase() == name2.toLowerCase()) {
                        entered = true
                    } else if(distance4 == distance && name1.toLowerCase() == nameSimilar.toLowerCase()) {
                        entered = true
                    } else if(distance1 == distance && nameChecked.toLowerCase() == nameSimilar.toLowerCase()) {
                        entered = true
                    }
                    if(entered === true) {
                        if (suggestedGroups[nameChecked]) {
                            suggestedGroups[nameChecked]['groups'].push(names[j]);
                        } else {
                            suggestedGroups[nameChecked] = {
                                main: names[i],
                                groups: [names[j]]
                            }
                        } 
                    }
                } else {
                    if (suggestedGroups[nameChecked]) {
                        suggestedGroups[nameChecked].push(nameSimilar);
                        otherSuggested.push(nameSimilar)
                    } else {
                        if(!otherSuggested.includes(nameChecked)) {
                            suggestedGroups[nameChecked] = [nameSimilar];
                            otherSuggested.push(nameSimilar)
                        }
                    }
                } 
            }
        }
    }  
    if(identical === 1) {
        return suggestedGroups
    } else {
        let newSuggestedSet = [], allNamesID = [];
        // Print suggested groups with correct name
        for (const name in suggestedGroups) {
            const group = suggestedGroups[name];
            //group.push(name); 
            //console.log(`${name} - ${group.length}`)
            if(group.length > 0) {
                // Find the name with the highest occurrences that doesn't have a middle name
                let correctName = "";
                let highestOccurrences = 0;
                for (let i = 0; i < group.length; i++) {
                    const parts = group[i].split(" ");
                    if (parts.length === 2 && names.find(n => n.name === group[i]).counter > highestOccurrences) {
                        correctName = group[i];
                        highestOccurrences = names.find(n => n.name === group[i]).counter;
                    }
                } 
                const findIndex = names.findIndex( row => row.name == name)
                if(findIndex !== -1) { 
                    let newGroup = []
                    allNamesID.push(names[findIndex].id)
                    group.map( grp => {
                        if(name != grp) {
                            const grpIndex = names.findIndex( row => row.name == grp)
                            if(grpIndex !== -1) {
                                if(!allNamesID.includes(names[grpIndex].id)) {  
                                    newGroup.push(names[grpIndex]) 
                                    allNamesID.push(names[grpIndex].id)
                                }
                            }
                        }
                    })
                    if(newGroup.length > 0) {
                        const rowData = {...names[findIndex], correctName, highestOccurrences} 
                        newSuggestedSet.push(rowData) 
                        newSuggestedSet = [...newSuggestedSet, ...newGroup]
                    }
                }
            } 
        }
    }

    //console.log('newSuggestedSet', newSuggestedSet)
    return newSuggestedSet; 
}

const groupOrganisationSuggestions = (entitiesList) => {
    // sample subset array of organizations with names and occurrences
    const orgs =  [...entitiesList]
    // function to group similar names and suggest correct name 
    // create an empty object to store groups of similar names
    const groups = {}, allNames = [];

    orgs.forEach((org) => {
        let added = false; 
        allNames.push(org.name)
        // check if there is already a group for the current name
        for (let group in groups) {
            if (levenshteinNatural(org.name, group) <= 2) {
                // if the levenshtein distance is less than or equal to 2, add the name to the existing group
                groups[group].push(org);
                added = true;
                break;
            }
        } 
        if (!added) {
            // if no group found, create a new group with the current name
            groups[org.name] = [org];
        }
    });

    let newSuggestedSet = [], allOrgID = [];
    const spellcheck = new natural.Spellcheck(allNames);
    // loop through the groups and suggest the correct name
    for (let group in groups) {
        // array to store names with the least number of typos
        let correctNames = '', highestOccurrences = 0;
        let minDistance = Number.MAX_SAFE_INTEGER;
    
        groups[group].forEach((org) => {
            // use spell checker to check for typos 
            let distance = spellcheck.getCorrections(org.name, 1);
            if(distance.length > 0 && org.name != group) {
                correctNames = [org.name];
                highestOccurrences = org.counter
            }
        });
        const findIndex = orgs.findIndex( row => row.name == group)
        if(findIndex !== -1) {
            /* const similarNames = [];
            groups[group].map((org) => similarNames.push(org.name)) */
            
            if(groups[group].length > 0) {
                allOrgID.push(orgs[findIndex].id)
                let newGroup = []
                groups[group].map((org) => {
                    if(!allOrgID.includes(org.id)) { 
                        newGroup.push(org)
                        allOrgID.push(org.id)
                    }
                })
                if(newGroup.length > 0) {
                    const rowData = {...orgs[findIndex], correctName: correctNames, highestOccurrences} 
                    newSuggestedSet.push(rowData)
                    newSuggestedSet = [...newSuggestedSet, ...newGroup]
                }
            }
        } 
    } 
    return newSuggestedSet;   
}

let findCompanyEntitiesByAccountIDByRepresentativeIDs = async(orgID, representativeIDs, type, DBConnection, suggestions, fixed_identicals) => {
   
    let entitiesList = [];
    if(representativeIDs.length > 0) {        
        const queryRepresentativeTransactions = "SELECT rf_id FROM list2 where organisation_id = :organisationID AND company_id IN (:representativeIDs)";

        const listIDs = await connection.resources.query(queryRepresentativeTransactions,{
            type: connection.Sequelize.QueryTypes.SELECT,
            replacements: { representativeIDs: representativeIDs, organisationID: orgID },
            raw: true,
            logging: console.log,
            }
        );

        if(listIDs.length > 0) {
            const rfIDs = [];
                listIDs.map( r => rfIDs.push(r.rf_id));
                entitiesList = await findAssignorAndAssigneeListFromRFIDs(rfIDs, type);

            console.log('suggestions', suggestions)
            if(typeof suggestions != 'undefined' && suggestions == 1) {
                if(type == 1) {
                    entitiesList = groupSuggestions(entitiesList)
                } else {
                    entitiesList = groupOrganisationSuggestions(entitiesList)
                }
            }
            if(typeof fixed_identicals != 'undefined' && fixed_identicals == 1) {
                if(type == 1) {
                    entitiesList = await groupFixIdentical(entitiesList)
                }
            }
        }
    }
    return entitiesList;
}


let findAssignorAndAssigneeListFromRFIDs = async(rfIDs, type) => {
    let customer_list = [], assignees = [], assignors = [], inventors = [];
    
    if(typeof type != 'undefined' &&  parseInt(type) < 3) {
        /* let queryAssignor = "SELECT a.assignor_and_assignee_id, a.or_name as name, count(a.or_name) as counter, r.representative_name as normalize_name, (select rr.representative_name FROM representative as rr WHERE rr.representative_name = aaa.name GROUP BY rr.representative_name) as representativeCompany, (SELECT aa.instances FROM assignor_and_assignee as aa WHERE aa.assignor_and_assignee_id = a.assignor_and_assignee_id GROUP BY aa.assignor_and_assignee_id) as total_occurences, a.rf_id FROM db_uspto.assignor as a LEFT JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = a.assignor_and_assignee_id LEFT JOIN db_uspto.representative_assignment_conveyance as rac ON rac.rf_id = a.rf_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE a.rf_id IN (:IDs) "; */

        let queryAssignor = "SELECT a.assignor_and_assignee_id, a.or_name as name, count(a.or_name) as counter, r.representative_name as normalize_name, (select rr.representative_name FROM representative as rr WHERE rr.representative_name = aaa.name GROUP BY rr.representative_name) as representativeCompany, (SELECT aa.instances FROM assignor_and_assignee as aa WHERE aa.assignor_and_assignee_id = a.assignor_and_assignee_id GROUP BY aa.assignor_and_assignee_id) as total_occurences, a.rf_id, 1 AS flag FROM db_uspto.assignor as a LEFT JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = a.assignor_and_assignee_id LEFT JOIN db_uspto.representative_assignment_conveyance as rac ON rac.rf_id = a.rf_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE date_format(a.exec_dt, '%Y') > :year AND a.rf_id IN (SELECT rf_id FROM documentid WHERE appno_doc_num IN (SELECT appno_doc_num FROM documentid WHERE rf_id IN (:IDs)) GROUP BY rf_id) "; 
        if(parseInt(type) > 0) { 
            if(parseInt(type) == 1) {
                queryAssignor += " AND (rac.employer_assign = 1) ";
            } else {
                queryAssignor += " AND (rac.employer_assign = 0) ";
            }
        }

        queryAssignor += " GROUP BY a.or_name ";

        if(parseInt(type) > 0) { 
            if(parseInt(type) == 1) {

                const queryAssets = "SELECT appno_doc_num FROM documentid WHERE rf_id IN (:IDs) AND date_format(appno_date, '%Y') > :year GROUP BY appno_doc_num"  

                const assetsList = await connection.resources.query(queryAssets,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    replacements: { IDs: rfIDs, year: connection.DEFAULT_YEAR },
                    raw: true,
                    logging: console.log,
                    }   
                );

                const allAssets = []

                assetsList.forEach( row => {
                    allAssets.push(`${row.appno_doc_num}`)
                })
                console.log('assetsList', allAssets.length)
                if(allAssets.length > 0) {
                    const grantInventorsQuery = "SELECT * FROM (SELECT appInv.assignor_and_assignee_id, CONCAT(appInv.family_name, ' ', appInv.given_name) AS aName, aaa.name AS name, count(aaa.name) as counter, r.representative_name as normalize_name, (select rr.representative_name FROM representative as rr WHERE rr.representative_name = aaa.name GROUP BY rr.representative_name) as representativeCompany, aaa.instances as total_occurences, 0 AS rf_id, 4 AS flag FROM db_patent_application_bibliographic.inventor AS appInv INNER JOIN  db_patent_application_bibliographic.assignor_and_assignee AS aaa ON aaa.assignor_and_assignee_id = appInv.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE appInv.appno_doc_num IN (:allAssets)  GROUP BY aaa.name UNION SELECT appInv.assignor_and_assignee_id, CONCAT(appInv.family_name, ' ', appInv.given_name) AS aName, aaa.name AS name, count(aaa.name) as counter, r.representative_name as normalize_name, (select rr.representative_name FROM representative as rr WHERE rr.representative_name = aaa.name GROUP BY rr.representative_name) as representativeCompany, aaa.instances as total_occurences, 0 AS rf_id, 4 AS flag FROM db_patent_grant_bibliographic.inventor_new AS appInv INNER JOIN  db_patent_application_bibliographic.assignor_and_assignee AS aaa ON aaa.assignor_and_assignee_id = appInv.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE appInv.appno_doc_num IN (:allAssets) GROUP BY aaa.name) AS temp";

                    inventors = await connection.resources.query(grantInventorsQuery,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: { allAssets },
                        raw: true,
                        logging: console.log,
                        }
                    );
                }


                //queryAssignor += " UNION SELECT assignor_and_assignee_id, name, counter, normalize_name, representativeCompany, total_occurences,rf_id FROM (SELECT appInv.assignor_and_assignee_id, aaa.name, count(aaa.name) as counter, r.representative_name as normalize_name, (select rr.representative_name FROM representative as rr WHERE rr.representative_name = aaa.name GROUP BY rr.representative_name) as representativeCompany, aaa.instances as total_occurences, 0 AS rf_id FROM db_patent_application_bibliographic.inventor AS appInv INNER JOIN  db_patent_application_bibliographic.assignor_and_assignee AS aaa ON aaa.assignor_and_assignee_id = appInv.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE appInv.appno_doc_num IN ( SELECT appno_doc_num FROM documentid WHERE rf_id IN (SELECT rf_id FROM documentid WHERE appno_doc_num IN (SELECT appno_doc_num FROM documentid WHERE rf_id IN (:IDs)) GROUP BY rf_id) GROUP BY appno_doc_num) GROUP BY aaa.name UNION SELECT appInv.assignor_and_assignee_id, aaa.name, count(aaa.name) as counter, r.representative_name as normalize_name, (select rr.representative_name FROM representative as rr WHERE rr.representative_name = aaa.name GROUP BY rr.representative_name) as representativeCompany, aaa.instances as total_occurences, 0 AS rf_id FROM db_patent_grant_bibliographic.inventor_new AS appInv INNER JOIN  db_patent_application_bibliographic.assignor_and_assignee AS aaa ON aaa.assignor_and_assignee_id = appInv.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE appInv.appno_doc_num IN ( SELECT appno_doc_num FROM documentid WHERE rf_id IN (SELECT rf_id FROM documentid WHERE appno_doc_num IN (SELECT appno_doc_num FROM documentid WHERE rf_id IN (:IDs)) GROUP BY rf_id) GROUP BY appno_doc_num) GROUP BY aaa.name) AS temp";
                
            }
        }
        
        if(parseInt(type) == 2) { 
            queryAssignor += " UNION  SELECT a.assignor_and_assignee_id, a.ee_name as name, count(a.ee_name) as counter, r.representative_name as normalize_name, (select rr.representative_name FROM representative as rr WHERE rr.representative_name = aaa.name GROUP BY rr.representative_name) as representativeCompany, (SELECT aa.instances FROM assignor_and_assignee as aa WHERE aa.assignor_and_assignee_id = a.assignor_and_assignee_id  GROUP BY aa.assignor_and_assignee_id) as total_occurences, a.rf_id, 1 AS flag FROM db_uspto.assignee as a INNER JOIN representative_assignment_conveyance as ac ON ac.rf_id = a.rf_id LEFT JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = a.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE a.rf_id IN (:IDs)  GROUP BY a.ee_name";
        }
        
        
        
        assignors = await connection.resources.query(queryAssignor,{
            type: connection.Sequelize.QueryTypes.SELECT,
            replacements: { IDs: rfIDs , year: connection.DEFAULT_YEAR },
            raw: true,
            logging: console.log,
            }
        );
        /* if(parseInt(type) == 2) {
            let queryAssignee = "SELECT a.assignor_and_assignee_id, a.ee_name as name, count(a.ee_name) as counter, r.representative_name as normalize_name, (select rr.representative_name FROM representative as rr WHERE rr.representative_name = aaa.name GROUP BY rr.representative_name) as representativeCompany, (SELECT aa.instances FROM assignor_and_assignee as aa WHERE aa.assignor_and_assignee_id = a.assignor_and_assignee_id  GROUP BY aa.assignor_and_assignee_id) as total_occurences, a.rf_id FROM db_uspto.assignee as a INNER JOIN representative_assignment_conveyance as ac ON ac.rf_id = a.rf_id LEFT JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = a.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE a.rf_id IN (:IDs) ";

            //queryAssignee +=" AND ac.employer_assign in (0,1)"; 
        

            queryAssignee += " GROUP BY a.ee_name";

            console.log(queryAssignee);   
            assignees = await connection.resources.query(queryAssignee,{
                type: connection.Sequelize.QueryTypes.SELECT,
                replacements: { IDs: rfIDs },
                raw: true,
                logging: console.log,
                }
            );   
        } */
    } else if(typeof type != 'undefined' &&  parseInt(type) == 3) {

        /* queryDocumentID = 'SELECT rf_id FROM documentid WHERE appno_doc_num IN (SELECT appno_doc_num FROM documentid WHERE rf_id IN (:rfIDs)) GROUP BY rf_id';
        documentRFIDs = await connection.resources.query(queryDocumentID,{
            type: connection.Sequelize.QueryTypes.SELECT,
            replacements: { rfIDs: rfIDs },
            raw: true,
            logging: console.log,
            }
        );

        rfIDs = [];

        documentRFIDs.map( r => rfIDs.push(r.rf_id));

        let queryAssignor = "SELECT a.assignor_and_assignee_id, a.or_name as name, count(a.or_name) as counter, r.representative_name as normalize_name, (select rr.representative_name FROM representative as rr WHERE rr.representative_name = aaa.name GROUP BY rr.representative_name) as representativeCompany, (SELECT aa.instances FROM assignor_and_assignee as aa WHERE aa.assignor_and_assignee_id = a.assignor_and_assignee_id  GROUP BY aa.assignor_and_assignee_id) as total_occurences, a.rf_id FROM assignor as a INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = a.assignor_and_assignee_id INNER JOIN representative_assignment_conveyance as rac ON rac.rf_id = a.rf_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE a.rf_id IN (:IDs) AND rac.employer_assign = 0 GROUP BY a.or_name UNION SELECT a.assignor_and_assignee_id, a.ee_name as name, count(a.ee_name) as counter, r.representative_name as normalize_name, (select rr.representative_name FROM representative as rr WHERE rr.representative_name = aaa.name GROUP BY rr.representative_name) as representativeCompany, (SELECT aa.instances FROM assignor_and_assignee as aa WHERE aa.assignor_and_assignee_id = a.assignor_and_assignee_id  GROUP BY aa.assignor_and_assignee_id) as total_occurences, a.rf_id FROM assignee as a INNER JOIN representative_assignment_conveyance as ac ON ac.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = a.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE a.rf_id IN (:IDs) AND ac.employer_assign = 0 GROUP BY a.ee_name";

       
        assignors = await connection.resources.query(queryAssignor,{
            type: connection.Sequelize.QueryTypes.SELECT,
            replacements: { IDs: rfIDs },
            raw: true,
            logging: console.log,
            }
        ); */

        let queryAssignor = `SELECT assignor_and_assignee_id, name, SUM(counter) AS counter, normalize_name, representativeCompany, total_occurences, rf_id, flag FROM (SELECT a.assignor_and_assignee_id, a.or_name as name, count(a.or_name) as counter, r.representative_name as normalize_name, (select rr.representative_name FROM representative as rr WHERE rr.representative_name = aaa.name GROUP BY rr.representative_name) as representativeCompany, (SELECT aa.instances FROM assignor_and_assignee as aa WHERE aa.assignor_and_assignee_id = a.assignor_and_assignee_id  GROUP BY aa.assignor_and_assignee_id) as total_occurences, a.rf_id, 1 AS flag FROM assignor as a INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = a.assignor_and_assignee_id INNER JOIN representative_assignment_conveyance as rac ON rac.rf_id = a.rf_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE aaa.assignor_and_assignee_id NOT IN (SELECT inventors.assignor_and_assignee_id FROM inventors) AND a.rf_id IN (SELECT rf_id FROM documentid WHERE appno_doc_num IN (SELECT appno_doc_num FROM documentid WHERE rf_id IN (:rfIDs)) GROUP BY rf_id) AND rac.employer_assign = 0  AND date_format(a.exec_dt, '%Y') > :year GROUP BY a.or_name
        UNION ALL
        SELECT a.assignor_and_assignee_id, a.ee_name as name, count(a.ee_name) as counter, r.representative_name as normalize_name, (select rr.representative_name FROM representative as rr WHERE rr.representative_name = aaa.name GROUP BY rr.representative_name) as representativeCompany, (SELECT aa.instances FROM assignor_and_assignee as aa WHERE aa.assignor_and_assignee_id = a.assignor_and_assignee_id  GROUP BY aa.assignor_and_assignee_id) as total_occurences, a.rf_id, 1 AS flag  FROM assignee as a INNER JOIN representative_assignment_conveyance as ac ON ac.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = a.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id INNER JOIN assignor as aor ON aor.rf_id = a.rf_id WHERE date_format(aor.exec_dt, '%Y') > :year AND a.rf_id IN (SELECT rf_id FROM documentid WHERE appno_doc_num IN (SELECT appno_doc_num FROM documentid WHERE rf_id IN (:rfIDs)) GROUP BY rf_id) GROUP BY a.ee_name) AS temp GROUP BY name`;

       
        assignors = await connection.resources.query(queryAssignor,{
            type: connection.Sequelize.QueryTypes.SELECT,
            replacements: { rfIDs, year: connection.DEFAULT_YEAR },
            raw: true,
            logging: console.log,
            }
        );
    }             
    
    customer_list = [...assignees, ...assignors, ...inventors];  

    let list = [];
    
    if(customer_list.length > 0) {
        let names = [];
        customer_list.forEach( async name => {
            let n = name.normalize_name;
            if(n == "" || n == null || n != undefined){
                n = name.name;
            }
            n = n.trim().toLowerCase();
            if(!names.includes(n)){
                await names.push(n);
            }
        })
        for(let i = 0; i < names.length; i++) {
            let nam = names[i];
            let getList = await customer_list.filter(n => {
                let name = n.name;
                name = name.trim().toLowerCase();
                return (name == nam.trim().toLowerCase())? n : undefined;
            })
            if(getList != undefined && getList.length > 0){
                let getCounter = await getList.reduce((partialSum, a) => parseInt(partialSum) + parseInt(a.counter), 0);
                await list.push({id: getList[0].assignor_and_assignee_id, name: getList[0].name, normalize_name: getList[0].normalize_name, counter: getCounter, total_occurences: getList[0].total_occurences, representative_company: getList[0].representativeCompany, rf_id: getList[0].rf_id, flag: getList[0].flag});
            }
        }
    }
    if(list.length > 0){
        list.sort((a,b) => (a.name > b.name) ? 1 : ((b.name > a.name) ? -1 : 0)); 
    }
    return list;
}

/**
 * Find Customer Parties
 * Input Company name
 * Find representative of the company name and then find assignors and assignees of the representative
 */

let findCompanyCustomersByName = async(companyName, type) => {
    let customer_list = [], assignees = [], assignors = [];

    /**Find representative for this company */
    /*let findRepresentative = await AssignorAndAssignee.findOne({
        where:{name: companyName, representative_id: {[connection.Op.gt]: 0}},
        attributes:['representative_id'],
        include:[
            {
                model: Representatives,
                as: "representative",
                attributes: ['representative_name']
            }
        ]
    })*/





    let representativeName = "";

    let findRepresentative = await Representatives.findOne({
        where:{representative_name: companyName},
    });

    if(findRepresentative == null ) {
        findRepresentative = await AssignorAndAssignee.findOne({
            where:{name: companyName, representative_id: {[connection.Op.gt]: 0}},
            attributes:['representative_id'],
            include:[
                {
                    model: Representatives,
                    as: "representative",
                    attributes: ['representative_name']
                }
            ]
        })
        if(findRepresentative != null && findRepresentative.representative.representative_name != null) {
            representativeName = findRepresentative.representative.representative_name;
        } else {
            representativeName = companyName;
        }
    } else {
        representativeName = findRepresentative.representative_name
    }



    if(representativeName != '') {
        console.log("UPDATE ORG...");
        /*if(companyName != findRepresentative.representative_name) {
            Organisations.update({name: findRepresentative.representative_name},{where: {name: companyName}});
        }*/
        Organisations.update({name: representativeName},{where: {name: companyName}});


        let queryFindAssignorAndAssigneeIDs = "SELECT aa.assignor_and_assignee_id, aa.name FROM assignor_and_assignee as aa LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id where (r1.representative_name=:name OR aa.name = :name)";

        let listIDs = await connection.resources.query(queryFindAssignorAndAssigneeIDs,{
            type: connection.Sequelize.QueryTypes.SELECT,
            replacements: { name: representativeName },
            raw: true,
            logging: console.log,
            }
        );

        if(listIDs != null && listIDs.length > 0) {
            let assgnorAssigneeIDS = [], names = [];

            for(let i = 0; i< listIDs.length; i++){
                assgnorAssigneeIDS.push(listIDs[i].assignor_and_assignee_id);
                names.push(listIDs[i].name);
            }
            console.log(assgnorAssigneeIDS);
            /** Find Assignors */

            let queryAssigneeRFIDs = "SELECT rf_id FROM db_uspto.assignee as ac WHERE ac.assignor_and_assignee_id IN (:IDs)";

            

            assigneeRFIDs = await connection.resources.query(queryAssigneeRFIDs,{
                type: connection.Sequelize.QueryTypes.SELECT,
                replacements: { IDs: assgnorAssigneeIDS },
                raw: true,
                logging: console.log,
                }
            );

            let queryAssignorRFIDs = "SELECT rf_id FROM db_uspto.assignor as ac WHERE ac.assignor_and_assignee_id IN (:IDs)";

            assignorRFIDs = await connection.resources.query(queryAssignorRFIDs,{
                type: connection.Sequelize.QueryTypes.SELECT,
                replacements: { IDs: assgnorAssigneeIDS },
                raw: true,
                logging: console.log,
                }
            );

            rfIDsList = [...assigneeRFIDs, ...assignorRFIDs];    


            let rfIDs = [];
            rfIDsList.map( r => rfIDs.push(r.rf_id));
            customer_list = await findAssignorAndAssigneeListFromRFIDs(rfIDs, type);               
        }
    } else {
        console.log("No representative company....");
    }  
    return customer_list;
}

let findCompanyCustomersByID = async(ID) => {
    let customer_list = [], assignees = [], assignors = [];

    if(ID != undefined  && ID > 0) {
        let queryAssignor = "SELECT a.or_name as name, count(a.or_name) as counter, r.company_name as normalize_name FROM assignor as a LEFT JOIN representative as r ON r.representative_id = a.representative_id INNER JOIN (SELECT a.rf_id FROM assignee as a LEFT JOIN representative as r ON r.representative_id = a.representative_id WHERE a.representative_id = :ID GROUP BY a.rf_id) as b ON b.rf_id = a.rf_id  GROUP BY a.or_name";

        assignors = await connection.resources.query(queryAssignor,{
            type: connection.Sequelize.QueryTypes.SELECT,
            replacements: { ID: ID },
            raw: true,
            logging: console.log,
            }
        );	

        let queryAssignee = "SELECT a.ee_name as name, count(a.ee_name) as counter, r.company_name as normalize_name FROM assignee as a LEFT JOIN representative as r ON r.representative_id = a.representative_id INNER JOIN (SELECT a.rf_id FROM assignor as a LEFT JOIN representative as r ON r.representative_id = a.representative_id WHERE a.representative_id = :ID  GROUP BY a.rf_id) as b ON b.rf_id = a.rf_id  GROUP BY a.ee_name";

        assignees = await connection.resources.query(queryAssignee,{
            type: connection.Sequelize.QueryTypes.SELECT,
            replacements: { ID: ID },
            raw: true,
            logging: console.log,
            }
        );               
        
        customer_list = [...assignees, ...assignors];
    }
    let list = [];
    if(customer_list.length > 0) {
        let names = [];
        customer_list.forEach( async name => {
            let n = name.normalize_name;
            if(n == "" || n == null || n != undefined){
                n = name.name;
            }
            n = n.trim().toLowerCase();
            if(!names.includes(n)){
                await names.push(n);
            }
        })

        for(let i = 0; i < names.length; i++) {
            let nam = names[i];
            let getList = await customer_list.filter(n => {
                let name = n.normalize_name;
                if(name == "" || name == null || name == undefined) {
                    name = n.name;
                }
                name = name.trim().toLowerCase();
                return (name == nam.trim().toLowerCase())? n : undefined;
            })/*(n.normalize_name.toLowerCase() == nam || n.name.trim().toLowerCase() == nam )? n : undefined);*/
            if(getList != undefined && getList.length > 0){
                let getCounter = await getList.reduce((a, b) => +a + +b.counter, 0);
                await list.push({id: uuidv4(), name: getList[0].name, normalize_name: getList[0].normalize_name, counter: getCounter, projects:[]});
            }
        }
    }
    return list;
}

let findProfessionalFromUserID = async(userID, connectionDB) => {
    const queryFindProfessional = "SELECT professional_id FROM professional WHERE type = 0 AND email_address IN ( SELECT email_address FROM user WHERE user_id = :userID )";
    return  await connectionDB.query(queryFindProfessional,{
		type: connection.Sequelize.QueryTypes.SELECT,
		raw: true,
        logging: console.log,
        plain: true,
		replacements: { userID: userID },
	});
}


let findFakeDocument = async (connectionDB) => {
    const documentQuery = "SELECT document_id FROM document WHERE status = :status";
    let findDocument = await connectionDB.query(documentQuery,{
		type: connection.Sequelize.QueryTypes.SELECT,
		raw: true,
        logging: console.log,
        plain: true,
		replacements: { status: 4 },
    });
    
    if(findDocument == null) {
        const queryInsertDocument = "INSERT INTO document (title, status) VALUES (:title, :status)";

        const insertDocument = await connectionDB.query(queryInsertDocument,{
            type: connection.Sequelize.QueryTypes.INSERT,
            raw: true,
            logging: console.log,
            plain: true,
            replacements: { status: 4, title: ' ' },
        });

        findDocument = await connectionDB.query(documentQuery,{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            logging: console.log,
            plain: true,
            replacements: { status: 4 },
        });

    }
    return findDocument;
}

let findActivityByID = async (activityID, Activity, Comment) => {

    Activity.hasMany(Comment, { foreignKey: 'activity_id', as: 'comments' });

    Comment.belongsTo(Activity, { foreignKey: 'activity_id', as: 'activities' });

    const findActivity = await Activity.findOne({
        where: {activity_id: activityID},
        include:[
            {
                model: Comment,
                as: 'comments'
            }
        ],
        order: [
            [ { model: Comment, as: 'comments' }, 'createdAt', 'ASC'], 
        ],
    });
    return findActivity;
}

let getCollectionList = async(Collection, CollectionCompany) => {

    Collection.hasMany(CollectionCompany, { foreignKey: 'collection_id', as: 'collection_companies' });

    const getList = await Collection.findAll({
        attributes: ['collection_id', 'name'],
        include: [
            {
                model: CollectionCompany,
                as: 'collection_companies',
                attributes: ['collection_company_id', 'name', 'instances'],
            }
        ]
    })

    return getList;

}

let getCollectionByID = async(Collection, CollectionCompany, collectionID) => {

    Collection.hasMany(CollectionCompany, { foreignKey: 'collection_id', as: 'collection_companies' });

    const getData = await Collection.findOne({
        attributes: ['collection_id', 'name'],
        where: {collection_id: collectionID},
        include: [
            {
                model: CollectionCompany,
                as: 'collection_companies',
                attributes: ['collection_company_id', 'name', 'instances'],
            }
        ]
    })

    return getData;
}

const assignorData = async(rfID) => {
    const assignorQuery = `SELECT a.original_name AS original_name, aaa.name as or_name, r.representative_name as normalize_name, (SELECT original_name FROM assignor 
        WHERE assignor_and_assignee_id IN (
            SELECT assignor_and_assignee_id FROM assignor_and_assignee 
            WHERE representative_id = aaa.representative_id AND assignor_and_assignee.representative_id  <> 0 AND assignor_and_assignee.name = r.representative_name
            GROUP BY assignor_and_assignee_id
        ) 
        ORDER BY exec_dt DESC 
        LIMIT 1 
    ) AS representative_original_name
    , date_format(MAX(a.exec_dt),"%Y-%m-%d %h:%i:%s") as exec_dt, aaa.assignor_and_assignee_id as id FROM assignor as a INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = a.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE a.rf_id = :rfID  GROUP BY aaa.name, normalize_name ORDER BY a.exec_dt ASC`;
    let assignor = await connection.resources.query(assignorQuery,{
		type: connection.Sequelize.QueryTypes.SELECT,
		raw: true,
		logging: console.log,
		replacements: { rfID: rfID },
	});
    return assignor;
}

const assigneeData = async(rfID) => {
    const assigneeQuery = `SELECT a.*, aaa.name as ee_name, r.representative_name as normalize_name, (SELECT original_name FROM assignee 
        WHERE assignor_and_assignee_id IN (
            SELECT assignor_and_assignee_id FROM assignor_and_assignee 
            WHERE representative_id = aaa.representative_id AND assignor_and_assignee.representative_id  <> 0 AND assignor_and_assignee.name = r.representative_name
            GROUP BY assignor_and_assignee_id
        ) 
        ORDER BY rf_id DESC 
        LIMIT 1 
    ) AS representative_original_name
    , aaa.assignor_and_assignee_id as id FROM assignee as a INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = a.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE a.rf_id = :rfID  GROUP BY aaa.name, normalize_name`;
    let assignee = await connection.resources.query(assigneeQuery,{
		type: connection.Sequelize.QueryTypes.SELECT,
		raw: true,
		logging: console.log,
		replacements: { rfID: rfID },
	});
    return assignee;
}

const assignmentData = async(rfID) => {
    const assignmentQuery = 'SELECT ac.*, acc.convey_ty, acc.employer_assign FROM assignment as ac INNER JOIN representative_assignment_conveyance as acc ON acc.rf_id = ac.rf_id WHERE ac.rf_id = :rfID';
    let assignment = await connection.resources.query(assignmentQuery,{
		type: connection.Sequelize.QueryTypes.SELECT,
		raw: true,
		logging: console.log,
		plain:true,
		replacements: { rfID: rfID },
	});
    return assignment;
}

const documentData = async(rfID) => {
    const documentQuery = 'SELECT * FROM documentid WHERE rf_id = :rfID';
    let properties = await connection.resources.query(documentQuery,{
        type: connection.Sequelize.QueryTypes.SELECT,
        raw: true,
        logging: console.log,
        replacements: { rfID: rfID },
    });	
    return properties;
}

let getAssignmentDataByrfID = async (rfID, t = 0) => {
	
    const assignor = await assignorData(rfID)
    const assignee = await assigneeData(rfID)
    const assignment = await assignmentData(rfID)
    let properties = []
    if( t === 0 ) {
        properties = await documentData(rfID)
    }
	
    let releaseAssignor = [], releaseAssignee = [], releaseAssignment = [], releaseProperties = []
    const queryCheckRelesed = 'SELECT release_rf_id FROM db_new_application.activity_parties_transactions WHERE rf_id = :rfID';
    let releasedData = await connection.resources.query(queryCheckRelesed,{
		type: connection.Sequelize.QueryTypes.SELECT,
		raw: true,
		logging: console.log,
		plain:true,
		replacements: { rfID: rfID },
	});
    if(releasedData != null && releasedData.release_rf_id > 0) {
        releaseAssignor = await assignorData(releasedData.release_rf_id)
        releaseAssignee = await assigneeData(releasedData.release_rf_id)
        releaseAssignment = await assignmentData(releasedData.release_rf_id)
        if( t === 0 ) {
            releaseProperties = await documentData(releasedData.release_rf_id)
        }
        console.log(releaseAssignor, releaseAssignee, releaseAssignment, releaseProperties)
    }
	return {assignee, assignor, assignment, properties, releaseAssignor, releaseAssignee, releaseAssignment, releaseProperties};
}

let generateJSON = async(req, res) => {
    try {
        console.log("SAAAPPAPAP: "+req.params.patentNumber);
        let orgID = 0, userID = 0, flag = '';
        if( req.orgId != undefined && req.orgId > 0 ) {
            orgID = req.orgId;
            userID = req.userId;            
        }

        if(typeof req.query.flag !== 'undefined' && req.query.flag >= 0){
            flag = req.query.flag 
        }
        console.log(process.env.BACKGROUND_JOB_URL+""+process.env.JSON_GENERATE+"?p="+req.params.asset+"&f="+flag+"&o="+orgID+"&u="+userID);
        await request(process.env.BACKGROUND_JOB_URL+""+process.env.JSON_GENERATE+"?p="+req.params.asset+"&f="+flag+"&o="+orgID+"&u="+userID,function (error, response, body) {
            if (!error && response.statusCode == 200) {
                console.log("request complete");
                if(body != ""){
                    try{
                        if(body.indexOf('box') >= 0){
                            body.share = 2;
                            res.status(200).send(body);
                        } else {
                            res.status(200).send("");
                        }
                    }catch(e){
                        res.status(200).send("");
                    }
                } else {
                    res.status(200).send("");
                }                            
            } else {
                console.log(error);
                res.status(200).send("");
            }
        });
    } catch (err) {
        console.log(err);
    }
}

let getNewCode = async () => {
    const retryLimit = 50;
    let newCode = undefined;
    let run =  true;
    for (let i = 0; i < retryLimit; i++) {
        if(run === true){
            const code = uuidv4() + (Math.random()*1e32).toString(36).substr(0,10);
            await Share.findOne({
                where:{code: code},
                attributes: ['share_id']
            })
            .then( s => {
                if(s == null){ 
                    newCode = code ;
                    run = false;
                }
            })  
        } else {
            return newCode;
        }        
    }
    return newCode;
};

const removeAllOldSharingUrl = async(organisation_id) => {
    const findOldShare = await Share.findAll({
        attributes: ['share_id'], 
        where : {organisation_id}
    })

    if(findOldShare.length > 0) {
        const oldShareIDs = []
        findOldShare.forEach( row => {
            oldShareIDs.push(row.get('share_id'))
        })
        await ShareLists.destroy({
            where: {share_id: oldShareIDs}
        })
        await Share.destroy({
            where: {share_id: oldShareIDs}
        })
    }
}

let shareURL = async (params) => {
    console.log(params.assets)
    const assets = JSON.parse(params.assets)
    const transactions = typeof params.transactions !== 'undefined' ? JSON.parse(params.transactions) : []

    if( assets.length > 0 || transactions.length > 0) {
        //await removeAllOldSharingUrl(params.organisation_id)


        let insertRecord = await Share.create({
            code: params.code,
            organisation_id: params.organisation_id,        
            user_id: params.user_id,
            type: params.type
        });
        if(insertRecord != null && insertRecord.share_id > 0) {      
            
            const bulkData = []
            if(assets.length > 0) {
                assets.forEach(item => bulkData.push({asset: item.asset, type: item.flag, share_id: insertRecord.share_id}))
            } else if(transactions.length > 0) {
                const query = "SELECT CASE WHEN patent = '' THEN application ELSE patent END AS asset, CASE WHEN patent = '' THEN 4 ELSE 5 END AS flag FROM (SELECT documentid.appno_doc_num AS application, MAX(documentid.grant_doc_num) AS patent  FROM assets INNER JOIN db_uspto.documentid AS doc ON assets.appno_doc_num = doc.appno_doc_num WHERE doc.rf_id IN (:rfIDs) AND organisation_id = :organisation_id GROUP BY doc.rf_id, assets.appno_doc_num) AS temp"
                const getList = await connection.applicationNew.query(query,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    logging: console.log,
                    replacements: {organisation_id: params.organisation_id, rfIDs: transactions},
                    }
                );

                if( getList.length > 0 ) {
                    insertRecord.update({transactions: JSON.stringify(transactions)})
                    getList.forEach( item => {
                        bulkData.push({asset: item.asset, type: item.flag, share_id: insertRecord.share_id})
                    })
                }
            }

            if(bulkData.length > 0) {                
                const addBulkData = await ShareLists.bulkCreate(bulkData, { ignoreDuplicates: true })
    
                if(addBulkData) {
                    return `https://${params.type == 2 ? 'sample.app' : params.type == 0 ? 'standard.app' : 'share'}.patentrack.com/${params.code}`;
                } else {
                    return '';
                }
            } else {
                return '';
            }            
        } else {
            return '';
        }
    } else {
        return '';
    }    
};

let getShareList = async (code, type) => {
    console.log('type', code, type)
    if(type == 9) {
        let query = "SELECT share.transactions, share.share_button FROM share  WHERE code = :code  AND type = :type"
        const shareData = await connection.applicationNew.query(query,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: {code, type},
                plain: true
            }
        );
        return shareData;
    } else {
        const assetsList = []
        const shareData = await Share.findOne({
            attributes: ['share_id', 'transactions'],
            where: {code, type}
        })
        if(shareData != null) {
            if(shareData.get('transactions') !== null) {
                
            }
        }
        let query = "SELECT  `share_lists`.`asset` AS asset, `share_lists`.`type`, `share`.`organisation_id` FROM `share` AS `share` INNER JOIN `share_list` AS `share_lists` ON `share`.`share_id` = `share_lists`.`share_id` WHERE `share`.`code` = :code  AND share.type = :type"
        
        /* if(type !== 'undefined' && type !== undefined && parseInt(type) === 2) {
            query += " AND share.type = :type"
        } else {
            query += " AND share.type <> :type"
        } */

        const shareList = await connection.applicationNew.query(query,{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            logging: console.log,
            replacements: {code, type},
            }
        );

        if( shareList.length > 0 ) {
            const grant = [], app = []

            let organisation_id = 0
            
            shareList.forEach( row => {
                if(organisation_id == 0) {
                    organisation_id = row.organisation_id
                }
                if(row.type === 4) {
                    grant.push(row.asset)
                } else {
                    app.push(row.asset)
                }
            })

            if((grant.length > 0 || app.length > 0) && organisation_id > 0) { 
                let queryAssets = `SELECT application AS appno_doc_num, patent AS grant_doc_num, CASE WHEN patent = '' THEN application ELSE patent END AS asset, CASE WHEN patent = '' THEN 1 ELSE 0 END AS asset_type, '' AS channel, 0 AS child_count  FROM db_new_application.dashboard_items WHERE  organisation_id = :organisation_id AND ( ` 

                if(grant.length > 0) {
                    queryAssets += `  patent IN (:grant)  `
                } 

                
                if(app.length > 0) {
                    if(grant.length > 0) {
                        queryAssets += ` OR ` 
                    }
                    queryAssets += `application IN (:app) `
                }
                
                queryAssets += ` ) GROUP BY application`

                const grantData = await connection.applicationNew.query(queryAssets,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    logging: console.log,
                    replacements: {grant, app, organisation_id},
                    }
                );

                if(grantData.length > 0) {
                    grantData.forEach( row => {
                        assetsList.push(row)
                    })
                }
            } 
            return assetsList;
        }
    }
}

let getShareDataByCode = async (code) => {
    return await Share.findOne({
        where:{code}
	});
}

let getShareDataByCodeWithAssets = async (code, asset) => {
    return await Share.findOne({
        where:{code},
        include:[
            {                       
                model: ShareLists,
                attributes: [ 'asset', 'type' ],  
            }
        ]
	});
}

let getShareData = async (code, asset) => {
    return await Share.findOne({
        where:{code},
        include:[
            {                       
                model: ShareLists,
                attributes: [ 'asset', 'type' ],
                where: {asset}             
            }
        ]
	});
}


let getCompaniesMinAndMaxDateTransaction = async(searchData) => {

    let firstDate = "", secondDate = "", minDate = "", maxDate = "";

    let customMinQuery = 'SELECT concat(aa.assignor_and_assignee_id,ac.rf_id) as id, ac.rf_id, aa.name as raw_name, r1.representative_name as normalize_name, acc.convey_ty, acc.employer_assign, ac.exec_dt FROM assignor as ac INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id INNER JOIN (SELECT ee.rf_id FROM assignee as ee INNER JOIN documentid as d ON d.rf_id = ee.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE (aaa.name IN (:name)  or r.representative_name IN (:name)) AND date_format(d.appno_date,"%Y") > "connection.DEFAULT_YEAR") as temp ON temp.rf_id = ac.rf_id WHERE acc.convey_ty IN (:convey_type) AND acc.employer_assign = :employer_assign GROUP BY ac.rf_id ORDER BY ac.exec_dt ASC LIMIT :recordLimit';

    let getMinAssignmentData = await connection.application.query(customMinQuery,{
        type: connection.Sequelize.QueryTypes.SELECT,
        raw: true,
        logging: console.log,
        replacements: searchData,
        plain:true
        }
    );      

    if(getMinAssignmentData != null && getMinAssignmentData.id > 0) {
        firstDate = new Date(getMinAssignmentData.exec_dt).getTime();
    }

    customMinQuery = 'SELECT concat(aa.assignor_and_assignee_id,ac.rf_id) as id, ac.rf_id, aa.name as raw_name, r1.representative_name as normalize_name, acc.convey_ty, acc.employer_assign, (SELECT ap.exec_dt FROM assignor as ap WHERE ap.rf_id = ac.rf_id ORDER BY ap.exec_dt ASC LIMIT 1) as exec_dt FROM assignee as ac INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id  INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id INNER JOIN (SELECT or.rf_id FROM assignor as `or` INNER JOIN documentid as d ON d.rf_id = or.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = or.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id  WHERE (aaa.name IN ( :name ) or r.representative_name  IN (:name)) AND date_format(d.appno_date,"%Y") > "connection.DEFAULT_YEAR" ) as temp ON temp.rf_id = ac.rf_id WHERE acc.convey_ty IN (:convey_type) AND acc.employer_assign = :employer_assign GROUP BY ac.rf_id ORDER BY exec_dt ASC LIMIT :recordLimit';
    
    /*Assignment organization as assignor i.e sale, security*/
        
    let getMinAssigneeData = await connection.application.query(customMinQuery,{
        type: connection.Sequelize.QueryTypes.SELECT,
        raw: true,
        logging: console.log,
        replacements: searchData,
        plain:true
        }
    );   

    if(getMinAssigneeData != null && getMinAssigneeData.id > 0) {
        secondDate = new Date(getMinAssigneeData.exec_dt).getTime();
    }

    if(firstDate != "" && secondDate != "") {
        if(firstDate < secondDate) {
            minDate = firstDate;
        } else {
            minDate = secondDate;
        }
    } else if(firstDate != "") {
        minDate = firstDate;
    } else {
        minDate = secondDate;
    }

    /**
     * Find Max Date
     */
    searchData.recordLimit = 1;        
    let customMaxQuery = 'SELECT concat(aa.assignor_and_assignee_id,ac.rf_id) as id, ac.rf_id, aa.name as raw_name, r1.representative_name as normalize_name, acc.convey_ty, acc.employer_assign, ac.exec_dt FROM assignor as ac INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id INNER JOIN (SELECT ee.rf_id FROM assignee as ee INNER JOIN documentid as d ON d.rf_id = ee.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE (aaa.name IN (:name)  or r.representative_name IN (:name)) AND date_format(d.appno_date,"%Y") > "connection.DEFAULT_YEAR") as temp ON temp.rf_id = ac.rf_id WHERE acc.convey_ty IN (:convey_type) AND acc.employer_assign = :employer_assign GROUP BY ac.rf_id ORDER BY ac.exec_dt DESC LIMIT :recordLimit';


    let getMaxAssignmentData = await connection.application.query(customMaxQuery,{
        type: connection.Sequelize.QueryTypes.SELECT,
        raw: true,
        logging: console.log,
        replacements: searchData,
        plain:true
        }
    );      
    
    

    if(getMaxAssignmentData != null && getMaxAssignmentData.id > 0) {
        firstDate = new Date(getMaxAssignmentData.exec_dt).getTime();
    }

    customMaxQuery = 'SELECT concat(aa.assignor_and_assignee_id,ac.rf_id) as id, ac.rf_id, aa.name as raw_name, r1.representative_name as normalize_name, acc.convey_ty, acc.employer_assign, (SELECT ap.exec_dt FROM assignor as ap WHERE ap.rf_id = ac.rf_id ORDER BY ap.exec_dt ASC LIMIT 1) as exec_dt FROM assignee as ac INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id  INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id INNER JOIN (SELECT or.rf_id FROM assignor as `or` INNER JOIN documentid as d ON d.rf_id = or.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = or.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id  WHERE (aaa.name IN ( :name ) or r.representative_name  IN (:name)) AND date_format(d.appno_date,"%Y") > "connection.DEFAULT_YEAR" ) as temp ON temp.rf_id = ac.rf_id WHERE acc.convey_ty IN (:convey_type) AND acc.employer_assign = :employer_assign GROUP BY ac.rf_id ORDER BY exec_dt DESC LIMIT :recordLimit';
        /*Assignment organization as assignor i.e sale, security*/
        
    let getMaxAssigneeData = await connection.application.query(customMaxQuery,{
        type: connection.Sequelize.QueryTypes.SELECT,
        raw: true,
        logging: console.log,
        replacements: searchData,
        plain:true
        }
    );   

    if(getMaxAssigneeData != null && getMaxAssigneeData.id > 0) {
        secondDate = new Date(getMaxAssigneeData.exec_dt).getTime();
    }

    if(firstDate != "" && secondDate != "") {
        if(firstDate > secondDate) {
            maxDate = firstDate;
        } else {
            maxDate = secondDate;
        }
    } else if(firstDate != "") {
        maxDate = firstDate;
    } else {
        maxDate = secondDate;
    }

    return {min_date: minDate, max_date: maxDate};
}


const findAssetsTimeSpanByTransactionById = async(rfID) => {
    let assetsLifeSpan = [];
    const getAssetList = await DocumentIds.findAll({
        /* attributes: [['appno_doc_num','application'], ['grant_doc_num', 'patent'], 'status', 'appno_date'], */
        attributes: [['appno_doc_num','application'], ['grant_doc_num', 'patent'], 'appno_date'],
        where: {
            [connection.Op.and]: [
                connection.Sequelize.where(
                    connection.Sequelize.fn(
                        'DATE_FORMAT',
                        connection.Sequelize.col('appno_date'),
                        '%Y'
                    ),
                    connection.Sequelize.Op.gte,
                    1990
                ),
                {appno_doc_num: {[connection.Op.ne]: ''}},
                {grant_doc_num: {[connection.Op.ne] : ''}},
                {rf_id: rfID}
            ]
        },
        group:['appno_doc_num']             
    });
    const applicationNumberAdded = [], dateAdded = [];

    if(getAssetList.length > 0) {                
        const timelineSpan = [];
        const promises = getAssetList.map( async application => {
            if(!applicationNumberAdded.includes(application.get('application'))){
                const startYear = moment(new Date(application.appno_date)).format(ASSETS_LIFE_SPAN_DATE_FORMAT);
                let endYear = moment(new Date(application.appno_date)).add(20, 'years').format(ASSETS_LIFE_SPAN_DATE_FORMAT);
                for(let i = parseInt(startYear); i <= parseInt(endYear); i++) {
                    timelineSpan.push({year: i, count: 1, application: application.get('application')});
                }
                applicationNumberAdded.push(application.get('application'));
                dateAdded.push(application.appno_date);
            }            
            return application;
        });

        await Promise.all(promises);
        console.log("TOTALAPPLICATIONS",JSON.stringify(dateAdded));
        assetsLifeSpan = findMaxMin(timelineSpan)        
    }
    return assetsLifeSpan;
}

const findAllAssetsTimeSpan = async( companies, tabs, customers, rfIDs, orgID ) => {
    const where = {organisation_id: orgID};
    let assetsLifeSpan = [];

    if(companies.length > 0) {
        where.representative_id = companies
    }

    if(tabs.length > 0) {
        where.tab_id = tabs
    }

    if(customers.length > 0) {
        where.assignor_and_assignee_id = customers
    }

    if(rfIDs.length > 0) {
        where.rf_id = rfIDs
    }

    const getAssetList = await TreePartiesCollections.findAll({
        attributes:[],
        where: where,
        include:[
            {                       
                model: DocumentIds,
                as: 'assets',
                attributes: [['appno_doc_num','application'], ['grant_doc_num', 'patent'], 'status', 'appno_date'],
                where:{
                    [connection.Op.and]: [
                        connection.Sequelize.where(
                            connection.Sequelize.fn(
                                'DATE_FORMAT',
                                connection.Sequelize.col('assets.appno_date'),
                                '%Y'
                            ),
                            connection.Sequelize.Op.gte,
                            1990
                        ),
                        {appno_doc_num: {[connection.Op.ne]: ''}},
                        {grant_doc_num: {[connection.Op.ne] : ''}}
                    ]
                },
            }
        ],
        group:['assets.appno_doc_num']             
    });




    const applicationNumberAdded = [], dateAdded = [];

    console.log("TOTALITEMS",getAssetList.length);
    
    if(getAssetList.length > 0) {                
        const timelineSpan = [];
        const promises = getAssetList.map( async item => {
            if(item.assets.length > 0) {
                const assetPromise = item.assets.map(application => {
                    if(!applicationNumberAdded.includes(application.get('application'))){
                        const startYear = moment(new Date(application.appno_date)).format(ASSETS_LIFE_SPAN_DATE_FORMAT);
                        let endYear = moment(new Date(application.appno_date)).add(20, 'years').format(ASSETS_LIFE_SPAN_DATE_FORMAT);
                        for(let i = parseInt(startYear); i <= parseInt(endYear); i++) {
                            timelineSpan.push({year: i, count: 1, application: application.get('application')});
                        }
                        applicationNumberAdded.push(application.get('application'));
                        dateAdded.push(application.appno_date);
                    }            
                    return application;
                });
                await Promise.all(assetPromise);
            }
            return item;
        });

        await Promise.all(promises);
        console.log("TOTALAPPLICATIONS",JSON.stringify(dateAdded));
        assetsLifeSpan = findMaxMin(timelineSpan)        
    }
    return assetsLifeSpan;

}

const findAssetsTimeSpan = async(portfolioList, tabID, customerID, rfID, orgID) => {    

    const where = {organisation_id: orgID};
    let assetsLifeSpan = [];

    if(portfolioList != null) {
        where.representative_id = portfolioList
    }    

    if(tabID != undefined && tabID != null && parseInt(tabID) > 0) {
        where.tab_id = parseInt(tabID);
    }

    if(parseInt(customerID) > 0) {
        where.assignor_and_assignee_id = parseInt(customerID);
    }

    if(parseInt(rfID) > 0) {
        where.rf_id = parseInt(rfID);
    }

    const getAssetList = await TreePartiesCollections.findAll({
        attributes:[],
        where: where,
        include:[
            {                       
                model: DocumentIds,
                as: 'assets',
                attributes: [['appno_doc_num','application'], ['grant_doc_num', 'patent'], 'status', 'appno_date'],
                where:{
                    [connection.Op.and]: [
                        connection.Sequelize.where(
                            connection.Sequelize.fn(
                                'DATE_FORMAT',
                                connection.Sequelize.col('assets.appno_date'),
                                '%Y'
                            ),
                            connection.Sequelize.Op.gte,
                            2000
                        ),
                        {appno_doc_num: {[connection.Op.ne]: ''}},
                        {grant_doc_num: {[connection.Op.ne] : ''}}
                    ]
                },
            }
        ],
        group:['assets.appno_doc_num']             
    });

    const applicationNumberAdded = [], dateAdded = [];

    console.log("TOTALITEMS",getAssetList.length);
    
    if(getAssetList.length > 0) {                
        const timelineSpan = [];
        const promises = getAssetList.map( async item => {
            if(item.assets.length > 0) {
                const assetPromise = item.assets.map(application => {
                    if(!applicationNumberAdded.includes(application.get('application'))){
                        const startYear = moment(new Date(application.appno_date)).format(ASSETS_LIFE_SPAN_DATE_FORMAT);
                        let endYear = moment(new Date(application.appno_date)).add(20, 'years').format(ASSETS_LIFE_SPAN_DATE_FORMAT);
                        for(let i = parseInt(startYear); i <= parseInt(endYear); i++) {
                            timelineSpan.push({year: i, count: 1, application: application.get('application')});
                        }
                        applicationNumberAdded.push(application.get('application'));
                        dateAdded.push(application.appno_date);
                    }            
                    return application;
                });
                await Promise.all(assetPromise);
            }
            return item;
        });

        await Promise.all(promises);
        console.log("TOTALAPPLICATIONS",JSON.stringify(dateAdded));
        assetsLifeSpan = findMaxMin(timelineSpan)        
    }
    return assetsLifeSpan;
}




const findMaxMin = async(timelineSpan) => {
    let assetsLifeSpan = []

    const {max, min} = await minMax2DArray(timelineSpan, 'year');
        
    for(let i = min; i < max; i++) {

        let getList = await timelineSpan.filter( item => {
            return i == parseInt(item.year) ? item : undefined;
        });

        if(getList != undefined && getList.length > 0) {
            
            let Counter = await getList.reduce((a, b) => +a + +b.count, 0);
            assetsLifeSpan.push({ year: i, count: Counter });
        }
    }

    return assetsLifeSpan
}

const findMaxMinLifeSpan = async(timelineSpan) => {
    let assetsLifeSpan = [['year', 'count', {type: 'string', role: 'style'}, {type: 'string', role: 'tooltip', 'p': {'html': true}}]]

    const {max, min} = await minMax2DArray(timelineSpan, 'year');
    const currentYear = moment(new Date()).format('YYYY');
    let entered = false
    for(let i = min; i < max; i++) {

        let getList = await timelineSpan.filter( item => {
            return i == parseInt(item.year) ? item : undefined;
        });

        if(getList != undefined && getList.length > 0) {
            
            let Counter = await getList.reduce((a, b) => +a + +b.count, 0);
            let counterWithYear = []
            counterWithYear.push(i)
            counterWithYear.push(Counter)
            counterWithYear.push('stroke-width:1;stroke-color:#2196f3;fill-color:#1565C0;')
            counterWithYear.push(`Year: ${i}\nNumber of Assets: ${Counter}`)
            if(i >= currentYear) { 
                assetsLifeSpan.push(counterWithYear)
            }
        }
        /* if(currentYear == i) {
            assetsLifeSpan.push([currentYear, 0, null, null])  
            entered = true
        } */
    }
   /*  if(entered === false) {
        assetsLifeSpan.push([currentYear, 0, null, null])  
    } */
    return assetsLifeSpan
}

const findMaxMinWithCompanies = async(companies, timelineSpan) => {
    let assetsLifeSpan = []

    const {max, min} = await minMax2DArray(timelineSpan, 'year');
    const currentYear = moment(new Date()).format('YYYY');
    let entered = false
    for(let i = min; i < max; i++) {
        const companiesYear = []
        companiesYear.push(i)
        companiesYear.push(null)
        const promise = companies.map(async company => {
            let Counter = 0
            let getList = await timelineSpan.filter( item => {
                return i == parseInt(item.year) && item.company_id === company.representative_id  ? item : undefined;
            });
            if(getList != undefined && getList.length > 0) {            
                Counter = await getList.reduce((a, b) => +a + +b.count, 0);                
            }
            companiesYear.push(Counter)
            companiesYear.push('stroke-width:1;stroke-color:#2196f3;fill-color:#1565C0;')
            companiesYear.push(`Year: ${i}\nOwner: ${company.representative_name}\nNumber of Assets: ${Counter}`)
            return company;
            //.push({ year: i, company, count: Counter });
        })
        await Promise.all(promise)   
        if(i === min) {
            const labels = ['year', {type: 'string', role: 'annotation'}];
            
            const labelPromise = companies.map( company => {
                labels.push(company.representative_name)
                labels.push({type: 'string', role: 'style'})
                labels.push({type: 'string', role: 'tooltip', 'p': {'html': true}})
            })
            //labels.push({role: 'style', type: 'string'})
            await Promise.all(labelPromise)   
            assetsLifeSpan.push(labels)  
        } 
        assetsLifeSpan.push(companiesYear)     
        if(currentYear == i) {
            const currentLabel = [currentYear, '']
            const labelPromise = companies.map( company => {
                currentLabel.push(0)
                currentLabel.push(null)
                currentLabel.push(null)
            })
            await Promise.all(labelPromise)   
            assetsLifeSpan.push(currentLabel)  
            entered = true
        }        
    }
    if(entered === false) {
        const currentLabel = [currentYear, '']
        const labelPromise = companies.map( company => {
            currentLabel.push(0)
            currentLabel.push(null)
            currentLabel.push(null)
        })
        await Promise.all(labelPromise)   
        assetsLifeSpan.push(currentLabel)  
    }
    return assetsLifeSpan
}

const findRfIDsBySearchString = async(req) => {
    
    const { search_string } = req.params
    let list = [], limit = 100, customQuery3rdParty = ''
    const searchList = [], uniquerfIDs = []

    if(!isNaN(search_string)) {
        customQuery3rdParty = `SELECT tpc.rf_id as rf_id, date_format(tpc.exec_dt,'%m/%d/%Y') as date, (SELECT count(*) FROM documentid as dd WHERE dd.rf_id = tpc.rf_id) as assets FROM tree_parties as tp INNER JOIN tree_parties_collection as tpc ON tp.assignor_and_assignee_id = tpc.assignor_and_assignee_id WHERE tpc.rf_id IN (SELECT rf_id FROM db_uspto.representative_transactions WHERE organisation_id = :orgId) AND tpc.rf_id = :searchItem GROUP BY tpc.rf_id LIMIT :limit`
    } else {
        customQuery3rdParty = `SELECT tpc.rf_id as rf_id, date_format(tpc.exec_dt,'%m/%d/%Y') as date, (SELECT count(*) FROM documentid as dd WHERE dd.rf_id = tpc.rf_id ) as assets FROM tree_parties as tp INNER JOIN tree_parties_collection as tpc ON tp.assignor_and_assignee_id = tpc.assignor_and_assignee_id WHERE tpc.rf_id IN (SELECT rf_id FROM db_uspto.representative_transactions WHERE organisation_id = :orgId) AND MATCH(tp.name) AGAINST (:searchItem) GROUP BY tpc.rf_id LIMIT :limit`
    }

    let getList = await connection.application.query(customQuery3rdParty,{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            logging: console.log,
            replacements: { searchItem: search_string, orgId: req.orgId, limit: limit },
        }
    );

    if( getList.length > 0) {
        list = [ ...list, ...getList]
    }

    const customQueryLawyer = `SELECT a.rf_id as rf_id, (SELECT date_format(exec_dt,'%m/%d/%Y') FROM assignor WHERE assignor.rf_id = a.rf_id LIMIT 1) as date, (SELECT count(*) FROM documentid as dd WHERE dd.rf_id = a.rf_id ) as assets FROM assignment as a WHERE a.rf_id IN (SELECT rf_id FROM db_uspto.representative_transactions WHERE organisation_id = :orgId) AND MATCH(a.cname, a.caddress_1) AGAINST (:searchItem) GROUP BY a.rf_id LIMIT :limit`

    getList = await connection.application.query(customQueryLawyer,{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            logging: console.log,
            replacements: { searchItem: search_string, orgId: req.orgId, limit: limit },
        }
    );

    if( getList.length > 0) {
        list = [ ...list, ...getList]
    }

    let customQueryDocument = ''

    if(!isNaN(search_string)) {
        customQueryDocument = `SELECT d.rf_id as rf_id, (SELECT date_format(exec_dt,'%m/%d/%Y') FROM assignor WHERE assignor.rf_id = d.rf_id LIMIT 1) as date, (SELECT count(*) FROM documentid as dd WHERE dd.rf_id = d.rf_id ) as assets FROM documentid as d WHERE d.rf_id IN (SELECT rf_id FROM db_uspto.representative_transactions WHERE organisation_id = :orgId) AND (d.appno_doc_num = :searchItem OR d.grant_doc_num = :searchItem) GROUP BY d.rf_id LIMIT :limit` 
    } else {
        customQueryDocument = `SELECT d.rf_id as rf_id, (SELECT date_format(exec_dt,'%m/%d/%Y') FROM assignor WHERE assignor.rf_id = d.rf_id LIMIT 1) as date, (SELECT count(*) FROM documentid as dd WHERE dd.rf_id = d.rf_id ) as assets FROM documentid as d WHERE d.rf_id IN (SELECT rf_id FROM db_uspto.representative_transactions WHERE organisation_id = :orgId) AND d.grant_doc_num = :searchItem GROUP BY d.rf_id LIMIT :limit` 
    }

    getList = await connection.application.query(customQueryDocument,{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            logging: console.log,
            replacements: { searchItem: search_string, orgId: req.orgId, limit: limit},
        }
    );
    
    if( getList.length > 0) {
        list = [ ...list, ...getList]
    }

    if(list.length) {
        const promise = list.map( item => {
            if(!uniquerfIDs.includes(item.rf_id)) {
                searchList.push(item)
                uniquerfIDs.push(item.rf_id)
            }
            return item
        })

        await Promise.all(promise)
    }
    return {uniquerfIDs,searchList}
}

const minMax2DArray = async(arr, idx) => {
    console.log(arr.length);
    var max = -Number.MAX_VALUE,
        min = Number.MAX_VALUE;
    arr.forEach(function(e) {
        if (max < e[idx]) {
            max = e[idx];
        }
        if (min > e[idx]) {
           min = e[idx];
       }
    });
    return {max: max, min: min};
}

const findLayout = (layout) => {
    let layoutID = 15
    switch(layout) {
        case 'restore_ownership':
            layoutID = 1
            break
        /* case 'pay_maintainence_fee':
            layoutID = 3
            break; */
        case 'clear_encumbrances':
            layoutID = 18
            break
        case 'incorrect_address':
            layoutID = 19
            break
        case 'incorrect_names':
            layoutID = 17
            break
        case 'to_be_monitized':
            layoutID = 20
            break
        case 'unnecessary_patents':
            layoutID = 21
            break
        case 'missed_monetization':
            layoutID = 22
            break
        case 'late_maintainance':
            layoutID = 23
            break
        case 'incorrect_recording':
            layoutID = 24
            break
        case 'late_recording':
            layoutID = 25
            break
        case 'deflated_collaterals':
            layoutID = 26
            break
        case 'assigned':
            layoutID = 30
            break
        case 'filled':
            layoutID = 31
            break
        case 'acquired':
            layoutID = 32
            break
        case 'divested':
            layoutID = 33
            break
        case 'collaterlized':
            layoutID = 34
            break
        case 'maintenance_budget':
        case 'pay_maintainence_fee':
            layoutID = 35
            break
        case 'abandoned':
            layoutID = 36
            break
        case 'ptab':
            layoutID = 37
            break
        case 'top_non_us_members':
            layoutID = 38
            break
        case 'proliferate_inventors':
            layoutID = 39
            break
        case 'top_law_firms':
            layoutID = 40
            break
        case 'top_lenders':
            layoutID = 41
            break
        case 'uncollateralized':
            layoutID = 45
            break
        /*case 'correct_details':
            layoutID = 4
            break */
        default:
            layoutID = 15
    }
    return layoutID
}

const ArrayInterString = (data) => {
    const result = Object.entries(data).reduce((r, [k, o]) => {
        r[k] = Object.entries(o).reduce((r, [k, v]) => {
            let _v = Number(v);
            if(!Number.isNaN(_v)) { v = _v; }
            return (r[k] = v, r);
        }, {});
        return r;
    }, {});
    return result
}


const findFilterAssets = async(req) => {
    try {
        let { list, total, type, selectedCompanies, tabs, customers, assignments, data_type, format_type, other_mode, sale, license } = req.body
        
        const where = { year: connection.DEFAULT_YEAR, organisationID: req.orgId}  

        const companies = JSON.parse(selectedCompanies)
        if(companies.length > 0) {
            where.company_id = companies
        }
        let query = '';
        if(typeof data_type != 'undefined' && data_type == 1) {
            query = "SELECT appno_doc_num FROM owned_assets WHERE organisation_id = :organisationID AND company_id IN (:company_id)"
        } else { 
            list = JSON.parse(list);

            /* if(list.length > 0) {  */

                if(parseInt(total) != list.length || list.length == 0) {
                    /**
                     * Get List
                     */
                    if((typeof other_mode != 'undefined' && other_mode == 'true') || typeof sale != 'undefined' || typeof license != 'undefined') {
                        query = `SELECT appno_doc_num FROM db_new_application.assets_for_sale AS assets WHERE assets.organisation_id = :organisationID `

                        if(typeof sale != 'undefined'  || typeof license != 'undefined') {
                            query += ` AND type = :saleLicenceType `

                            where.saleLicenceType = typeof sale != 'undefined' && sale == 1 ? 2 : 4
                        }  
                        query += ` GROUP BY appno_doc_num`;
                    } else {
                        if(typeof type !== 'undefined') {
                            where.layoutID = findLayout(type)        
                        } else {
                            where.layoutID = 15
                        }
                        console.log("where.layoutID", where.layoutID)
                        if(where.layoutID > 15 || where.layoutID == 3) {
                            if(where.layoutID == 38) {
                                where.layoutID = 30
                            }
                            query = `SELECT application AS appno_doc_num FROM db_new_application.dashboard_items  WHERE organisation_id = :organisationID AND type = :layoutID `

                            if(Array.isArray(companies) && companies.length > 0) {
                                query += ` AND representative_id IN (:company_id)`
                            }

                            if(customers && customers != '' && where.layoutID == 39) {
                                customers = JSON.parse( customers )
                                if(customers.length > 0) {
                                    where.customers = customers
                                    query += ` AND assignor_id IN (:customers)`
                                }
                            }


                            query += ` GROUP BY application`;
                        } else {
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
        
                            query = `SELECT appno_doc_num FROM db_new_application.assets AS assets `
        
        
                            query += ` WHERE date_format(assets.appno_date, '%Y') > :year AND assets.layout_id = :layoutID AND assets.organisation_id = :organisationID `
                            
        
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
                                query += ` AND assets.appno_doc_num IN (  SELECT documentid.appno_doc_num FROM db_uspto.documentid WHERE rf_id  IN ( SELECT activity_parties_transactions.rf_id  FROM db_new_application.activity_parties_transactions WHERE activity_parties_transactions.organisation_id = :organisationID AND activity_parties_transactions.activity_id <> 10  ` 
    
                                if(Array.isArray(companies) && companies.length > 0 ) {
                                    query += ` AND activity_parties_transactions.company_id IN (:company_id) `
                                }
    
                                query += ` GROUP BY activity_parties_transactions.rf_id )  GROUP BY documentid.appno_doc_num) `
                                
                            }
                            query += ` GROUP BY appno_doc_num`;
                        } 
                    }
                    
                    
                }
            /* } else if(typeof sale != 'undefined' || typeof license != 'undefined') { 
                query = `SELECT appno_doc_num FROM db_new_application.assets_for_sale AS assets WHERE assets.organisation_id = :organisationID `

                if(typeof sale != 'undefined'  || typeof license != 'undefined') {
                    query += ` AND type = :saleLicenceType `

                    where.saleLicenceType = typeof sale != 'undefined' && sale == 1 ? 2 : 4 
                }  
                query += ` GROUP BY appno_doc_num`;
            } */ 
        }
        if(query != '') {
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
            }
        }
        
        return list;
    } catch (e) {
        console.log('Get Filter list', e)
    }
}

const checkTabs = (tabs) => {
    if(tabs.includes(81) && ( !tabs.includes(5) && !tabs.includes(11) && !tabs.includes(12) && !tabs.includes(13) && !tabs.includes(16)) ) {
        tabs.push(5)
        tabs.push(11)
        tabs.push(12)
        tabs.push(13)
        tabs.push(16)
    } else if (tabs.includes(17)) {
        tabs.push(1)
        tabs.push(6)
        /**
         * Later add other assets
         */
    }
    return tabs
}

const findCompanyName = async(DBConnection, selectedCompanies) => {
    /**
     * Find company name
     */
    const Representative = DBConnection.define('Representatives', ClientRepesentative.mainStructure, ClientRepesentative.options);
    const getRepresentativeName = await Representative.findOne({
         attributes: ['representative_name'],
         where: {
             representative_id: selectedCompanies
         }
    });
    return getRepresentativeName;
}


const findFillingAssets = async (req) => {
    let {companies } = req.query;
    let {selectedCompanies, lawfirm} = req.body
    const replacements = { organisation_id: req.orgId, year: connection.DEFAULT_YEAR }

    const allAssets = []
    if(typeof companies != 'undefined' && companies != '') {
        companies = JSON.parse(companies)
    } else if(typeof selectedCompanies != 'undefined' && selectedCompanies != '') {            
        companies = JSON.parse(selectedCompanies)
    }

    const Representative = req.connection_db.define('Representatives', Representatives.mainStructure, Representatives.options);

    const getAllCompaniesName = await Representative.findAll({
        attributes: ['representative_name'],
        where:{ representative_id: companies}                        
    }); 

    if(getAllCompaniesName.length > 0) {
        const allCompanyNames = [], allRepresentativeNames = []

        const promises = getAllCompaniesName.map(company => { 
            allRepresentativeNames.push(company.get('representative_name'))
            allCompanyNames.push(company.get('representative_name'))
        })

        await Promise.all(promises)

        const representativeQuery = ` SELECT representative_id FROM db_uspto.representative WHERE representative_name IN (:representativeNames) GROUP BY representative_id`;

        const allRepresentatives =  await connection.applicationNew.query(representativeQuery, {
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            logging: console.log,
            replacements: {representativeNames: allRepresentativeNames},
        }); 
        
        const representativeIDs = [];

        const promisesRepresenative = allRepresentatives.map(company => { 
            representativeIDs.push(company.representative_id)
        })

        await Promise.all(promisesRepresenative)

        let findAllAssigneeAssets = `SELECT appno_doc_num FROM db_patent_application_bibliographic.assignee AS a INNER JOIN db_patent_application_bibliographic.assignor_and_assignee AS aaa ON aaa.assignor_and_assignee_id = a.assignor_and_assignee_id WHERE (aaa.name IN (:companyNames) `

        if(representativeIDs.length > 0) {
            findAllAssigneeAssets += `  OR aaa.representative_id IN (:representativeIDs) `
        } 
        
        findAllAssigneeAssets += ` ) AND appno_doc_num IN (SELECT application FROM dashboard_items WHERE organisation_id = :organisation_id  AND representative_id IN (:companies) AND type = :type `

        if(typeof lawfirm != 'undefined' && lawfirm > 0) {

            if(lawfirm > 0) { 
                const findLawFirm = `SELECT  lf.law_firm_id  FROM db_uspto.correspondent AS c LEFT JOIN db_uspto.law_firm  as lf ON c.cname = lf.name
                LEFT JOIN db_uspto.representative_law_firm AS rlf ON rlf.representative_id = lf.representative_id WHERE c.rf_id = :rfID`

                const getLawFirmData = await connection.applicationNew.query(findLawFirm, {
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    plain: true,
                    logging: console.log,
                    replacements: {rfID: lawfirm},
                }) 

                if(getLawFirmData.length > 0) {
                    const allLawfirms = []
                    const promise = getLawFirmData.map( row => {
                        allLawfirms.push(row.law_firm_id)
                    })
                    await Promise.all(promise)
                    replacements.lawfirms = allLawfirms
                    findAllAssigneeAssets += ` AND lawfirm_id IN (:lawfirms) `;
                } 
            } 
        }
        
        findAllAssigneeAssets += `  GROUP BY application) GROUP BY appno_doc_num`

        replacements.companyNames = allCompanyNames
        replacements.companies = companies
        replacements.type = 31
        replacements.representativeIDs = representativeIDs
            
        const assigneeAssets =  await connection.applicationNew.query(findAllAssigneeAssets, {
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            logging: console.log,
            replacements: replacements,
        });  
        
        if(assigneeAssets != null && assigneeAssets.length > 0) { 
            const promiseAssets = assigneeAssets.map(row => {
                allAssets.push(`${row.appno_doc_num}`)
            })

            await Promise.all(promiseAssets)
        }
    }
    return allAssets;
}

const getFamilyList = async(replacements) => {

    const query = `SELECT grant_doc_num FROM db_uspto.assets_family AS af WHERE grant_doc_num IN ( 
        SELECT patent FROM db_new_application.dashboard_items WHERE organisation_id = :organisationID AND representative_id IN (:companies) AND type = :type GROUP BY patent ) AND application_country NOT IN ('WO', 'US') GROUP BY grant_doc_num `
    replacements.type = 30
    const grantAssets =  await connection.applicationNew.query(query, {
        type: connection.Sequelize.QueryTypes.SELECT,
        raw: true,
        logging: console.log,
        replacements: replacements,
    });  
    const allAssets = []
    if(grantAssets != null && grantAssets.length > 0) { 
        const promiseAssets = grantAssets.map(row => {
            allAssets.push(`${row.grant_doc_num}`)
        }) 
        await Promise.all(promiseAssets)
    }
    return allAssets;
}

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


const getOwnedAssets = async( req, t = 0 ) => {
    try {
        let getList = [], selectedCompanies = [];
        if( t == 1) { 
            selectedCompanies = req.query.companies
        } else {
            selectedCompanies = req.body.selectedCompanies;
        }

        if(selectedCompanies != '' && typeof selectedCompanies != 'undefined' && selectedCompanies != null) {
            selectedCompanies = JSON.parse(selectedCompanies)
        }
        /* const query = `SELECT appno_doc_num FROM owned_assets WHERE organisation_id = :organisationID AND company_id IN (:selectedCompanies)` */
        const query = `SELECT application FROM dashboard_items WHERE organisation_id = :organisationID AND representative_id IN (:selectedCompanies) AND type = :type AND application <> '' GROUP BY application`

        const list =  await connection.applicationNew.query(query,{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            logging: console.log,
            replacements: {
                organisationID: req.orgId,
                selectedCompanies,
                type: 30
            }
        }) 
        if(list !== null && list.length > 0) {
            list.forEach( row => {
                getList.push(`${row.application}`)
            })
        }
        return getList
    } catch (err) {
        console.log('errrrrrr', err)
        return []
    }
}

const helper = {};
helper.getOwnedAssets = getOwnedAssets
helper.minMax2DArray = minMax2DArray
helper.findLawFirmName = findLawFirmName
helper.getFamilyList = getFamilyList
helper.findFillingAssets = findFillingAssets
helper.findCompanyName = findCompanyName
helper.checkTabs = checkTabs;
helper.findFilterAssets = findFilterAssets;
helper.ArrayInterString = ArrayInterString;
helper.getXML = getXML;
helper.findMaxMin = findMaxMin;
helper.findMaxMinWithCompanies = findMaxMinWithCompanies;
helper.findMaxMinLifeSpan = findMaxMinLifeSpan;
helper.findLayout = findLayout;
helper.allAssignments = allAssignments;
helper.allAssignmentsByRepresentativeIDs = allAssignmentsByRepresentativeIDs;
helper.findAllLawFirms = findAllLawFirms;
helper.findOrganisationbyID = findOrganisationbyID;
helper.findRepresentative = findRepresentative;
helper.getCompanyListByEmployee = getCompanyListByEmployee;
helper.getCompanyListByOwnership = getCompanyListByOwnership;
helper.getCompanyListBySecurity = getCompanyListBySecurity;
helper.getCompanyListByOther = getCompanyListByOther;
helper.searchCompany = searchCompany;
helper.searchLenders = searchLenders;
helper.searchCompanyByAddress = searchCompanyByAddress;
helper.searchCompanyByCountry = searchCompanyByCountry;
helper.searchCompanyIDByAddress = searchCompanyIDByAddress;
helper.searchLawfirmIDByAddress = searchLawfirmIDByAddress;
helper.getAddressListByCompanyID = getAddressListByCompanyID;
helper.getAddressListByApplicantID = getAddressListByApplicantID;
helper.getAddressWithTransactionsListByCompanyID = getAddressWithTransactionsListByCompanyID;
helper.getAddressDataFromLastTransaction = getAddressDataFromLastTransaction;
helper.getAddressListByLawfirmID = getAddressListByLawfirmID;
helper.checkRepresentativeCompany = checkRepresentativeCompany;
helper.checkCustomerCompany = checkCustomerCompany;
helper.getAllUsers = getAllUsers;
helper.findCompanyCustomersByName = findCompanyCustomersByName;
helper.updateAllCustomerInventor = updateAllCustomerInventor;
helper.findCompanyCustomersByID = findCompanyCustomersByID;
helper.getCompaniesCount = getCompaniesCount;
helper.getCompaniesList = getCompaniesList;
helper.findRepresentativeByID = findRepresentativeByID;
helper.findRepresentativeByIDs = findRepresentativeByIDs;
helper.getSubCompaniesList = getSubCompaniesList;
helper.getAllCompaniesList = getAllCompaniesList;
helper.findCompanyEntitiesByAccountID = findCompanyEntitiesByAccountID;
helper.findCompanyEntitiesByAccountIDByRepresentativeIDs = findCompanyEntitiesByAccountIDByRepresentativeIDs;
helper.getCompaniesWithChildren = getCompaniesWithChildren;
helper.getAssignmentDataByrfID = getAssignmentDataByrfID;
helper.generateJSON = generateJSON;
helper.getNewCode = getNewCode;
helper.shareURL = shareURL;
helper.getShareList = getShareList;
helper.getShareData = getShareData;
helper.getShareDataByCode = getShareDataByCode;
helper.getShareDataByCodeWithAssets = getShareDataByCodeWithAssets;
helper.getCompaniesMinAndMaxDateTransaction = getCompaniesMinAndMaxDateTransaction;
helper.findProfessionalFromUserID = findProfessionalFromUserID;
helper.findFakeDocument = findFakeDocument;
helper.findActivityByID = findActivityByID;
helper.getCollectionList = getCollectionList;
helper.getCollectionByID = getCollectionByID;
helper.allTransactionEntities = allTransactionEntities;
helper.findEntityAssets = findEntityAssets;
helper.findAssetsTimeSpan = findAssetsTimeSpan
helper.findAllAssetsTimeSpan = findAllAssetsTimeSpan
helper.findAssetsTimeSpanByTransactionById = findAssetsTimeSpanByTransactionById
helper.findRfIDsBySearchString = findRfIDsBySearchString 
helper.getCompaniesListWithReports = getCompaniesListWithReports 
helper.getCompaniesListSumWithReports = getCompaniesListSumWithReports 
helper.getCompaniesAllList = getCompaniesAllList 
helper.removeAllOldSharingUrl = removeAllOldSharingUrl
module.exports = helper;