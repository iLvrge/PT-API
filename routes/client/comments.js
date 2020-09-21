const express = require("express");

const route = express.Router();

//require the Model
const Activities = require("../../model/client/Activities");
const Professionals = require("../../model/client/Professionals");
const Documents = require("../../model/client/Documents");
const Types = require("../../model/client/Types");
const Comments = require("../../model/client/Comments");

const ShareLink = require("../../model/business/ShareLinks");

const authJWT = require("../../helpers/verifyJwtToken");
const clientDBConnection = require("../../helpers/clientDBConnection");

const helpers = require("../../helpers/helper");



route.get("/comments/:subjectType", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const subjectType = req.params.subjectType, subject = req.params.subject;
            const Activity = req.connection_db.define('Activities', Activities.mainStructure, Activities.options);
            const Type = req.connection_db.define('Types', Types.mainStructure, Types.options);

            const Comment = req.connection_db.define('Comments', Comments.mainStructure, Comments.options);

            Activity.belongsTo(Type, { foreignKey: 'type', as: 'types' });

            Activity.hasMany(Comment, { foreignKey: 'activity_id', as: 'comments' });

            Comment.belongsTo(Activity, { foreignKey: 'activity_id', as: 'activities' });

            const include = [];

            include.push({
                model: Comment,
                as: 'comments',
            });

            if(subjectType == 'Record') {
                const findTypeID = await Type.findOne({
                    where: {name: subjectType}
                });
    
                if(findTypeID != null) {
                    const type = findTypeID.type_id;
                    include.push({
                        model: Document,
                        as: 'documents',
                        required:false,
                        attributes:['file','title']                    
                    });
                    
                    const findAllActivities = await Activity.findAll({
                        where: {type: type},
                        include:include
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
            const subjectType = req.params.subjectType, subject = req.params.subject;
            const Activity = req.connection_db.define('Activities', Activities.mainStructure, Activities.options);
            const Type = req.connection_db.define('Types', Types.mainStructure, Types.options);

            const Comment = req.connection_db.define('Comments', Comments.mainStructure, Comments.options);

            Activity.belongsTo(Type, { foreignKey: 'type', as: 'types' });

            Activity.hasMany(Comment, { foreignKey: 'activity_id', as: 'comments' });

            Comment.belongsTo(Activity, { foreignKey: 'activity_id', as: 'activities' });

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
            });

            let where = {subject: subject};

            if(subjectType == 'Record') {
                include.push({
                    model: Document,
                    as: 'documents',
                    required:false,
                    attributes:['file','title']                    
                });
                where = {id: subject};
            }

            const findActivity = await Activity.findOne({
                where: {subject: subject},
                include:include
            });
            res.status(200).json(findActivity);
        }
    } catch ( err ) {
        res.status(402).send("Invalid option");
    }
});

route.post("/comments/:subjectType", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const subjectType = req.params.subjectType;

            const Type = req.connection_db.define('Types', Types.mainStructure, Types.options);

            const findTypeID = await Type.findOne({
                where: {name: subjectType}
            });

            if(findTypeID != null) {
                const type = findTypeID.type_id, subject = req.body.subject;

                const Activity = req.connection_db.define('Activities', Activities.mainStructure, Activities.options);

                let findActivity = null;

                if(subjectType != 'Record' ) {
                    findActivity = await Activity.findOne({
                        where: {type: type, subject: subject}
                    });
                } else if ( subject > 0 && subjectType == 'Record' ) {
                    findActivity = await Activity.findOne({
                        where: {type: type, activity_id: subject}
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
                    if((subjectType == 'Fix' || subjectType == 'Record') && req.body.professional_id > 0) {
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
    
                    if(subjectType == 'Record' && req.body.document_id > 0) {
                        const Document = req.connection_db.define('Documents', Documents.mainStructure, Documents.options);
                        documentData = await Document.findOne({
                            where: {document_id: req.body.document_id},
                            attributes: ['document_id', 'file']
                        })
                        postData.document_id = req.body.document_id;
                    } 
                    if(subjectType == 'Fix') {
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