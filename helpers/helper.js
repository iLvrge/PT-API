
const connection = require("../config/db.config");

const request = require("request");

const FtsQuery = require("full-text-search-query");

const { v4: uuidv4  } = require('uuid');

const Organisations = require("../model/business/Organisations");

const BusinessRoles = require("../model/business/Roles");

const Representatives = require("../model/resources/Representatives");

const AssignorAndAssignee = require("../model/resources/AssignorAndAssignee");

const RepresentativeApplication = require("../model/resources/Representatives");

const Users = require("../model/business/Users");

const Roles = require("../model/client/Roles");

const ShareLink = require("../model/business/ShareLinks");

const ClientRepesentative = require("../model/client/Representatives");


/**
 * 
 * @param {SearchCompanies} search 
 */

 
let searchCompany = async(search) => {

    let searchTerm, queryCompany;

    const splitSearch = search.toString().split(' ');

    if(splitSearch.length > 1){				
        if(splitSearch.length == 2) {
            if(splitSearch[1] == '') {
                searchTerm = `${search}*`;
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
    console.log("SEARCH:",search);

    queryCompany = "SELECT a.assignor_and_assignee_id as id, a.name, sum(a.instances) as counter, c.representative_name as normalize_name, (select rr.representative_name FROM representative as rr WHERE rr.representative_name = a.name GROUP BY rr.representative_name) as representativeCompany FROM assignor_and_assignee as a LEFT JOIN representative as c ON c.representative_id = a.representative_id WHERE MATCH(a.name) AGAINST (:search IN BOOLEAN MODE) GROUP BY a.name";

    let getCompanyData = await connection.resources.query(queryCompany,{
        type: connection.Sequelize.QueryTypes.SELECT,
        raw: true,
        replacements: { search: searchTerm },
        logging: console.log,
    });

    if(getCompanyData.length == 0){
        queryCompany = `SELECT a.assignor_and_assignee_id as id, a.name, sum(a.instances) as counter, c.representative_name as normalize_name, (select rr.representative_name FROM representative as rr WHERE rr.representative_name = a.name GROUP BY rr.representative_name) as representativeCompany FROM assignor_and_assignee as a LEFT JOIN representative as c ON c.representative_id = a.representative_id where a.name LIKE ":search%" GROUP BY a.name`;
        
        getCompanyData = await connection.resources.query(queryCompany,{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            replacements: { search: searchTerm },
            logging: console.log,
          }
        );
        if(getCompanyData.length == 0){
            queryCompany = `SELECT a.assignor_and_assignee_id as id, a.name, sum(a.instances) as counter, c.representative_name as normalize_name, (select rr.representative_name FROM representative as rr WHERE rr.representative_name = a.name GROUP BY rr.representative_name) as representativeCompany FROM assignor_and_assignee as a LEFT JOIN representative as c ON c.representative_id = a.representative_id where a.name LIKE "%:search%" GROUP BY a.name`;
            
            getCompanyData = await connection.resources.query(queryCompany,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                replacements: { search: searchTerm },
                logging: console.log,
              }
            );
        }
    }

    return getCompanyData;
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
									
    let getNameChgData = await csv.query(queryNameChange,{
        type: connection.Sequelize.QueryTypes.SELECT,
        replacements: { name: companyName, convey_type: 'namechg' },
        raw: true,
        logging: console.log,
        }
    );

    let queryGovernChange = "SELECT ac.or_name as name, c1.company_name as normalize_name, 'Govt.' as type FROM assignors_copy as ac INNER JOIN (SELECT a.rf_id FROM assignments_copy as a INNER JOIN assignment_conveyances_copy as ass ON ass.rf_id = a.rf_id INNER JOIN assignees_copy as acc ON acc.rf_id = a.rf_id LEFT JOIN representative as c ON c.representative_id = acc.representative_id WHERE ass.convey_ty = :convey_type AND (acc.ee_name = :name OR c.company_name = :name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id LEFT JOIN representative as c1 ON c1.representative_id = ac.representative_id GROUP BY name, normalize_name ORDER BY normalize_name ASC, name ASC ";

    let getGovernData = await csv.query(queryGovernChange,{
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
 * Find Customer companies list
 * @param {} DBConnection 
 */

let getCompaniesList = async (DBConnection) => {
    const Representative = DBConnection.define('ClientRepesentative', ClientRepesentative.mainStructure, ClientRepesentative.options);

    return await Representative.findAll({
        where: {parent_id: 0}
    });
}

/**
 * Find Customer Parties
 * Input Company name
 * Find representative of the company name and then find assignors and assignees of the representative
 */

let findCompanyCustomersByName = async(companyName) => {
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

    let findRepresentative = await Representatives.findOne({
        where:{representative_name: companyName},
    });

    /*if(findRepresentative == null ) {
        let findRepresentative = await AssignorAndAssignee.findOne({
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
    }*/



    if(findRepresentative != null && findRepresentative.representative_id > 0) {
        if(findRepresentative.representative_name != null) {
            console.log("UPDATE ORG...");
            /*if(companyName != findRepresentative.representative_name) {
                Organisations.update({name: findRepresentative.representative_name},{where: {name: companyName}});
            }*/
            //Organisations.update({name: findRepresentative.representative_name},{where: {name: companyName}});

            /** Find Assignors */

            let queryAssignor = "SELECT a.or_name as name, count(a.or_name) as counter, r.representative_name as normalize_name FROM db_uspto.assignor as a LEFT JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = a.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id INNER JOIN (SELECT rf_id FROM db_uspto.assignee as ac WHERE ac.assignor_and_assignee_id IN ( SELECT aa.assignor_and_assignee_id FROM assignor_and_assignee as aa LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id where (r1.representative_name=:name OR aa.name = :name))) as b ON  b.rf_id = a.rf_id GROUP BY a.or_name";
            console.log(queryAssignor);
            assignors = await connection.resources.query(queryAssignor,{
                type: connection.Sequelize.QueryTypes.SELECT,
                replacements: { name: findRepresentative.representative_name },
                raw: true,
                logging: console.log,
                }
            );	
    
            /*let queryAssignee = "SELECT a.ee_name as name, count(a.ee_name) as counter, r.representative_name as normalize_name FROM db_uspto.assignee as a LEFT JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = a.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id INNER JOIN (SELECT rf_id FROM db_uspto.assignor as ac WHERE or_name IN ( SELECT aa.name FROM assignor_and_assignee as aa INNER JOIN representative as r1 ON r1.representative_id = aa.representative_id where r1.representative_name=:name)) as b ON  b.rf_id = a.rf_id GROUP BY a.ee_name";*/
    
            /** Find Assignees */

            let queryAssignee = "SELECT ee.ee_name as name, count(ee.ee_name) as counter, r.representative_name as normalize_name from assignee as ee INNER JOIN (SELECT rf_id FROM db_uspto.assignor as ac INNER JOIN ( SELECT aa.assignor_and_assignee_id FROM assignor_and_assignee as aa LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id WHERE (r1.representative_name=:name OR aa.name = :name)) as np ON np.assignor_and_assignee_id = ac.assignor_and_assignee_id GROUP BY ac.rf_id) as temp ON temp.rf_id = ee.rf_id LEFT JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id GROUP BY ee.ee_name";
            console.log(queryAssignee);   
            assignees = await connection.resources.query(queryAssignee,{
                type: connection.Sequelize.QueryTypes.SELECT,
                replacements: { name: findRepresentative.representative_name },
                raw: true,
                logging: console.log,
                }
            );               
            console.log(assignees.length);
            console.log(assignors.length);
            customer_list = [...assignees, ...assignors];
        }        
        
    } else {
        console.log("No representative company....");
    }

    
    let list = [];
    console.log(customer_list.length);
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
                await list.push({id: uuidv4(), name: getList[0].name, normalize_name: getList[0].normalize_name, counter: getCounter});
            }
        }
    }
    console.log(list.length);
    return list;
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

const helper = {};
helper.findOrganisationbyID = findOrganisationbyID;
helper.findRepresentative = findRepresentative;
helper.getCompanyListByEmployee = getCompanyListByEmployee;
helper.getCompanyListByOwnership = getCompanyListByOwnership;
helper.getCompanyListBySecurity = getCompanyListBySecurity;
helper.getCompanyListByOther = getCompanyListByOther;
helper.searchCompany = searchCompany;
helper.checkRepresentativeCompany = checkRepresentativeCompany;
helper.getAllUsers = getAllUsers;
helper.findCompanyCustomersByName = findCompanyCustomersByName;
helper.findCompanyCustomersByID = findCompanyCustomersByID;
helper.getCompaniesList = getCompaniesList;
helper.generateJSON = generateJSON;
helper.getNewCode = getNewCode;
module.exports = helper;