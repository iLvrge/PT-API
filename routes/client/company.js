const express = require("express"),
    
    exec = require("child_process").exec,

    moment = require('moment'),

    route = express.Router();
//require the Model

const Representatives = require("../../model/client/Representatives");

const ActivityLogs = require("../../model/resources/ActivityLog");

const RepresentativeTransactions = require("../../model/resources/RepresentativeTransactions");

const Lawfirm = require("../../model/client/Lawfirm");

const CompanyLawfirm = require("../../model/client/CompanyLawfirm");

const Validity = require("../../model/application/Validity");

const Transactions = require("../../model/application/Transactions");

const TreeParties = require("../../model/application/TreeParties");

const TreePartiesCollections = require("../../model/application/TreePartiesCollections");

const Errors = require("../../model/application/Errors");

const Timelines = require("../../model/application/Timelines");

const helpers = require("../../helpers/helper");

const authJWT = require("../../helpers/verifyJwtToken");

const connection = require("../../config/db.config");

const clientDBConnection = require("../../helpers/clientDBConnection");
/**Get all companies */
route.get("/", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const getCompaniesList = await helpers.getCompaniesWithChildren(req.connection_db, req.orgId);
            res.status(200).json(getCompaniesList);
        } else {
            res.status(401).send("Unable to retrieve companies");
        }
    } catch (err) {
        console.log(err);
        res.status(500).json({message: "Unable to retrieve companies"})
    }
});

/**Get all companies */
route.get("/list", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const { offset } = req.query;

            const Representative = req.connection_db.define('Representatives', Representatives.mainStructure, Representatives.options);

            const where = {where: {parent_id: 0}};

            const total_records = await Representative.count( where );

            where.limit = connection.DEFAULT_LIMIT;
            where.offset = offset > 0 ? parseInt(offset) : 0;
            where.order = [
                ['original_name', 'ASC'],
                ['representative_name', 'ASC']
            ];
            where.attributes = ['representative_id', 'original_name', 'representative_name'];

            const list = await Representative.findAll( where );
            res.status(200).json({list, total_records});
        } else {
            res.status(401).send("Unable to retrieve companies");
        }
    } catch (err) {
        console.log(err);
        res.status(500).json({message: "Unable to retrieve companies"})
    }
});

