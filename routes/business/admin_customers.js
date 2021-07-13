const express = require("express"),

    bcrypt = require('bcrypt'),

    fs = require('fs'),

    http = require('http'),

    https = require('https'),

    Stream = require('stream').Transform;

const { v4: uuidv4  } = require('uuid');

const exec = require("child_process").exec;

const route = express.Router();

const connection = require("../../config/db.config");

//require the Model

const Organisations = require("../../model/business/Organisations"),

    Users = require("../../model/business/Users"),

    Documentids = require("../../model/application/DocumentIds"),

    Assignees = require("../../model/resources/Assignees"),

    Assignors = require("../../model/resources/Assignors"),

    AdminAccountProcess = require("../../model/resources/AdminAccountProcess"),

    MissingInventorProcess = require("../../model/resources/MissingInventorProcess"),

    authJWT = require("../../helpers/verifyJwtToken"),

    userExist = require("../../helpers/verifySignUp"),

    helpers = require("../../helpers/helper"),

    clientDBConnection = require("../../helpers/clientDBConnection"),

    ClientUsers = require("../../model/client/Users"),

    ProfessionalUsers = require("../../model/client/Professionals"),

    Firms = require("../../model/client/Firms"),

    config = require("../../config/db.config"),

    AWS  = require('aws-sdk');

route.put("/customers/:organisation_id/buttons", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        const { organisation_id } = req.params;
        const { button_id, status } = req.body;

        let findButton = await AdminAccountProcess.findOne({
            where: { organisation_id, button_id}
        })

        if( findButton != null ) {
            findButton.status = status
            buttonData = await findButton.save()
        } else {
            findButton = await AdminAccountProcess.create({organisation_id, button_id, status: 1 })           
        }
        res.status(200).json(findButton);
    } catch(err) {
        console.log(err);
        res.status(400).send("Bad inputs");
    }
})

route.get("/customers/:organisation_id/buttons" , [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        const { organisation_id } = req.params;

        const findButtons = await AdminAccountProcess.findAll({
            where: { organisation_id}
        })
        
        res.status(200).json(findButtons);
    } catch(err) {
        console.log(err);
        res.status(400).send("Bad inputs");
    }
})

/**
 * List all customers
 */

route.get("/customers/run_query/:representative_name/:query_no", [authJWT.verifyToken, authJWT.isAdmin], (req, res, next) => {
    try{
        const { representative_name, query_no } = req.params
        console.log("ad", representative_name, query_no)
        let  procedureName = null
        switch(parseInt(query_no)) {
            case 1:
                procedureName = 'Table_A'
                break;
            case 2:
                procedureName = 'Table_B'
                break;
            case 3:
                procedureName = 'Table_C'
                break;
        }
        if(procedureName != null) {
            connection.resources.query(`CALL ${procedureName}(:representative_name);`,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    logging: console.log,
                    replacements: {representative_name},
                }
            ).spread(result => {
                let reports = []
                if (result) {
                    reports = Object.values(result)
                }
                res.status(200).json(reports);
            })
        } else {
            res.status(200).json([]);
        }        
    } catch( err ) {
        console.log("Error: ", err)
    }
})

/**
 * List all customers
 */

route.get("/customers", [authJWT.verifyToken, authJWT.isAdmin], (req, res, next) => {

    Organisations.findAll({
        attributes: [['organisation_id', 'id'], 'name','logo'],
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
 * List all admin users
 */
route.get("/users", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        
        const adminUsers = await Users.findAll({
            attributes: ['user_id', 'first_name', 'last_name', 'username'],
            where: {role_id: 1, type: '9', organisation_id: 3}
        })
        
        res.status(200).json(adminUsers);     
    } catch( err ) {
        console.log(err);
        res.status(400).send("Invalid inputs");
    }
});

/**
 * Add admin user
 */

route.post("/users", [authJWT.verifyToken, authJWT.isAdmin, userExist.checkDuplicateAdminUsername], async (req, res, next) =>{
    try{
        const addUser = await Users.create({
            first_name: req.body.first_name,
            last_name: req.body.last_name,
            email_address: '',
            username: req.body.username,						
            password: bcrypt.hashSync(req.body.password ? req.body.password : 123456, 8),
            job_title: '',
            linkedin_url: '',
            type: '9',
            logo: '',
            role_id: 1,
            organisation_id: 3
        })
        if(addUser != null) {   
            const newUser = addUser.toJSON();
            newUser.id = newUser.user_id;
            newUser.password = '';
            newUser.organisation_id = '';
            res.status(200).json(newUser);
        }  else {
            res.status(400).send("Bad inputs");
        } 
    } catch( err ) {
        console.log(err);
        res.status(400).send("Bad inputs");
    }
});

/**
 * Update admin user
 */

route.put("/users/:user_id", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) =>{
   
    try{
        
        
        const user = await Users.findOne({
            where: {user_id: req.params.user_id, organisation_id: 3, type: '9'}
        })

        if( user != null && user.user_id > 0){				
            if(req.body.password != undefined && req.body.password != null && req.body.password != ""){
                user.first_name = req.body.first_name;
                user.password = bcrypt.hashSync(req.body.password, 8);
                const update = await user.save();
                console.log(update)
                if(update) {
                    res.status(200).send("Updated successfully");
                } else {
                    res.status(500).send("Error while updating user.");
                }                
            } else {
                res.status(400).send("Invalid inputs");
            }
        } else {
            res.status(400).send("Invalid inputs");
        }
    } catch( err ) {
        console.log(err);
        
        res.status(400).send("Invalid inputs");
    }
})

/**
 * Delete admin user
 */

route.delete("/users/:user_id", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) =>{
    try{
        const user = await Users.findOne({
            where: {user_id: req.params.user_id, organisation_id: 3, type: '9'}
        })

        if( user != null && user.user_id > 0){
            
            const deleteUser = await user.destroy();

            if(deleteUser != null) {
                res.status(200).send("User deleted successfully.");
            } else {
                res.status(500).send("Error while deleting user.");
            }
        } else {
            res.status(500).send("Error while deleting user.");
        }
    } catch( err ) {
        console.log(err);
        res.status(400).send("Invalid inputs");
    }
})

