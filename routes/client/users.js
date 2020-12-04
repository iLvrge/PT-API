const express = require("express");

const route = express.Router();

const bcrypt = require('bcrypt');

const connection = require("../../config/db.config");

//require the Model

const Users = require("../../model/client/Users");

const Activities = require("../../model/client/Activities");

const LoginUsers = require("../../model/business/Users");

const Organisation = require("../../model/business/Organisations");

const ProfessionalUsers = require("../../model/client/Professionals");

const Firms = require("../../model/client/Firms");

const authJWT = require("../../helpers/verifyJwtToken");

const AWS  = require('aws-sdk');
const clientDBConnection = require("../../helpers/clientDBConnection");


var emailRegex = /^[-!#$%&'*+\/0-9=?A-Z^_a-z{|}~](\.?[-!#$%&'*+\/0-9=?A-Z^_a-z`{|}~])*@[a-zA-Z0-9](-*\.?[a-zA-Z0-9])*\.[a-zA-Z](-?[a-zA-Z0-9])+$/;

function isEmailValid(email) {
    if (!email)
        return false;

    if(email.length>254)
        return false;

    var valid = emailRegex.test(email);
    if(!valid)
        return false;

    // Further checking of some things regex can't handle
    var parts = email.split("@");
    if(parts[0].length>64)
        return false;

    var domainParts = parts[1].split(".");
    if(domainParts.some(function(part) { return part.length>63; }))
        return false;

    return true;
}

/**Get User List */
route.get("/", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            
            const User = req.connection_db.define('Users', Users.mainStructure, Users.options);            
            User.findAll()
            .then((list)=>{
                res.status(200).json(list);
            }).catch((err)=>{
                console.log(err);
                res.status(500).json({message: "Unable to retrieve user list"})
            });
            //.finally(() => req.connection_db.close());
        }
    } catch (err) {

    }
});
/**Add User */
route.post("/", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {

            const User = req.connection_db.define('Users', Users.mainStructure, Users.options);  

            const userDetail = await User.findOne({
                                    where: {user_id: req.userId, role_id: 1},
                                    attributes: ['user_id'],
                                });
            if( userDetail != null && userDetail.user_id > 0 ) {
                let type = '1',roleID = 2;
                if(req.body.type == 0) {
                    type = '0';
                    roleID = 1;
                }

                if(req.body.role != undefined && req.body.role > 0) {
                    type = req.body.role == 1 ? '0' : '1';
                    roleID = req.body.role;
                }

                if(req.body.first_name == '' || req.body.first_name == undefined || req.body.first_name == null) {
                    res.status(402).send("Firstname cannot be empty."); 
                } else if(req.body.last_name == '' || req.body.last_name == undefined || req.body.last_name == null) {
                    res.status(402).send("Lastname cannot be empty."); 
                } else if(req.body.email_address == '' || req.body.email_address == undefined || req.body.email_address == null) {
                    res.status(402).send("Email address cannot be empty."); 
                } else if(req.body.email_address != '' && !isEmailValid(req.body.email_address)) {
                    res.status(402).send("Email address is not valid"); 
                } else {
                    const checkUser = await LoginUsers.findOne({
                        where: {username: req.body.email_address, email_address: req.body.email_address}
                    });
                    if(checkUser == null) {
                        const loginCredential = {
                            username: req.body.email_address,
                            email_address: req.body.email_address,
                            first_name: req.body.first_name,
                            last_name: req.body.last_name,
                            role_id: roleID,
                            type: type,
                            organisation_id: req.orgId,
                            password: bcrypt.hashSync(req.body.last_name, 8)
                        };
                        const addUser = await LoginUsers.create(loginCredential);

                        console.log(addUser);

                        if(addUser != null && addUser.user_id > 0) {
                            let logo = "";
                            const clientUser = {
                                user_id: addUser.user_id,
                                first_name: req.body.first_name,
                                last_name: req.body.last_name,
                                email_address: req.body.email_address,
                                username: req.body.email_address,		
                                job_title: req.body.job_title,
                                linkedin_url: req.body.person_linkedin_url,
                                telephone1: req.body.telephone1,
                                telephone: req.body.telephone,
                                role_id: roleID,
                                logo: logo
                            }

                            const addClientUser = await User.create(clientUser);

                            if(addClientUser != null  && addClientUser.user_id > 0) {
                                
                                if(req.files != null && req.files != undefined && req.files.file != undefined) {
                                    const mimeType = req.files.file.mimetype
                                
                                    if(mimeType != null && mimeType != '' && mimeType.toLowerCase().indexOf('.exe') < 0){
                                        let fileObject = req.files.file;
                                        const name = fileObject.name.replace(/\s+/g, '-');
                                        const bucketConfig = connection.bucketConfig;  
                                        let s3 = new AWS.S3({
                                            credentials: {
                                                accessKeyId: bucketConfig.accessKeyId,
                                                secretAccessKey: bucketConfig.secretAccessKey,
                                            },
                                            region: bucketConfig.region
                                        })

                                        const params = {
                                            Key: `${bucketConfig.dirName}/${name}`,
                                            Bucket: bucketConfig.bucketName,
                                            Body: fileObject.data,
                                            ACL: 'public-read',
                                            ContentType: contentType,
                                            ContentDisposition: 'inline'
                                        }
                                        s3.putObject(params, async function(err, data) {
                                            console.log(err, data)
                                            if(err == null) {
                                                const upload_file = `https://s3-${bucketConfig.region}.amazonaws.com/${bucketConfig.bucketName}/${bucketConfig.dirName}/${name}`
                                                await User.update({logo: upload_file}, {where: {user_id: addClientUser.user_id}})
                                                await LoginUsers.update({logo: upload_file}, {where: {user_id: addUser.user_id}})
                                                addClientUser.logo = upload_file;
                                            }
                                        });
                                    }
                                }

                                const Firm = req.connection_db.define('Firms', Firms.mainStructure, Firms.options);

                                const organisationName = await Organisation.findOne({
                                                                    where: {organisation_id: req.orgId}
                                                                });
                                console.log(organisationName);
                                if(organisationName != null && organisationName.organisation_id > 0) {
                                    let firmID = 0;

                                    let findFirm = await Firm.findOne({
                                                    where: {firm_name: organisationName.name}
                                                });
                                    if(findFirm != null && findFirm.firm_id > 0) {
                                        firmID = findFirm.firm_id;
                                    } else {
                                        findFirm = await Firm.create({firm_name: organisationName.name});
                                        if(findFirm != null && findFirm.firm_id > 0) {
                                            firmID = findFirm.firm_id;
                                        }
                                    }   
                                    
                                    if(firmID > 0) {
                                        const Professional = req.connection_db.define('Professionals', ProfessionalUsers.mainStructure, ProfessionalUsers.options);  
                                        const addUserToProfessional = {
                                            first_name: req.body.first_name,
                                            last_name: req.body.last_name,
                                            email_address: req.body.email_address,
                                            job_title: req.body.job_title,
                                            linkedin_url: req.body.person_linkedin_url,
                                            telephone1: req.body.telephone1,
                                            telephone: req.body.telephone,
                                            type: 0,
                                            profile_logo: logo,
                                            firm_id: firmID
                                        }
                                        const professionalUser = await Professional.create(addUserToProfessional);
                                        if(professionalUser != null) {
                                            addClientUser.password = '';
                                            console.log("User"+professionalUser.professional_id);
                                            console.log("User created successfully");
                                            res.status(200).json(addClientUser);
                                        }
                                    } else {
                                        console.log("Not able to create firm.");
                                        addClientUser.password = '';
                                        console.log("User"+professionalUser.professional_id);
                                        console.log("User created successfully");
                                        res.status(200).json(addClientUser);
                                    }
                                } else {
                                    console.log("Organisation not found.");
                                    addClientUser.password = '';
                                    console.log("User"+professionalUser.professional_id);
                                    console.log("User created successfully");
                                    res.status(200).json(addClientUser);
                                }
                            } else {
                                res.status(400).send("Bad inputs");
                            }
                        } else {
                            res.status(400).send("Bad inputs");
                        }
                    } else {
                        res.status(402).send("Email address is already exist.");  
                    }
                }
            } else {
                res.status(400).send("You are not authorized user to perform this action.");  
            } 
        } else {
            res.status(401).send("Error to connect user list.");  
        } 
    } catch (err) {
        console.log(err);
        return res.status(500).send('Internal server error');
    }
});
/**Update user */
route.put("/:user_id", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            let organisationID = req.orgId;
            if(organisationID > 0){
                const User = req.connection_db.define('Users', Users.mainStructure, Users.options);  

                const userDetail = await User.findOne({
                                    where: {user_id: req.userId, role_id: 1},
                                    attributes: ['user_id'],
                                });
                if( userDetail != null && userDetail.user_id > 0 ) {
                    const updateUserID = req.params.user_id;
                    const findUser = await User.findOne({
                                        where: {user_id: updateUserID}
                                    });
                    if(findUser != null && findUser.user_id > 0) {
                        if(req.body.password != undefined){
                            const newPassword = bcrypt.hashSync(req.body.password, 8);
                            if(newPassword.length > 0) {
                                await LoginUsers.update({password:newPassword},{where:{user_id: findUser.user_id}});
                            }
                        } 
                        if(req.body.status != undefined && (req.body.status == 0 || req.body.status == 1)){
                            const loginStatusUpdate = await LoginUsers.update({status:req.body.status},{where:{user_id: findUser.user_id}});
                        } 
                        let user = findUser.toJSON();
                        user.first_name = req.body.first_name;
                        user.last_name = req.body.last_name;
                        user.email_address = req.body.email_address;
                        user.linkedin_url = req.body.linkedin_url;
                        user.telephone = req.body.telephone;
                        user.telephone1 = req.body.telephone1;
                        console.log(req.body);
                        if(req.body.status != undefined && (req.body.status == 0 || req.body.status == 1)){
                            user.status = req.body.status;
                        }
                        let updateUserType = null;
                        if(req.body.type != undefined ) {
                            if(req.body.type == 'Admin') {
                                updateUserType = {type: '0'};
                                user.role_id = 1;
                            } else if(req.body.type == 'Manager'){
                                updateUserType = {type: '1'};
                                user.role_id = 2;
                            }
                        }

                        if(req.body.role != undefined && req.body.role > 0) {
                            updateUserType = {type : req.body.role == 1 ? '0' : '1'};
                            user.role_id = req.body.role;
                        }
                        
                        const u = await User.update(user,{where: {user_id: findUser.user_id}});
                        if(u) {
                            if(updateUserType != null) {
                                await LoginUsers.update(updateUserType,{where:{user_id: findUser.user_id}});
                                res.status(200).send("Updated successfully");
                            } else {
                                res.status(200).send("Updated successfully");
                            }                                
                        } else {
                            res.status(400).send("Invalid inputs4");
                        }
                    } else {
                        res.status(400).send("Invalid inputs3");
                    }
                } else {
                    res.status(400).send("You are not authorized user to perform this action.");  
                } 
            } else {
                res.status(400).send("Invalid inputs2");
            }
        } else {
            res.status(401).send("Error to connect user list.");  
        } 
    } catch( err ) {
        console.log(err);
        res.status(400).send("Invalid inputs1");
    }
});
/**Delete user */
route.delete("/:user_id", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const User = req.connection_db.define('Users', Users.mainStructure, Users.options);  
            const Activity = req.connection_db.define('Activities', Activities.mainStructure, Activities.options);  
            
                const userDetail = await User.findOne({
                                    where: {user_id: req.userId, role_id: 1},
                                    attributes: ['user_id'],
                                });
                if( userDetail != null && userDetail.user_id > 0 ) {
                    const updateUserID = req.params.user_id;
                    if(userDetail.user_id != updateUserID) {
                        const findUser = await User.findOne({
                            where: {user_id: updateUserID}
                        });
                        if(findUser != null && findUser.user_id > 0) { 

                            const checkActivities = await Activity.count({
                                where: {user_id: updateUserID}
                            })

                            if(checkActivities == 0) {
                                /** Add transaction so that it will roll back incase if any error comes */
                                User.destroy({
                                    where: {user_id: findUser.user_id},
                                })
                                .then(u => {
                                    if(u) {
                                        (async () => {
                                            await LoginUsers.destroy({where: {user_id: findUser.user_id}});
                                            res.status(200).send("User deleted.");
                                        })();
                                        
                                        /*
                                        if(loggedUser) {
                                            //const Professional = req.connection_db.define('Professionals', ProfessionalUsers.mainStructure, ProfessionalUsers.options); 
                                            
                                        } else {
                                            res.status(401).send("Not found");
                                        } 
                                        */
                                    }
                                })
                                .catch(err => {
                                    console.log(err);
                                    res.status(401).send("Not found");
                                })  
                            } else {
                                const updateUser =  await LoginUsers.update({status: 1},{where: {user_id: findUser.user_id}});
                                if(updateUser){
                                    await User.update({status: 1},{where: {user_id: findUser.user_id}});

                                    res.status(200).send("User blocked successfully");
                                }
                            }                      
                        } else {
                            res.status(400).send("Invalid inputs");
                        }
                    } else {
                        res.status(400).send("You cannot delete your own account");  
                    } 
                } else {
                    res.status(400).send("You are not authorized user to perform this action.");  
                } 
        } else {
            res.status(401).send("Error to connect user list.");  
        } 
    } catch( err ) {
        console.log(err);
        res.status(400).send("Invalid inputs");
    }
});

module.exports = route;