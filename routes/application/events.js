const express = require("express"),

    moment = require('moment'),

    route = express.Router(),

    authJWT = require("../../helpers/verifyJwtToken"),

    connection = require("../../config/db.config"),
    
    clientDBConnection = require("../../helpers/clientDBConnection");

const MaintainenceCode = require("../../model/maintainence/MaintainenceCode"),
    
    MaintainenceFees = require("../../model/maintainence/MaintainenceFees"),
    
    Documentid = require("../../model/application/DocumentIds");



route.get("/events/tabs/:tabID", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        const tabID = req.params.tabID;
        let assetsLifeSpan = [];
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const getCompaniesList = await helpers.getCompaniesList(req.connection_db);
            const portfolioList = [];
            if(getCompaniesList.length > 0) {                   
                const promises = getCompaniesList.map(p => {
                    portfolioList.push(p.representative_id);
                    return p;
                });

                await Promise.all(promises);
            }
            if(portfolioList.length > 0) {
                assetsLifeSpan = await helpers.findAssetsTimeSpan(portfolioList, tabID, 0, 0, req.orgId);
            }
        }
        res.status(200).json(assetsLifeSpan);
    } catch (err) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
});


route.get("/events/tabs/:tabID/companies/:companyID", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        const tabID = req.params.tabID, representativeID = req.params.companyID;
        let assetsLifeSpan = [];
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const findRepresentative = await helpers.findRepresentativeByID(req.connection_db, representativeID);

            if(findRepresentative != null && findRepresentative.representative_id > 0) {
                assetsLifeSpan = await helpers.findAssetsTimeSpan([findRepresentative.representative_id], tabID, 0, 0, req.orgId);
            }
        }
        res.status(200).json(assetsLifeSpan);
    } catch (err) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
});

route.get("/events/tabs/:tabID/companies/:companyID/customers/:customerID", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        const tabID = req.params.tabID, representativeID = req.params.companyID, customerID = req.params.customerID;
        let assetsLifeSpan = [];
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const findRepresentative = await helpers.findRepresentativeByID(req.connection_db, representativeID);

            if(findRepresentative != null && findRepresentative.representative_id > 0) {
                assetsLifeSpan = await helpers.findAssetsTimeSpan([findRepresentative.representative_id], tabID, customerID, 0, req.orgId);
            }
        }
        res.status(200).json(assetsLifeSpan);
    } catch (err) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
});

route.get("/events/tabs/:tabID/companies/:companyID/customers/:customerID/transactions/:rfID", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        const tabID = req.params.tabID, representativeID = req.params.companyID, customerID = req.params.customerID, rfID = req.params.rfID;
        let assetsLifeSpan = [];
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const findRepresentative = await helpers.findRepresentativeByID(req.connection_db, representativeID);

            if(findRepresentative != null && findRepresentative.representative_id > 0) {
                assetsLifeSpan = await helpers.findAssetsTimeSpan([findRepresentative.representative_id], tabID, customerID, rfID, req.orgId);
            }
        }
        res.status(200).json(assetsLifeSpan);
    } catch (err) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
});


route.get("/events/tabs/:tabID/companies/:companyID/customers/:customerID/transactions/:rfID/assets/:applicationNumber", [authJWT.verifyToken, clientDBConnection.connect], async (req, res) =>{     
    try {
        const tabID = req.params.tabID, representativeID = req.params.companyID, customerID = req.params.customerID, rfID = req.params.rfID, applicationNumber = req.params.applicationNumber;
        
        if(applicationNumber != undefined && applicationNumber != null){
            if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
                const findRepresentative = await helpers.findRepresentativeByID(req.connection_db, representativeID);
    
                if(findRepresentative != null && findRepresentative.representative_id > 0) {
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
            } else {
                res.status(402).send("Invalid application number.");
            }
        } else {
            res.status(402).send("Invalid application number.");
        }
    } catch(err){
        console.log(err);
        res.status(500).send("Internal server error.");
    }
});


