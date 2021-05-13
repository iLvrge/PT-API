const express = require("express");

const route = express.Router();

const stringify = require('csv-stringify');

const {google} = require('googleapis');

const { create } = require('xmlbuilder2');

//require the Model

const Documents = require("../../model/client/Documents");
const Users = require("../../model/client/Users");

const Layouts = require("../../model/application/Layouts");
const Templates = require("../../model/application/Templates");
const Repository = require("../../model/application/Repository");

const authJWT = require("../../helpers/verifyJwtToken");

const config = require("../../config/db.config");

const AWS  = require('aws-sdk');

const clientDBConnection = require("../../helpers/clientDBConnection");
/**Get all documents */

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_SECRET_KEY,
    process.env.REDIRECT_URL
);

let authenticateGoogleToken = async( code ) => {
    let getTokens = {}

    try{
        const {tokens} = await oauth2Client.getToken(code)
        getTokens = tokens
    } catch(e) {
        console.log(e)
    }
    
    return getTokens
}

const findLayoutData = async(layoutID, orgID, userAccount) => {
    const list = await Layouts.findOne({
        attributes: ['layout_id', 'layout_name'], 
        where: {layout_id: layoutID},                  
        include: [
            {
                model: Templates,
                as: 'templates',
                attributes: [ 'template_id', 'layout_id', 'container_name', 'container_id'],
                required: false,
                where: {
                    user_account: userAccount,
                    organisation_id: orgID
                }
            }
        ]
    })

    return list
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

route.get("/profile" , authJWT.verifyToken, async(req, res, next) => {
    const { access_token, refresh_token } = req.query
    try {
        /**
         * If refresh token is undefined just pass access token only
        */
        let userAccount = {}
        let credentials = {"scope": process.env.GOOGLE_SCOPE}
        if( access_token ) {
            
            if(refresh_token != undefined && refresh_token != 'undefined') {
                credentials.access_token = access_token
                credentials.refresh_token = refresh_token
            } else {
                credentials.access_token = access_token
            }           
            oauth2Client.setCredentials(credentials)
            const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client }) 
            const { data } = await oauth2.userinfo.v2.me.get({})
            if ( data && data != undefined ) {
                userAccount = data
            }
        }
        res.status(200).json(userAccount)
    } catch(e) {
        console.log("Google Profile error", e)
        res.status(200).send('Error while retreiving profile data')
    }
})

route.get("/layout", authJWT.verifyToken, async(req, res, next) => {
    const { access_token, refresh_token, user_account } = req.query
    let list = [], message = ''
    try{
        /**
         * If refresh token is undefined just pass access token only
        */
        let credentials = {"scope": process.env.GOOGLE_SCOPE}
        if( access_token && typeof user_account != 'undefined' ) {
            list = await Layouts.findAll({
                attributes: ['layout_id', 'layout_name'],                   
                include: [
                    {
                        model: Templates,
                        as: 'templates',
                        attributes: [ 'template_id', 'layout_id', 'container_name', 'container_id'],
                        required: false,
                        where: {
                            user_account: user_account,
                            organisation_id: req.orgId
                        }
                    }
                ]
            })          
        } else {
            message = 'Please first login with google account.'
        }   
        res.status(200).json({list, message})     
    } catch(e) {
        console.log(e)
        message = 'Token expired'
        res.status(200).json({list, message})
    }
})

route.get("/layout/:layout_id", authJWT.verifyToken, async(req, res, next) => {
    let list = [], message = ''
    try {
        const { layout_id } = req.params
        const { user_account } = req.query

        if(typeof layout_id != 'undefined' && typeof user_account != 'undefined') {
            list = await Templates.findAll({
                where: {organisation_id: req.orgId, layout_id: layout_id, user_account: user_account}
            })
        } else {
            if(typeof user_account == 'undefined') {
                message = 'Token expired'
            } else {
                message = 'Invalid inputs'
            }            
        }
        res.status(200).json({list, message})
    }catch(e) {
        console.log(e)
        message = 'No templates'
        res.status(200).json({list, message})
    }
})

