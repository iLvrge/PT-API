const express = require("express");

const route = express.Router();

//require the Model
const Activities = require("../../model/client/Activities");
const Professionals = require("../../model/client/Professionals");
const Firms = require("../../model/client/Firms");
const Users = require("../../model/client/Users");
const Documents = require("../../model/client/Documents");
const Comments = require("../../model/client/Comments");
const Types = require("../../model/client/Types");
const ShareLink = require("../../model/business/ShareLinks");

const Errors = require("../../model/application/Errors");

const authJWT = require("../../helpers/verifyJwtToken");
const clientDBConnection = require("../../helpers/clientDBConnection");

const helpers = require("../../helpers/helper");

/**Get activities list */

route.get("/activities/", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const type = req.query.type, option = req.query.count;
            const Activity = req.connection_db.define('Activities', Activities.mainStructure, Activities.options);

            if(option == "true" || option == true){
                const where = {};
                if(type == 'fix' || type == 'record') {
                    where.type = type == 'fix' ? 1 :  2;
                    where.complete = 0;
                } else {
                    where.complete = 1;
                }               

                const countItem = await Activity.findAll({
					attributes: [[req.connection_db.fn('COUNT', 'id'), 'count_items']],
					where:where
				});
				res.status(200).json(countItem);
            } else {
                const Professional = req.connection_db.define('Professionals', Professionals.mainStructure, Professionals.options);
                const Firm = req.connection_db.define('Firms', Firms.mainStructure, Firms.options);
                const User = req.connection_db.define('Users', Users.mainStructure, Users.options);
                const Document = req.connection_db.define('Documents', Documents.mainStructure, Documents.options);
                
                Professional.belongsTo(Firm, { foreignKey: 'firm_id', as: 'firms' });

                Activity.belongsTo(Professional, { foreignKey: 'professional_id', as: 'professionals' });
                Activity.belongsTo(User, { foreignKey: 'user_id', as: 'users' });
                Activity.belongsTo(Document, { foreignKey: 'document_id', as: 'documents' });

                const where = {};
                if(type == 'fix' || type == 'record') {
                    // where.type = type == 'fix' ? 1 :  2;
                    where.type = [1,2]
                    where.complete = 0;
                } else {
                    where.complete = 1;
                } 

                const itemListToDO = await Activity.findAll({
					attributes: [['activity_id','id'],'subject', 'subject_type', 'complete', 'comment', 'share_url','created_at'],
					where: where,
					include:[
						{
							model: Professional,
							as: 'professionals',
                            attributes:['first_name', 'last_name','email_address','telephone'],
                            include:[
								{
									model: Firm,
									as: 'firms',
									attributes:['firm_name']
								}
							]
						},
						{
							model: User,
							as: 'users',
							attributes:['first_name', 'last_name','email_address','telephone']
                        },
                        {
							model: Document,
							as: 'documents',
							attributes:['title', 'file','type','description']
						}
					],
					order: [
						['created_at', 'DESC'],
					],
                });
                
                res.status(200).json(itemListToDO);
            }
        } else {
            console.log("Client DB not connected");
            res.status(402).send("Invalid option");
        }
    } catch (err) {
        console.log('REQUEST GET, activities: '+ err);
        res.status(402).send("Invalid option");
    }    
});