/**
 * Get customer by ID
 */

route.get("/customers/:id", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    (async () => {
        try{
            let organisationID = req.params.id;
            if(organisationID > 0){

                const query = "SELECT BIN_TO_UUID(`uuid`) AS `standard`, `organisation_id`, `name`, `address`, `team`, `phone_number`, `email_address`, `logo`, `linkedin_url`, `zipcode`, `city`, `state`, `country_id`, `type`, `status` FROM db_business.`organisation` AS `organisation` WHERE `organisation`.`organisation_id` = :organisationID";   

                const org =  await connection.resources.query(query,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    replacements: { organisationID: organisationID },
                    raw: true,
                    plain: true,
                    logging: console.log,
                    }
                );               
                if(org != null && org.organisation_id > 0) {
                    res.status(200).json({name: org.name, organisation_id: org.organisation_id, logo: org.logo, standard: org.standard});
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
 * Get List from assignor and assignees
 * 
 */
route.get("/customers/customers/:id/:type", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID, clientDBConnection.connect], async (req, res, next) => {
    try{            
        /*const companyName = req.params.company_name, type = req.params.type;*/
        const organisationID = req.params.id, type = req.params.type;

        let list = [];

        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            list = await helpers.findCompanyEntitiesByAccountID(organisationID, type, req.connection_db);
        }
        res.status(200).json(list);
    } catch (e){
        console.log(e);
        res.status(402).send("No customers found");
    }
});

/**
 * Get List from assignor and assignees
 * 
 */
route.get("/customers/customers/:id/:representativeID/:type", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID, clientDBConnection.connect], async (req, res, next) => {
    try{            
        /*const companyName = req.params.company_name, type = req.params.type;*/
        const organisationID = req.params.id, type = req.params.type, representativeIDs = JSON.parse(req.params.representativeID);

        let list = [];

        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            list = await helpers.findCompanyEntitiesByAccountIDByRepresentativeIDs(organisationID, representativeIDs, type, req.connection_db);
        }
        res.status(200).json(list);
    } catch (e){
        console.log(e);
        res.status(402).send("No customers found");
    }
});
/**
 * Client Portfolios list
 */

route.get("/customers/:id/companies", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID, clientDBConnection.connect], async (req, res, next) => {
    try{
        let organisationID = req.params.id;
        if(organisationID > 0){
            const organisation  = await helpers.findOrganisationbyID(organisationID);
            if(organisation != null && organisation.organisation_id > 0){
                if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
                    /*const getCompaniesList = await helpers.getCompaniesWithChildren(req.connection_db);*/
                    const getCompaniesList = await helpers.getCompaniesList(req.connection_db);
                    res.status(200).json(getCompaniesList);
                } else {
                    res.status(200).json([]);
                }
            } else {
                res.status(200).json([]);
            }
        } else {
            res.status(400).send("Invalid inputs");
        }       
    } catch( err ) {
        console.log(err);
        res.status(400).send("Invalid inputs");
    } 
});