route.post('/layout', [authJWT.verifyToken], async(req, res, next) => {
    try {
        let {container_id, container_name, layout_id, user_account} = req.body
        let list = null
        if(layout_id != '') {
            layout_id = JSON.parse(layout_id)
            const findLayout = await Layouts.findAll({
                where: { layout_id: layout_id }
            })

            if( findLayout.length > 0 ) {
                const addData = []
                const promises = layout_id.map( ID => {
                    addData.push({
                        layout_id: ID,
                        user_account: user_account,
                        organisation_id: req.orgId,
                        container_id: container_id,
                        container_name: container_name
                    })
                    return ID
                })

                await Promise.all(promises)
                const addRepo = await Templates.bulkCreate(addData, { ignoreDuplicates: true })

                if( addRepo ) {
                    list = await findLayoutData(layout_id, req.orgId, user_account)
                    res.status(200).json(list)
                } else {
                    res.status(500).send('Invalid input.')
                }
            } else {
                res.status(500).send('Layout not found.')
            }
        } else {
            res.status(500).send('Invalid input.')
        }            
    } catch(e) {
        console.log(e)
        res.status(500).send('Error while adding template to layout.')
    }
})

route.delete('/layout', [authJWT.verifyToken], async(req, res, next) => {
    try {
        let list = null
        let { layout_id, container_id, user_account } = req.query
        if(layout_id != 0 && container_id != '') {
            layout_id = JSON.parse(layout_id)
            if(layout_id.length > 0) {
                const findTemplate = await Templates.findOne({
                    where: { layout_id: layout_id, container_id: container_id, organisation_id: req.orgId, user_account: user_account }
                })
    
                if( findTemplate != null ) {
                    const deleteTemplate = await Templates.destroy({
                        where: { layout_id: layout_id, container_id: container_id, organisation_id: req.orgId,user_account: user_account, }
                    })
    
                    if( deleteTemplate ) {
                        list = await findLayoutData(layout_id, req.orgId, user_account) 
                    }
                }
            } 
        }
        res.status(200).json(list)
    } catch(e) {
        console.log(e)
        res.status(500).send('Error while deleting template from layout.')
    }
})

route.get("/repo_folder", [authJWT.verifyToken], async(req, res, next) => {
    try {
        const {  user_account } = req.query

        if(typeof user_account != 'undefined') {
            let getRepo = await Repository.findOne({
                where: { organisation_id: req.orgId, user_account: user_account}
            })        
            res.status(200).json(getRepo)
        } else {
            res.status(200).send(null)
        }
    } catch(e) {
        console.log(e)
        res.status(500).send('Invalid inputs.')
    }
})

route.put("/repo_folder", [authJWT.verifyToken], async(req, res, next) => {
    try {
        const { container_id, container_name, user_account, breadcrumb } = req.body

        let getRepo = await Repository.findOne({
            where: { organisation_id: req.orgId, user_account: user_account}
        })

        if(getRepo == null) {
            getRepo = await Repository.create({
                organisation_id: req.orgId,
                user_account: user_account,
                container_id: container_id,
                container_name: container_name,
                breadcrumb: breadcrumb
            })
        } else {
            getRepo.container_id = container_id
            getRepo.container_name = container_name
            getRepo.breadcrumb = breadcrumb
            await getRepo.save();
        }
        res.status(200).json(getRepo)
    } catch(e) {
        console.log(e)
        res.status(500).send('Error while adding repository folder.')
    }
})