route.get("/activities/:type/:option", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const type = req.params.type, option = req.params.option;
            const Activity = req.connection_db.define('Activities', Activities.mainStructure, Activities.options);

            if(option == "count"){

                const where = {type: type, complete: type == '3' ? 1 : 0};

                const countItem = await Activity.findAll({
					attributes: [[req.connection_db.fn('COUNT', 'id'), 'count_items']],
					where: where
				});
				res.status(200).json(countItem);
            } else if(option == "list") {
                const Professional = req.connection_db.define('Professionals', Professionals.mainStructure, Professionals.options);
                const Firm = req.connection_db.define('Firms', Firms.mainStructure, Firms.options);
                const User = req.connection_db.define('Users', Users.mainStructure, Users.options);
                const Document = req.connection_db.define('Documents', Documents.mainStructure, Documents.options);
                
                Professional.belongsTo(Firm, { foreignKey: 'firm_id', as: 'firms' });

                Activity.belongsTo(Professional, { foreignKey: 'professional_id', as: 'professionals' });
                Activity.belongsTo(User, { foreignKey: 'user_id', as: 'users' });
                Activity.belongsTo(Document, { foreignKey: 'document_id', as: 'documents' });

                const itemListToDO = await Activity.findAll({
					attributes: [['activity_id','id'],'subject', 'subject_type', 'complete', 'comment', 'share_url','created_at'],
					where:{ type: type, complete: 0},
					include:[
						{
							model: Professional,
							as: 'professionals',
                            attributes:['first_name', 'last_name','email_address','telephone'],
                            include:[
								{
									model: Firm,
									as: 'firms',
									attributes:['firm_name']
								}
							]
						},
						{
							model: User,
							as: 'users',
							attributes:['first_name', 'last_name','email_address','telephone']
                        },
                        {
							model: Document,
							as: 'documents',
							attributes:['title', 'file','type','description']
						}
					],
					order: [
						['created_at', 'DESC'],
					],
                });
                
                const itemListComplete = await Activity.findAll({
					attributes: [['activity_id','id'],'subject', 'subject_type', 'complete', 'comment', 'share_url','created_at','updated_at'],
					where:{complete: 1},
					include:[
						{
							model: Professional,
							as: 'professionals',
                            attributes:['first_name', 'last_name','email_address','telephone'],
                            include:[
								{
									model: Firm,
									as: 'firms',
									attributes:['firm_name']
								}
							]
						},
						{
							model: User,
							as: 'users',
							attributes:['first_name', 'last_name','email_address','telephone']
                        },
                        {
							model: Document,
							as: 'documents',
							attributes:['title', 'file','type','description']
						}
					],
					order: [
						['updated_at', 'DESC'],
					],
                });
                res.status(200).json({todo: itemListToDO, complete: itemListComplete});
            }
        } else {
            console.log("Client DB not connected");
            res.status(402).send("Invalid option");
        }
    } catch (err) {
        console.log('REQUEST GET, activities: '+ err);
        res.status(402).send("Invalid option");
    }    
});

/**Get only activities comments list */

route.get("/activities/comments/:subject_type/:subject", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const subject_type = req.params.subject_type, subject = req.params.subject;
            const Activity = req.connection_db.define('Activities', Activities.mainStructure, Activities.options);
            const getCommentList = await Activity.findAll({
                where: {subject_type: subject_type, subject: subject},
                attributes: ['comment', 'created_at'],
                order: [
                    ['created_at', 'DESC'],
                ],
            })
            res.status(200).json(getCommentList);
        }
    } catch ( err ) {
        res.status(402).send("Invalid option");
    }
});

/**Get activties by ID */

route.get("/activities/:ID", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const Activity = req.connection_db.define('Activities', Activities.mainStructure, Activities.options);
            const Document = req.connection_db.define('Documents', Documents.mainStructure, Documents.options);

            Activity.belongsTo(Document, { foreignKey: 'document_id', as: 'documents' });

            const findData = await Activity.findOne({
                where: {activity_id: req.params.ID},
                attributes: [['activity_id','id'], 'comment', 'created_at', 'type', 'subject', 'subject_type','upload_file'],
                include:[
                    {
                        model: Document,
                        as: 'documents',
                        required:false,
                        attributes:['file','title']                    
                    }
                ] 	
            });

            if(findData != null) {
                res.status(200).json(findData);
            } else {
                res.status(404).send("No found!");
            }
        } else {
            console.log("Client DB not connected");
            res.status(402).send("Invalid option");
        }
    } catch ( err ) {
        console.log('REQUEST GET, activities: '+ err);
        res.status(402).send("Invalid option");
    }
});

/**Insert new activities */

