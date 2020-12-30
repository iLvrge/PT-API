const express = require("express");

const route = express.Router();

const stringify = require('csv-stringify');

const {google} = require('googleapis');

//require the Model

const Documents = require("../../model/client/Documents");
const Users = require("../../model/client/Users");

const authJWT = require("../../helpers/verifyJwtToken");

const config = require("../../config/db.config");

const AWS  = require('aws-sdk');

const clientDBConnection = require("../../helpers/clientDBConnection");
/**Get all documents */

let authenticateGoogleToken = async( code ) => {
    let getTokens = {}

    try{
        const oauth2Client = new google.auth.OAuth2(
            '27050530278-uu7ns2gdg0ibstde3gh1o6h40618k38n.apps.googleusercontent.com',
            '9VuBSiz5LVedKXGRY37jtBrF',
            'http://localhost:3000'
        );
        const {tokens} = await oauth2Client.getToken(code)
        getTokens = tokens
    } catch(e) {
        console.log(e)
    }
    
    return getTokens
}

route.get("/auth_token", authJWT.verifyToken, async(req, res, next) => {
    const { code } = req.query
    try{
        if(code != '' && code != undefined) {
            const token = await authenticateGoogleToken( code )
            res.status(200).json(token);
        } else {
            res.status(401).send("Authentication code is missing");
        }
    } catch(e) {
        console.log(e)
        res.status(500).send("Unable to authenticate token");
    }
})

route.post("/create_maintainence_file", [authJWT.verifyToken], async(req, res, next) => {
    try{
        const oauth2Client = new google.auth.OAuth2(
            '27050530278-uu7ns2gdg0ibstde3gh1o6h40618k38n.apps.googleusercontent.com',
            '9VuBSiz5LVedKXGRY37jtBrF',
            'http://localhost:3000'
        );
        const { access_token, refresh_token, file_name, file_data } = req.body

        /**
         * If refresh token is undefined just pass access token only
         */
        if(refresh_token != undefined) {
            oauth2Client.setCredentials({ access_token, refresh_token})
        } else {
            oauth2Client.setCredentials({ access_token})
        }

        const drive = google.drive({version: 'v3', auth:oauth2Client});

        if(drive != null && drive != undefined) {
            if(file_data != '') {
                const fileData = JSON.parse( file_data )
                const columns = {
                    id: 'Patent #',
                    name: 'Application #',
                    attorney: 'Attorney Docket #',
                    fee_code: 'Fee Code',
                    fee_amount: 'Fee Amount'
                }
                stringify(fileData, { header: true, columns}, (err, output) => {
                    if(err) {
                        console.log("dasdsad", err);
                        res.status(400).send("Not able to create file")
                    } else {
                        console.log("output", output)
                        const fileMetadata = {
                            'name': file_name
                        };
                        const fileMedia = {
                            mimeType: 'text/csv',
                            body: output
                        };
                        drive.files.create({
                            resource: fileMetadata,
                            media: fileMedia,
                            fields: 'id, name, mimeType, webContentLink, webViewLink, iconLink, thumbnailLink, exportLinks '
                        }, function (error, response) {
                            if (error) {
                              // Handle error
                              console.error(error);
                              res.status(400).send(error)
                            } else {
                                res.status(200).json(response.data)
                            }
                        });
                    }                    
                })
            }
        }
    } catch( e ) {
        console.log(e)
        res.status(500).send("Unable to create maintainence file");
    }
})

route.get("/drive", authJWT.verifyToken, async(req, res, next) => {
    
    try{
        let list = []
        const oauth2Client = new google.auth.OAuth2(
            '27050530278-uu7ns2gdg0ibstde3gh1o6h40618k38n.apps.googleusercontent.com',
            '9VuBSiz5LVedKXGRY37jtBrF',
            'http://localhost:3000'
        );
        const { access_token, refresh_token } = req.query

        /**
         * If refresh token is undefined just pass access token only
         */
        if(refresh_token != undefined) {
            oauth2Client.setCredentials({ access_token, refresh_token})
        } else {
            oauth2Client.setCredentials({ access_token})
        }
               
        const drive = google.drive({version: 'v3', auth:oauth2Client});

        if(drive != null && drive != undefined) {
            drive.files.list({
                pageSize: 50,
                fields: 'nextPageToken, files(id, name, mimeType, webContentLink, webViewLink, iconLink, thumbnailLink, exportLinks)',
            }, (err, response) => {
                if (err) {
                    res.status(500).send(err);
                }
                if(response.data != undefined) {
                    list = response.data.files;
                    res.status(200).json(response.data);
                } else {
                    res.status(500).send("Unable to retrive drive files");
                }                
            });
        } else {
            res.status(500).send("Unable to retrive drive files");
        }
    } catch(e) {
        console.log("Drive error", e);
        res.status(500).send("Unable to retrive drive files");
    }
})



