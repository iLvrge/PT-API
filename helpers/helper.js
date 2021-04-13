
const connection = require("../config/db.config");

const request = require("request");

const FtsQuery = require("full-text-search-query");

const { v4: uuidv4  } = require('uuid');

const Organisations = require("../model/business/Organisations");

const BusinessRoles = require("../model/business/Roles");

const Representatives = require("../model/resources/Representatives");

const AssignmentConveyance = require("../model/application/AssignmentConveyance");

const RepresentativeAssignmentConveyance = require("../model/resources/RepresentativeAssignmentConveyance");

const AssignorAndAssignee = require("../model/resources/AssignorAndAssignee");

const RepresentativeApplication = require("../model/resources/Representatives");

const Users = require("../model/business/Users");

const Roles = require("../model/client/Roles");

const ShareLink = require("../model/business/ShareLinks");

const ClientRepesentative = require("../model/client/Representatives");

const TreePartiesCollections = require("../model/application/TreePartiesCollections");

const DocumentIds = require("../model/application/DocumentIds");

const moment = require('moment');

const ASSETS_LIFE_SPAN_DATE_FORMAT = 'YYYY';

const fs = require('fs');
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


            queryCompany = `SELECT a.assignor_and_assignee_id as id, a.assignor_and_assignee_id, a.name, a.instances as counter, c.representative_name as normalize_name, (select rr.representative_name FROM representative as rr WHERE rr.representative_name = a.name GROUP BY rr.representative_name) as representative_company, (SELECT concat(ass.reel_no,'-', ass.frame_no) FROM assignee as ee INNER JOIN assignment as ass ON ass.rf_id = ee.rf_id  WHERE ee.assignor_and_assignee_id = a.assignor_and_assignee_id  LIMIT 1) as assigneeRFID, (SELECT concat(asss.reel_no,'-', asss.frame_no) FROM assignor as assi INNER JOIN assignment as asss ON asss.rf_id = assi.rf_id WHERE assi.assignor_and_assignee_id = a.assignor_and_assignee_id LIMIT 1) as assignorRFID  FROM assignor_and_assignee as a 
            LEFT JOIN representative as c ON c.representative_id = a.representative_id 
            INNER JOIN LATERAL (Select assignee.assignor_and_assignee_id from assignment
                INNER JOIN assignee ON assignee.rf_id = assignment.rf_id
                WHERE date_format(assignment.record_dt, '%Y') >= :year AND assignee.assignor_and_assignee_id = a.assignor_and_assignee_id
                GROUP BY assignee.ee_name                
                UNION 
                Select assignor.assignor_and_assignee_id from assignment
                INNER JOIN assignor ON assignor.rf_id = assignment.rf_id
                WHERE date_format(assignment.record_dt, '%Y') >= :year AND assignor.assignor_and_assignee_id = a.assignor_and_assignee_id
                GROUP BY assignor.or_name) as tempAssignorAndAssignee 
            WHERE MATCH(a.name) AGAINST (:search IN BOOLEAN MODE) GROUP BY a.name ORDER BY counter DESC`;

            let querySearchResult = await connection.resources.query(queryCompany,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                replacements: { search: search, year: 2000 },
                logging: console.log,
            }); 
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
                queryResult = [...queryResult, ...querySearchResult];
                /*console.log(queryResult);*/
            }
            return querySearchResult;
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
                searchResult.map( (s, index) => {
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
                return searchResult;
            } else {
                return searchResult;
            }        
        } else {
            return searchResult;
        }
    } else {
        return queryResult;
    }
}