route.post("/activities/:type", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const type = req.params.type;
            
            let postData = {		
                user_id: req.userId,
                professional_id: req.body.professional_id,	
                subject: req.body.subject,
                subject_type: req.body.subject_type, /** Company, Customer, Transaction, Application, PatentNumber*/
                type: type, /**RecordIt, FixIt, Comment */
                share_url: '',
                document_id: '1'
            };
            let insertData = true;
            let professional;
            /**For RecordIt or FixIt */
            if((type == 1 || type == 2) && req.body.professional_id > 0) {
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
            } else if( type  == 3) {
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
            } else {
                insertData = false;
            }
            /**Find Document */          

            let documentData;
            /**If type is RecordIt */
            if(req.params.type == 2) {
                const Document = req.connection_db.define('Documents', Documents.mainStructure, Documents.options);
                documentData = await Document.findOne({
                    where: {document_id: req.body.document_id},
                    attributes: ['document_id', 'file']
                })
                postData.document_id = req.body.document_id;
            }   

            /**For FixIt or RecordIt */
            if(req.params.type == 1) {
                /**
                 * create sharing code
                 */
                let code = await helpers.getNewCode();
                let shareUrl = {
                    code: code,
                    organisation_id: req.orgId,
                    user_id: req.userId,
                    subject: req.body.subject,
                    subject_type: req.body.subject_type,
                }
                
                /**
                 * insert sharelink
                 */
                const shareLink = await ShareLink.create(shareUrl);
                if(shareLink != null && shareLink.share_id > 0) {
                    postData.share_url = "https://share.patentrack.com/"+code;
                }
            }
            console.log(postData);
            /**Insert new activity */
            if(insertData === true) {
                const Activity = req.connection_db.define('Activities', Activities.mainStructure, Activities.options);
                const Type = req.connection_db.define('Types', Types.mainStructure, Types.options);
                const Comment = req.connection_db.define('Comments', Comments.mainStructure, Comments.options);

                Activity.belongsTo(Type, { foreignKey: 'type', as: 'types' });

                
                let findActivity = null, activityID = 0;

                if(type == 1 ) {
                    findActivity = await Activity.findOne({
                        where: {subject: postData.subject}
                    });
                } else if(type == 2 ) {
                    postData.subject = '';
                }

                if(findActivity != null) {
                    activityID = findActivity.activity_id
                }

                let mimeType = null;

                if(req.files != null && req.files != undefined && req.files.file != undefined) {
                    mimeType = req.files.file.mimetype
                }
                
                if(mimeType != null && mimeType != '' && mimeType.toLowerCase().indexOf('.exe') < 0){
                    let fileObject = req.files.file;
                    await fileObject.mv('/var/www/html/beta/resources/shared/data/'+fileObject.name, async function(err) {
                        if (!err){
                            postData.upload_file = "https://patentrack.com/resources/shared/data/"+fileObject.name;
                            
                            if(activityID == 0){
                                const newActivity = await Activity.create(postData);
                                if(newActivity != null && newActivity.activity_id > 0){
                                    activityID = newActivity.activity_id;
                                }
                            } else {
                               await Activity.update(postData,{where:{activity_id: activityID}});
                            }

                            

                            if(activityID > 0){
                                if(req.body.entity_id != undefined && req.body.entity_id > 0){
                                    await Errors.update({status: 1},{error_id: req.body.entity_id});
                                }
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

                    if(activityID == 0){
                        const newActivity = await Activity.create(postData);
                        if(newActivity != null && newActivity.activity_id > 0){
                            activityID = newActivity.activity_id;
                        }
                    } else {
                       await Activity.update(postData,{where:{activity_id: activityID}});
                    }

                    

                    if(activityID > 0){
                        if(req.body.entity_id != undefined && req.body.entity_id > 0){
                            await Errors.update({status: 1},{error_id: req.body.entity_id});
                        }
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
            } else {
                res.status(401).send("Bad inputs.");
            }            
        } else {
            console.log("Client DB not connected");
            res.status(401).send("Bad inputs.");
        }
    } catch ( err ) {
        console.log( err );
        res.status(500).send("Internal server error.");
    }    
});

/**Update activities */

route.put("/activities/:ID", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        const complete = req.body.complete, ID = req.params.ID;
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const Activity = req.connection_db.define('Activities', Activities.mainStructure, Activities.options);

            const findData = await Activity.findOne({
                where:{ activity_id: ID}
            });

            if( findData != null && findData.activity_id > 0) {
                const t = await req.connection_db.transaction();
                await Activity.update({complete: complete},{where: {activity_id: ID}, transaction: t});
                if (t) await t.commit();
                res.status(200).send("Updated successfully");
            } else {
                res.status(401).send("Bad inputs.");
            }
        }  else {
            console.log("Client DB not connected");
            res.status(401).send("Bad inputs.");
        }  
    } catch( err ) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
});

module.exports = route;