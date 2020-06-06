const express = require("express");

const route = express.Router();

//require the Model
const Activities = require("../../model/client/Activities");
const Professionals = require("../../model/client/Professionals");
const Firms = require("../../model/client/Firms");
const Users = require("../../model/client/Users");
const Documents = require("../../model/client/Documents");


const authJWT = require("../../helpers/verifyJwtToken");
const clientDBConnection = require("../../helpers/clientDBConnection");

route.get("/activities/:type/:option", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const type = req.params.type, option = req.params.option;
            const Activities = req.connection_db.define('Activities', Activities.mainStructure, Activities.options);

            if(option == "count"){

                let where = {type: type, complete: 0};

                if(type == '3') {
                    where = {type: type};
                }

                const countItem = await Activities.findAll({
					attributes: [[db.sequelize.fn('COUNT', 'id'), 'count_items']],
					where:where
				});
				res.status(200).json(countItem);
            } else if(option == "list") {
                const Professionals = req.connection_db.define('Professionals', Professionals.mainStructure, Professionals.options);
                const Firms = req.connection_db.define('Firms', Firms.mainStructure, Firms.options);
                const Users = req.connection_db.define('Users', Users.mainStructure, Users.options);
                const Documents = req.connection_db.define('Documents', Documents.mainStructure, Documents.options);
                
                Activities.belongsTo(Professionals, { foreignKey: 'professional_id', as: 'professionals' });
                Activities.belongsTo(Users, { foreignKey: 'user_id', as: 'users' });
                Activities.belongsTo(Documents, { foreignKey: 'document_id', as: 'documents' });

                Professionals.belongsTo(Firms, { foreignKey: 'firm_id', as: 'firms' });

                const itemListToDO = await Activities.findAll({
					attributes: [['activity_id','id'],'subject', 'subject_type', 'complete', 'comment', 'share_url','created_at'],
					where:{ type: type, complete: 0},
					include:[
						{
							model: Professionals,
							as: 'professional',
                            attributes:['first_name', 'last_name','email_address','telephone','firm_name'],
                            include:[
								{
									model: Firms,
									as: 'firm',
									attributes:['firm_name']
								}
							]
						},
						{
							model: Users,
							as: 'users',
							attributes:['first_name', 'last_name','email_address','telephone']
                        },
                        {
							model: Documents,
							as: 'document',
							attributes:['title', 'file','type','description']
						}
					],
					order: [
						['created_at', 'DESC'],
					],
                });
                
                const itemListComplete = await Activities.findAll({
					attributes: [['activity_id','id'],'subject', 'subject_type', 'complete', 'comment', 'share_url','created_at'],
					where:{complete: 1},
					include:[
						{
							model: Professionals,
							as: 'professional',
                            attributes:['first_name', 'last_name','email_address','telephone','firm_name'],
                            include:[
								{
									model: Firms,
									as: 'firm',
									attributes:['firm_name']
								}
							]
						},
						{
							model: Users,
							as: 'users',
							attributes:['first_name', 'last_name','email_address','telephone']
                        },
                        {
							model: Documents,
							as: 'document',
							attributes:['title', 'file','type','description']
						}
					],
					order: [
						['created_at', 'DESC'],
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
        res.status(402).json("Invalid option");
    }    
});

route.post("/activities/:type", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const Activities = req.connection_db.define('Activities', Activities.mainStructure, Activities.options);
            const Documents = req.connection_db.define('Documents', Documents.mainStructure, Activities.options);

            const findRecord = await Activities.findOne({
                where: {id: req.params.ID, organisation_id: req.orgId},
                attributes: ['id', 'comment', 'created_at', 'type', 'subject', 'subject_type'],
                include:[
                    {
                        model: Documents,
                        as: 'documents',
                        required:false,
                        attributes:['file','title']                    
                    }
                ] 	
            })
            if(findRecord != null && findRecord.id > 0) {
                res.status(200).json(findRecord);
            } else {
                res.status(404).json("No found!");
            }
        } else {
            console.log("Client DB not connected");
            res.status(402).send("Invalid option");
        }
    } catch ( err ) {
        console.log('REQUEST GET, activities: '+ err);
        res.status(402).json("Invalid option");
    }
});

route.post("/activities/:type", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const type = req.params.type;
            const Activities = req.connection_db.define('Activities', Activities.mainStructure, Activities.options);
            let postData = {		
                user_id: req.userId,
                professional_id: req.body.user_id,	
                subject: req.body.subject,
                subject_type: req.body.option,
                comment: req.body.comment,
                type: type,
                document_id: 0,
                share_url: ''
            };
            if(req.body.user_id > 0) {
                /**
                 * Find Professional
                 */
                let professional;
                if(req.body.user_id > 0) {
                    professional = await Professionals.findOne({
                        where: {id: req.body.user_id},
                        attributes: ['professional_id', 'email_address']
                    });
                }             

                let documentData;
                if(req.params.type == 2) {
                    documentData = await Document.findOne({
                        where: {document_id: req.body.document_id},
                        attributes: ['document_id', 'file']
                    })
                    postData.document_id = req.body.document_id;
                }

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
                        subject_type: req.body.option,
                    }
                    /**
                     * insert sharelink
                     */
                    const shareLink = await ShareLink.create(shareUrl);
                    if(shareLink != null && shareLink.share_id > 0) {
                        postData.share_url = "https://share.patentrack.com/"+code;
                    }
                }

                const newActivity = Activity.create(postData);
                if(newActivity != null && newActivity.activity_id > 0){
                    let response = newActivity.toJSON();
                    if(req.params.type == 1 && documentData != null) {
                        response.document = documentData.file;
                    }
                    if(req.params.type == 1 || req.params.type == 2 ) {
                        response.email_address = professional.email_address;
                    }                
                    res.status(200).json(response);
                } else {
                    res.status(500).send("Internal server error.");
                }
            } else {
                res.status(402).send("Please select professional.");
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

route.put("/activities", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        const ID = req.body.complete, type = req.params.type;
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const Activities = req.connection_db.define('Activities', Activities.mainStructure, Activities.options);

            const findData = await Activities.findOne({
                where:{ type: type, id: ID}
            });

            if( findData != null && findData.id > 0) {
                const t = await req.connection_db.transaction();
                const items = await RecordItem.update({complete: 1},{where: {id: ID}, transaction: t});
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