let searchCompanyByAddress = async( address ) => {
    let searchResult = [];
    if(address.length > 1) {

        const queryCompany = "SELECT a.assignor_and_assignee_id as id, a.assignor_and_assignee_id, a.name, a.instances as counter, c.representative_name as normalize_name, (select rr.representative_name FROM representative as rr WHERE rr.representative_name = a.name GROUP BY rr.representative_name) as representative_company, (SELECT concat(assign.reel_no,'-', assign.frame_no) FROM assignee as ee INNER JOIN assignment as assign ON assign.rf_id = ee.rf_id WHERE ee.assignor_and_assignee_id = a.assignor_and_assignee_id LIMIT 1) as assigneeRFID, (SELECT concat(asss.reel_no,'-', asss.frame_no) FROM assignor as assi INNER JOIN assignment as asss ON asss.rf_id = assi.rf_id WHERE assi.assignor_and_assignee_id = a.assignor_and_assignee_id LIMIT 1) as assignorRFID  FROM assignor_and_assignee as a LEFT JOIN representative as c ON c.representative_id = a.representative_id INNER JOIN assignee as ass ON ass.assignor_and_assignee_id = a.assignor_and_assignee_id INNER JOIN assignment ON ass.rf_id = assignment.rf_id WHERE date_format(assignment.record_dt, '%Y') >= :year AND MATCH(ass.ee_address_1, ass.ee_address_2) AGAINST (:address IN BOOLEAN MODE)  GROUP BY a.name ORDER BY counter DESC ";

        searchResult = await connection.resources.query(queryCompany,{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            replacements: { address: address, flag: 0, year: 2000},
            logging: console.log,
          }
        );
    }

    return searchResult;
}

