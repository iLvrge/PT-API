const express = require("express");

const bcrypt = require('bcrypt');

const { v4: uuidv4  } = require('uuid');

const exec = require("child_process").exec;

const route = express.Router();

const connection = require("../../config/db.config");

//require the Model

const Organisations = require("../../model/business/Organisations");

const Users = require("../../model/business/Users");

const Assignees = require("../../model/resources/Assignees");

const Assignors = require("../../model/resources/Assignors");

const authJWT = require("../../helpers/verifyJwtToken");

const userExist = require("../../helpers/verifySignUp");

const helpers = require("../../helpers/helper");



/**
 * List all customers
 */

route.get("/customers", [authJWT.verifyToken, authJWT.isAdmin], (req, res, next) => {

    Organisations.findAll({
        attributes: [['organisation_id', 'id'], 'name'],
        where: {type:{[connection.Op.ne]: 2}}
    })
    .then((list)=>{
        res.status(200).json(list);
    }).catch((err)=>{
        console.log(err);
        res.status(500).json({message: "Unable to retrieve customer list"})
    });
});

/**
 * Get customer by ID
 */

route.get("/customers/:id", [authJWT.verifyToken, authJWT.isAdmin], (req, res, next) => {
    (async () => {
        try{
            let organisationID = req.params.id;
            if(organisationID > 0){
                let org = await helpers.findOrganisationbyID( organisationID );
                if(org != null && org.organisation_id > 0) {
                    res.status(200).json(org);
                } else {
                    res.status(402).send("Not found");
                }
            } else {
                res.status(402).send("Not found ");
            } 
        } catch (e) {
            console.log(e);
            res.status(402).send("Not found ");
        }         
    })();     
});

/**
 * Get Customer assignor and assignees
 */
route.get("/customers/customers/:company_name", [authJWT.verifyToken, authJWT.isAdmin], (req, res, next) => {
    (async () => {
        try{
            
            let companyName = req.params.company_name;
            let list = await helpers.findCompanyCustomersByName(companyName);
            res.status(200).json(list);
        } catch (e){
            console.log(e);
            res.status(402).send("No customers found");
        }
    })();
});

route.get("/customers/:id/users", [authJWT.verifyToken, authJWT.isAdmin], (req, res, next) => {
    (async () => {
        try{
            let organisationID = req.params.id;
            if(organisationID > 0){
                const organisation  = await helpers.findOrganisationbyID(organisationID);
                if(organisation != null && organisation.organisation_id > 0){
                    const list = await helpers.getAllUsers(organisation.organisation_id);
                    res.status(200).json(list);
                } else {
                    res.status(200).json([]);
                }
            } else {
                res.status(400).send("Invalid inputs2");
            }       
        } catch( err ) {
            console.log(err);
            res.status(400).send("Invalid inputs1");
        }
    })(); 
});

/**
 * Create new user in same organisation
 */

route.post("/customers/:id/users", [authJWT.verifyToken, authJWT.isAdmin, userExist.checkDuplicateUsername], function (req, res){
    (async () => {
        try{
            let organisationID = req.params.id;
            if(organisationID > 0){
                const organisation  = await helpers.findOrganisationbyID(organisationID);
                if(organisation != null && organisation.organisation_id > 0){
                    console.log(req.body);
                    Users.create({
                        first_name: req.body.first_name,
                        last_name: req.body.last_name,
                        email_address: req.body.email_address,
                        username: req.body.email_address,						
                        password: bcrypt.hashSync(req.body.last_name, 8),
                        job_title: req.body.job_title,
                        linkedin_url: req.body.person_linkedin_url,
                        type: req.body.type,
                        logo: req.body.logo,
                        role_id: req.body.type == 0 ? 1 : 2,
                        organisation_id: organisationID
                    })
                    .then(function( user ){
                        if(user != null) {                            
                            console.log("User"+user.user_id);
                            console.log("User created successfully");
                            const newUser = user.toJSON();
                            newUser.id = newUser.user_id;
                            res.status(200).json(newUser);
                        }  else {
                            res.status(400).send("Bad inputs");
                        }                  
                    })
                    .catch(function(err){
                        console.log(err);
                        res.status(400).send("Bad inputs");
                    })
                }
            }
        } catch( err ) {
            console.log(err);
            res.status(400).send("Invalid inputs");
        }
    })();
});
	
/**
 * UPdate Users list
 */