route.get("/events/:applicationNumber/:patentNumber", [authJWT.verifyToken], async (req, res) =>{     
    try {
        const { applicationNumber, patentNumber } = req.params;
        if(applicationNumber != undefined && applicationNumber != null){
            let where = {appno_doc_num: applicationNumber};
            const event_code = ['M1551', 'M2551', 'M3551', 'M1552', 'M2552', 'M3552', 'M1553', 'M2553', 'M3553'], attributes = ['grant_doc_num', 'appno_doc_num', 'grant_date', [connection.Sequelize.fn('date_format', connection.Sequelize.col('event_date'), '%Y-%m-%d'), 'eventdate'], 'event_code', 'event_icon'], group = ['eventdate','event_code'], include = [
                {
                    model: MaintainenceCode,
                    as: 'maintainence_code',
                    attributes:['event_description']
                }
            ];

            let findData = await MaintainenceFees.findAll({
                attributes: attributes,
                where: where,
                group: group,
                include: include
            });

            if(findData.length == 0) {
                where = {grant_doc_num: {[connection.Op.like]: `%${patentNumber}%`}};
                findData = await MaintainenceFees.findAll({
                    attributes: attributes,
                    where: where,
                    group: group,
                    include: include
                });
            }

            let other = []

            if(findData.length > 0) { 
                where.event_code = event_code
                const findPaymentEvents = await MaintainenceFees.findAll({
                    attributes: ['event_code'],
                    where: where
                });
    
                if( findPaymentEvents.length > 0 ) {
                    const promise = findPaymentEvents.map( event => {
                        const findIndex = event_code.findIndex(e => e === event.event_code)
                        if( findIndex >= 0 ) {
                            event_code.splice( findIndex, 1 )
                        }
                        return event
                    })
    
                    await Promise.all( promise )
                }
                
                if( event_code.length > 0 ) {
                    const date = findData[0].grant_date;
                    const grantDate = `${date.substring(0,4)}-${date.substring(4,6)}-${date.substring(6,8)} 00:00:00`
                    const eventAddedWithCode = [];
                    const eventPromise = event_code.map( event => {
                        let enter = true;
                        if( (event == 'M1551' || event == 'M2551' || event == 'M3551') ) {
                            if( eventAddedWithCode.includes('M1551') || eventAddedWithCode.includes('M2551') || eventAddedWithCode.includes('M3551') ) {
                                enter = false
                            }
                        } else if( (event == 'M1552' || event == 'M2552' || event == 'M3552') ) {
                            if( eventAddedWithCode.includes('M1552') || eventAddedWithCode.includes('M2552') || eventAddedWithCode.includes('M3552') ) {
                                enter = false
                            }
                        } else if( (event == 'M1553' || event == 'M2553' || event == 'M3553') ) {
                            if( eventAddedWithCode.includes('M1553') || eventAddedWithCode.includes('M2553') || eventAddedWithCode.includes('M3553') ) {
                                enter = false
                            }
                        }
                        if(enter === true) {
                            let months = (event == 'M1551' || event == 'M2551' || event == 'M3551') ? 36 : (event == 'M1552' || event == 'M2552' || event == 'M3552') ? 84 : 132;
                            let currentDate = new Date( grantDate )
                            const eventDate = moment( currentDate.setMonth( currentDate.getMonth() + months ) );
                            const nextDate = new Date( eventDate )
                            const startDate = eventDate.format('YYYY-MM-DD')
                            const endDate = moment( nextDate.setMonth( nextDate.getMonth() + 6 ) ).format('YYYY-MM-DD')
                            
                            /**Yellow */
                            other.push({
                                grant_doc_num: findData[0].grant_doc_num,
                                appno_doc_num: findData[0].grant_doc_num,
                                start: startDate, 
                                end: endDate,
                                event_code: event,
                                event_desc: event,
                                type: 'yellow'
                            })
                            /**Red */
                            let followingDay = new Date( endDate + ' 00:00:00' );
                            const redStartDate = moment( new Date(followingDay.setTime(followingDay.getTime() + 86400000)) ).format('YYYY-MM-DD')
                            const redEndDate = moment( new Date(redStartDate).setMonth( new Date(redStartDate).getMonth() + 6) ).format('YYYY-MM-DD')
                            /**SetDate + 1 not working */
                            if( event == 'M1551' || event == 'M2551' || event == 'M3551' ) {
                                eventAddedWithCode.push('M1551');
                                eventAddedWithCode.push('M2551');
                                eventAddedWithCode.push('M3551');
                            } else if( event == 'M1552' || event == 'M2552' || event == 'M3552' ) {
                                eventAddedWithCode.push('M1552');
                                eventAddedWithCode.push('M2552');
                                eventAddedWithCode.push('M3552');
                            } else if( event == 'M1553' || event == 'M2553' || event == 'M3553' ) {
                                eventAddedWithCode.push('M1553');
                                eventAddedWithCode.push('M2553');
                                eventAddedWithCode.push('M3553');
                            }
                            other.push({
                                grant_doc_num: findData[0].grant_doc_num,
                                appno_doc_num: findData[0].grant_doc_num,
                                start: redStartDate, 
                                end: redEndDate,
                                event_code: event,
                                event_desc: event,
                                type: 'red'
                            })
                        }
                    })
                    await Promise.all( eventPromise )
                }
            }

            res.status(200).json({main: findData, other});
        } else {
            res.status(402).send("Invalid application number.");
        }
    } catch(err){
        console.log(err);
        res.status(500).send("Internal server error.");
    }
});

/*
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
});*/
module.exports = route;