let searchCompanyIDByAddress = async( ID ) => {
    let searchResult = [];
    if(ID > 0) {

        const queryFindIDS = "SELECT assignor_and_assignee_id FROM assignee WHERE ee_address_1 IN (SELECT ee_address_1 FROM assignee WHERE ee_address_1 <> '' AND assignor_and_assignee_id = :ID GROUP BY ee_address_1) GROUP BY assignor_and_assignee_id";

        resultAssignees = await connection.resources.query(queryFindIDS,{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            replacements: { ID: ID },
            logging: console.log,
          }
        );

        const IDs = [];
        const promise = resultAssignees.map(row => IDs.push(row.assignor_and_assignee_id))

        await Promise.all(promise)


        const queryCompany = "SELECT a.assignor_and_assignee_id as id, a.assignor_and_assignee_id, a.name, a.instances as counter, c.representative_name as normalize_name, (select rr.representative_name FROM representative as rr WHERE rr.representative_name = a.name GROUP BY rr.representative_name) as representative_company, (SELECT concat(assign.reel_no,'-', assign.frame_no) FROM assignee as ee INNER JOIN assignment as assign ON assign.rf_id = ee.rf_id WHERE ee.assignor_and_assignee_id = a.assignor_and_assignee_id LIMIT 1) as assigneeRFID, (SELECT concat(asss.reel_no,'-', asss.frame_no) FROM assignor as assi INNER JOIN assignment as asss ON asss.rf_id = assi.rf_id WHERE assi.assignor_and_assignee_id = a.assignor_and_assignee_id LIMIT 1) as assignorRFID  FROM assignor_and_assignee as a LEFT JOIN representative as c ON c.representative_id = a.representative_id INNER JOIN assignee as ass ON ass.assignor_and_assignee_id = a.assignor_and_assignee_id INNER JOIN assignment ON ass.rf_id = assignment.rf_id WHERE date_format(assignment.record_dt, '%Y') >= :year AND a.assignor_and_assignee_id IN (:ID) GROUP BY a.name ORDER BY counter DESC ";

        searchResult = await connection.resources.query(queryCompany,{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            replacements: { ID: IDs, flag: 0, year: 2000},
            logging: console.log,
          }
        );
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
                    list.push({id: getList[0].assignor_and_assignee_id , name: getList[0].name, normalize_name: getList[0].normalize_name, counter: getCounter, representative_company: getList[0].representative_company});
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
    if(parseInt(customerID) > 0) {        
        let org = await findOrganisationbyID( customerID );
        
        if(org != null && org.organisation_id > 0) {
            
            const findRepresentative = await getCompaniesList(req.connection_db);
            if(findRepresentative != null && findRepresentative.length > 0) {
                let representativeID = [];
                findRepresentative.map(e => representativeID.push(e.representative_id));

                queryAllAssignments = "Select a.rf_id as id, a.convey_text as text, CONCAT(a.reel_no, '/', a.frame_no) as reel_frame, a.frame_no, a.reel_no , ac.convey_ty, rac.convey_ty as updated_convey_ty,  CASE  WHEN rac.convey_ty = 'assignment' THEN 0 WHEN rac.convey_ty = 'addresschg' THEN 1	 WHEN rac.convey_ty = 'correct' THEN 2	 WHEN rac.convey_ty = 'courtappointment' THEN 3	 WHEN rac.convey_ty = 'courtorder' THEN 4	 WHEN rac.convey_ty = 'employee' THEN 5	 WHEN rac.convey_ty = 'govern' THEN 6	 WHEN rac.convey_ty = 'license' THEN 7	 WHEN rac.convey_ty = 'licenseend' THEN 8	 WHEN rac.convey_ty = 'missing' THEN 9	 WHEN rac.convey_ty = 'merger' THEN 10	 WHEN rac.convey_ty = 'namechg' THEN 11	 WHEN rac.convey_ty = 'option' THEN 12	 WHEN rac.convey_ty = 'other' THEN 13	 WHEN rac.convey_ty = 'partialassignment' THEN 14	 WHEN rac.convey_ty = 'release' THEN 15	 WHEN rac.convey_ty = 'restatedsecurity' THEN 16	 WHEN rac.convey_ty = 'security' THEN 17	 ELSE '' END as assignment_convey_ty FROM db_application.assignment as a INNER JOIN db_application.assignment_conveyance as ac ON ac.rf_id = a.rf_id LEFT JOIN db_uspto.representative_assignment_conveyance as rac ON rac.rf_id = a.rf_id WHERE a.convey_text <> '' AND a.convey_text IS NOT NULL AND a.rf_id IN (SELECT d.rf_id FROM db_application.documentid as d WHERE appno_doc_num <> '' AND  d.rf_id IN (SELECT rf_id FROM db_uspto.representative_transactions WHERE organisation_id = :organisationID AND representative_id IN (:representativeID)) GROUP BY d.rf_id)"; 

                /* queryAllAssignments = "SELECT a.rf_id as id, a.convey_text as text, CONCAT(a.reel_no, '/', a.frame_no) as reel_frame, a.frame_no, a.reel_no , ac.convey_ty, rac.convey_ty as updated_convey_ty, CASE WHEN rac.convey_ty = 'assignment' THEN 0 WHEN rac.convey_ty = 'addresschg' THEN 1 WHEN rac.convey_ty = 'correct' THEN 2 WHEN rac.convey_ty = 'courtappointment' THEN 3 WHEN rac.convey_ty = 'courtorder' THEN 4 WHEN rac.convey_ty = 'employee' THEN 5 WHEN rac.convey_ty = 'govern' THEN 6 WHEN rac.convey_ty = 'license' THEN 7 WHEN rac.convey_ty = 'licenseend' THEN 8 WHEN rac.convey_ty = 'missing' THEN 9 WHEN rac.convey_ty = 'merger' THEN 10 WHEN rac.convey_ty = 'namechg' THEN 11 WHEN rac.convey_ty = 'option' THEN 12 WHEN rac.convey_ty = 'other' THEN 13 WHEN rac.convey_ty = 'partialassignment' THEN 14 WHEN rac.convey_ty = 'release' THEN 15  WHEN rac.convey_ty = 'restatedsecurity' THEN 16 WHEN rac.convey_ty = 'security' THEN 17 ELSE '' END as assignment_convey_ty FROM db_application.assignment as a INNER JOIN db_application.assignment_conveyance as ac ON ac.rf_id = a.rf_id LEFT JOIN db_uspto.representative_assignment_conveyance as rac ON rac.rf_id = a.rf_id WHERE a.convey_text <> '' AND a.convey_text IS NOT NULL AND a.rf_id IN (SELECT d.rf_id FROM db_application.documentid as d WHERE appno_doc_num <> '' AND d.rf_id IN (SELECT rf_id FROM assignee WHERE rf_id IN (SELECT rf_id FROM db_uspto.representative_transactions WHERE organisation_id = :organisationID AND representative_id IN (:representativeID))) OR d.rf_id IN(SELECT rf_id FROM assignor WHERE rf_id IN (SELECT rf_id FROM db_uspto.representative_transactions WHERE organisation_id = :organisationID AND representative_id IN (:representativeID))) GROUP BY d.rf_id)"; */

                assignmentsList =  await connection.resources.query(queryAllAssignments,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    replacements: { organisationID: org.organisation_id, representativeID: representativeID },
                    raw: true,
                    logging: console.log,
                    }
                );
                
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
            if(splitSearch.length > 1){				
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
            }
            queryAllAssignments += " WHERE MATCH(text) AGAINST (:search IN BOOLEAN MODE) ";
            replacements.search =  searchTerm ;
        }

        queryAllAssignments += " GROUP BY text, updated_convey_ty";

        
        
        assignmentsList =  await connection.resources.query(queryAllAssignments,{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            replacements: replacements,
            logging: console.log,
          }
        );

        if(assignmentsList.length == 0){
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
        }        
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
    let queryAllAssignments = "", assignmentsList = [];
    if(parseInt(customerID) > 0) {        
        let org = await findOrganisationbyID( customerID );
        
        if(org != null && org.organisation_id > 0) {

            if(representativeIDs != null && representativeIDs.length > 0) {
                               
                let queryFindMainCompany = "SELECT rf_id FROM representative_transactions WHERE organisation_id = :organisationID AND representative_id IN (:representativeID) ";

                let listIDs = await connection.resources.query(queryFindMainCompany,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    replacements: { organisationID: org.organisation_id, representativeID: representativeIDs },
                    raw: true,
                    logging: console.log,
                    }
                );
                if(listIDs != null && listIDs.length > 0) {
                    /*let assgnorAssigneeIDS = [], names = [];*/
                    let rawRfIDs = [];
                    listIDs.map(e => rawRfIDs.push(e.rf_id));
                    let queryAssigneeRFIDs = "SELECT rf_id FROM assignee as ac WHERE ac.rf_id IN (:IDs)";
            
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
        
                    rfIDsList = [...assigneeRFIDs, ...assignorRFIDs];    
                        
        
                    let rfIDs = [];
                    rfIDsList.map( r => rfIDs.push(r.rf_id));

                    if(rfIDsList.length > 0) {
                        queryAllAssignments = "Select a.rf_id as id, a.convey_text as text, CONCAT(a.reel_no, '/', a.frame_no) as reel_frame, a.frame_no, a.reel_no , ac.convey_ty, rac.convey_ty as updated_convey_ty,  CASE  WHEN rac.convey_ty = 'assignment' THEN 0 WHEN rac.convey_ty = 'addresschg' THEN 1	 WHEN rac.convey_ty = 'correct' THEN 2	 WHEN rac.convey_ty = 'courtappointment' THEN 3	 WHEN rac.convey_ty = 'courtorder' THEN 4	 WHEN rac.convey_ty = 'employee' THEN 5	 WHEN rac.convey_ty = 'govern' THEN 6	 WHEN rac.convey_ty = 'license' THEN 7	 WHEN rac.convey_ty = 'licenseend' THEN 8	 WHEN rac.convey_ty = 'missing' THEN 9	 WHEN rac.convey_ty = 'merger' THEN 10	 WHEN rac.convey_ty = 'namechg' THEN 11	 WHEN rac.convey_ty = 'option' THEN 12	 WHEN rac.convey_ty = 'other' THEN 13	 WHEN rac.convey_ty = 'partialassignment' THEN 14	 WHEN rac.convey_ty = 'release' THEN 15	 WHEN rac.convey_ty = 'restatedsecurity' THEN 16	 WHEN rac.convey_ty = 'security' THEN 17	 ELSE '' END as assignment_convey_ty from assignment as a INNER JOIN assignment_conveyance as ac ON ac.rf_id = a.rf_id LEFT JOIN representative_assignment_conveyance as rac ON rac.rf_id = a.rf_id WHERE a.convey_text <> '' AND a.convey_text IS NOT NULL AND a.rf_id IN (SELECT d.rf_id FROM documentid as d WHERE appno_doc_num <> '' AND  d.rf_id IN (:rfIDs) GROUP BY d.rf_id) ";
    
                        assignmentsList =  await connection.resources.query(queryAllAssignments,{
                            type: connection.Sequelize.QueryTypes.SELECT,
                            replacements: { rfIDs: rfIDs },
                            raw: true,
                            logging: console.log,
                            }
                        );
                    }
                }
            }
        }
    }  
    return assignmentsList;
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

let getCompaniesList = async (DBConnection) => {
    const Representative = DBConnection.define('ClientRepesentative', ClientRepesentative.mainStructure, ClientRepesentative.options);

    return await Representative.findAll({
        where: {parent_id: 0}
    });
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
    const parentCompanyQuery = "SELECT representative_id as id, original_name, representative_name, instances, instances + (Select sum(instances) FROM representative as r1 WHERE r1.parent_id = r.representative_id) as counter FROM representative as r WHERE r.parent_id = 0";

    companies = await DBConnection.query(parentCompanyQuery,{
        type: connection.Sequelize.QueryTypes.SELECT,
        raw: true,
        logging: console.log,
        }
    ); 
    
    if(companies.length > 0) {
        let getAllIDs = [];
        companies.map( c => getAllIDs.push(c.id));
        let childCompaniesQuery = "SELECT representative_id as id, original_name, representative_name, instances as counter, parent_id FROM representative as r WHERE r.parent_id IN (:parentCompany) ORDER BY r.parent_id ASC, counter DESC";

        let childCompanies = await DBConnection.query(childCompaniesQuery,{
                type: connection.Sequelize.QueryTypes.SELECT,
                replacements: { parentCompany: getAllIDs },
                raw: true,
                logging: console.log,
            }
        ); 
        if(childCompanies.length == 0) {
            for(let i = 0; i < companies.length; i++) {
                let newC = {...companies[i]};
                newC.counter = newC.instances;
                companies[i]['children'] = [newC];
            }
        } else {
            for(let i = 0; i < companies.length; i++) {
                let children = [];
                let newC = {...companies[i]};
                newC.counter = newC.instances;
                children.push(newC);
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
            queryApplicationUpdate = "UPDATE assignment_conveyance SET employer_assign = :flag, convey_ty = :conveyType WHERE rf_id IN (SELECT rf_id FROM assignor WHERE assignor_and_assignee_id IN (:list))";

            where.conveyType = 'employee';
        } else {
            queryResourceUpdate = "UPDATE representative_assignment_conveyance SET employer_assign = :flag WHERE rf_id IN (SELECT rf_id FROM assignor WHERE assignor_and_assignee_id IN (:list))";
            queryApplicationUpdate = "UPDATE assignment_conveyance SET employer_assign = :flag WHERE rf_id IN (SELECT rf_id FROM assignor WHERE assignor_and_assignee_id IN (:list))";
        }

        added = await connection.resources.query(queryResourceUpdate,{
                type: connection.Sequelize.QueryTypes.UPDATE,
                replacements: where,
                raw: true,
                logging: console.log,
            }
        );
        added = await connection.application.query(queryApplicationUpdate,{
                type: connection.Sequelize.QueryTypes.UPDATE,
                replacements: where,
                raw: true,
                logging: console.log,
            }
        );
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

let findCompanyEntitiesByAccountID = async(orgID, type, DBConnection) => {
    const list = await getCompaniesList(DBConnection);
    let entitiesList = [];
    if(list.length > 0) {
        const IDs = [];
        list.map(r => IDs.push(r.representative_id));
        let listIDs = [];

        if(IDs.length > 0) {
            const queryRepresentativeTransactions = "SELECT rf_id FROM representative_transactions where organisation_id = :organisationID AND representative_id IN (:representativeIDs)";

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
            }
        }
    }
    return entitiesList;
}

let findCompanyEntitiesByAccountIDByRepresentativeIDs = async(orgID, representativeIDs, type, DBConnection) => {
   
    let entitiesList = [];
    if(representativeIDs.length > 0) {        
        const queryRepresentativeTransactions = "SELECT rf_id FROM representative_transactions where organisation_id = :organisationID AND representative_id IN (:representativeIDs)";

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
        }
    }
    return entitiesList;
}


let findAssignorAndAssigneeListFromRFIDs = async(rfIDs, type) => {
    let customer_list = [], assignees = [], assignors = [];
    
    if(typeof type != 'undefined' &&  parseInt(type) < 3) {
        let queryAssignor = "SELECT a.assignor_and_assignee_id, a.or_name as name, count(a.or_name) as counter, r.representative_name as normalize_name, (select rr.representative_name FROM representative as rr WHERE rr.representative_name = aaa.name GROUP BY rr.representative_name) as representativeCompany, (SELECT aa.instances FROM assignor_and_assignee as aa WHERE aa.assignor_and_assignee_id = a.assignor_and_assignee_id GROUP BY aa.assignor_and_assignee_id) as total_occurences, a.rf_id FROM db_uspto.assignor as a LEFT JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = a.assignor_and_assignee_id LEFT JOIN db_uspto.representative_assignment_conveyance as rac ON rac.rf_id = a.rf_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE a.rf_id IN (:IDs) ";
        console.log("TYPE: "+ parseInt(type));
        if(parseInt(type) > 0) {
            console.log("TYPE: "+ type);
            if(parseInt(type) == 1) {
                queryAssignor += " AND (rac.employer_assign = 1)";
            } else {
                queryAssignor += " AND (rac.employer_assign = 0)";
            }
        }

        queryAssignor += " GROUP BY a.or_name";
        assignors = await connection.resources.query(queryAssignor,{
            type: connection.Sequelize.QueryTypes.SELECT,
            replacements: { IDs: rfIDs },
            raw: true,
            logging: console.log,
            }
        );
        if(parseInt(type) == 2) {
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
        }
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

        let queryAssignor = "SELECT a.assignor_and_assignee_id, a.or_name as name, count(a.or_name) as counter, r.representative_name as normalize_name, (select rr.representative_name FROM representative as rr WHERE rr.representative_name = aaa.name GROUP BY rr.representative_name) as representativeCompany, (SELECT aa.instances FROM assignor_and_assignee as aa WHERE aa.assignor_and_assignee_id = a.assignor_and_assignee_id  GROUP BY aa.assignor_and_assignee_id) as total_occurences, a.rf_id FROM assignor as a INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = a.assignor_and_assignee_id INNER JOIN representative_assignment_conveyance as rac ON rac.rf_id = a.rf_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE a.rf_id IN (SELECT rf_id FROM documentid WHERE appno_doc_num IN (SELECT appno_doc_num FROM documentid WHERE rf_id IN (:rfIDs)) GROUP BY rf_id) AND rac.employer_assign = 0  AND date_format(a.exec_dt, '%Y') >= 2000 GROUP BY a.or_name UNION SELECT a.assignor_and_assignee_id, a.ee_name as name, count(a.ee_name) as counter, r.representative_name as normalize_name, (select rr.representative_name FROM representative as rr WHERE rr.representative_name = aaa.name GROUP BY rr.representative_name) as representativeCompany, (SELECT aa.instances FROM assignor_and_assignee as aa WHERE aa.assignor_and_assignee_id = a.assignor_and_assignee_id  GROUP BY aa.assignor_and_assignee_id) as total_occurences, a.rf_id FROM assignee as a INNER JOIN representative_assignment_conveyance as ac ON ac.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = a.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id INNER JOIN assignor as aor ON aor.rf_id = a.rf_id WHERE date_format(aor.exec_dt, '%Y') >= 2000 AND a.rf_id IN (SELECT rf_id FROM documentid WHERE appno_doc_num IN (SELECT appno_doc_num FROM documentid WHERE rf_id IN (:rfIDs)) GROUP BY rf_id) AND ac.employer_assign = 0 GROUP BY a.ee_name";

       
        assignors = await connection.resources.query(queryAssignor,{
            type: connection.Sequelize.QueryTypes.SELECT,
            replacements: { rfIDs: rfIDs },
            raw: true,
            logging: console.log,
            }
        );
    }             
    
    customer_list = [...assignees, ...assignors];  

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
                /*let name = n.normalize_name;
                if(name == "" || name == null || name == undefined) {
                    name = n.name;
                }*/
                let name = n.name;
                name = name.trim().toLowerCase();
                return (name == nam.trim().toLowerCase())? n : undefined;
            })/*(n.normalize_name.toLowerCase() == nam || n.name.trim().toLowerCase() == nam )? n : undefined);*/
            if(getList != undefined && getList.length > 0){
                let getCounter = await getList.reduce((a, b) => +a + +b.counter, 0);
                //let getOccurences = await getList.reduce((a, b) => +a + +b.total_occurences, 0);
                await list.push({id: getList[0].assignor_and_assignee_id, name: getList[0].name, normalize_name: getList[0].normalize_name, counter: getCounter, total_occurences: getList[0].total_occurences, representative_company: getList[0].representativeCompany, rf_id: getList[0].rf_id});
            }
        }
    }
    if(list.length > 0){
        list.sort((a,b) => (a.name > b.name) ? 1 : ((b.name > a.name) ? -1 : 0)); 
    }
    console.log(list.length);
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

