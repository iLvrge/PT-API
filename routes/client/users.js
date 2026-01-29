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

const SlackHelper = require('../../helpers/slack')

const AWS = require('aws-sdk');
const clientDBConnection = require("../../helpers/clientDBConnection");

const { uploadFile } = require("../../helpers/uploadHelper");


var emailRegex = /^[-!#$%&'*+\/0-9=?A-Z^_a-z{|}~](\.?[-!#$%&'*+\/0-9=?A-Z^_a-z`{|}~])*@[a-zA-Z0-9](-*\.?[a-zA-Z0-9])*\.[a-zA-Z](-?[a-zA-Z0-9])+$/;

function isEmailValid(email) {
    if (!email)
        return false;

    if (email.length > 254)
        return false;

    var valid = emailRegex.test(email);
    if (!valid)
        return false;

    // Further checking of some things regex can't handle
    var parts = email.split("@");
    if (parts[0].length > 64)
        return false;

    var domainParts = parts[1].split(".");
    if (domainParts.some(function (part) { return part.length > 63; }))
        return false;

    return true;
}

/**Get User List */
route.get("/", [authJWT.verifyToken, clientDBConnection.connect], async (req, res, next) => {
    try {
        if (typeof req.connection_db != "undefined" && req.connection_db != null) {

            const User = req.connection_db.define('Users', Users.mainStructure, Users.options);
            const list = await User.findAll({
                attributes: ['user_id', 'first_name', 'last_name', 'job_title', 'email_address', 'logo', 'telephone', 'telephone1', 'role_id', [connection.Sequelize.literal(0, 'username'), 'slack']]
            })
            return res.status(200).json(list);
        } else {
            return res.status(400).json({ message: "Invalid database connection" });
        }
    } catch (err) {
        return res.status(500).json({ message: "Unable to retrieve user list" });
    }
});
/**Add User */
route.post("/", [authJWT.verifyToken, clientDBConnection.connect], async (req, res, next) => {
    try {
        if (typeof req.connection_db != "undefined" && req.connection_db != null) {

            const User = req.connection_db.define('Users', Users.mainStructure, Users.options);

            const userDetail = await User.findOne({
                where: { user_id: req.userId, role_id: 1 },
                attributes: ['user_id'],
            });
            if (userDetail != null && userDetail.user_id > 0) {
                let type = '1', roleID = 2;
                if (req.body.type == 0) {
                    type = '0';
                    roleID = 1;
                }

                if (req.body.role != undefined && req.body.role > 0) {
                    type = req.body.role == 1 ? '0' : '1';
                    roleID = req.body.role;
                }

                if (req.body.first_name == '' || req.body.first_name == undefined || req.body.first_name == null) {
                    res.status(402).send("Firstname cannot be empty.");
                } else if (req.body.last_name.trim() == '' || req.body.last_name == undefined || req.body.last_name == null) {
                    res.status(402).send("Lastname cannot be empty.");
                } else if (req.body.email_address == '' || req.body.email_address == undefined || req.body.email_address == null) {
                    res.status(402).send("Email address cannot be empty.");
                } else if (req.body.email_address != '' && !isEmailValid(req.body.email_address)) {
                    res.status(402).send("Email address is not valid");
                } else {
                    const checkUser = await LoginUsers.findOne({
                        where: { username: req.body.email_address, email_address: req.body.email_address }
                    });
                    if (checkUser == null) {
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

                        if (addUser != null && addUser.user_id > 0) {
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

                            if (addClientUser != null && addClientUser.user_id > 0) {

                                /**
                                 * Add user to slack
                                 */
                                /**
                                     * Invite user to client workspace
                                    */
                                /* const organisation  = await helpers.findOrganisationbyID(req.orgId);
                                if(organisation != null && organisation.organisation_id > 0){
                                    
                
                                   const slack = await new SlackHelper()

                                    slack.adminConversationSearch({
                                       team_ids: organisation.team
                                    }, function(response) {
                                        if(response.length > 0) {
                                            const params = {
                                               channel_ids: response[0].id,
                                               team_id: organisation.team,
                                               email: req.body.email_address,
                                               resend: true,
                                               custom_message: 'You are invited to Join workspace '
                                            }
                                            console.log(params)
                                            slack.addInvite(params, function(response){
                                               console.log('user invited', response)                                                
                                                if(response.ok == true) {
                                                    slack.updateMembersToUserGroup(0, organisation.team, process.env.USERGROUP_NAME)
                                                }
                                           })
                                        } 
                                   })
                                } */

                                let upload_file = ''
                                if (req.files != null && req.files != undefined && req.files.file != undefined) {
                                    const mimeType = req.files.file.mimetype
                                    if (mimeType != null && mimeType != '' && mimeType.toLowerCase().indexOf('.exe') < 0) {
                                        let fileObject = req.files.file;
                                        const name = fileObject.name.replace(/\s+/g, '-');
                                        const bucketConfig = connection.bucketConfig;
                                        upload_file = `https://s3-${bucketConfig.region}.amazonaws.com/${bucketConfig.bucketName}/${bucketConfig.dirName}/${name}`
                                        /* let s3 = new AWS.S3({
                                            credentials: {
                                                accessKeyId: bucketConfig.accessKeyId,
                                                secretAccessKey: bucketConfig.secretAccessKey,
                                            },
                                            region: bucketConfig.region
                                        }) */
                                        const extension = name.toString().split('.').pop().toLowerCase();
                                        let contentType = "";
                                        if (extension.indexOf('jpg') >= 0) {
                                            contentType = "image/jpeg";
                                        } else if (extension.indexOf('svg') >= 0) {
                                            contentType = "image/svg+xml";
                                        } else if (extension.indexOf('bmp') >= 0) {
                                            contentType = "image/bmp";
                                        } else {
                                            contentType = "image/png";
                                        }
                                        const params = {
                                            Key: `${bucketConfig.dirName}/${name}`,
                                            Bucket: bucketConfig.bucketName,
                                            Body: fileObject.data,
                                            ACL: 'public-read',
                                            ContentType: contentType,
                                            ContentDisposition: 'inline'
                                        }
                                        uploadFile(fileObject.data, bucketConfig, bucketConfig.dirName, name, contentType)
                                            .then(async (data) => {
                                                upload_file = data.Location;
                                                await User.update({ logo: upload_file }, { where: { user_id: addClientUser.user_id } })
                                                await LoginUsers.update({ logo: upload_file }, { where: { user_id: addUser.user_id } })
                                                addClientUser.logo = upload_file;
                                            })
                                            .catch(err => {
                                                console.log(err);
                                            });
                                    }
                                }
                                addClientUser.logo = upload_file;
                                const Firm = req.connection_db.define('Firms', Firms.mainStructure, Firms.options);

                                const organisationName = await Organisation.findOne({
                                    where: { organisation_id: req.orgId }
                                });
                                console.log(organisationName);
                                if (organisationName != null && organisationName.organisation_id > 0) {
                                    let firmID = 0;

                                    let findFirm = await Firm.findOne({
                                        where: { firm_name: organisationName.name }
                                    });
                                    if (findFirm != null && findFirm.firm_id > 0) {
                                        firmID = findFirm.firm_id;
                                    } else {
                                        findFirm = await Firm.create({ firm_name: organisationName.name });
                                        if (findFirm != null && findFirm.firm_id > 0) {
                                            firmID = findFirm.firm_id;
                                        }
                                    }

                                    if (firmID > 0) {
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
                                        if (professionalUser != null) {
                                            addClientUser.password = '';
                                            console.log("User" + professionalUser.professional_id);
                                            console.log("User created successfully");
                                            res.status(200).json(addClientUser);
                                        }
                                    } else {
                                        console.log("Not able to create firm.");
                                        addClientUser.password = '';
                                        console.log("User" + professionalUser.professional_id);
                                        console.log("User created successfully");
                                        res.status(200).json(addClientUser);
                                    }
                                } else {
                                    console.log("Organisation not found.");
                                    addClientUser.password = '';

                                    console.log("User" + professionalUser.professional_id);
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
            res.status(402).send("Error to connect user list.");
        }
    } catch (err) {
        console.log(err);
        return res.status(500).send('Internal server error');
    }
});
/**Update user */
route.put("/:user_id", [authJWT.verifyToken, clientDBConnection.connect], async (req, res, next) => {
    try {
        if (typeof req.connection_db != "undefined" && req.connection_db != null) {
            let organisationID = req.orgId;
            if (organisationID > 0) {
                const User = req.connection_db.define('Users', Users.mainStructure, Users.options);

                const userDetail = await User.findOne({
                    where: { user_id: req.userId, role_id: 1 },
                    attributes: ['user_id'],
                });
                if (userDetail != null && userDetail.user_id > 0) {
                    const updateUserID = req.params.user_id;
                    const findUser = await User.findOne({
                        where: { user_id: updateUserID }
                    });
                    if (findUser != null && findUser.user_id > 0) {
                        if (req.body.password != undefined) {
                            const newPassword = bcrypt.hashSync(req.body.password, 8);
                            if (newPassword.length > 0) {
                                await LoginUsers.update({ password: newPassword }, { where: { user_id: findUser.user_id } });
                            }
                        }
                        if (req.body.status != undefined && (req.body.status == 0 || req.body.status == 1)) {
                            const loginStatusUpdate = await LoginUsers.update({ status: req.body.status }, { where: { user_id: findUser.user_id } });
                        }
                        let updateUserType = null;
                        let user = findUser.toJSON();
                        user.first_name = req.body.first_name;
                        user.last_name = req.body.last_name;
                        user.email_address = req.body.email_address;
                        user.linkedin_url = req.body.linkedin_url;
                        user.job_title = req.body.job_title;
                        user.telephone = req.body.telephone;
                        user.telephone1 = req.body.telephone1;
                        console.log(req.body);
                        if (req.body.status != undefined && (req.body.status == 0 || req.body.status == 1)) {
                            user.status = req.body.status;
                        }



                        if (req.body.type != undefined) {
                            if (req.body.type == 'Admin') {
                                updateUserType = { type: '0' };
                                user.role_id = 1;
                            } else if (req.body.type == 'Manager') {
                                updateUserType = { type: '1' };
                                user.role_id = 2;
                            }
                        }

                        if (req.body.role != undefined && req.body.role > 0) {
                            updateUserType = { type: req.body.role == 1 ? '0' : '1' };
                            user.role_id = req.body.role;
                        }

                        let upload_file = ''
                        if (req.files != null && req.files != undefined && req.files.file != undefined) {
                            const mimeType = req.files.file.mimetype
                            if (mimeType != null && mimeType != '' && mimeType.toLowerCase().indexOf('.exe') < 0) {
                                let fileObject = req.files.file;
                                const name = fileObject.name.replace(/\s+/g, '-');
                                const bucketConfig = connection.bucketConfig;
                                upload_file = `https://s3-${bucketConfig.region}.amazonaws.com/${bucketConfig.bucketName}/${bucketConfig.dirName}/${name}`
                                /* let s3 = new AWS.S3({
                                    credentials: {
                                        accessKeyId: bucketConfig.accessKeyId,
                                        secretAccessKey: bucketConfig.secretAccessKey,
                                    },
                                    region: bucketConfig.region
                                }) */
                                const extension = name.toString().split('.').pop().toLowerCase();
                                let contentType = "";
                                if (extension.indexOf('jpg') >= 0) {
                                    contentType = "image/jpeg";
                                } else if (extension.indexOf('svg') >= 0) {
                                    contentType = "image/svg+xml";
                                } else if (extension.indexOf('bmp') >= 0) {
                                    contentType = "image/bmp";
                                } else {
                                    contentType = "image/png";
                                }
                                const params = {
                                    Key: `${bucketConfig.dirName}/${name}`,
                                    Bucket: bucketConfig.bucketName,
                                    Body: fileObject.data,
                                    ACL: 'public-read',
                                    ContentType: contentType,
                                    ContentDisposition: 'inline'
                                }
                                uploadFile(fileObject.data, bucketConfig, bucketConfig.dirName, name, contentType)
                                    .then(async (data) => {
                                        upload_file = data.Location;
                                        await User.update({ logo: upload_file }, { where: { user_id: findUser.user_id } })
                                        await LoginUsers.update({ logo: upload_file }, { where: { user_id: findUser.user_id } })
                                    })
                                    .catch(err => {
                                        console.log(err);
                                    });
                            }
                        }



                        console.log(updateUserType)
                        console.log(user)
                        const u = await User.update(user, { where: { user_id: findUser.user_id } });
                        if (u) {
                            if (updateUserType != null) {
                                updateUserType.first_name = req.body.first_name;
                                updateUserType.last_name = req.body.last_name;
                                if (req.body.email_address != findUser.email_address) {
                                    updateUserType.email_address = req.body.email_address;
                                }
                                updateUserType.job_title = req.body.job_title;
                                await LoginUsers.update(updateUserType, { where: { user_id: findUser.user_id } });
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
            res.status(402).send("Error to connect user list.");
        }
    } catch (err) {
        console.log(err);
        res.status(400).send("Invalid inputs1");
    }
});
/**
 * Delete multiple users
 */
route.delete("/", [authJWT.verifyToken, clientDBConnection.connect], async (req, res, next) => {
    try {
        if (typeof req.connection_db != "undefined" && req.connection_db != null) {
            const User = req.connection_db.define('Users', Users.mainStructure, Users.options);
            const Activity = req.connection_db.define('Activities', Activities.mainStructure, Activities.options);

            // Get the list of user IDs from the query string
            const userList = req.query.list ? JSON.parse(req.query.list) : [];

            if (!Array.isArray(userList) || userList.length === 0 || userList.some(isNaN)) {
                return res.status(400).send("No valid user IDs provided.");
            }

            // Check if the requester is authorized (role_id == 1)
            const userDetail = await User.findOne({
                where: { user_id: req.userId, role_id: 1 },
                attributes: ['user_id', 'role_id'],
            });
            console.log(userList)
            if (userDetail != null && userDetail.user_id > 0) {
                // Filter out the current user's ID to prevent self-deletion
                const filteredUserList = userList.filter(userId => userId !== req.userId);

                if (!filteredUserList.length) {
                    return res.status(400).send("You cannot delete your own account or invalid users.");
                }
                console.log(filteredUserList)
                // Find the users to be deleted
                const findUsers = await User.findAll({
                    where: { user_id: filteredUserList }
                });

                if (findUsers && findUsers.length > 0) {
                    const userIDs = findUsers.map(user => user.user_id);
                    const usersBackup = findUsers.map(u => u.toJSON()); // Backup for rollback

                    try {
                        // Use separate transactions for client DB and business DB
                        // First delete from client database (Activities and Users)
                        await req.connection_db.transaction(async (clientTransaction) => {
                            // Delete associated activities first
                            await Activity.destroy({
                                where: { user_id: userIDs },
                                transaction: clientTransaction
                            });

                            // Delete the users from client database
                            await User.destroy({
                                where: { user_id: userIDs },
                                transaction: clientTransaction
                            });
                            // If any error occurs here, Sequelize automatically rolls back
                        });

                        // Then delete from business database (LoginUsers)
                        try {
                            await connection.business.transaction(async (businessTransaction) => {
                                await LoginUsers.destroy({
                                    where: { user_id: userIDs },
                                    transaction: businessTransaction
                                });
                                // If any error occurs here, Sequelize automatically rolls back
                            });
                        } catch (businessError) {
                            // Business DB deletion failed - attempt to restore client DB data
                            console.error("Business DB deletion failed, attempting rollback:", businessError);
                            try {
                                await req.connection_db.transaction(async (restoreTransaction) => {
                                    // Restore deleted users
                                    await User.bulkCreate(usersBackup, { transaction: restoreTransaction });
                                });
                            } catch (restoreError) {
                                console.error("CRITICAL: Failed to restore users after business DB error:", restoreError);
                            }
                            throw new Error("Failed to delete users from login database");
                        }

                        res.status(200).send("Users deleted successfully.");
                    } catch (error) {
                        console.error("Error during user deletion:", error);
                        throw error; // Re-throw to be caught by outer catch
                    }
                } else {
                    res.status(400).send("No valid users found to delete.");
                }
            } else {
                res.status(403).send("You are not authorized to perform this action.");
            }
        } else {
            res.status(500).send("Error connecting to the database.");
        }
    } catch (err) {
        console.error(err);
        res.status(500).send("An error occurred while deleting users.");
    }
});
/**Delete user */
route.delete("/:user_id", [authJWT.verifyToken, clientDBConnection.connect], async (req, res, next) => {
    try {
        if (typeof req.connection_db != "undefined" && req.connection_db != null) {
            const User = req.connection_db.define('Users', Users.mainStructure, Users.options);
            const Activity = req.connection_db.define('Activities', Activities.mainStructure, Activities.options);

            const userDetail = await User.findOne({
                where: { user_id: req.userId, role_id: 1 },
                attributes: ['user_id'],
            });

            if (userDetail != null && userDetail.user_id > 0) {
                const updateUserID = req.params.user_id;

                // Prevent self-deletion
                if (userDetail.user_id != updateUserID) {
                    const findUser = await User.findOne({
                        where: { user_id: updateUserID }
                    });

                    if (findUser != null && findUser.user_id > 0) {
                        const userBackup = findUser.toJSON(); // Backup for rollback

                        try {
                            // Use separate transactions for client DB and business DB
                            // First delete from client database (Activities and User)
                            await req.connection_db.transaction(async (clientTransaction) => {
                                // Delete associated activities first
                                await Activity.destroy({
                                    where: { user_id: updateUserID },
                                    transaction: clientTransaction
                                });

                                // Delete from client User table
                                await User.destroy({
                                    where: { user_id: findUser.user_id },
                                    transaction: clientTransaction
                                });
                                // If any error occurs here, Sequelize automatically rolls back
                            });

                            // Then delete from business database (LoginUsers)
                            try {
                                await connection.business.transaction(async (businessTransaction) => {
                                    await LoginUsers.destroy({
                                        where: { user_id: findUser.user_id },
                                        transaction: businessTransaction
                                    });
                                    // If any error occurs here, Sequelize automatically rolls back
                                });
                            } catch (businessError) {
                                // Business DB deletion failed - attempt to restore client DB data
                                console.error("Business DB deletion failed, attempting rollback:", businessError);
                                try {
                                    await req.connection_db.transaction(async (restoreTransaction) => {
                                        // Restore deleted user
                                        await User.create(userBackup, { transaction: restoreTransaction });
                                    });
                                } catch (restoreError) {
                                    console.error("CRITICAL: Failed to restore user after business DB error:", restoreError);
                                }
                                throw new Error("Failed to delete user from login database");
                            }

                            res.status(200).send("User deleted.");
                        } catch (error) {
                            console.error("Error during user deletion:", error);
                            throw error; // Re-throw to be caught by outer catch
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
            res.status(402).send("Error to connect user list.");
        }
    } catch (err) {
        console.log(err);
        res.status(500).send("An error occurred while deleting user.");
    }
});

route.post("/invite", [authJWT.verifyToken], async (req, res, next) => {
    try {
        const { email, representative_name } = req.body
        const organisation = await helpers.findOrganisationbyID(req.orgId);
        if (organisation != null && organisation.organisation_id > 0 && organisation.team !== '') {
            const slack = await new SlackHelper()
            await slack.refreshToken()

            slack.getAllTeams({}, async (list) => {
                if (list.length > 0) {
                    const findTeam = await slack.findWorkSpace(list, representative_name, organisation)
                    if (findTeam.length > 0) {
                        slack.adminConversationSearch({
                            team_ids: findTeam[0].id
                        }, function (response) {
                            if (response.length > 0) {
                                const params = {
                                    channel_ids: response[0].id,
                                    team_id: findTeam[0].id,
                                    email: email,
                                    resend: true,
                                    custom_message: 'You are invited to Join workspace '
                                }
                                console.log(params)
                                slack.addInvite(params, function (response) {
                                    console.log('user invited', response)
                                    if (response.ok == true) {
                                        res.status(200).send("Invitation sent");
                                    } else {
                                        res.status(200).send(response.data.error);
                                    }
                                })
                            }
                        })

                    } else {
                        res.status(402).send("No team found");
                    }
                } else {
                    res.status(402).send("No team found");
                }
            })
        } else {
            res.status(402).send("No team found");
        }
    } catch (err) {
        console.log(err);
        res.status(500).send("Unable to process request");
    }
});



module.exports = route;