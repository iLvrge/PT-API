const express = require("express"),

    route = express.Router(),

    authJWT = require("../../helpers/verifyJwtToken"),

    connection = require("../../config/db.config"),
    
    moment = require('moment');

const MaintainenceCode = require("../../model/maintainence/MaintainenceCode"),
    
    MaintainenceFees = require("../../model/maintainence/MaintainenceFees"),
    
    Documentid = require("../../model/application/DocumentIds");

route.get("/events/:applicationNumber", [authJWT.verifyToken], async (req, res) =>{     
    try {
        const applicationNumber = req.params.applicationNumber;
        if(applicationNumber != undefined && applicationNumber != null){
            const findData = await MaintainenceFees.findAll({
                attributes:['grant_doc_num', 'appno_doc_num', [connection.Sequelize.fn('date_format', connection.Sequelize.col('event_date'), '%Y-%m-%d'), 'eventdate'], 'event_code'],
                where: {appno_doc_num: applicationNumber},
                group: ['eventdate','event_code'],
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
        const rfID = req.params.rfID, DATE_FORMAT = 'YYYY';
        if(rfID != undefined && rfID != null){
            let getList = [], timelineSpan = [];
            const findAllApplications = await Documentid.findAll({
                attributes: ['appno_doc_num', 'grant_date'],
                where: {    
                    rf_id: rfID, 
                    appno_doc_num: {[connection.Op.ne]: ''},
                    grant_doc_num : {[connection.Op.ne]: ''},
                },
                order: [['grant_date', 'ASC']]
            });


            console.log(findAllApplications.length);
            if(findAllApplications.length > 0) {
                const allApplications = [];
                const promises = findAllApplications.map( application => {
                    allApplications.push(application.appno_doc_num);
                    return application;
                });

                await Promise.all(promises);

                if(allApplications.length > 0) {
                    getList = await MaintainenceFees.findAll({
                        attributes:['grant_doc_num', 'appno_doc_num', [connection.Sequelize.fn('date_format', connection.Sequelize.col('event_date'), '%Y-%m-%d'), 'eventdate'], 'event_code'],
                        where: {appno_doc_num: allApplications},
                        order: [['event_date', 'ASC']]
                    });

                    //res.status(200).json(getList);

                    if(getList.length > 0) {     
                        
                        const startYear = moment(new Date(findAllApplications[0].get('grant_date'))).format(DATE_FORMAT), endYear = moment(new Date(getList[getList.length - 1].get('eventdate'))).format(DATE_FORMAT);

                        console.log(startYear, endYear);

                        for(let i = startYear; i <= endYear; i++) {
                            timelineSpan.push({year: i, count: 0});
                        }

                        const eventNotExist = [];

                        const promises = findAllApplications.map( async application => {

                            const allEvents = getList.filter( event => {
                               // console.log(BigInt(event.appno_doc_num) , BigInt(application.appno_doc_num));
                                return  parseInt(event.appno_doc_num) == parseInt(application.appno_doc_num) ? event : undefined;
                            });

                            if(allEvents.length > 0) {
                                let checkStatus = false, eventLastYear =  moment(new Date(allEvents[allEvents.length - 1].get('eventdate'))).format(DATE_FORMAT);
                                const promiseEventCheck = allEvents.map( e => {
                                    if(e.event_code == 'EXP.' || e.event_code == 'EXPX') {
                                        checkStatus = true;
                                        eventLastYear = moment(new Date(e.get('eventdate'))).format(DATE_FORMAT);
                                    }                                    
                                    return e;
                                });
                                await Promise.all(promiseEventCheck);
                                const patentStartYear = moment(new Date(application.get('grant_date'))).format(DATE_FORMAT);
                                for(let i = patentStartYear; i <= eventLastYear; i++) {
                                    const findIndex = timelineSpan.findIndex( e => e.year == i);
                                    if(findIndex >= 0) {
                                        timelineSpan[findIndex].count = timelineSpan[findIndex].count + 1;
                                    }
                                }
                            } else {
                                eventNotExist.push({application: application.appno_doc_num, grant_date: moment(new Date(application.get('grant_date'))).format(DATE_FORMAT)});
                            }
                            return application;
                        });
                        await Promise.all(promises);

                        console.log(eventNotExist);
                    }                   
                }
            }            
            res.status(200).json(timelineSpan);
        } else {
            res.status(402).send("Invalid transaction ID.");
        }
    } catch(err){
        console.log(err);
        res.status(500).send("Internal server error.");
    }
});
module.exports = route;