/**Get all maintaince assets */
route.get("/maintainence_assets", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const Representative = req.connection_db.define('Representatives', Representatives.mainStructure, Representatives.options); 
            const { representative_id, offset } = req.query

            const queryParams = {}
            queryParams.attributes = [ 'representative_id', 'original_name' ]

            if(JSON.parse( representative_id ).length > 0 ) {
                queryParams.representative_id = JSON.parse( representative_id ) 
            }

            const getAllNames = await Representative.findAll(queryParams);

            if(getAllNames.length > 0) {
                const allNames = [], representativeIDs = []

                const promises = getAllNames.map( company => {
                    allNames.push( company.original_name )
                    if(!representativeIDs.includes( company.representative_id )) {
                        representativeIDs.push( company.representative_id )
                    }
                    return company
                })

                Promise.all( promises )

                if( allNames.length > 0 ) {
                    const activityType = ['assignment','partialassignment','namechg','merger','employee','courtappointment', 'courtorder'], eventCode = ['F170', 'F173', 'F273', 'M170', 'M173', 'M183', 'M273', 'M283', 'M1551', 'M2551', 'M3551'];

                    const currentDate = moment(new Date()).format('YYYY-MM-DD');
                    const startDate = '2000-12-24', endDate =  '2020-12-24' ;

                    const customQuery = "SELECT STRING_REPLACE FROM db_patent_maintainence_fee.event_maintainence_fees WHERE event_code NOT IN (:eventCode) AND appno_doc_num IN ( SELECT appno_doc_num FROM documentid WHERE grant_doc_num <> '' AND date_format(appno_date, '%Y') BETWEEN :startDate AND :endDate AND rf_id IN ( SELECT ee.rf_id  from assignee as ee INNER JOIN assignment_conveyance as ac ON ac.rf_id = ee.rf_id LEFT JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE aaa.name IN (:representativeNames) AND ac.convey_ty IN (:activityType)  AND  ac.rf_id IN (SELECT rf_id FROM db_uspto.representative_transactions WHERE representative_id IN (:representativeIds) AND organisation_id = :organisationID ))  AND appno_doc_num NOT IN ( SELECT appno_doc_num FROM documentid WHERE rf_id IN (SELECT ass.rf_id FROM assignor as ass  INNER JOIN assignment_conveyance as ac ON ac.rf_id = ass.rf_id LEFT JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = ass.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE aaa.name IN (:representativeNames) AND ac.convey_ty IN (:activityType) AND ac.rf_id IN (SELECT rf_id FROM db_uspto.representative_transactions WHERE representative_id IN (:representativeIds) AND organisation_id = :organisationID )) GROUP BY appno_doc_num ) GROUP BY appno_doc_num ) AND appno_doc_num NOT IN (SELECT appno_doc_num FROM db_patent_maintainence_fee.event_maintainence_fees WHERE event_code IN (:eventCode) AND appno_doc_num IN ( SELECT appno_doc_num FROM documentid WHERE grant_doc_num <> '' AND date_format(appno_date, '%Y') BETWEEN :startDate AND :endDate AND rf_id IN ( SELECT ee.rf_id  from assignee as ee INNER JOIN assignment_conveyance as ac ON ac.rf_id = ee.rf_id LEFT JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE aaa.name IN (:representativeNames) AND ac.convey_ty IN (:activityType)  AND  ac.rf_id IN (SELECT rf_id FROM db_uspto.representative_transactions WHERE representative_id IN (:representativeIds) AND organisation_id = :organisationID ))  AND appno_doc_num NOT IN ( SELECT appno_doc_num FROM documentid WHERE rf_id IN (SELECT ass.rf_id FROM assignor as ass  INNER JOIN assignment_conveyance as ac ON ac.rf_id = ass.rf_id LEFT JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = ass.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE aaa.name IN (:representativeNames) AND ac.convey_ty IN (:activityType) AND ac.rf_id IN (SELECT rf_id FROM db_uspto.representative_transactions WHERE representative_id IN (:representativeIds) AND organisation_id = :organisationID )) GROUP BY appno_doc_num ) GROUP BY appno_doc_num )  GROUP BY appno_doc_num)  GROUP BY appno_doc_num ";

                    
                    const replacements = { representativeIds: representativeIDs, organisationID: req.orgId, representativeNames: allNames, startDate, endDate, activityType, eventCode };

                    let counterQuery = `SELECT count(*) as total_records FROM ( ${customQuery.replace('STRING_REPLACE', ' appno_doc_num ')} ) as temp`
                    

                    let getCounter = await connection.application.query(counterQuery,{
                            type: connection.Sequelize.QueryTypes.SELECT,
                            raw: true,
                            logging: console.log,
                            replacements: replacements,
                            plain: true
                        }
                    ); 

                    let list = [];

                    if(getCounter.total_records > 0) {
                        const listQuery = customQuery.replace('STRING_REPLACE', 'grant_doc_num, appno_doc_num')

                        replacements.limit = connection.DEFAULT_LIMIT, 
                        replacements.offset = offset > 0 ? parseInt(offset) : 0
    
                        list = await connection.application.query(listQuery,{
                                type: connection.Sequelize.QueryTypes.SELECT,
                                raw: true,
                                logging: console.log,
                                replacements: replacements,
                            }
                        ); 
                    }
                    res.status(200).json({total_records: getCounter.total_records, list})
                }
            }
        }
    }  catch (err) {
        console.log(err);
        res.status(500).json({message: "Unable to retrieve assets"})
    }
})

route.get("/lawfirm", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {

            const Representative = req.connection_db.define('Representatives', Representatives.mainStructure, Representatives.options);

            const Lawfirms = req.connection_db.define('Lawfirm', Lawfirm.mainStructure, Lawfirm.options);

            const RepresentativeLawfirms = req.connection_db.define('CompanyLawfirm', CompanyLawfirm.mainStructure, CompanyLawfirm.options);

            Representative.hasMany(RepresentativeLawfirms, { foreignKey: 'representative_id', as: 'mapping_company_law_firms' });

            RepresentativeLawfirms.belongsTo(Lawfirms, { foreignKey: 'lawfirm_id', as: 'lawfirm', otherKey: 'lawfirm_id' });

            let where = {};

            if(req.query.companies != undefined && req.query.companies != null) {
                const representativeIDs = JSON.parse(req.query.companies);
                where = {representative_id: representativeIDs};
            }
            where.parent_id = 0;
            const list = await Representative.findAll({
                attributes: ['representative_id', 'original_name', 'representative_name'],
                where: where,
                include: [
                    {
                        model: RepresentativeLawfirms,
                        as: 'mapping_company_law_firms',
                        attributes: ['lawfirm_id'],
                        required:false,
                        include: [
                            {
                                model: Lawfirms,
                                as: 'lawfirm',
                                attributes: ['lawfirm_id', 'name']
                            }
                        ]
                    }
                ]
            });

            res.status(200).json(list);
        } else {
            res.status(401).send("Unable to retrieve companies");
        }
    } catch (err) {
        console.log(err);
        res.status(500).json({message: "Unable to retrieve companies"})
    }
});


