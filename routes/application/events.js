const express = require("express"),

    route = express.Router(),

    authJWT = require("../../helpers/verifyJwtToken"),

    connection = require("../../config/db.config");

const MaintainenceCode = require("../../model/maintainence/MaintainenceCode"),
    
    MaintainenceFees = require("../../model/maintainence/MaintainenceFees"),
    
    Documentid = require("../../model/application/DocumentIds");

route.get("/events/:applicationNumber", [authJWT.verifyToken], async (req, res) =>{     
    try {
        const applicationNumber = req.params.applicationNumber;
        if(applicationNumber != undefined && applicationNumber != null){
            const findData = await MaintainenceFees.findAll({
                attributes:['grant_doc_num', 'appno_doc_num', [connection.Sequelize.fn('date_format', connection.Sequelize.col('event_date'), '%Y-%m-%d'), 'event_date'], 'event_code'],
                where: {appno_doc_num: applicationNumber},
                group: ['event_date','event_code'],
                include: [
                    {
                        model: MaintainenceCode,
                        as: 'maintainence_code',
                        attributes:['event_description']
                    }
                ]
            })
            res.status(200).json(findData);
        } else {
            res.status(402).send("Invalid application number.");
        }
    } catch(err){
        console.log(err);
        res.status(500).send("Internal server error.");
    }
});

route.get("/events/transactions/:rfID", [authJWT.verifyToken], async (req, res) =>{    
    try {
        
        const rfID = req.params.rfID;
        if(rfID != undefined && rfID != null){
            let getList = [];
            const findAllApplications = await Documentid.findAll({
                attributes: ['appno_doc_num'],
                where: {rf_id: rfID, appno_doc_num: {[connection.Op.ne]: ''}}
            });

            if(findAllApplications.length > 0) {
                const allApplications = [];
                const promises = findAllApplications.map( application => {
                    allApplications.push(application.appno_doc_num);
                    return application;
                });

                await Promise.all(promises);

                if(allApplications.length > 0) {
                    getList = await MaintainenceFees.findAll({
                        attributes:['grant_doc_num', [connection.Sequelize.fn('date_format', connection.Sequelize.col('event_date'), '%Y-%m-%d'), 'event_date'], 'event_code'],
                        where: {appno_doc_num: allApplications},
                        group: ['event_date','event_code'],
                        include: [
                            {
                                model: MaintainenceCode,
                                as: 'maintainence_code',
                                attributes:['event_description']
                            }
                        ]
                    });
                }
            }            
            res.status(200).json(getList);
        } else {
            res.status(402).send("Invalid transaction ID.");
        }
    } catch(err){
        console.log(err);
        res.status(500).send("Internal server error.");
    }
});
module.exports = route;