const express = require("express");



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
                let childCompaniesQuery = "SELECT representative_id as id, original_name, representative_name, instances as counter, parent_id FROM representative as r WHERE r.parent_id IN (:parentCompany) ORDER BY r.parent_id ASC";

                let childCompanies = await req.connection_db.query(childCompaniesQuery,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: { parentCompany: getAllIDs.join(',') },
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
                /*for(let i = 0; i < companies.length; i++) {
                    const firstChild = [companies[i]];
                    console.log("firstChild");
                    console.log(firstChild);
                    let childCompanyQuery = "SELECT representative_id as id, original_name, representative_name, instances as counter FROM representative as r WHERE r.parent_id = :parentCompany";

                    let childCompanies = await req.connection_db.query(childCompanyQuery,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: { parentCompany: companies[i].id },
                        raw: true,
                        logging: console.log,
                        }
                    ); 
                    let allChild = [];
                    if(childCompanies.length) {
                        allChild = [...firstChild, ...childCompanies];
                    } else {
                        allChild = firstChild;
                    }
                    console.log("child");
                    console.log(allChild);
                    companies['children'] = allChild;
                }*/
                
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
    searchCompanies  = await helpers.searchCompany(search);
    res.status(200).json(searchCompanies);
});

route.post("/", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        const subsidaryName = req.body.name, parentCompany = req.body.parent_company;
        if(subsidaryName.length > 0) {
            let companyList = JSON.parse(subsidaryName);
            const querySubsidaryCompany = "SELECT aaa.assignor_and_assignee_id, aaa.name, r.representative_name, aaa.instances, r.representative_id FROM assignor_and_assignee as aaa LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE aaa.assignor_and_assignee_id IN (:IDs)";
                    
            const getList = await connection.resources.query(querySubsidaryCompany,{
                type: connection.Sequelize.QueryTypes.SELECT,
                replacements: { IDs: companyList.join(',') },
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
                    logging: console.log,
                    }
                ); 
                if(findName != null && findName.length > 0) {                    
                    const Representative = req.connection_db.define('Representatives', Representatives.mainStructure, Representatives.options);
                    let companies = [];
                    if(getList.length > 0) {                
                        getList.forEach( company => {
                            companies.push({
                                original_name: company.name , representative_name: company.representative_name, instances: company.instances, parent: findName[0].representative_id
                            });
                        });
                    }
                    if(companies.length > 0) {
                        const addCompanies = await Representative.bulkCreate(companies);
                        if(addCompanies) {
                            res.status(200).json(companies);
                        } else {
                            res.status(500).send("Internal server error");
                        }
                    } else {
                        res.status(402).send("Invalid inputs");
                    }                                        
                } else {
                    res.status(403).send("Parent company not exist");
                }
            } else {
                /**Add parent companies */
                let companies = [];
                const Representative = req.connection_db.define('Representatives', Representatives.mainStructure, Representatives.options);
                if(getList.length > 0) {                
                    getList.forEach( company => {
                        companies.push({
                            instances: company.instances, representative_id: company.representative_id, original_name: company.name, representative_name: representative_name
                        });
                    });
                }
                if(companies.length > 0) {
                    let originalNames = [], representativeNames = [];
                    companies.map( c => {
                        originalNames.push(c.original_name);
                        representativeNames.push(c.representative_name);
                    });
                    const findParentCompanies = await Representative.findAll({
                        where: {[connection.Op.or]:[{original_name: originalNames}, {representative_name: representativeNames}]}
                    });
                    if(findParentCompanies.length == 0) {
                        let addRecord = 0,  mainCompanies = [];                   
                        for(let i = 0; i < companies.length; i++) {

                            /** Add in Client Representative */
                            const addParent = await Representative.create({
                                original_name: companies[i].original_name, representative_name: companies[i].representative_name, instances: companies[i].instances
                            });
                            if(addParent != null && addParent.representative_id > 0){
                                mainCompanies.push(companies[i].representative_name);
                                addRecord++;
                                if(companies[i].representative_id > 0) {
                                    const findCompaniesQuery = "SELECT aaa.*, r.representative_name  FROM assignor_and_assignee as aaa LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE aaa.representative_id = :representativeID";

                                    const list  = await req.connection_db.query(findCompaniesQuery,{
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
                        if(addRecord > 0) {
                            if(mainCompanies.length > 0){
                                mainCompanies.map(async company => {
                                    console.log(`php -f /var/www/html/trash/tree_script.php "${company}"`);
                                    await exec(`php -f /var/www/html/trash/tree_script.php "${company}"`, async (error, stdout, stderr) => {
                                        console.log(error);
                                        console.log(stdout);
                                        console.log(stderr);
                                    })
                                });
                            }
                            res.status(200).send("Companies added");
                        } else {
                            res.status(500).json("Internal server error");
                        }
                    } else {
                        const addedCompanies = [],  mainCompanies = [];       
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
                                    mainCompanies.push(companies[i].representative_name);
                                    addRecord++;
                                    if(companies[i].representative_id > 0) {
                                        const findCompaniesQuery = "SELECT aaa.*, r.representative_name  FROM assignor_and_assignee as aaa LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE aaa.representative_id = :representativeID";
    
                                        const list  = await req.connection_db.query(findCompaniesQuery,{
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
                                mainCompanies.map(company => {
                                    console.log(`php -f /var/www/html/trash/tree_script.php "${company}"`);
                                    await exec(`php -f /var/www/html/trash/tree_script.php "${company}"`, async (error, stdout, stderr) => {
                                        console.log(error);
                                        console.log(stdout);
                                        console.log(stderr);
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
            res.status(401).send("Name cannot be blank");
        }
    } catch( err ) {
        console.log(err);
        res.status(500).json({message: "Error while adding company"})
    }
});


route.delete("/:ids", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        let IDs = req.params.ids;
        if(IDs.length > 0) {
            const Representative = req.connection_db.define('Representatives', Representatives.mainStructure, Representatives.options);
            const findParentCompanies = await Representative.findAll({
                attributes:['parent_id'],
                where:{representative_id: IDs, parent_id:{[req.connection_db.Op.gt]: 0}}
            });
            if(findParentCompanies.length > 0) {
                findParentCompanies.map(c => IDs.push(c.parent_id));
            }
            Representative.destroy({
                where: {representative_id: IDs},
            })
            .then( u => {
                res.status(200).send("Companies deleted.");
            })
            .catch(err => {
                console.log(err);
                res.status(500).send("Unable to delete professional");
            })
        }
    } catch( err ) {
        console.log(err);
        res.status(500).json({message: "Error while adding company"})
    }    
});
 		
module.exports = route;