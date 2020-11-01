const express = require("express");

const route = express.Router();

//require the Model
const Activities = require("../../model/client/Activities");
const Professionals = require("../../model/client/Professionals");
const Documents = require("../../model/client/Documents");
const Types = require("../../model/client/Types");
const Comments = require("../../model/client/Comments");
const Users = require("../../model/client/Users");
const ShareLink = require("../../model/business/ShareLinks");

const authJWT = require("../../helpers/verifyJwtToken");
const clientDBConnection = require("../../helpers/clientDBConnection");

const helpers = require("../../helpers/helper");



route.get("/comments/:subjectType", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            let subjectType = req.params.subjectType;
            const Activity = req.connection_db.define('Activities', Activities.mainStructure, Activities.options);
            const Type = req.connection_db.define('Types', Types.mainStructure, Types.options);
            const Document = req.connection_db.define('Documents', Documents.mainStructure, Documents.options);
            const Comment = req.connection_db.define('Comments', Comments.mainStructure, Comments.options);
            const User = req.connection_db.define('Users', Users.mainStructure, Users.options);

            Activity.belongsTo(Type, { foreignKey: 'type', as: 'types' });

            Activity.hasMany(Comment, { foreignKey: 'activity_id', as: 'comments' });

            Activity.belongsTo(Document, { foreignKey: 'document_id', as: 'documents' });

            Comment.belongsTo(Activity, { foreignKey: 'activity_id', as: 'activities' });

            Comment.belongsTo(User, { foreignKey: 'user_id', as: 'user', otherKey: 'user_id' });

            const include = [];

            include.push({
                model: Comment,
                as: 'comments',                
                include:[{
                    model: User,
                    as: 'user',           
                }]
            });

            if(subjectType[0] == 'error' || subjectType[0] == 'fix'){
                subjectType.push('asset');
            } else if(subjectType[0] == 'asset'){
                subjectType.push('error');
                subjectType.push('fix');
            }

            if(subjectType[0] == 'record') {                
                const findTypes = await Type.findAll({
                    where: {name: subjectType}
                });
    
                if(findTypeID != null && findTypes.length > 0) {
                    const type = [];
                    const promises = findTypes.map( t => {
                        type.push(t.type_id);
                        return t;
                    })
                    await Promise.all(promises);
                    include.push({
                        model: Document,
                        as: 'documents',
                        required:false,
                        attributes:['file','title']                    
                    });
                    
                    const findAllActivities = await Activity.findAll({
                        where: {type: type},
                        include:include,
                        order: [
                            [ { model: Comment, as: 'comments' }, 'createdAt', 'ASC'], 
                        ],
                        
                    });
                    res.status(200).json(findAllActivities);
                }
            } else {
                res.status(200).json({});
            }
        }
    } catch ( err ) {
        res.status(402).send("Invalid option");
    }
});


route.get("/comments/:subjectType/:subject", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const subjectType = [req.params.subjectType], subject = req.params.subject;
            const Activity = req.connection_db.define('Activities', Activities.mainStructure, Activities.options);
            const Type = req.connection_db.define('Types', Types.mainStructure, Types.options);
            const Document = req.connection_db.define('Documents', Documents.mainStructure, Documents.options);
            const Comment = req.connection_db.define('Comments', Comments.mainStructure, Comments.options);
            const User = req.connection_db.define('Users', Users.mainStructure, Users.options);

            Activity.belongsTo(Type, { foreignKey: 'type', as: 'types' });

            Activity.hasMany(Comment, { foreignKey: 'activity_id', as: 'comments' });

            Activity.belongsTo(Document, { foreignKey: 'document_id', as: 'documents' });

            Comment.belongsTo(Activity, { foreignKey: 'activity_id', as: 'activities' });

            Comment.belongsTo(User, { foreignKey: 'user_id', as: 'user', otherKey: 'user_id' });

            if(subjectType[0] == 'error' || subjectType[0] == 'fix'){
                subjectType.push('asset');
                if(!subjectType.includes('error')){
                    subjectType.push('error');
                } else if(!subjectType.includes('fix')){
                    subjectType.push('fix');
                }
            } else if(subjectType[0] == 'asset'){
                subjectType.push('error');
                subjectType.push('fix');
            }
            const include = [];

            include.push({
                model: Type,
                as: 'types',
                attributes:[],
                where: {name: subjectType}
            });

            include.push({
                model: Comment,
                as: 'comments',
                include:[{
                    model: User,
                    as: 'user',           
                }]
            });

            let where = {subject: subject};

            if(subjectType[0] == 'record') {
                include.push({
                    model: Document,
                    as: 'documents',
                    required:false,
                    attributes:['file','title']                    
                });
                where = {activity_id: subject};
            }
            
            const findActivity = await Activity.findOne({
                where: where,               
                include:include,
                order: [
                    [ { model: Comment, as: 'comments' }, 'createdAt', 'ASC'], 
                ],
            });
            res.status(200).json(findActivity);
        }
    } catch ( err ) {
        console.log(err);
        res.status(402).send("Invalid option");
    }
});