route.put("/customers/:id/users/:user_id", [authJWT.verifyToken, authJWT.isAdmin], async (req, res)=>{
    (async () => {
        
        try{
            let organisationID = req.params.id;
            if(organisationID > 0){
                const organisation  = await helpers.findOrganisationbyID(organisationID);
                if(organisation != null && organisation.organisation_id > 0){
                    User.findOne({
                        where: {user_id: req.params.user_id, organisation_id: organisationID}
                    })
                    .then( u => {
                        if( u != null && u.id > 0){						
                            const t = await connection.business.transaction();		
                            let user = {};
                            if(req.body.password != undefined && req.body.password != null && req.body.password != ""){
                                user.password = bcrypt.hashSync(req.body.password, 8);
                            } else {
                                user.first_name = req.body.first_name;
                                user.last_name = req.body.last_name;
                                user.email_address = req.body.email_address;
                                user.linkedin_url = req.body.linkedin_url;
                            }
                            console.log(user);
                            (async () => {									
                                const update = await User.update(user,{where: {user_id: req.params.user_id}, transaction: t});
                                if (t) await t.commit();
                                res.status(200).send("Updated successfully");
                            })();
                        } else {
                            res.status(400).send("Invalid inputs");
                        }
                    })
                } else {
                    res.status(400).send("Invalid inputs");
                }
            } else {
                res.status(400).send("Invalid inputs");
            }       
        } catch( err ) {
            console.log(err);
            if (t) await t.rollback();
            res.status(400).send("Invalid inputs");
        }
    })();    
});

/**
 * Get customer by ID
 */

route.get("/customers/:id/libraries", [authJWT.verifyToken, authJWT.isAdmin], (req, res, next) => {
    (async () => {
        try{
            let organisationID = req.params.id;
            if(organisationID > 0){
                let org = await helpers.findOrganisationbyID( organisationID );
                if(org != null && org.organisation_id > 0) {
                    /**
                     * Get list of all from resources database.
                     */
                    let companyName = org.name;
                    let companyData = await helpers.checkRepresentativeCompany(companyName);
                    let list = [];
                    if(companyData != null && companyData.representative_id > 0) {
/*                      list = await helpers.findCompanyCustomersByID(companyData.representative_id);*/
                        list = await helpers.findCompanyCustomersByName(companyName);
                    }
                    res.status(200).json(list);
                } else {
                    res.status(402).send("Not found ");
                }
            } else {
                res.status(402).send("Not found ");
            }
        } catch(e) {
            console.log(e);
            res.status(402).send("Not found ");
        }
    })();
});

route.get("/customers/:organisation_id/create_tree", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        let organisationID = req.params.organisation_id;
        if(organisationID > 0){
            let org = await helpers.findOrganisationbyID( organisationID );
            if(org != null && org.organisation_id > 0) {
                /**
                 * Get list of all from resources database.
                 */
                let companyName = org.name;
                /*let companyData = await helpers.checkRepresentativeCompany(companyName);
                if(companyData != null && companyData.representative_id > 0) {
                    console.log(`php -f /var/www/html/trash/tree_script.php "${companyName}"`);
                    await exec(`php -f /var/www/html/trash/tree_script.php "${companyName}"`, function (error, stdout, stderr) {
                        console.log(error);
                        console.log(stderr);
                        res.status(200).send(stdout);
                    });
                } else {
                    res.status(402).send("Bad Inputs");
                }*/
                console.log(`php -f /var/www/html/trash/tree_script.php "${companyName}"`);
                await exec(`php -f /var/www/html/trash/tree_script.php "${companyName}"`, function (error, stdout, stderr) {
                    console.log(error);
                    console.log(stderr);
                    res.status(200).send(stdout);
                });
            } else {
                res.status(402).send("Bad Inputs");
            }
        } else {
            res.status(402).send("Bad Inputs");
        }
        
    } catch(e) {
        console.log("ERROR:");
        console.log(e);
        res.status(402).send("Not found ");
    } 
});

/**
 * (async () => {
        try{
            let organisationID = req.params.id;
            if(organisationID > 0){
                let org = await helpers.findOrganisationbyID( organisationID );
                if(org != null && org.organisation_id > 0) {
                    
                    let companyName = org.name;

                    let companiesList = [];

                    if(companyName != undefined  && companyName.length > 0) {

                        let allList = [];

                        const employee = await helpers.getCompanyListByEmployee(companyName);
                        const ownership = await helpers.getCompanyListByOwnership(companyName);
                        const security = await helpers.getCompanyListBySecurity(companyName);
                        const other = await helpers.getCompanyListByOther(companyName);

                        allList = [...employee, ...ownership, ...security, ...other];

                        if(allList.length > 0) {
                            let nameList = [];
                            allList.map(company => {
                                let name = company.normalize_name;
                                if(name == null || name == '') {
                                    name = company.name;
                                }
                                if(!nameList.includes(name)) {
                                   nameList.push(name);
                                   companiesList.push({id: uuidv4(),name: name, type: company.type, company_name: company.name, normalize_name: company.normalize_name});
                                }
                            })
                        }
                    }
                    res.status(200).json(companiesList);
                } else {
                    res.status(402).send("Not found");
                }
            } else {
                res.status(402).send("Not found ");
            } 
        } catch (e) {
            console.log(e);
            res.status(402).send("Not found ");
        }         
    })();  
 */

