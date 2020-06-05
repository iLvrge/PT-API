const express = require("express");

const route = express.Router();

//require the Model
const Activities = require("../../model/client/Activities");


const authJWT = require("../../helpers/verifyJwtToken");
const clientDBConnection = require("../../helpers/clientDBConnection");

route.get("/activities/:type/:option", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const type = req.params.type, option = req.params.option;
            const Activities = DBConnection.define('Activities', Activities.mainStructure, Activities.options);
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
            res.status(400).json("Invalid option");
        }
    } catch (err) {
        console.log('REQUEST GET, activities: '+ err);
        res.status(400).json("Invalid option");
    }
    
});

route.post("/activities", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {

    res.status(200).json([]);
});

route.put("/activities", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {

    res.status(200).json([]);
});

module.exports = route;