route.post("/comments/:subjectType", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const subjectType = [req.params.subjectType];

            const Type = req.connection_db.define('Types', Types.mainStructure, Types.options);

            if(subjectType[0] == 'error' || subjectType[0] == 'fix'){
                subjectType.push('asset');
                if(!subjectType.includes('error')){
                    subjectType.push('error');
                } else if(!subjectType.includes('fix')){
                    subjectType.push('fix');
                }
            } else if(subjectType[0] == 'asset'){
                subjectType.push('error');
                subjectType.push('fix');
            }

            const findTypeID = await Type.findOne({
                where: {name: subjectType}
            });

            if(findTypeID != null) {
                const type = findTypeID.type_id, subject = req.body.subject;

                const Activity = req.connection_db.define('Activities', Activities.mainStructure, Activities.options);

                let findActivity = null;

                if(subjectType != 'record' ) {
                    const where = {subject: subject};
                    if(subjectType != 'asset' || subjectType != 'error' ||  subjectType != 'fix') {
                        where.type = type;
                    }
                    findActivity = await Activity.findOne({
                        where: where
                    });
                } else if ( subject > 0 && subjectType == 'record' ) {
                    findActivity = await Activity.findOne({
                        where: {activity_id: subject}
                    });
                }

                let activityID = 0, postData = {};

                if(findActivity == null) {
                    postData = {		
                        user_id: req.userId,
                        professional_id: req.body.professional_id,	
                        subject: subject,
                        subject_type: type,
                        type: type,
                        share_url: '',
                        document_id: '1'
                    };
                    let professional, documentData;
                    if((subjectType == 'fix' || subjectType == 'record') && req.body.professional_id > 0) {
                        /**
                         * Find Professional
                         */
                        
                        if(req.body.professional_id > 0) {
                            const Professional = req.connection_db.define('Professionals', Professionals.mainStructure, Professionals.options);
                            professional = await Professional.findOne({
                                where: {professional_id: req.body.professional_id, type: 1},
                                attributes: ['professional_id', 'email_address']
                            });
                        }
                    } else {
                        const findUserDetails = await helpers.findProfessionalFromUserID(req.userId, req.connection_db);
                        if(findUserDetails != null) {
                            postData.professional_id =  findUserDetails.professional_id;
                        } else {
                            postData.professional_id = 1;
                        }
                        
                        const findDocument = await helpers.findFakeDocument(req.connection_db);
        
                        if(findDocument != null) {
                            postData.document_id = findDocument.document_id;
                        }
                    }
    
                    if(subjectType == 'record' && req.body.document_id > 0) {
                        const Document = req.connection_db.define('Documents', Documents.mainStructure, Documents.options);
                        documentData = await Document.findOne({
                            where: {document_id: req.body.document_id},
                            attributes: ['document_id', 'file']
                        })
                        postData.document_id = req.body.document_id;
                    } 
                    if(subjectType == 'fix') {
                        /**
                         * create sharing code
                         */
                        let code = await helpers.getNewCode();
                        let shareUrl = {
                            code: code,
                            organisation_id: req.orgId,
                            user_id: req.userId,
                            subject: subject,
                            subject_type: type,
                        }
                        
                        /**
                         * insert sharelink
                         */
                        const shareLink = await ShareLink.create(shareUrl);
                        if(shareLink != null && shareLink.share_id > 0) {
                            postData.share_url = "https://share.patentrack.com/"+code;
                        }
                    }
                } else {
                    activityID = findActivity.activity_id;
                }

                const Comment = req.connection_db.define('Comments', Comments.mainStructure, Comments.options);

                if(activityID > 0) {

                    const postComment = {
                        activity_id: activityID,
                        user_id: req.userId,
                        comment: req.body.comment,
                    }

                    await Comment.create(postComment);

                    const activityData = await helpers.findActivityByID(activityID, Activity, Comment);

                    res.status(200).json(activityData);
                } else {
                    console.log(postData);
                    /**Insert new activity */
                    let mimeType = null;

                    if(req.files != null && req.files != undefined && req.files.file != undefined) {
                        mimeType = req.files.file.mimetype
                    }

                    if(mimeType != null && mimeType != '' && mimeType.toLowerCase().indexOf('.exe') < 0){
                        let fileObject = req.files.file;
                        await fileObject.mv('/var/www/html/beta/resources/shared/data/'+fileObject.name, async function(err) {
                            if (!err){
                                postData.upload_file = "https://patentrack.com/resources/shared/data/"+fileObject.name;
                                const newActivity = await Activity.create(postData);
                                if(newActivity != null && newActivity.activity_id > 0){
                                    activityID = newActivity.activity_id;
                                    const postComment = {
                                        activity_id: activityID,
                                        user_id: req.userId,
                                        comment: req.body.comment,
                                    }                                    
                                    await Comment.create(postComment);
                                    const activityData = await helpers.findActivityByID(activityID, Activity, Comment);
                                    res.status(200).json(activityData);
                                } else {
                                    res.status(500).send("Internal server error.");
                                }
                            } else {
                                res.status(500).send("Error while uploading file.");
                            }
                        })
                    } else {
                        const newActivity = await Activity.create(postData);
                        if(newActivity != null && newActivity.activity_id > 0){
                            activityID = newActivity.activity_id;
                            const postComment = {
                                activity_id: activityID,
                                user_id: req.userId,
                                comment: req.body.comment,
                            }
                            
                            await Comment.create(postComment);
                            const activityData = await helpers.findActivityByID(activityID, Activity, Comment);
                            res.status(200).json(activityData);
                        } else {
                            res.status(500).send("Internal server error.");
                        }
                    }
                }
            } else {
                res.status(401).send("Bad inputs.");
            }
        } else {
            console.log("Client DB not connected");
            res.status(401).send("Bad inputs.");
        }
    } catch (err) {
        console.log( err );
        res.status(500).send("Internal server error.");
    }
});


module.exports = route;