route.post('/create_template_drive', [authJWT.verifyToken], async(req, res, next) => {
    try{
        const { access_token, refresh_token, user_account, id } = req.body
        if(typeof user_account != 'undefined') {
            let getRepo = await Repository.findOne({
                where: { organisation_id: req.orgId, user_account: user_account}
            })        

            if(getRepo != null) {
                if(refresh_token != undefined) {
                    oauth2Client.setCredentials({ access_token, refresh_token})
                } else {
                    oauth2Client.setCredentials({ access_token})
                }
        
                const drive = google.drive({version: 'v3', auth:oauth2Client});
        
                if(drive != null && drive != undefined) {
                    const findTemplate = await Templates.findOne({
                        where: { organisation_id: req.orgId, user_account: user_account, container_id: id}
                    })

                    if(findTemplate != null) {                        
                        const copyRequest = {  
                            name: findTemplate.container_name,
                            parents: [getRepo.container_id],
                          };
                    
                        const {data} = await drive.files.copy({  
                            fileId: findTemplate.container_id,
                            requestBody: copyRequest  
                          })

                        if( data != null ) {
                            res.status(200).json(data)
                        } else {
                            res.status(200).send('Error while copying drive file')
                        }
                    } else {
                        res.status(200).send("Invalid inputs")
                    }                    
                } else {
                    res.status(200).send("Token expired")
                }
            } else {
                res.status(200).send("Please add a repository folder")
            }            
        } else {
            console.log('user_account undefined')
            res.status(200).send("Token expired")
        }        
    } catch (e) {
        console.log(e)
        res.status(200).send("Token expired")
    }
});

route.post("/downloadXML", [authJWT.verifyToken], async(req, res, next) => {
    try{
        let { assets } = req.body

        if( assets && assets != '' ) {
            assets = JSON.parse(assets)

            if(assets.length > 0) {
                const root = create({ version: '1.0' })
                        .ele('pat-assignment-template')
                            .ele('correspondent')
                                .ele('correspondent-name-address')
                                    .ele('name').txt('UZI ALOUSH').up()
                                    .ele('address-1').txt('111 EMBARCADERO W').up()
                                    .ele('address-2').txt('INTERNAL ADDRESS').up()
                                    .ele('city').txt('OAKLAND').up()
                                    .ele('state').txt('CALIFORNIA').up()
                                    .ele('postal-code').txt('94607').up()
                                .up()
                            .ele('e-mail').txt('uzi@ilvrge.com').up()
                            .ele('fax').txt('(415)922-2282').up()
                            .ele('phone').txt('415-9025901').up()
                            .up();
                const assignees = [
                    {
                        name: 'THIS IS THE NAME OF THE CONVEYING PARTIES1',
                        address_1: 'STREET ADDRESS 123',
                        address_2: 'INTERNAL ADDRESS',
                        city: 'SAN FRANCISCO',
                        state: 'ALGERIA',
                        postal_code: '94132',
                        type: 'company'
                    },
                    {
                        first_name: 'JAMES',
                        last_name: 'DEAN',
                        address_1: 'STREET ADDRESS 123',
                        address_2: 'INTERNAL ADDRESS',
                        city: 'SAN FRANCISCO',
                        state: 'ALGERIA',
                        postal_code: '94132',
                        type: 'individual'
                    }
                ]  
                
                const assignors = [
                    {
                        name: 'THE NAME OF THE RECEIVING PARTIES',
                        exec_dt: '2019-02-28',
                        type: 'company'
                    },
                    {
                        prefix: 'MR',
                        first_name: 'JAMES',
                        middle_name: 'D',
                        last_name: 'DEAN',
                        suffix: 'JR',
                        exec_dt: '2019-02-28',
                        type: 'individual'
                    }
                ] 

                const patConveyingParties = root.ele('pat-conveying-parties')
                for( let i = 0; i < assignors.length; i++ ) {
                    if( assignors[i].type == 'individual' ) {
                        patConveyingParties
                            .ele('pat-conveying-party')
                                .ele('individual')
                                    .ele('prefix').txt(assignors[i].prefix).up()
                                    .ele('first-name').txt(assignors[i].first_name).up()
                                    .ele('middle-name').txt(assignors[i].last_name).up()
                                    .ele('last-name').txt(assignors[i].suffix).up()
                                .up()
                                .ele('executed-date').txt(assignors[i].exec_dt).up()
                            .up()
                    } else {
                        patConveyingParties
                        .ele('pat-conveying-party')
                            .ele('company')
                                .ele('orgname').txt(assignors[i].name).up()
                            .up()
                            .ele('executed-date').txt(assignors[i].exec_dt).up()
                        .up()
                    }
                }

                const patReceivingParties = root.ele('pat-receiving-parties')
                for( let i = 0; i < assignees.length; i++ ) {
                    const receivingParty = patReceivingParties
                                                .ele('pat-receiving-party')
                    if( assignees[i].type == 'individual' ) {
                        receivingParty
                            .ele('individual')
                                .ele('first-name').txt(assignees[i].first_name).up()
                                .ele('last-name').txt(assignees[i].suffix).up()
                            .up()
                    } else {
                        receivingParty
                            .ele('company')
                                .ele('orgname').txt(assignees[i].name).up()
                            .up()
                    }
                    receivingParty
                        .ele('address')
                            .ele('address-1').txt(assignees[i].address_1).up()
                            .ele('address-2').txt(assignees[i].address_2).up()
                            .ele('city').txt(assignees[i].city).up()
                            .ele('state').txt(assignees[i].state).up()
                            .ele('postal-code').txt(assignees[i].postal_code).up()
                        .up()

                }

                const patProperties = root.ele('pat-properties')
                for( let j = 0; j < assets.length; j++ ) {
                    patProperties
                        .ele('pat-property').att('patent', assets[j])
                            .ele('pat-application-number').txt(assets[j]).up()
                        .up()
                }
                
                const xml = root.end({ prettyPrint: true });
                res.status(200).send(xml)
            } else {
                res.status(200).send('Invalid inputs')
            }
        } else {
            res.status(200).send('Invalid inputs')
        }
    } catch (e) {
        console.log(e)
        res.status(200).send("")
    }
});

