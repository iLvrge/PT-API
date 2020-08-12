const express = require("express");
const exec = require("child_process").exec;


const route = express.Router();
//require the Model

const Representatives = require("../../model/client/Representatives");

const ApplicationRepresentative = require("../../model/application/Representatives");

const helpers = require("../../helpers/helper");

const authJWT = require("../../helpers/verifyJwtToken");

const connection = require("../../config/db.config");

const clientDBConnection = require("../../helpers/clientDBConnection");
/**Get all companies */
route.get("/", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {

            const parentCompanyQuery = "SELECT representative_id as id, original_name, representative_name, instances, instances + (Select sum(instances) FROM representative as r1 WHERE r1.parent_id = r.representative_id) as counter FROM representative as r WHERE r.parent_id = 0";

            const companies = await req.connection_db.query(parentCompanyQuery,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                }
            ); 
            
            if(companies.length > 0) {
                let getAllIDs = [];
                companies.map( c => getAllIDs.push(c.id));
                let childCompaniesQuery = "SELECT representative_id as id, original_name, representative_name, instances as counter, parent_id FROM representative as r WHERE r.parent_id IN (:parentCompany) ORDER BY r.parent_id ASC, counter DESC";

                let childCompanies = await req.connection_db.query(childCompaniesQuery,{
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
                res.status(200).json(companies);
            } else {
                res.status(200).json([]);
            }
            
            //.finally(() => req.connection_db.close());
        } else {
            res.status(401).send("Unable to retrieve companies");
        }
    } catch (err) {
        console.log(err);
        res.status(500).json({message: "Unable to retrieve companies"})
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
                                    await companies.push({
                                        original_name: company.name , representative_name: company.representative_name, instances: company.instances, parent_id: findName.representative_id
                                    });
                                } else {
                                    tap = true;
                                }                            
                            });
                        }
                        
                        if(companies.length > 0) {
                            const addCompanies = await Representative.bulkCreate(companies);
                            console.log(addCompanies);
                            if(addCompanies) {
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
                                })
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
                            if(company.name != null) {
                                originalNames.push(company.name);
                            } 
                            if(company.representative_name != null) {
                                representativeNames.push(company.representative_name);
                            } 
                            companies.push({
                                instances: company.instances, representative_id: company.representative_id, original_name: company.name, representative_name: company.representative_name
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
                                const addParent = await Representative.create({
                                    original_name: companies[i].original_name, representative_name: companies[i].representative_name, instances: companies[i].instances
                                });
                                
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
                                            childCompanies.push({original_name: company.name, representative_name: company.representative_name, instances: company.instances, parent_id: addParent.representative_id});
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
                                if(mainCompanies.length > 0){
                                    mainCompanies.map(async (company, index) => {
                                        console.log(`php -f /var/www/html/trash/tree_script_client.php "${company}"`);
                                        await exec(`php -f /var/www/html/trash/tree_script_client.php "${company}"`, async (error, stdout, stderr) => {
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
                                if(mainCompanies.length > 0){
                                    mainCompanies.map(async company => {
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
                                        })
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
route.delete("/:ids", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        let IDs = req.params.ids;
        if(IDs.length > 0) {
            IDs = IDs.toString().split(',');
            const Representative = req.connection_db.define('Representatives', Representatives.mainStructure, Representatives.options);
            const findParentCompanies = await Representative.findAll({
                attributes:['representative_id'],
                where:{representative_id: IDs, parent_id:{[connection.Op.eq]: 0}}
            });
            const deleteParentCompanies = []
            if(findParentCompanies.length > 0) {
                findParentCompanies.map(c => deleteParentCompanies.push(c.representative_id));
                Representative.destroy({
                    where: {[connection.Op.or]: [{representative_id: deleteParentCompanies},{parent_id: deleteParentCompanies}]},
                })
                .then( u => {
                    console.log("DELETE COMPANIES: " + u);
                    res.status(200).send("Companies deleted.");
                })
                .catch(err => {
                    console.log(err);
                    res.status(500).send("Unable to delete companies");
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

/**
 * Delete Child Companies
 */
     
route.delete("/subcompanies/:ids", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        let IDs = req.params.ids;
        if(IDs.length > 0) {
            IDs = IDs.toString().split(',');
            const Representative = req.connection_db.define('Representatives', Representatives.mainStructure, Representatives.options);
            const findParentCompanies = await Representative.findAll({
                attributes:['representative_id'],
                where:{representative_id: IDs, parent_id:{[connection.Op.gt]: 0}}
            });
            const deleteParentCompanies = []
            if(findParentCompanies.length > 0) {
                findParentCompanies.map(c => deleteParentCompanies.push(c.representative_id));
                Representative.destroy({
                    where: {representative_id: deleteParentCompanies},
                })
                .then( u => {
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

module.exports = route;