route.get("/customers/:id/users", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID, clientDBConnection.connect], (req, res, next) => {
    (async () => {
        try{
            let organisationID = req.params.id;
            if(organisationID > 0){
                const organisation  = await helpers.findOrganisationbyID(organisationID);
                if(organisation != null && organisation.organisation_id > 0){
                    /* const list = await helpers.getAllUsers(organisation.organisation_id);
                    res.status(200).json(list); */
                    if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
                        const dbUser = await req.connection_db.define('Users', ClientUsers.mainStructure, ClientUsers.options);
                        const list = await dbUser.findAll();
                        res.status(200).json(list);
                    }
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

route.post("/customers/:id/users", [authJWT.verifyToken, authJWT.isAdmin, userExist.checkDuplicateUsername, authJWT.addClientID, clientDBConnection.connect], function (req, res, next){
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
                        password: bcrypt.hashSync(req.body.password ? req.body.password : req.body.last_name, 8),
                        job_title: req.body.job_title,
                        linkedin_url: req.body.person_linkedin_url,
                        type: req.body.type,
                        logo: req.body.logo,
                        role_id: req.body.type == 0 ? 1 : 2,
                        organisation_id: organisationID
                    })
                    .then(function( user ){
                        if(user != null) {   
                            console.log(req.connection_db); 
                            if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
                                /** */
                                (async () => {
                                    const dbUser = await req.connection_db.define('Users', ClientUsers.mainStructure, ClientUsers.options);
                                    
                                    const clientUser = {
                                        user_id: user.user_id,
                                        first_name: req.body.first_name,
                                        last_name: req.body.last_name,
                                        email_address: req.body.email_address,
                                        username: req.body.email_address,		
                                        job_title: req.body.job_title,
                                        linkedin_url: req.body.person_linkedin_url,
                                        telephone1: req.body.telephone1,
                                        telephone: req.body.telephone,
                                        role_id: req.body.type == 0 ? 1 : 2,
                                        logo: req.body.logo
                                    }

                                    const addClientUser = await dbUser.create(clientUser);
                                    console.log("addClientUser", addClientUser);

                                    if(addClientUser != null) {
                                        const Firm = await req.connection_db.define('Firms', Firms.mainStructure, Firms.options);

                                        let firmID = 0;

                                        let findFirm = await Firm.findOne({
                                                        where: {firm_name: organisation.name}
                                                    });
                                        if(findFirm != null && findFirm.firm_id > 0) {
                                            firmID = findFirm.firm_id;
                                        } else {
                                            findFirm = await Firm.create({firm_name: organisation.name});
                                            if(findFirm != null && findFirm.firm_id > 0) {
                                                firmID = findFirm.firm_id;
                                            }
                                        } 
                                        if(firmID > 0) {
                                            const Professional = await req.connection_db.define('Professionals', ProfessionalUsers.mainStructure, ProfessionalUsers.options);  
                                            const addUserToProfessional = {
                                                first_name: req.body.first_name,
                                                last_name: req.body.last_name,
                                                email_address: req.body.email_address,
                                                job_title: req.body.job_title,
                                                linkedin_url: req.body.person_linkedin_url,
                                                telephone1: req.body.telephone1,
                                                telephone: req.body.telephone,
                                                type: 0,
                                                profile_logo: req.body.logo,
                                                firm_id: firmID
                                            }
                                            const professionalUser = await Professional.create(addUserToProfessional);
                                            if(professionalUser != null) {
                                                console.log("User"+professionalUser.professional_id);
                                                console.log("User created successfully");
                                            }
                                        }
                                    }
                                })();
                            }
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
                const t = await connection.business.transaction();		
                const organisation  = await helpers.findOrganisationbyID(organisationID);
                if(organisation != null && organisation.organisation_id > 0){
                    Users.findOne({
                        where: {user_id: req.params.user_id, organisation_id: organisationID}
                    })
                    .then( u => {
                        if( u != null && u.user_id > 0){						
                            
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
                                const update = await Users.update(user,{where: {user_id: req.params.user_id}, transaction: t});
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

let downloadImageFromUrl = async (org, res, url, filename, contentType, callback) => {
    console.log("Calling downloadImageFromUrl.....")
    var client = http;
    if (url.toString().indexOf("https") !== -1){
      client = https;
      console.log("sending HTTPS request");
    }
    
    client.request(url, async (response)=> {  
       
        console.log("response chunk", response)
       const data = new Stream();                                                    

        response.on('data', function(chunk) {  
            console.log("Logo", chunk)
            data.push(chunk);                                                         
        });                                                                         

        response.on('end', async () => {                
            const bucketConfig = config.bucketConfig;  
            
            filename = filename.replace(/\s+/g, '-');
           
            let s3 = new AWS.S3({
                credentials: {
                    accessKeyId: bucketConfig.accessKeyId,
                    secretAccessKey: bucketConfig.secretAccessKey,
                },
                region: bucketConfig.region
            })
           
            const params = {
                Key: `${bucketConfig.dirName}/${filename}`,
                Bucket: bucketConfig.bucketName,
                Body: data.read(),
                ACL: 'public-read',
                ContentType: contentType,
                ContentDisposition: 'inline'
            }
           console.log("params", params)
            s3.putObject(params, async function(err, data) {
                console.log(err, data);
                if(err == null) {
                    filename = `https://s3-${bucketConfig.region}.amazonaws.com/${bucketConfig.bucketName}/${bucketConfig.dirName}/${filename}`;
                    await org.update({
                        logo: filename
                    })
                    res.status(200).json({name: org.name, logo: org.logo});    
                } else {
                    res.status(200).json({name: org.name, logo: ''});    
                }
            });
        });                                                                         
    }).end();
};

route.put("/customers/:id/logo", [authJWT.verifyToken, authJWT.isAdmin], async (req, res)=>{
    (async () => {        
        try{
            let organisationID = req.params.id;
            if(organisationID > 0){
                let org = await helpers.findOrganisationbyID( organisationID );
                if(org != null && org.organisation_id > 0) {
                    console.log(organisationID);
                    console.log(req.files);
                    let logoURL = req.body.url_customer_logo;
                    if(logoURL != "" && logoURL != 'null' && logoURL != "undefined") {
                        /**Download file from URL */
                        console.log("DOWNLOAD URL");
                        let contentType = "", base64IndexOf = -1;
                        base64IndexOf = logoURL.toString().indexOf(';base64,');
                        if(base64IndexOf !== -1){
                            //Image content
                            console.log("Image content");
                            const bucketConfig = config.bucketConfig;  
                            let s3 = new AWS.S3({
                                credentials: {
                                    accessKeyId: bucketConfig.accessKeyId,
                                    secretAccessKey: bucketConfig.secretAccessKey,
                                },
                                region: bucketConfig.region
                            })
                            let name = `logo_${organisationID}`;
                            if(logoURL.indexOf('image/jpeg') >= 0){
                                name += ".jpeg";
                                contentType = "image/jpeg";
                            } else if(logoURL.indexOf('image/svg+xml') >= 0) {
                                name += ".svg";
                                contentType = "image/svg+xml";
                            } else if(logoURL.indexOf('image/bmp') >= 0){
                                name += ".bmp";
                                contentType = "image/bmp";
                            } else {
                                name += ".png";
                                contentType = "image/png";
                            }
                            logoURL = logoURL.substr(base64IndexOf + 8, logoURL.length -1);
                            logoURL  +=  logoURL.replace('+', ' ');
                            logoURL = Buffer.from(logoURL, 'base64');
                            const params = {
                                Key: `${bucketConfig.documentDir}/${name}`,
                                Bucket: bucketConfig.bucketName,
                                Body: logoURL,
                                ACL: 'public-read',
                                ContentType: contentType,
                                ContentDisposition: 'inline'
                            }

                            console.log(params)
                             s3.upload(params, async function(err, data) {
                                if(err == null) {
                                    org.logo = `${bucketConfig.s3Url}${data.key}`;
                                    await org.update({
                                        logo: org.logo
                                    });
                                    res.status(200).json({name: org.name, logo: org.logo});
                                } else {
                                    return res.status(500).send("ERROR: "+err);	
                                }
                            }) 
                        } else {
                            //Image file
                            console.log("Image file");
                            const extension = logoURL.toString().split('.').pop().toLowerCase();
                            
                            if(extension.indexOf('jpg') >= 0){
                                contentType = "image/jpeg";
                            } else if(extension.indexOf('svg') >= 0) {
                                contentType = "image/svg+xml";
                            } else if(extension.indexOf('bmp') >= 0){
                                contentType = "image/bmp";
                            } else {
                                contentType = "image/png";
                            }
                            console.log("contentType", contentType);
                            await downloadImageFromUrl(org, res, logoURL, org.name+'.'+extension, contentType);
                        }
                        
                    } else if(req.files != null && req.files.file != null && req.files.file != undefined) {
                        let mimeType = req.files.file.mimetype;
                        console.log(mimeType);
                        if(mimeType.toLowerCase().indexOf('.exe') < 0){
                            let fileObject = req.files.file;
                            const bucketConfig = config.bucketConfig;  
                            let s3 = new AWS.S3({
                                credentials: {
                                    accessKeyId: bucketConfig.accessKeyId,
                                    secretAccessKey: bucketConfig.secretAccessKey,
                                },
                                region: bucketConfig.region
                            })
                            let name = fileObject.name;
                                name = name.replace(/\s+/g, '-');
                            const params = {
                                Key: `${bucketConfig.documentDir}/${name}`,
                                Bucket: bucketConfig.bucketName,
                                Body: fileObject.data,
                                ACL: 'public-read'
                            }
                            
                            s3.upload(params, async function(err, data) {
                                if(err == null) {
                                    org.logo = `${bucketConfig.s3Url}${data.key}`;
                                    await org.update({
                                        logo: org.logo
                                    });
                                    res.status(200).json({name: org.name, logo: org.logo});
                                } else {
                                    return res.status(500).send("ERROR: "+err);	
                                }
                            })
                        } else {
                            return res.status(400).send("Invalid file format.");	
                        }
                    } else {
                        return res.status(400).send("Please select file first.");	
                    }
                } else {
                    return res.status(400).send("Invalid customer");	
                }
            } else {
                return res.status(400).send("Invalid customer");	
            }
        } catch(e) {
            console.log(e);
            return res.status(500).send("Error while uploading file.");	
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
 * Create Account in Business Database and create database for the customer
 */

route.post("/customers", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {   
    try{
        let companyName = req.body.company_name;
        if(companyName != undefined && companyName.length > 0) {
            /**
             * Check customer already exist!
             */
            let org = await Organisations.findOne({
                where: {name: companyName}
            })

            if(org == null) {
                /**
                 * Create account
                 */
                org =  await Organisations.create({
                    name: req.body.company_name,
                    country_id:1,
                })
            }
            if(org != null && org.organisation_id > 0){
                let organisationID = org.organisation_id;
               
                /**
                 * Run script for creating database
                 */
                const query = "UPDATE db_business.organisation SET uuid=UUID_TO_BIN(UUID()) WHERE organisation_id = :organisation_id"

                await connection.resources.query(query,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    replacements: { organisation_id: organisationID },
                    raw: true,
                    logging: console.log,
                });

                console.log(`php -f /var/www/html/trash/script_create_customer_db.php "${organisationID}"`);
                await exec(`php -f /var/www/html/trash/script_create_customer_db.php "${organisationID}"`, async (error, std, stderr) => {
                    console.log("script_create_customer_db");
                    console.log(error);
                    console.log(stderr);
                    console.log(std);
                    res.status(200).json(org);   
                });                                            
            } else {
                res.status(500).send("Internal server error");
            }
        }
    } catch (e) {
        console.log(e);
        res.status(402).send("Not able to create new customer ");
    }    
});

route.put("/customers" , [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
    try{
        const companyName = req.body.company_name, clientID = req.body.organisation_id;
        if(companyName != undefined && companyName.length > 0 && clientID > 0) {
            /**
             * Check customer exist!
             */
            const org = await Organisations.findOne({
                where: {organisation_id: clientID}
            })
            if(org != null) {
                await org.update({
                    name: req.body.company_name
                });
                res.status(200).json({name: org.name, logo: org.logo});   
            } else {
                res.status(403).send("Client not found");
            }
        } else {
            res.status(400).send("Name cannot be blank");
        }
    }catch(e){
        res.status(402).send("Not able to update client account ");
    }
})



route.get("/customers/:id/patents", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID, clientDBConnection.connect], async (req, res, next) => {
    try{
        let organisationID = req.params.id;
        let patentList = [];
        if(organisationID > 0){
            let org = await helpers.findOrganisationbyID( organisationID );
            if(org != null && org.organisation_id > 0) {
                const findRepresentative = await helpers.getCompaniesList(req.connection_db);
                if(findRepresentative != null && findRepresentative.length > 0) {
                    let representativeID = [];
                    findRepresentative.map(e => representativeID.push(e.representative_id));
                    

                    /*let queryFindAssignorAndAssigneeIDs = "SELECT aa.assignor_and_assignee_id, aa.name FROM assignor_and_assignee as aa LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id where (r1.representative_id=:representativeCompanies)";

                    let listIDs = await connection.application.query(queryFindAssignorAndAssigneeIDs,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: { representativeCompanies: representativeID },
                        raw: true,
                        logging: console.log,
                        }
                    );*/


                    /*let queryFindMainCompany = "SELECT aa.assignor_and_assignee_id, aa.name FROM assignor_and_assignee as aa LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id where (aa.name = :name OR r1.representative_name = :name )";

                    let listIDs = await connection.application.query(queryFindMainCompany,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: { name: org.name },
                        raw: true,
                        logging: console.log,
                        }
                    );*/

                    let queryFindMainCompany = "SELECT rf_id FROM representative_transactions WHERE organisation_id = :organisationID AND representative_id IN (:representativeID) ";

                    let listIDs = await connection.resources.query(queryFindMainCompany,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: { organisationID: organisationID, representativeID: representativeID },
                        raw: true,
                        logging: console.log,
                        }
                    );

                    if(listIDs != null && listIDs.length > 0) {
                        /*let assgnorAssigneeIDS = [], names = [];*/
                        let rawRfIDs = [];
                        listIDs.map(e => rawRfIDs.push(e.rf_id));
                        /*for(let i = 0; i< listIDs.length; i++){
                            assgnorAssigneeIDS.push(listIDs[i].assignor_and_assignee_id);
                            names.push(listIDs[i].name);
                        }*/
                        //console.log(assgnorAssigneeIDS);
                        /** Find Assignors */
            
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
                            let queryAllPatentList = 'SELECT grant_doc_num as number, appno_doc_num as application FROM documentid WHERE appno_doc_num IN (SELECT appno_doc_num FROM documentid WHERE appno_doc_num <> "" AND  rf_id IN (:rfIDs)) GROUP BY number, application';
            
                            patentList = await connection.application.query(queryAllPatentList,{
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
        res.status(200).json(patentList);
    } catch(e) {
        console.log(e);
        res.status(402).send("No patents");
    }
});

route.get("/customers/:id/:representativeID/patents", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID, clientDBConnection.connect], async (req, res, next) => {
    try{
        const organisationID = req.params.id, representativeIDs = JSON.parse(req.params.representativeID);
        let patentList = [];
        if(organisationID > 0){
            let org = await helpers.findOrganisationbyID( organisationID );
            if(org != null && org.organisation_id > 0) {
                if(representativeIDs.length > 0) {
                    let queryFindMainCompany = "SELECT rf_id FROM representative_transactions WHERE organisation_id = :organisationID AND representative_id IN (:representativeID) ";

                    let listIDs = await connection.resources.query(queryFindMainCompany,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: { organisationID: organisationID, representativeID: representativeIDs },
                        raw: true,
                        logging: console.log,
                        }
                    );

                    if(listIDs != null && listIDs.length > 0) {
                        /*let assgnorAssigneeIDS = [], names = [];*/
                        let rawRfIDs = [];
                        listIDs.map(e => rawRfIDs.push(e.rf_id));
                        /*for(let i = 0; i< listIDs.length; i++){
                            assgnorAssigneeIDS.push(listIDs[i].assignor_and_assignee_id);
                            names.push(listIDs[i].name);
                        }*/
                        //console.log(assgnorAssigneeIDS);
                        /** Find Assignors */
            
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
                            let queryAllPatentList = 'SELECT grant_doc_num as number, appno_doc_num as application FROM documentid WHERE appno_doc_num IN (SELECT appno_doc_num FROM documentid WHERE appno_doc_num <> "" AND  rf_id IN (:rfIDs)) GROUP BY number, application';
            
                            patentList = await connection.application.query(queryAllPatentList,{
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
        res.status(200).json(patentList);
    } catch(e) {
        console.log(e);
        res.status(402).send("No patents");
    }
});

route.get("/customers/:organisation_id/flag_automatic", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        let organisationID = req.params.organisation_id;
        if(organisationID > 0){
            let org = await helpers.findOrganisationbyID( organisationID );
            if(org != null && org.organisation_id > 0) {
                
                console.log(`php -f /var/www/html/trash/update_flag.php "${organisationID}"`);
                exec(`php -f /var/www/html/trash/update_flag.php "${organisationID}"`, (error, stdout, stderr) => {  
                    console.log(error, stdout, stderr);
                });
                res.status(200).send("Fixing flag in process");
            } else {
                res.status(402).send("Customer not exist.");
            }
        } else {
            res.status(402).send("Invalid parameters.");
        }
    }catch(e) {
        console.log(e);
        res.status(402).send("Error while updating flag");
    }
});

route.get("/customers/:organisation_id/:representative_id/missing_inventor", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        let organisationID = req.params.organisation_id;
        if(organisationID > 0){
            let org = await helpers.findOrganisationbyID( organisationID );
            if(org != null && org.organisation_id > 0) {
                const findProcess = await MissingInventorProcess.findOne({
                    where: {organisation_id: org.organisation_id, representative_id: req.params.representative_id, status: 0}
                })

                if( findProcess == null ) {
                    MissingInventorProcess
                    .create({organisation_id: org.organisation_id, representative_id: req.params.representative_id, status: 0})
                    .then( data => {
                        console.log(data);
                        console.log(`php -f /var/www/html/trash/find_missing_from_api_inventor_xml.php "${organisationID}" "${req.params.representative_id}"`);
                        exec(`php -f /var/www/html/trash/find_missing_from_api_inventor_xml.php "${organisationID}" "${req.params.representative_id}"`, (error, stdout, stderr) => {  
                            console.log(error, stdout, stderr);
                        });
                        res.status(200).send("Finding the number of assignment with missing inventor.");
                    })
                } else {
                    res.status(200).send("Already in process.");
                }
            } else {
                res.status(402).send("Customer not exist.");
            }
        } else {
            res.status(402).send("Invalid parameters.");
        }
    }catch(e) {
        console.log(e);
        res.status(402).send("Error while updating flag");
    }
})

route.get("/customers/:organisation_id/:representative_id/missing_inventor/stop", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        let organisationID = req.params.organisation_id;
        if(organisationID > 0){
            let org = await helpers.findOrganisationbyID( organisationID );
            if(org != null && org.organisation_id > 0) {
                const where = {organisation_id: org.organisation_id};
                const representativeID = req.params.representative_id;
                if(representativeID > 0) {
                    where['representative_id'] = representativeID;
                }
                const data = await MissingInventorProcess.findOne({where: where});

                if(data != null && data.process_id > 0) {
                   const updateData =  await MissingInventorProcess.update({status: 1}, {where: where});
                    if(updateData) {
                        res.status(200).send("Process stopped");
                    } else {
                        res.status(200).send("Error while stopping process.");
                    }
                } else {
                    res.status(200).send("Error while stopping process.");
                }
            } else {
                res.status(200).send("AccountID missing.");
            }
        } else {
            res.status(200).send("AccountID missing.");
        }
    }catch(e) {
        console.log(e);
        res.status(402).send("Error while stopping process");
    }
})

route.get("/customers/:organisation_id/:representative_id/find_inventor", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        let organisationID = req.params.organisation_id;
        if(organisationID > 0){
            let org = await helpers.findOrganisationbyID( organisationID );
            if(org != null && org.organisation_id > 0) {
                MissingInventorProcess
                .create({organisation_id: org.organisation_id, representative_id: req.params.representative_id})
                .then( data => {
                    console.log(data);
                    console.log(`php -f /var/www/html/trash/missing_inventor_from_api_2000_2004.php "${organisationID}" "${req.params.representative_id}"`);
                    exec(`php -f /var/www/html/trash/missing_inventor_from_api_2000_2004.php "${organisationID}" "${req.params.representative_id}"`, (error, stdout, stderr) => {  
                        console.log(error, stdout, stderr);
                    });
                    res.status(200).send("Finding the number of assignment with missing inventor from 2000-2004.");
                })
            } else {
                res.status(402).send("Customer not exist.");
            }
        } else {
            res.status(402).send("Invalid parameters.");
        }
    } catch(e) {
        console.log(e);
        res.status(402).send("Error while updating flag");
    }
})


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
                    let companyName = org.name;
                    /*console.log(`php -f /var/www/html/trash/tree_script.php "${companyName}"`);*/
                    /*console.log(`php -f /var/www/html/trash/tree_script.php "${organisationID}"`);
                    await exec(`php -f /var/www/html/trash/tree_script.php "${organisationID}"`, async (error, stdout, stderr) => {*/
                    console.log(`php -f /var/www/html/trash/tree_script_client.php "${organisationID}"  ""`);
                    await exec(`php -f /var/www/html/trash/tree_script_client.php "${organisationID}"  ""`, async (error, stdout, stderr) => {    
                        console.log("tree_script");
                        console.log(error);
                        console.log(stderr);
                        /*res.status(200).send(stdout);*/
                        if(stdout == "Tree created") {
                            console.log(`php -f /var/www/html/trash/fix_inventor_timeline_tree_transaction_assests_updates.php "${organisationID}" ""`);
                            await exec(`php -f /var/www/html/trash/fix_inventor_timeline_tree_transaction_assests_updates.php "${organisationID}" ""`, async (error, std, stderr) => {
                                console.log("FiX Inventor Data, Transaction, Timeline, Tree, Assets, Updates, Error....");
                                console.log(error);
                                console.log(stderr);
                                console.log(std);                                
                                res.status(200).send(stdout);
                            });
                            /*console.log(`php -f /var/www/html/trash/script_create_customer_db.php "${organisationID}"`);
                            await exec(`php -f /var/www/html/trash/script_create_customer_db.php "${organisationID}"`, async (error, std, stderr) => {
                                console.log("script_create_customer_db");
                                console.log(error);
                                console.log(stderr);
                                console.log(std);
                               
                            });*/
                            /*console.log(`php -f /var/www/html/trash/download_all_pdf.php "${companyName}"`);
                                exec(`php -f /var/www/html/trash/download_all_pdf.php "${companyName}"`, (error, stdd, stderr)=> {
                                    console.log("donwload_all_pdf....")
                                    console.log(error);
                                    console.log(stderr);
                                    console.log(stdd);
                                    console.log("DONE");
                                });*/
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

route.put("/customers/:id/flag_update_manually", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID, clientDBConnection.connect], async(req, res, next) => {
    let inventors = req.body.inventors, organisationID = req.params.id, flag = req.body.flag;

    if(inventors != undefined && inventors.length > 0) {
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            let update = await helpers.updateAllCustomerInventor(organisationID, inventors, flag, req.connection_db);
            res.status(200).json(update);
        } else {
            res.status(400).send("No companies found ");
        }
    } else {
        res.status(400).send("No list found! ");
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


route.get("/patents/:patentNumber",[authJWT.verifyToken, authJWT.isAdmin], async (req, res) =>{        
    let patentNumber = req.params.patentNumber;
    Documentids.findAll({
        where:{[connection.Op.or]:[{grant_doc_num: patentNumber},{appno_doc_num: patentNumber}]},
        attributes:['rf_id',['grant_doc_num','number'], ['appno_doc_num','application']],
    })
    .then(p => {
        console.log("CHECKING PATENT");
        console.log('%j',p);     
        if(p != null && p.length > 0){
            console.log(p); 
            helpers.generateJSON(req, res);
        } else {
            res.status(400).send("Invalid number");
        }       
    }).catch(err => {
        console.log(err);
        res.status(400).send("Invalid number");
    })
});

route.get("/patents/:patentNumber/comments",[authJWT.verifyToken, authJWT.isAdmin], async (req, res) =>{        
    res.status(200).json({});
});

route.get("/patents/:patentNumber/outsource",[authJWT.verifyToken, authJWT.isAdmin], async (req, res) =>{ 
    let patentNumber = req.params.patentNumber;       
    Documentids.findOne({
        where:{[connection.Op.or]:[{grant_doc_num: patentNumber},{appno_doc_num: patentNumber}]},
        attributes:['rf_id',['grant_doc_num','number'], ['appno_doc_num','application']],
    })
    .then(p => {
        if(p != null) {
            let type = "patNum";
            console.log('%j',p); 
            let data = p.toJSON();
            if(patentNumber == data.application){
                patentNumber = data.application;
                type = "applNum";
            }      
            res.status(200).json({url:`https://assignment.uspto.gov/patent/index.html#/patent/search/resultAbstract?id=${patentNumber}&type=${type}`});
        } else {
            res.status(200).send("");
        }        
    }).catch(err => {
        console.log(err);
        res.status(400).send("Invalid number");
    })
});

route.get("/patents/:patentNumber/assignments",[authJWT.verifyToken, authJWT.isAdmin], async (req, res) =>{ 
    let patentNumber = req.params.patentNumber; 
    Documentids.findOne({
        where:{[connection.Op.or]:[{grant_doc_num: patentNumber},{appno_doc_num: patentNumber}]},
        attributes:['rf_id',['grant_doc_num','number'], ['appno_doc_num','application']],
    })
    .then(p => {
        if(p != null) {
            let type = "patNum";
            console.log('%j',p); 
            let data = p.toJSON();
            if(patentNumber == data.application){
                patentNumber = data.application;
                type = "applNum";
            }      

            let queryAssignments = "SELECT a.rf_id, a.convey_text, ac.convey_ty, '' as file, r.representative_type FROM assignment as a INNER JOIN assignor as `or` ON `or`.rf_id = a.rf_id INNER JOIN assignment_conveyance as ac ON ac.rf_id = a.rf_id INNER JOIN documentid as d ON d.rf_id = a.rf_id LEFT JOIN representative_assignment_conveyance as r ON r.rf_id = a.rf_id WHERE ";

            if(type == "patNum") {
                queryAssignments += " d.grant_doc_num = :number";
            } else if(type == "applNum") {
                queryAssignments += " d.appno_doc_num = :number";
            }

            queryAssignments +=" ORDER BY a.exec_dt ASC";
            (async () => {
                let getAssignmentList = await connection.resources.query(queryAssignments,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    replacements: { number: patentNumber },
                    raw: true,
                    logging: console.log,
                    }
                );	
    
                if(getAssignmentList.length > 0) {
                    const path = '/var/wwww/html/PatenTrack/resources/shared/data/';
                    getAssignmentList.map( (a, index) => {
                        let fileName = `assignment-pat-${a.reel_no}-${a.frame_no}.pdf`;
                        if (fs.existsSync(path+fileName)) {
                            //file exists
                            getAssignmentList[index].file = `https://patentrack.com/resources/shared/data/${fileName}`;
                        }
                    });
                }
                res.status(200).json(getAssignmentList);
            }) ();
            
        } else {
            res.status(200).send("");
        }        
    }).catch(err => {
        console.log(err);
        res.status(400).send("Invalid number");
    })
});

module.exports = route;