let getAssignmentDataByrfID = async (rfID, t = 0) => {
	const assignorQuery = 'SELECT aaa.name as or_name, r.representative_name as normalize_name, date_format(a.exec_dt,"%Y-%m-%d %h:%i:%s") as exec_dt, aaa.assignor_and_assignee_id as id FROM assignor as a INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = a.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE a.rf_id = :rfID  GROUP BY aaa.name, normalize_name ORDER BY a.exec_dt ASC';
	const assigneeQuery = 'SELECT a.*, aaa.name as ee_name, r.representative_name as normalize_name, aaa.assignor_and_assignee_id as id FROM assignee as a INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = a.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE a.rf_id = :rfID  GROUP BY aaa.name, normalize_name';
	const assignmentQuery = 'SELECT ac.*, acc.convey_ty, acc.employer_assign FROM assignment as ac INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id WHERE ac.rf_id = :rfID';
	const documentQuery = 'SELECT * FROM documentid WHERE rf_id = :rfID';
	let assignee = await connection.application.query(assigneeQuery,{
		type: connection.Sequelize.QueryTypes.SELECT,
		raw: true,
		logging: console.log,
		replacements: { rfID: rfID },
	});
	let assignor = await connection.application.query(assignorQuery,{
		type: connection.Sequelize.QueryTypes.SELECT,
		raw: true,
		logging: console.log,
		replacements: { rfID: rfID },
	});
	let assignment = await connection.application.query(assignmentQuery,{
		type: connection.Sequelize.QueryTypes.SELECT,
		raw: true,
		logging: console.log,
		plain:true,
		replacements: { rfID: rfID },
	});
    let properties = []
    
    if( t === 0 ) {
        properties = await connection.application.query(documentQuery,{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            logging: console.log,
            replacements: { rfID: rfID },
        });	
    }
    
	const data = await {assignee, assignor, assignment, properties}
	return data;
}