route.post("/lawfirm", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        let add = [];
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            if(req.body.companies != null && req.body.companies != undefined  && req.body.lawfirms != undefined ) {
                
                const lawFirmList = JSON.parse(req.body.lawfirms);
                const companiesList = JSON.parse(req.body.companies);

                const postData = [];
                if(lawFirmList.length > 0) {
                    const promises = companiesList.map(async company => {
                        const promise = lawFirmList.map(lawFirm => {
                            postData.push({representative_id: company, lawfirm_id: lawFirm})   
                            return lawFirm
                        })
                        await Promise.all(promise);
                        return company
                    })
                    await Promise.all(promises);

                    const RepresentativeLawfirm = req.connection_db.define('RepresentativeLawfirm', CompanyLawfirm.mainStructure, CompanyLawfirm.options);

                    add = await RepresentativeLawfirm.bulkCreate(postData, {returning: true});
                } else {
                    res.status(402).send("Please select law firm IDs.");        
                }
            } else {
                res.status(402).send("Invalid inputs");        
            } 
        }
        res.status(200).json(add);
    } catch (e) {
        console.log(e);
        res.status(500).send("Internal error");
    }
});

route.get("/search/:searchName", [authJWT.verifyToken], async(req, res, next) => {
    const search = req.params.searchName;
    searchCompanies  = await helpers.searchCompany(search, 0);
    res.status(200).json(searchCompanies);
});

/**
 * Add new company 
 */