route.post("/create_maintainence_file", [authJWT.verifyToken], async(req, res, next) => {
    try{
        
        const { access_token, refresh_token, file_name, file_data, user_account } = req.body
        
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
                stringify(fileData, { header: true, columns}, async (err, output) => {
                    if(err) {
                        console.log("dasdsad", err);
                        res.status(400).send("Not able to create file")
                    } else {
                        let getRepo = await Repository.findOne({
                            where: { organisation_id: req.orgId, user_account: user_account}
                        }) 
                        if(getRepo != null) {
                            console.log("output", output)

                            const fileMetadata = {
                                'name': `${file_name}.csv`,
                                parents: [ getRepo.container_id ]
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
                        } else {
                            res.status(200).send("Please add a repository folder")
                        } 
                        
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
    let list = [], message = ''
    let { access_token, refresh_token, id, show_folders } = req.query
    try{        
       
        let credentials = {"scope": process.env.GOOGLE_SCOPE}
        if( access_token ) {
            /**
             * If refresh token is undefined just pass access token only
             */
            if(refresh_token != undefined && refresh_token != 'undefined') {
                credentials.access_token = access_token
                credentials.refresh_token = refresh_token
            } else {
                credentials.access_token = access_token
            }           
            oauth2Client.setCredentials(credentials)

            const drive = google.drive({version: 'v3', auth:oauth2Client});

            if(drive != null && drive != undefined) {
                
                const params = {
                    pageSize: 1000,
                    fields: 'nextPageToken, files(id, name, mimeType, webContentLink, webViewLink, iconLink, thumbnailLink, exportLinks)',
                    q: "'root' in parents"
                }

                if( id != '' && id != undefined && id != 'undefined' ) {
                    params.q = `'${id}' in parents`
                } 
                const {data} = await drive.files.list(params);
                list = data
            } else {
                message = 'Please first login with google account.'
            }
        } else {
            message = 'Please first login with google account.'
        }   
        res.status(200).json({list, message})   
    } catch(e) {
        console.log(e)
        message = 'Token expired'
        res.status(200).json({list, message})   
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