let generateJSON = async(req, res) => {
    try {
        console.log("SAAAPPAPAP: "+req.params.patentNumber);
        let orgID = 0, userID = 0;
        if( req.orgId != undefined && req.orgId > 0 ) {
            orgID = req.orgId;
            userID = req.userId;
        }
        console.log(process.env.BACKGROUND_JOB_URL+""+process.env.JSON_GENERATE+"?p="+req.params.patentNumber+"&o="+orgID+"&u="+userID);
        await request(process.env.BACKGROUND_JOB_URL+""+process.env.JSON_GENERATE+"?p="+req.params.patentNumber+"&o="+orgID+"&u="+userID,function (error, response, body) {
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
            const code = (Math.random()*1e32).toString(36).substr(0,10);
            await ShareLink.findOne({
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

let shareURL = async (params) => {
    let insertRecord = await ShareLink.create({
        code: params.code,
        organisation_id: params.organisation_id,        
        user_id: params.user_id,
        subject_type: params.type,
        subject: params.assets
    });
    if(insertRecord != null && insertRecord.share_id > 0) {
        return "https://share.patentrack.com/"+params.code;
    } else {
        return '';
    }
};
let getShareData = async (code) => {
	return await ShareLink.findOne({
		where:{code:code}
	});
}


let getCompaniesMinAndMaxDateTransaction = async(searchData) => {

    let firstDate = "", secondDate = "", minDate = "", maxDate = "";

    let customMinQuery = 'SELECT concat(aa.assignor_and_assignee_id,ac.rf_id) as id, ac.rf_id, aa.name as raw_name, r1.representative_name as normalize_name, acc.convey_ty, acc.employer_assign, ac.exec_dt FROM assignor as ac INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id INNER JOIN (SELECT ee.rf_id FROM assignee as ee INNER JOIN documentid as d ON d.rf_id = ee.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE (aaa.name IN (:name)  or r.representative_name IN (:name)) AND date_format(d.appno_date,"%Y") > "1999") as temp ON temp.rf_id = ac.rf_id WHERE acc.convey_ty IN (:convey_type) AND acc.employer_assign = :employer_assign GROUP BY ac.rf_id ORDER BY ac.exec_dt ASC LIMIT :recordLimit';

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

    customMinQuery = 'SELECT concat(aa.assignor_and_assignee_id,ac.rf_id) as id, ac.rf_id, aa.name as raw_name, r1.representative_name as normalize_name, acc.convey_ty, acc.employer_assign, (SELECT ap.exec_dt FROM assignor as ap WHERE ap.rf_id = ac.rf_id ORDER BY ap.exec_dt ASC LIMIT 1) as exec_dt FROM assignee as ac INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id  INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id INNER JOIN (SELECT or.rf_id FROM assignor as `or` INNER JOIN documentid as d ON d.rf_id = or.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = or.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id  WHERE (aaa.name IN ( :name ) or r.representative_name  IN (:name)) AND date_format(d.appno_date,"%Y") > "1999" ) as temp ON temp.rf_id = ac.rf_id WHERE acc.convey_ty IN (:convey_type) AND acc.employer_assign = :employer_assign GROUP BY ac.rf_id ORDER BY exec_dt ASC LIMIT :recordLimit';
    
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
    let customMaxQuery = 'SELECT concat(aa.assignor_and_assignee_id,ac.rf_id) as id, ac.rf_id, aa.name as raw_name, r1.representative_name as normalize_name, acc.convey_ty, acc.employer_assign, ac.exec_dt FROM assignor as ac INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id INNER JOIN (SELECT ee.rf_id FROM assignee as ee INNER JOIN documentid as d ON d.rf_id = ee.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE (aaa.name IN (:name)  or r.representative_name IN (:name)) AND date_format(d.appno_date,"%Y") > "1999") as temp ON temp.rf_id = ac.rf_id WHERE acc.convey_ty IN (:convey_type) AND acc.employer_assign = :employer_assign GROUP BY ac.rf_id ORDER BY ac.exec_dt DESC LIMIT :recordLimit';


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

    customMaxQuery = 'SELECT concat(aa.assignor_and_assignee_id,ac.rf_id) as id, ac.rf_id, aa.name as raw_name, r1.representative_name as normalize_name, acc.convey_ty, acc.employer_assign, (SELECT ap.exec_dt FROM assignor as ap WHERE ap.rf_id = ac.rf_id ORDER BY ap.exec_dt ASC LIMIT 1) as exec_dt FROM assignee as ac INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id  INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id INNER JOIN (SELECT or.rf_id FROM assignor as `or` INNER JOIN documentid as d ON d.rf_id = or.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = or.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id  WHERE (aaa.name IN ( :name ) or r.representative_name  IN (:name)) AND date_format(d.appno_date,"%Y") > "1999" ) as temp ON temp.rf_id = ac.rf_id WHERE acc.convey_ty IN (:convey_type) AND acc.employer_assign = :employer_assign GROUP BY ac.rf_id ORDER BY exec_dt DESC LIMIT :recordLimit';
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
        attributes: [['appno_doc_num','application'], ['grant_doc_num', 'patent'], 'status', 'appno_date'],
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

const helper = {};
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
helper.searchCompanyByAddress = searchCompanyByAddress;
helper.searchCompanyIDByAddress = searchCompanyIDByAddress;
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
helper.getShareData = getShareData;
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
module.exports = helper;