route.post("/", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        
        const subsidaryName = req.body.name, parentCompany = req.body.parent_company;
        if(subsidaryName.length > 0) {
            let companyList = JSON.parse(subsidaryName);

            if(companyList.length > 0) {
                const querySubsidaryCompany = "SELECT aaa.assignor_and_assignee_id, aaa.name, r.representative_name, aaa.instances, r.representative_id FROM assignor_and_assignee as aaa LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE aaa.assignor_and_assignee_id IN (:IDs)";
                    
                const getList = await connection.resources.query(querySubsidaryCompany,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    replacements: { IDs: companyList },
                    raw: true,
                    logging: console.log,
                    }
                ); 
                const activityLogs = [], currentDate = moment(new Date()).format('YYYY-MM-DD hh:mm:ss');

                if(parentCompany != undefined && parentCompany > 0) {   
                    const parentCompanyQuery = "SELECT representative_id, original_name, representative_name FROM representative as r WHERE representative_id = :parentCompany AND r.parent_id =  0";
                    
                    const findName = await req.connection_db.query(parentCompanyQuery,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: { parentCompany: parentCompany },
                        raw: true,
                        plain: true,
                        logging: console.log,
                        }
                    ); 
                   

                    if(findName != null && findName.representative_id > 0) { 
                        const Representative = req.connection_db.define('Representatives', Representatives.mainStructure, Representatives.options);
                        const findCompanies = await Representative.findAll({
                            where: {parent_id: findName.representative_id}
                        });
                        const listedCompanies = [];
                        listedCompanies.push(findName.original_name);
                        if(findCompanies.length > 0) {
                            findCompanies.map( listed => listedCompanies.push(listed.original_name));
                        }
                        
                        let companies = [];
                        let tap = false;
                        
                        if(getList.length > 0) {                
                            getList.forEach(async company => {
                                if(!listedCompanies.includes(company.name)){
                                    let nameRepre = company.representative_name != null ? company.representative_name : company.name;
                                    /**
                                     * For inserting bulk entries creating array of companies
                                     */
                                    await companies.push({
                                        original_name: company.name , representative_name: nameRepre, instances: company.instances, parent_id: findName.representative_id
                                    });

                                    /**
                                     *  For inserting bulk entries for activity log
                                     */
                                    activityLogs.push({organistaion_id: req.orgId, user_id: req.userId, type: 0, company_name: company.name, representative_company_name: findName.original_name, activity_date: currentDate});
                                } else {
                                    tap = true;
                                }                            
                            });
                        }
                        
                        if(companies.length > 0) {
                            const addCompanies = await Representative.bulkCreate(companies);
                            ActivityLogs.bulkCreate(activityLogs);
                            console.log(addCompanies);
                            if(addCompanies) {
                                console.log(`php -f /var/www/html/trash/add_representative_rfids.php "${req.orgId}" "${findName.representative_name}"`);
                                await exec(`php -f /var/www/html/trash/add_representative_rfids.php "${req.orgId}" "${findName.representative_name}"`, async (error, stdout, stderr) => {
                                    console.log(error);
                                    console.log(stdout);
                                    console.log(stderr);
                                    console.log(`php -f /var/www/html/trash/tree_script_client.php "${findName.representative_name}"`);
                                    await exec(`php -f /var/www/html/trash/tree_script_client.php "${findName.representative_name}"`, async (error, stdout, stderr) => {
                                        console.log(error);
                                        console.log(stdout);
                                        console.log(stderr);
                                        console.log(`php -f /var/www/html/trash/fix_inventor_timeline_tree_transaction_assests_updates.php  "${req.orgId}" "${findName.representative_id}"`);
                                        await exec(`php -f /var/www/html/trash/fix_inventor_timeline_tree_transaction_assests_updates.php  "${req.orgId}" "${findName.representative_id}"`, async (error, stdd, stderr)=> {    
                                            console.log(error);
                                            console.log(stdd);
                                            console.log(stderr);                                        
                                            console.log("DONE>>>>>>>>>>>");
                                            console.log(`php -f /var/www/html/trash/download_all_pdf.php "${findName.representative_name}"`);
                                            exec(`php -f /var/www/html/trash/download_all_pdf.php "${findName.representative_name}"`, (error, stdd, stderr)=> {
                                                console.log("donwload_all_pdf....")
                                                console.log(error); 
                                                console.log(stderr);
                                                console.log(stdd);
                                                console.log("DONE");
                                            });
                                        });
                                    });
                                });
                                res.status(200).json(companies);
                            } else {
                                res.status(500).send("Internal server error");
                            }
                        } else {
                            if(tap === true) {
                                res.status(403).send("Company already added");
                            } else {
                                res.status(402).send("Invalid inputs");
                            }                        
                        }
                    } else {
                        res.status(403).send("Parent company not exist");
                    }
                } else {
                    /**Add parent companies */
                    console.log("IN Parent");
                    let companies = [], originalNames = [], representativeNames = [];
                    const Representative = req.connection_db.define('Representatives', Representatives.mainStructure, Representatives.options);
                    if(getList.length > 0) {                
                        getList.forEach( company => {
                            let representativeName = "";
                            if(company.name != null) {
                                originalNames.push(company.name);
                            } 
                            if(company.representative_name != null) {
                                representativeNames.push(company.representative_name);
                                representativeName = company.representative_name;
                            } else {
                                representativeName = company.name;
                            }
                            
                            companies.push({
                                instances: company.instances, representative_id: company.representative_id, original_name: company.name, representative_name: representativeName
                            });
                        });
                    }
                    if(companies.length > 0) {                    
                        let whereC = "";
                        if(originalNames.length > 0 && representativeNames.length > 0) {
                            whereC = {[connection.Op.or]:[{original_name: originalNames}, {representative_name: representativeNames}]};
                        } else if(originalNames.length > 0) {
                            whereC = {original_name: originalNames};
                        }
                        const findParentCompanies = await Representative.findAll({
                            where: whereC
                        });
                        if(findParentCompanies.length == 0) {
                            let addRecord = 0,  mainCompanies = [], parentCompaniesID = [];                   
                            for(let i = 0; i < companies.length; i++) {
                                
                                /** Add in Client Representative */
                                let representativeName = companies[i].representative_name != null ? companies[i].representative_name : companies[i].original_name;

                                const addParent = await Representative.create({
                                    original_name: companies[i].original_name, representative_name: representativeName, instances: companies[i].instances
                                });

                                /**
                                 *  For inserting bulk entries for activity log
                                 */
                                activityLogs.push({organistaion_id: req.orgId, user_id: req.userId, type: 0, company_name: companies[i].original_name, representative_company_name: companies[i].original_name, activity_date: currentDate});
                                
                                if(addParent != null && addParent.representative_id > 0){
                                    /**
                                     * Find Normalize companies
                                     */
                                    parentCompaniesID.push(addParent.representative_id);
                                    let nameR = companies[i].representative_id > 0 ? companies[i].representative_name : companies[i].original_name;
    
                                    mainCompanies.push(nameR);
                                    addRecord++;
                                    
                                    let findCompaniesQuery = "";

                                    if(companies[i].representative_id > 0) {
                                        findCompaniesQuery = "SELECT aaa.*, r.representative_name  FROM assignor_and_assignee as aaa LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE aaa.representative_id = :representativeID";
                                    } else {
                                        findCompaniesQuery = "SELECT aaa.*, r.representative_name  FROM assignor_and_assignee as aaa LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE aaa.representative_id IN (SELECT representative_id FROM representative WHERE representative_name = :name)";
                                    }
                                    
                                    const list  = await connection.resources.query(findCompaniesQuery,{
                                        type: connection.Sequelize.QueryTypes.SELECT,
                                        replacements: { representativeID: companies[i].representative_id, name: nameR },
                                        raw: true,
                                        logging: console.log,
                                        }
                                    ); 

                                    if(list.length > 0) {
                                        const childCompanies = [];
                                        list.forEach( company => {
                                            let nameRepre = company.representative_name != null ? company.representative_name : company.name;
                                            childCompanies.push({original_name: company.name, representative_name: nameRepre, instances: company.instances, parent_id: addParent.representative_id});

                                            /**
                                             *  For inserting bulk entries for activity log
                                             */
                                            activityLogs.push({organistaion_id: req.orgId, user_id: req.userId, type: 0, company_name: company.name, representative_company_name: companies[i].original_name, activity_date: currentDate});
                                        });
                                        if(childCompanies.length > 0) {
                                            const addChildCompanies = await Representative.bulkCreate(childCompanies);
                                            if(addChildCompanies) {
                                                addRecord++;
                                            }
                                        }
                                    }
                                   
                                }
                            }
                            if(addRecord > 0) {
                                ActivityLogs.bulkCreate(activityLogs);
                                if(mainCompanies.length > 0){
                                    mainCompanies.map(async (company, index) => {
                                        console.log(`php -f /var/www/html/trash/add_representative_rfids.php "${req.orgId}" "${company}"`);
                                        await exec(`php -f /var/www/html/trash/add_representative_rfids.php "${req.orgId}" "${company}"`, async (error, stdout, stderr) => {
                                            console.log(error);
                                            console.log(stdout);
                                            console.log(stderr);
                                            console.log(`php -f /var/www/html/trash/tree_script_client.php "${req.orgId}"  "${company}"`);
                                            await exec(`php -f /var/www/html/trash/tree_script_client.php "${req.orgId}"  "${company}"`, async (error, stdout, stderr) => {
                                                console.log(error);
                                                console.log(stdout);
                                                console.log(stderr);
                                                console.log(`php -f /var/www/html/trash/fix_inventor_timeline_tree_transaction_assests_updates.php "${req.orgId}" "${parentCompaniesID[index]}"`);
                                                await exec(`php -f /var/www/html/trash/fix_inventor_timeline_tree_transaction_assests_updates.php "${req.orgId}" "${parentCompaniesID[index]}"`, async (error, std, stderr) => {
                                                    console.log(error);
                                                    console.log(std);
                                                    console.log(stderr);
                                                    console.log("DONE>>>>>>>>>>>");
                                                    console.log(`php -f /var/www/html/trash/download_all_pdf.php "${company}"`);
                                                    exec(`php -f /var/www/html/trash/download_all_pdf.php "${company}"`, (error, stdout, stderr)=> {
                                                        console.log("donwload_all_pdf....")
                                                        console.log(error);
                                                        console.log(stderr);
                                                        console.log(stdout);
                                                        console.log("DONE");
                                                    });
                                                });
                                            })
                                        });
                                    });
                                }
                                res.status(200).send("Companies added");
                            } else {
                                res.status(500).json("Internal server error");
                            }
                        } else {
                            const addedCompanies = [],  mainCompanies = [], parentCompaniesID = [];           
                            let addRecord = 0;    
                            findParentCompanies.map(c => {
                                addedCompanies.push(c.original_name);
                                addedCompanies.push(c.representative_name);
                            })
                            for(let i = 0; i < companies.length; i++) {
                                if(!addedCompanies.includes(companies[i].original_name) && !addedCompanies.includes(companies[i].representative_name)){
                                    const addParent = await Representative.create({
                                        original_name: companies[i].original_name, representative_name: companies[i].representative_name, instances: companies[i].instances
                                    });
                                    if(addParent != null && addParent.representative_id > 0){
                                        parentCompaniesID.push(addParent.representative_id);
                                        let nameR = companies[i].representative_id > 0 ? companies[i].representative_name : companies[i].original_name;
    
                                        mainCompanies.push(nameR);
                                        addRecord++;
                                        if(companies[i].representative_id > 0) {
                                            const findCompaniesQuery = "SELECT aaa.*, r.representative_name  FROM assignor_and_assignee as aaa LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE aaa.representative_id = :representativeID";
        
                                            const list  = await connection.resources.query(findCompaniesQuery,{
                                                type: connection.Sequelize.QueryTypes.SELECT,
                                                replacements: { representativeID: companies[i].representative_id },
                                                raw: true,
                                                logging: console.log,
                                                }
                                            ); 
        
                                            if(list.length > 0) {
                                                const childCompanies = [];
                                                list.map( company => {
                                                    childCompanies.push({original_name: company.name, representative_name: company.representative_name, instances: companies[i].instances, parent_id: addParent.representative_id});

                                                    /**
                                                     *  For inserting bulk entries for activity log
                                                     */
                                                    activityLogs.push({organistaion_id: req.orgId, user_id: req.userId, type: 0, company_name: company.name, representative_company_name: companies[i].original_name, activity_date: currentDate});
                                                });
                                                if(childCompanies.length > 0) {
                                                    const addChildCompanies = await Representative.bulkCreate(companies);
                                                    if(addChildCompanies) {
                                                        addRecord++;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            if(addRecord > 0) {
                                ActivityLogs.bulkCreate(activityLogs);
                                if(mainCompanies.length > 0){
                                    mainCompanies.map(async (company, index) => {
                                        console.log(`php -f /var/www/html/trash/add_representative_rfids.php "${req.orgId}" "${company}"`);
                                        await exec(`php -f /var/www/html/trash/add_representative_rfids.php "${req.orgId}" "${company}"`, async (error, stdout, stderr) => {
                                            console.log(error);
                                            console.log(stdout);
                                            console.log(stderr);
                                            console.log(`php -f /var/www/html/trash/tree_script_client.php "${company}"`);
                                            await exec(`php -f /var/www/html/trash/tree_script_client.php "${company}"`, async (error, stdout, stderr) => {
                                                console.log(error);
                                                console.log(stdout);
                                                console.log(stderr);
                                                await exec(`php -f /var/www/html/trash/fix_inventor_timeline_tree_transaction_assests_updates.php "${req.orgId}" "${parentCompaniesID[index]}"`, async (error, std, stderr) => {
                                                    console.log(error);
                                                    console.log(std);
                                                    console.log(stderr);
                                                    console.log("DONE>>>>>>>>>>>");
                                                    console.log(`php -f /var/www/html/trash/download_all_pdf.php "${company}"`);
                                                    exec(`php -f /var/www/html/trash/download_all_pdf.php "${company}"`, (error, stdout, stderr)=> {
                                                        console.log("donwload_all_pdf....")
                                                        console.log(error);
                                                        console.log(stderr);
                                                        console.log(stdout);
                                                        console.log("DONE");
                                                    });
                                                });
                                            });
                                        });
                                    });
                                }
                                res.status(200).send("Companies added");
                            } else {
                                res.status(500).json("Internal server error");
                            }
                        }
                    } else {
                        res.status(402).send("Invalid inputs");
                    }
                }
            } else {
                res.status(402).send("Please select companies first.");
            }            
        } else {
            res.status(401).send("Name cannot be blank");
        }
    } catch( err ) {
        console.log(err);
        res.status(500).json({message: "Error while adding company"})
    }
});

/**
 * Delete Parent Companies
 */
route.delete("/", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        let IDs = req.query.companies;
        if(IDs.length > 0) {
            IDs = JSON.parse(IDs)
            const Representative = req.connection_db.define('Representatives', Representatives.mainStructure, Representatives.options);
            const findCompanies = await Representative.findAll({
                attributes:['representative_id', 'parent_id', 'original_name'],
                where:{representative_id: IDs},
                group:['representative_id','parent_id']
            });
            const updateKPICompanies=[],  deleteParentCompanies = [], reUpdateCompanies = [], deleteCompanies = [], activityLogs = [], currentDate = moment(new Date()).format('YYYY-MM-DD hh:mm:ss');
            if(findCompanies.length > 0) {
                const promise = findCompanies.map(c => {
                    if(c.parent_id == 0) {
                        deleteParentCompanies.push(c.representative_id);
                        updateKPICompanies.push(c.representative_id);
                    } else {
                        if(!updateKPICompanies.includes(c.parent_id)){
                            updateKPICompanies.push(c.parent_id); 
                            reUpdateCompanies(c.parent_id);
                        }
                    }
                    deleteCompanies.push(c.representative_id);
                   
                    
                     /**
                     *  For inserting bulk entries for activity log
                     */
                    activityLogs.push({organisation_id: req.orgId, user_id: req.userId, type: 1, company_name: c.original_name, representative_company_name: c.original_name, activity_date: currentDate});
                    return c;
                });

                await Promise.all(promise);

                if(deleteParentCompanies.length > 0) {
                    const findParentSubCompanies = await Representative.findAll({
                        attributes:['representative_id'],
                        where:{parent_id: deleteParentCompanies}                        
                    });

                    if(findParentSubCompanies.length) {
                        const promise = findParentSubCompanies.map(c => {
                            deleteCompanies.push(c.representative_id);
                            return c;
                        });
                        await Promise.all(promise);
                    }
                }


                if(deleteCompanies.length > 0) {
                    
                    const destroyAllCompanies = await  Representative.destroy({
                        where: {representative_id: deleteCompanies},
                    })

                    if(destroyAllCompanies != null) {
                        ActivityLogs.bulkCreate(activityLogs);
                        if(deleteParentCompanies.length > 0) {
                            const destroyAllTransactions = await RepresentativeTransactions.destroy({
                                where: {representative_id: deleteParentCompanies, organisation_id: req.orgId},
                            });
                            console.log("destroyAllTransactions", destroyAllTransactions);
                            if(destroyAllTransactions) {
                                /**
                                 * Delete KPI counter, Tree, Timeline, Error
                                 */

                                await Validity.destroy({
                                    where: {representative_id: deleteParentCompanies, organisation_id: req.orgId},
                                });
                                await Transactions.destroy({
                                    where: {representative_id: deleteParentCompanies, organisation_id: req.orgId},
                                });
                                await TreeParties.destroy({
                                    where: {representative_id: deleteParentCompanies, organisation_id: req.orgId},
                                });
                                await TreePartiesCollections.destroy({
                                    where: {representative_id: deleteParentCompanies, organisation_id: req.orgId},
                                });
                                await Errors.destroy({
                                    where: {representative_id: deleteParentCompanies, organisation_id: req.orgId},
                                });

                                await Timelines.destroy({
                                    where: {representative_id: deleteParentCompanies, organisation_id: req.orgId},
                                });
                            }
                        }


                        if(reUpdateCompanies.length > 0) {
                            /**
                             * Delete from Representative Transaction and add transactions again
                             */
                            const destroyAllTransactions = await RepresentativeTransactions.destroy({
                                where: {representative_id: reUpdateCompanies, organisation_id: req.orgId},
                            });

                            if(destroyAllTransactions) {
                                const findPCompanies = await Representative.findAll({
                                    attributes:['original_name'],
                                    where:{representative_id: reUpdateCompanies, parent_id: 0}                        
                                });

                                if(findPCompanies.length > 0) {
                                    const promiseAddRFIDs = findPCompanies.map(async (company, index) => {
                                        console.log(`php -f /var/www/html/trash/add_representative_rfids.php "${req.orgId}" "${company.original_name}"`);
                                        await exec(`php -f /var/www/html/trash/add_representative_rfids.php "${req.orgId}" "${company.original_name}"`, async (error, std, stderr) => {
                                            /*await exec(`php -f /var/www/html/trash/tree_script_client.php "${company.original_name}"`, async (error, stdout, stderr) => {

                                            });*/
                                            console.log(error);
                                            console.log(std);
                                            console.log(stderr);
                                        });
                                        return company;
                                    });
                                    await Promise.all(promiseAddRFIDs);

                                    /**
                                     * Recreate KPI and Tree
                                     */
                                    exec(`php -f /var/www/html/trash/fix_inventor_timeline_tree_transaction_assests_updates.php "${req.orgId}" ""`, async (error, std, stderr) => {
                                        console.log(error);
                                        console.log(std);
                                        console.log(stderr);
                                    });
                                    res.status(200).send("Companies deleted.");
                                }
                            }
                        } else {
                            /**
                             * Recreate KPI and Tree
                             */
                            console.log("DELETE");
                            exec(`php -f /var/www/html/trash/fix_inventor_timeline_tree_transaction_assests_updates.php "${req.orgId}" ""`, async (error, std, stderr) => {
                                console.log(error);
                                console.log(std);
                                console.log(stderr);
                            });
                            res.status(200).send("Companies deleted.");
                        }
                    } else {
                        res.status(500).send("Error while deleting companies.");
                    }                    
                } else {
                    res.status(402).send("No company found");
                }
            } else {
                res.status(402).send("No company found");
            }
        }
    } catch( err ) {
        console.log(err);
        res.status(500).json({message: "Error while deleting companies."})
    }    
});

/**
 * Delete Child Companies
 */
     
route.delete("/subcompanies", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        let IDs = req.query.companies;
        if(IDs.length > 0) {
            IDs = JSON.parse(IDs)
            const Representative = req.connection_db.define('Representatives', Representatives.mainStructure, Representatives.options);
            const findParentCompanies = await Representative.findAll({
                attributes:['representative_id','original_name', 'parent_id'],
                where:{representative_id: IDs, parent_id:{[connection.Op.gt]: 0}}
            });
            const deleteParentCompanies = [], activityLogs = [], currentDate = moment(new Date()).format('YYYY-MM-DD hh:mm:ss');
            if(findParentCompanies.length > 0) {
                findParentCompanies.map(c => {
                    deleteParentCompanies.push(c.representative_id);
                     /**
                     *  For inserting bulk entries for activity log
                     */
                    activityLogs.push({organisation_id: req.orgId, user_id: req.userId, type: 1, company_name: c.original_name, representative_company_name: '', activity_date: currentDate});
                });
                Representative.destroy({
                    where: {representative_id: deleteParentCompanies},
                })
                .then( u => {
                    ActivityLogs.bulkCreate(activityLogs);
                   
                    (async () => {
                        const parentCompanies = [];
                        const promise = findParentCompanies.map(c => {
                            parentCompanies.push(c.parent_id);
                            return c;
                        });

                        await Promise.all(promise);
                        const mainCompanies = await Representative.findAll({
                            attributes:['representative_id', 'original_name'],
                            where:{representative_id: parentCompanies, parent_id: 0}
                        });

                        if(mainCompanies.length > 0) {
                            const destroyAllTransactions = await RepresentativeTransactions.destroy({
                                where: {representative_id: parentCompanies, organisation_id: req.orgId},
                            });
                            if(destroyAllTransactions) {
                                const promise = mainCompanies.map(async company => {
                                    console.log(`php -f /var/www/html/trash/add_representative_rfids.php "${req.orgId}" "${company.original_name}"`);
                                    await exec(`php -f /var/www/html/trash/add_representative_rfids.php "${req.orgId}" "${company.original_name}"`, async (error, stdout, stderr) => {
                                        console.log(error);
                                        console.log(stdout);
                                        console.log(stderr);
                                        //console.log(`php -f /var/www/html/trash/tree_script_client.php "${req.orgId}"  "${company.original_name}"`);
                                        
                                    });
                                    return company;
                                });
                                await Promise.all(promise);
                                /**
                                 * Recreate KPI and Tree
                                 */
                                exec(`php -f /var/www/html/trash/fix_inventor_timeline_tree_transaction_assests_updates.php "${req.orgId}" ""`, async (error, std, stderr) => {

                                });
                            }
                        } else {
                            /**
                             * Recreate KPI and Tree
                             */
                            exec(`php -f /var/www/html/trash/fix_inventor_timeline_tree_transaction_assests_updates.php "${req.orgId}" ""`, async (error, std, stderr) => {

                            });
                        }
                    })();
                    res.status(200).send("Companies deleted.");
                })
                .catch(err => {
                    console.log(err);
                    res.status(500).send("Unable to delete professional");
                })
            } else {
                res.status(402).send("No company found");
            }
        }
    } catch( err ) {
        console.log(err);
        res.status(500).json({message: "Error while deleting company"})
    }    
});


route.delete("/lawfirm/companyLawfirmID", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            if(req.params.companyLawfirmID != null && req.params.companyLawfirmID != undefined && req.params.companyLawfirmID > 0) {
                
                const RepresentativeLawfirm = req.connection_db.define('RepresentativeLawfirm', CompanyLawfirm.mainStructure, CompanyLawfirm.options);

                const findData = RepresentativeLawfirm.findByPk(req.params.companyLawfirmID);

                if(findData != null && findData.company_lawfirm_id > 0) {
                    const deleteData = await RepresentativeLawfirm.destroy({
                        where:{company_lawfirm_id: req.params.companyLawfirmID}
                    })

                    if(deleteData) {
                        res.status(200).send("Record delete successfully");    
                    } else {
                        res.status(500).send("Deleting data failed.");    
                    } 
                }
            } else {
                res.status(402).send("Invalid inputs");        
            } 
        } else {
            res.status(402).send("Invalid inputs");        
        } 
    } catch (e) {
        console.log(e);
        res.status(500).send("Internal error");
    }
});

module.exports = route;