route.get("/", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const Document = req.connection_db.define('Documents', Documents.mainStructure, Documents.options);

            Document.findAll({
                attributes:[['title','name'],'document_id','file','description'],
                where: {status: 0},
                order: [
                    ['title', 'ASC'],
                ],
            })
            .then((list)=>{
                res.status(200).json(list);
            }).catch((err)=>{
                console.log(err);
                res.status(500).json({message: "Unable to retrieve documents"})
            });
            //.finally(() => req.connection_db.close());
        } else {
            res.status(401).send("Unable to retrieve documents");
        }
    } catch (err) {
        console.log(err);
        res.status(500).json({message: "Unable to retrieve documents"})
    }
});
/**Add new document */
route.post("/", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {

            const User = req.connection_db.define('Users', Users.mainStructure, Users.options);  

            const user = await User.findOne({
                where: {user_id: req.userId, role_id: 1},
                attributes: ['user_id'],
            });
            if(user != null && user.user_id > 0) {
                const Document = req.connection_db.define('Documents', Documents.mainStructure, Documents.options);

                console.log("FILESSSSSS");
					
                
                const fileLink = req.body.file_link;                
                if(fileLink != undefined && fileLink != '') {
                    const documentData = {
                        user_id: req.userId,
                        title: req.body.name,
                        file: fileLink,
                        description: req.body.description
                    }
                    const document = await Document.create(documentData);
                    if(document != null && document.document_id > 0){
                        console.log("Record Item added"+document.document_id);
                        res.status(200).json(document);
                    } else {
                        console.log("Unable to create new document")
                        res.status(500).json("Error while adding new document");
                    }
                } else {
                    if(req.files.file != null) {
                        let mimeType = req.files.file.mimetype;
                        console.log(mimeType);
                        if( mimeType.toLowerCase().indexOf('.exe') < 0){
                            let fileObject = req.files.file;
                            const name = fileObject.name.replace(/\s+/g, '-');
                            const bucketConfig = config.bucketConfig;  
                            let s3 = new AWS.S3({
                                credentials: {
                                    accessKeyId: bucketConfig.accessKeyId,
                                    secretAccessKey: bucketConfig.secretAccessKey,
                                },
                                region: bucketConfig.region
                            })

                            const params = {
                                Key: `${bucketConfig.documentDir}/${name}`,
                                Bucket: bucketConfig.bucketName,
                                Body: fileObject.data,
                                ACL: 'public-read',
                                ContentType: contentType,
                                ContentDisposition: 'inline'
                            }
                            s3.putObject(params, async function(err, data) {
                                if(err == null) {
                                    Document.create({	
                                        user_id: req.userId,
                                        title: req.body.name,
                                        description: req.body.description,
                                        file: `https://s3-${bucketConfig.region}.amazonaws.com/${bucketConfig.bucketName}/${bucketConfig.documentDir}/${name}`
                                    }).then(addRecord => {
                                        if(addRecord != null && addRecord.document_id > 0){
                                            console.log("Record Item added"+addRecord.document_id);
                                            res.status(200).json(addRecord);
                                        } else {
                                            console.log("Unable to create new document")
                                            res.status(500).json("Error while adding new document");
                                        }
                                    }).catch( err => {
                                        console.log(err);
                                        res.status(500).send("Internal server error");
                                    });
                                } else {    
                                    return res.status(500).send("ERROR: "+err);	
                                }
                            });
                        } else {
                            res.status(402).send("We are not supporting this file format.");
                        }
                    } else {
                        res.status(401).send("Please select a file.");
                    }                    
                }            
            } else {
                res.status(401).send("You are not authorized user to perform this action");
            }
        } else {
            console.log("Unable to connect to document table");
            res.status(401).send("Unable to connect to document table");
        }
    } catch (err) {
        console.log( err );
        res.status(401).send("Unable to connect to document table");
    }
});
/**Update document */
route.put("/:document_id", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const User = req.connection_db.define('Users', Users.mainStructure, Users.options);  

            const user = await User.findOne({
                where: {user_id: req.userId, role_id: 1},
                attributes: ['user_id'],
            });
            if(user != null && user.user_id > 0) {
                const Document = req.connection_db.define('Documents', Documents.mainStructure, Documents.options);

                const documentData = await Document.findOne({
                    where: {document_id: req.params.document_id}
                });

                if(documentData != null && documentData.document_id > 0) {
                    let doc = documentData.toJSON();
                    const fileLink = req.body.file_link; 
                    if(req.files != null && req.files.file != null && req.files.file != undefined) {
                        let mimeType = req.files.file.mimetype;
                        console.log(mimeType);
                        if(mimeType.toLowerCase().indexOf('.exe') < 0){
                            let fileObject = req.files.file;
                            const name = fileObject.name.replace(/\s+/g, '-');
                            const bucketConfig = config.bucketConfig;  
                            let s3 = new AWS.S3({
                                credentials: {
                                    accessKeyId: bucketConfig.accessKeyId,
                                    secretAccessKey: bucketConfig.secretAccessKey,
                                },
                                region: bucketConfig.region
                            })
                            const extension = name.toString().split('.').pop().toLowerCase();
                            let contentType = "";
                            if(extension.indexOf('jpg') >= 0){
                                contentType = "image/jpeg";
                            } else if(extension.indexOf('svg') >= 0) {
                                contentType = "image/svg+xml";
                            } else if(extension.indexOf('bmp') >= 0){
                                contentType = "image/bmp";
                            } else {
                                contentType = "image/png";
                            }
                            const params = {
                                Key: `${bucketConfig.documentDir}/${name}`,
                                Bucket: bucketConfig.bucketName,
                                Body: fileObject.data,
                                ACL: 'public-read',
                                ContentType: contentType,
                                ContentDisposition: 'inline'
                            }
                            s3.putObject(params, async function(err, data) {
                                if(err == null) {
                                   
                                    doc.file =  `https://s3-${bucketConfig.region}.amazonaws.com/${bucketConfig.bucketName}/${bucketConfig.documentDir}/${name}`
                                    (async () =>{
                                        await Document.update(doc,{where: {document_id: doc.document_id}});
                                        res.status(200).json(doc);
                                    })();
                                } else {
                                    return res.status(500).send("ERROR: "+err);	
                                }
                            })
                        } else {
                            res.status(402).send("We are not supporting this file format.");
                        }
                    } else if(fileLink != undefined && fileLink != '') {
                        doc.file = fileLink;
                        const updateDoc = await Document.update(doc,{where: {document_id: doc.document_id}});
                        if(updateDoc) {
                            res.status(200).json(doc);
                        } else {
                            console.log("Unable to update document.");
                            res.status(500).send("Unable to update document.");
                        }
                    } else {
                        doc.name = req.body.name;
                        doc.description = req.body.description;
                        await Document.update(doc,{where: {document_id: doc.document_id}});
                        res.status(200).json(doc);
                    }
                } else {
                    res.status(400).send("Not found");
                }
            } else {
                res.status(402).send("YOu are not authorised user to perform this action");
            }
        } else {
            console.log("Unable to connect to document table");
            res.status(401).send("Error to connect document list.");
        }
    } catch (err) {
        console.log( err );
        res.status(401).send("Error to connect document list.");
    }
});    
/**Delete document */
route.delete("/:document_id", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {

            const User = req.connection_db.define('Users', Users.mainStructure, Users.options);  

            const user = await User.findOne({
                where: {user_id: req.userId, role_id: 1},
                attributes: ['user_id'],
            });
            if(user != null && user.user_id > 0) {
                const Document = req.connection_db.define('Documents', Documents.mainStructure, Documents.options);

                const documentData = await Document.findOne({
                    where: {document_id: req.params.document_id}
                });

                if(documentData != null && documentData.document_id > 0) {
                    const deleteDocument = await Document.destroy({
                                            where: {document_id: req.params.document_id},
                                        })
                    if(deleteDocument) {
                        res.status(200).send("Document deleted successfully.");
                    } else {
                        res.status(500).send("Unable to delete document.");
                    }
                } else {
                    res.status(401).send("Not found");
                }
            } else {
                res.status(400).send("You are not authorized user to perform this action.");
            }            
        } else {
            console.log("Unable to connect to document table");
            res.status(401).send("Error to connect document table.");
        }
    } catch (err) {
        console.log( err );
        res.status(401).send("Error to connect document table.");
    }
});    		
module.exports = route;