/**
 * Create new Customer
 */

route.post("/customers", [authJWT.verifyToken, authJWT.isAdmin], (req, res, next) => {
    (async () => {
        try{
            let companyName = req.body.company_name;

            if(companyName != undefined && companyName.length > 0) {
                Organisations.create({
                    name: req.body.company_name,
                    country_id:1,
                }).then( org => {
                    if(org != null && org.organisation_id > 0){
                        res.status(200).json(org);
                    } else {
                        res.status(500).send("Internal server error");
                    }
                }).catch(err => {
                    console.log(err);
                    res.status(400).send("Bad inputs");
                });
            }
        } catch (e) {
            console.log(e);
            res.status(402).send("Not able to create new customer ");
        }         
    })();     
});

route.get("/customers/:id/patents", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
    try{
        let organisationID = req.params.id;
        let patentList = [];
        if(organisationID > 0){
            let org = await helpers.findOrganisationbyID( organisationID );
            if(org != null && org.organisation_id > 0) {
                const findRepresentative = await helpers.findRepresentative(org.name);
                if(findRepresentative != null) {
                    let representativeID = [];
                    representativeID.push(findRepresentative.representative_id);
                    const queryAllPatentList = "SELECT d1.grant_doc_num as number, d1.appno_doc_num as application FROM documentid as d1 WHERE d1.rf_id IN (Select d.rf_id from documentid as d LEFT JOIN (SELECT `or`.rf_id FROM assignor as `or` INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = `or`.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE r.representative_id IN (:representativeCompanies)) as temp ON temp.rf_id = d.rf_id LEFT JOIN (SELECT `ee`.rf_id FROM assignee as `ee` INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id WHERE r1.representative_id IN (:representativeCompanies)) as temp1 ON temp1.rf_id = d.rf_id GROUP BY d.rf_id)";
                    patentList = await connection.application.query(queryAllPatentList,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: { representativeCompanies: representativeID },
                        raw: true,
                        logging: console.log,
                        }
                    ); 
                }                
            }
        }
        res.status(200).json(patentList);
    } catch(e) {
        console.log(e);
        res.status(402).send("No patents");
    }
});

route.get("/customers/:organisation_id/publish", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        let organisationID = req.params.organisation_id;
        if(organisationID > 0){
            let org = await helpers.findOrganisationbyID( organisationID );
            if(org != null && org.organisation_id > 0) {
                /**
                 * Get list of all from resources database.
                 */
                const findUsers = await Users.count({
                    where:{organisation_id: org.organisation_id},
                    col: 'user_id'
                });
                if(findUsers > 0) {
                    console.log(`php -f /var/www/html/trash/tree_script.php "${companyName}"`);
                    await exec(`php -f /var/www/html/trash/tree_script.php "${companyName}"`, async (error, stdout, stderr) => {
                        console.log(error);
                        console.log(stderr);
                        /*res.status(200).send(stdout);*/
                        if(stdout == "Tree created") {
                            console.log(`php -f /var/www/html/trash/script_create_customer_db.php "${organisationID}"`);
                            await exec(`php -f /var/www/html/trash/script_create_customer_db.php "${organisationID}"`, function (error, stdout, stderr) {
                                console.log(error);
                                console.log(stderr);
                                res.status(200).send(stdout);
                            });
                        } else {
                            res.status(200).send("Error while creating database for the customer.");
                        }
                    });
                } else {
                    res.status(200).send("Please create a admin user first for this customer.");
                }

                
            } else {
                res.status(402).send("Bad Inputs");
            }
        } else {
            res.status(402).send("Bad Inputs");
        }
        
    } catch(e) {
        console.log("ERROR:");
        console.log(e);
        res.status(402).send("Not found ");
    } 
});

route.delete("/customers/:organisation_id", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        let organisationID = req.params.organisation_id;
        if(organisationID > 0){
            let org = await helpers.findOrganisationbyID( organisationID );
            if(org != null && org.organisation_id > 0) {
                if(org.org_usr != "" && org.org_pass != "" && org.org_host != "" && org.org_db != "") {
                    res.status(403).send("Cannot delete customer account.");
                } else {
                    let t = await connection.resources.transaction();

                    const deleteCompany = await Organisations.destroy({
                        where:{representative_id: organisationID}, transaction: t
                    });

                    if(deleteCompany != null) {
                        res.status(200).send("Customer deleted successfully.");
                    } else {
                        res.status(500).send("Error while deleting customer.");
                    }
                }
            } else {
                res.status(402).send("Bad Inputs");
            }
        } else {
            res.status(402).send("Bad Inputs");
        }
    } catch(e) {
        console.log("ERROR:");
        console.log(e);
        res.status(402).send("Not found ");
    } 
});

module.exports = route;