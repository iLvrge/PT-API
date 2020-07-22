const express = require("express");

const route = express.Router();

const moment = require('moment');

const connection = require("../../config/db.config");

const Timelines = require("../../model/application/Timelines");

const helpers = require("../../helpers/helper");

const authJWT = require("../../helpers/verifyJwtToken");

const clientDBConnection = require("../../helpers/clientDBConnection");


route.get("/standalone/:groupId", [authJWT.addToken, clientDBConnection.connect], async(req, res, next) => {
    try{        
        const organisationData = await helpers.findOrganisationbyID(req.orgId);
        //console.log(0);
        if(organisationData != null && organisationData.organisation_id > 0 && typeof req.connection_db != "undefined" && req.connection_db != null){
            
            /*Assignment organization as assignee i.e purchase, invented, name change, release*/
            let searchData = {}, className="";
            const groupID = req.params.groupId;	
            if(groupID == 0) {
                searchData = {convey_type: ['assignment', 'employee'], employer_assign: 1, organisation_id: req.orgId};
                className = "red";
            } else if (groupID == 1) {
                searchData = {convey_type: ['assignment', 'merger' ], employer_assign: 0, organisation_id: req.orgId};
                className = "blue";
            } else if (groupID == 2) {
                searchData = {convey_type: ['security', 'release' ], employer_assign: 0, organisation_id: req.orgId};
                className = "yellow";
            } else if (groupID == 3) {
                searchData = {convey_type: ['namechg', 'govern', 'other', 'missing', 'correct' ], employer_assign: 0, organisation_id: req.orgId};
                className = "green";
            }
            const todaysDate = new Date(), startDate = moment(todaysDate).subtract(1, 'year').format('YYYY'), endDate = moment(todaysDate).format('YYYY');

            searchData.start = startDate;
            searchData.end = endDate;
            searchData.recordLimit = 5000;

            let customQuery = 'SELECT t.rf_id as id, SUBSTRING_INDEX(CASE WHEN r.representative_name <> null THEN r.representative_name ELSE aaa.name END, " ", 1)  as content, t.convey_ty, t.exec_dt as start FROM timeline as t INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = t.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE organisation_id = :organisation_id AND convey_ty IN (:convey_type) AND employer_assign = :employer_assign GROUP BY rf_id  ORDER BY t.exec_dt DESC LIMIT :recordLimit' ;

            
            let getAllTransactionData = await connection.application.query(customQuery,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: searchData,
            });


            /*
            let uniqueRFIDS = [],  getAllData = [];
            
            if(getAllTransactionData.length > 0) {
                getAllTransactionData.map(t => uniqueRFIDS.push(t.id));

                let queryFindAssignorAndAssignee = "SELECT t.rf_id as id, CASE WHEN r.representative_name <> null THEN r.representative_name ELSE aaa.name END as name, type FROM timeline as t INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = t.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE rf_id IN (:rfIDs)";

                getAllData = await connection.application.query(queryFindAssignorAndAssignee,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    logging: console.log,
                    replacements: {rfIDs: uniqueRFIDS},
                });
            }*/

            res.status(200).json({
                items: getAllTransactionData,
                className: className,
            });    
        } else {
            res.status(400).send("Bad Inputs");
        }
    } catch ( err ) {
        console.log("Timeline:"+err);
        res.status(500).send("error");
    }
});

route.get("/standalone/filter/:groupId/:startDate/:endDate/:scroll", [authJWT.addToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        let startDate, endDate, mainStartDate = req.params.startDate, mainEndDate = req.params.endDate, scroll = req.params.scroll ? req.params.scroll : 'left';
        const organisationData = await helpers.findOrganisationbyID(req.orgId);
        //console.log(2);
        let limitRows = 10000;
        if(organisationData != null && organisationData.organisation_id > 0 && typeof req.connection_db != "undefined" && req.connection_db != null) {
           
            const DATE_FORMAT = 'YYYY-MM-DD';
            /** Add 12 months to end date and substract 12 months to end date */
            startDate = moment(new Date(mainStartDate)).subtract(12, 'months').format(DATE_FORMAT);
            endDate = moment(new Date(mainEndDate)).add(12, 'months').format(DATE_FORMAT);

            let searchData = {}, className = "";
            const groupID = req.params.groupId;	
            if(groupID == 0) {
                searchData = {convey_type: ['assignment', 'employee'], employer_assign: 1, organisation_id: req.orgId, startDate: startDate, endDate: endDate };
                className = "red";
            } else if (groupID == 1) {
                searchData = {convey_type: ['assignment', 'merger' ], employer_assign: 0, organisation_id: req.orgId, startDate: startDate, endDate: endDate};
                className = "blue";
            } else if (groupID == 2) {
                searchData = {convey_type: ['security', 'release' ], employer_assign: 0, organisation_id: req.orgId, startDate: startDate, endDate: endDate};
                className = "yellow";
            } else if (groupID == 3) {
                searchData = {convey_type: ['namechg', 'govern', 'other', 'missing', 'correct' ], employer_assign: 0, organisation_id: req.orgId, startDate: startDate, endDate: endDate};
                className = "green";
            }

            let customQuery = 'SELECT count(t.rf_id) as counter FROM timeline as t INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = t.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE organisation_id = :organisation_id AND convey_ty IN (:convey_type) AND employer_assign = :employer_assign AND exec_dt BETWEEN :startDate AND :endDate  GROUP BY rf_id' ;

            let getAssignmentCountData = await connection.application.query(customQuery,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: searchData,
                plain:true
            });
            let getAllTransactionData = [], items = [],  uniqueRFIDS = [], getAssignmentData = [], getAssigneeData = [], getRFAssignorsData = [], getRFAssigneeData = [], getMinMaxDate = {min_date: "", max_date:""};

            if(getAssignmentCountData != null && getAssignmentCountData.counter > 0) {
                customAllQuery = 'SELECT type, CONCAT(t.assignor_and_assignee_id, t.rf_id) as id, t.rf_id, aaa.name as raw_name, r.representative_name as normalize_name, t.convey_ty, t.employer_assign, t.exec_dt FROM timeline as t INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = t.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE organisation_id = :organisation_id AND convey_ty IN (:convey_type) AND employer_assign = :employer_assign AND exec_dt BETWEEN :startDate AND :endDate  ORDER BY t.exec_dt DESC' ;

                if(getAssignmentCountData.counter <= limitRows) {
                    getAllTransactionData = await connection.application.query(customAllQuery,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        logging: console.log,
                        replacements: searchData,
                    });
                } else {
                    startDate = moment(new Date(mainStartDate)).subtract(6, 'months').format(DATE_FORMAT);
                    endDate = moment(new Date(mainEndDate)).add(6, 'months').format(DATE_FORMAT);
                    searchData.startDate = startDate;
                    searchData.endDate = endDate;
                    getAssignmentCountData = await connection.application.query(customQuery,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        logging: console.log,
                        replacements: searchData,
                        plain:true
                    });
                    if(getAssignmentCountData != null && getAssignmentCountData.counter > 0) {
                        if(getAssignmentCountData.counter <= limitRows) {
                            getAllTransactionData = await connection.application.query(customAllQuery,{
                                type: connection.Sequelize.QueryTypes.SELECT,
                                raw: true,
                                logging: console.log,
                                replacements: searchData,
                            });
                        } else {
                            /*Check Scroll left or right */
                            if(scroll == 'right') {
                                /**Scroll Right i.e Start Date - 1month */
                                endDate = moment(new Date(endDate)).add(12, 'months').format(DATE_FORMAT);
                                for(i=1;i<24;i++){
                                    startDate = moment(new Date(mainStartDate)).subtract(i, 'months').format(DATE_FORMAT);
                                    searchData.startDate = startDate;
                                    searchData.endDate = endDate;
                                    getAssignmentCountData = await connection.application.query(customQuery,{
                                        type: connection.Sequelize.QueryTypes.SELECT,
                                        raw: true,
                                        logging: console.log,
                                        replacements: searchData,
                                        plain:true
                                    });

                                    if(getAssignmentCountData != null && getAssignmentCountData.counter > 0 && getAssignmentCountData.counter <= limitRows) {                                        
                                        getAllTransactionData = await connection.application.query(customAllQuery,{
                                            type: connection.Sequelize.QueryTypes.SELECT,
                                            raw: true,
                                            logging: console.log,
                                            replacements: searchData,
                                        });

                                        return false;
                                    }
                                }
                            } else if(scroll == 'left'){
                                /**Scroll Left i.e End Date - 1month */
                                startDate = moment(new Date(startDate)).add(12, 'months').format(DATE_FORMAT);
                                for(i=1;i<24;i++){
                                    endDate = moment(new Date(mainEndDate)).subtract(i, 'months').format(DATE_FORMAT);
                                    searchData.startDate = startDate;
                                    searchData.endDate = endDate;
                                    getAssignmentCountData = await connection.application.query(customQuery,{
                                        type: connection.Sequelize.QueryTypes.SELECT,
                                        raw: true,
                                        logging: console.log,
                                        replacements: searchData,
                                        plain:true
                                    });
                                    if(getAssignmentCountData != null && getAssignmentCountData.counter > 0 && getAssignmentCountData.counter <= limitRows) {                                        
                                        getAllTransactionData = await connection.application.query(customAllQuery,{
                                            type: connection.Sequelize.QueryTypes.SELECT,
                                            raw: true,
                                            logging: console.log,
                                            replacements: searchData,
                                        });

                                        return false;
                                    }
                                }
                            }
                        }
                    }
                }

                if(getAllTransactionData.length > 0) {
                    getAllTransactionData.map( assignment => {
                        if(!uniqueRFIDS.includes(parseInt(assignment.rf_id))){
                            uniqueRFIDS.push(parseInt(assignment.rf_id));
                            assignment.type == 'Assignor' ? getAssignmentData.push(assignment) : getAssigneeData.push(assignment);
                            items.push(assignment);
                            let date = assignment.exec_dt != "" ? new Date(assignment.exec_dt).getTime() : '';
                            getMinMaxDate.max_date = getMinMaxDate.max_date == '' ? date : (date > 0 && date > getMinMaxDate.max_date) ? date : getMinMaxDate.max_date;
                            getMinMaxDate.min_date = getMinMaxDate.min_date == '' ? date : (date > 0 && date < getMinMaxDate.min_date) ? date : getMinMaxDate.min_date;
                        }
                        assignment.type == 'Assignor' ? getRFAssignorsData.push(assignment) : getRFAssigneeData.push(assignment);
                    });
                }                
            }
            res.status(200).json({
                items: items,
                assignors: getRFAssignorsData,
                assignees: getRFAssigneeData,
                min_date: getMinMaxDate.min_date,
                max_date: getMinMaxDate.max_date,
                className: className
            });
        } else {
            res.status(400).send("Bad Inputs");
        }
    } catch ( err ) {
        console.log("Timeline Filter:"+err);
        res.status(500).send("error");
    }
});

route.get("/:groupId", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{        
        const organisationData = await helpers.findOrganisationbyID(req.orgId);
        //console.log(0);
        if(organisationData != null && organisationData.organisation_id > 0 && typeof req.connection_db != "undefined" && req.connection_db != null){
            
            let searchData = {}, className="";
            const groupID = req.params.groupId;	
            if(groupID == 0) {
                searchData = {convey_type: ['assignment', 'employee'], employer_assign: 1, organisation_id: req.orgId};
                className = "red";
            } else if (groupID == 1) {
                searchData = {convey_type: ['assignment', 'merger' ], employer_assign: 0, organisation_id: req.orgId};
                className = "blue";
            } else if (groupID == 2) {
                searchData = {convey_type: ['security', 'release' ], employer_assign: 0, organisation_id: req.orgId};
                className = "yellow";
            } else if (groupID == 3) {
                searchData = {convey_type: ['namechg', 'govern', 'other', 'missing', 'correct' ], employer_assign: 0, organisation_id: req.orgId};
                className = "green";
            }
            /*const todaysDate = new Date(), startDate = moment(todaysDate).subtract(1, 'year').format('YYYY'), endDate = moment(todaysDate).format('YYYY');

            searchData.start = startDate;
            searchData.end = endDate;*/
            searchData.recordLimit = 1000;

            let customQuery = 'SELECT t.rf_id as id, SUBSTRING_INDEX(CASE WHEN r.representative_name <> null THEN r.representative_name ELSE aaa.name END, " ", 1)  as content, t.convey_ty, t.exec_dt as start, "Point" as type FROM timeline as t INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = t.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE organisation_id = :organisation_id AND convey_ty IN (:convey_type) AND employer_assign = :employer_assign GROUP BY rf_id  ORDER BY t.exec_dt DESC LIMIT :recordLimit' ;

            
            let getAllTransactionData = await connection.application.query(customQuery,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: searchData,
            }); 

            res.status(200).json({
                items: getAllTransactionData,
                className: className,
            });    
        } else {
            res.status(400).send("Bad Inputs");
        }
    } catch ( err ) {
        console.log("Timeline:"+err);
        res.status(500).send("error");
    }
});

route.get("/:organisation/:name/:depth/:groupId", [authJWT.verifyToken], async(req, res, next) => {
    try{
        const organisationData = await helpers.findOrganisationbyID(req.orgId);

        if(organisationData != null && organisationData.organisation_id > 0){

            let organisation = req.params.organisation, name = req.params.name, depth = (req.params.depth != undefined && req.params.depth != null && req.params.depth != '') ? parseInt(req.params.depth) : 0, groupID = req.params.groupId;

            let customQueryAssignorST, customQueryAssigneeST, customQueryAssignorList, customQueryAssigneeList, className = 'red';
            let extendString = "";
            switch(parseInt(groupID)) {
                case 1:
                    extendString = " convey_ty IN ('assignment', 'merger') AND employer_assign = 0 ";
                    break;
                case 2:
                    extendString = " convey_ty IN ('security', 'release') AND employer_assign = 0 ";
                    break;
                case 3:
                    extendString = " convey_ty IN ('namechg', 'govern', 'other', 'missing', 'correct') AND employer_assign = 0 ";
                    break;                    
                case 0:
                default:        
                    extendString = " convey_ty IN ('assignment', 'employee') AND employer_assign = 1 ";            
                    break;
            }

            if( depth === 3 ) {
                /*Asset Number*/
                let patentNumber = await connection.application.query("SELECT rf_id FROM documentid WHERE grant_doc_num = :name LIMIT 1",{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    logging: console.log,
                    replacements: { name: name },
                    plain:true
                  }
                );



                customQueryAssignorST = 'SELECT concat(aa.assignor_and_assignee_id, or.rf_id) as id, or.rf_id, aa.name as raw_name, r1.representative_name as normalize_name, acc.convey_ty, acc.employer_assign, or.exec_dt FROM assignor as `or` INNER JOIN (SELECT ee.rf_id from assignee as `ee` INNER JOIN (SELECT d.rf_id from documentid as d WHERE ';

                if(patentNumber != null && patentNumber.rf_id > 0) {
                    customQueryAssignorST += ' ( d.grant_doc_num = :name ) ';
                } else {
                    customQueryAssignorST += ' ( d.appno_doc_num = :name ) ';
                }
                customQueryAssignorST += ' ) as temp on temp.rf_id = ee.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = `ee`.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE ( aaa.name = :organisation_name OR r.representative_name = :organisation_name )) as t ON t.rf_id = or.rf_id INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = `or`.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id INNER JOIN assignment_conveyance as acc ON acc.rf_id = or.rf_id WHERE ';
                
                customQueryAssignorST += extendString;
                
                customQueryAssignorST += ' GROUP BY or.rf_id ORDER BY or.exec_dt ASC ';                
                
                
                customQueryAssigneeST = 'SELECT concat(aa.assignor_and_assignee_id,ee.rf_id) as id, ee.rf_id, aa.name as raw_name, r1.representative_name as normalize_name, acc.convey_ty, acc.employer_assign, (SELECT ap.exec_dt FROM assignor as ap WHERE ap.rf_id = ee.rf_id ORDER BY ap.exec_dt ASC LIMIT 1) as exec_dt from assignee as `ee`  INNER JOIN (SELECT or.rf_id from assignor as `or` INNER JOIN (SELECT d.rf_id from documentid as d WHERE ';
                
                if(patentNumber != null && patentNumber.rf_id > 0) {
                    customQueryAssigneeST += ' ( d.grant_doc_num = :name ) ';
                } else {
                    customQueryAssigneeST += ' ( d.appno_doc_num = :name ) ';
                }
                
                customQueryAssigneeST += '  ) as temp on temp.rf_id = or.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = `or`.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE ( aaa.name = :organisation_name  OR r.representative_name = :organisation_name )) as t ON t.rf_id = ee.rf_id INNER JOIN assignment_conveyance as acc ON acc.rf_id = ee.rf_id INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = `ee`.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id WHERE ';

                customQueryAssigneeST += extendString;
                
                customQueryAssigneeST += ' GROUP BY ee.rf_id ORDER BY exec_dt ASC ';   
                
                customQueryAssignorList = "SELECT or.rf_id, aa.name as raw_name, r1.representative_name as normalize_name FROM assignor as `or` INNER JOIN (SELECT ee.rf_id from assignee as `ee` INNER JOIN (SELECT d.rf_id from documentid as d WHERE ";
                
                if(patentNumber != null && patentNumber.rf_id > 0) {
                    customQueryAssignorList += ' ( d.grant_doc_num = :name ) ';
                } else {
                    customQueryAssignorList += ' ( d.appno_doc_num = :name ) ';
                }

                customQueryAssignorList += ' ) as temp on temp.rf_id = ee.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = `ee`.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE ( aaa.name = :organisation_name OR r.representative_name = :organisation_name )) as t ON t.rf_id = or.rf_id INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = `or`.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id INNER JOIN assignment_conveyance as acc ON acc.rf_id = or.rf_id WHERE ';
                
                customQueryAssignorList += extendString;
                
                customQueryAssignorList += '  ORDER BY or.exec_dt ASC ';
                
                customQueryAssigneeList = "SELECT ee.rf_id, aa.name as raw_name, r1.representative_name as normalize_name from assignee as `ee`  INNER JOIN (SELECT or.rf_id from assignor as `or` INNER JOIN (SELECT d.rf_id from documentid as d WHERE ";
                
                if(patentNumber != null && patentNumber.rf_id > 0) {
                    customQueryAssigneeList += " ( d.grant_doc_num = :name ) ";
                } else {
                    customQueryAssigneeList += " ( d.appno_doc_num = :name ) ";
                }
                
                customQueryAssigneeList += '  ) as temp on temp.rf_id = or.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = `or`.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE ( aaa.name = :organisation_name  OR r.representative_name = :organisation_name )) as t ON t.rf_id = ee.rf_id INNER JOIN assignment_conveyance as acc ON acc.rf_id = ee.rf_id INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = `ee`.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id WHERE ';
                
                customQueryAssigneeList += extendString;
                                
                className = 'green';                
            } else if( depth === 2 ){ 
                /*RF ID*/
                console.log('Transactions...')
                customQueryAssignorST = 'SELECT concat(aaa.assignor_and_assignee_id,or.rf_id) as id, or.rf_id, aaa.name as raw_name, r.representative_name as normalize_name, acc.convey_ty, acc.employer_assign, or.exec_dt from assignor as `or` INNER JOIN assignment_conveyance as acc ON acc.rf_id = or.rf_id INNER JOIN documentid as d ON d.rf_id = acc.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = `or`.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE date_format(d.appno_date,"%Y") > 1999 AND or.rf_id = :name AND ( aaa.name <> :organisation_name OR r.representative_name <> :organisation_name ) AND ';
                
                customQueryAssignorST += extendString +' GROUP BY or.rf_id';
							
                customQueryAssigneeST = 'SELECT concat(aaa.assignor_and_assignee_id,ee.rf_id) as id, ee.rf_id, aaa.name as raw_name, r.representative_name as normalize_name, acc.convey_ty, acc.employer_assign, (SELECT ap.exec_dt FROM assignor as ap WHERE ap.rf_id = ee.rf_id ORDER BY ap.exec_dt ASC LIMIT 1) as exec_dt FROM assignee as ee INNER JOIN assignment_conveyance as acc ON acc.rf_id = ee.rf_id INNER JOIN documentid as d ON d.rf_id = acc.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = `ee`.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE date_format(d.appno_date,"%Y") > 1999 AND ee.rf_id = :name AND ( aaa.name <> :organisation_name OR r.representative_name <> :organisation_name ) AND ';
                
                customQueryAssigneeST += extendString +' GROUP BY ee.rf_id';
                
                customQueryAssignorList = 'SELECT or.rf_id, aaa.name as raw_name, r.representative_name as normalize_name from assignor as `or` INNER JOIN assignment_conveyance as acc ON acc.rf_id = or.rf_id INNER JOIN documentid as d ON d.rf_id = acc.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = `or`.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE date_format(d.appno_date,"%Y") > 1999 AND or.rf_id = :name AND ( aaa.name <> :organisation_name OR r.representative_name <> :organisation_name ) AND ';

                customQueryAssignorList += extendString +' ORDER BY or.exec_dt ASC';
                
                customQueryAssigneeList = 'SELECT concat(aaa.assignor_and_assignee_id,ee.rf_id) as id, ee.rf_id, aaa.name as raw_name, r.representative_name as normalize_name, acc.convey_ty, acc.employer_assign, (SELECT ap.exec_dt FROM assignor as ap WHERE ap.rf_id = ee.rf_id ORDER BY ap.exec_dt ASC LIMIT 1) as exec_dt FROM assignee as ee INNER JOIN assignment_conveyance as acc ON acc.rf_id = ee.rf_id INNER JOIN documentid as d ON d.rf_id = acc.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = `ee`.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE date_format(d.appno_date,"%Y") > 1999 AND ee.rf_id = :name AND ( aaa.name <> :organisation_name OR r.representative_name <> :organisation_name ) AND ';

                customQueryAssigneeList += extendString +' ORDER BY exec_dt ASC';
                
                className = 'orange';
            } else if ( depth === 1 ) {
                /*Customer*/
                console.log("Parties......");
                customQueryAssignorST = 'SELECT concat(aaa.assignor_and_assignee_id,ac.rf_id) as id, ac.rf_id, aaa.name as raw_name, r.representative_name as normalize_name, ass.convey_ty, ass.employer_assign, ac.exec_dt FROM assignor as ac INNER JOIN assignment_conveyance as ass ON ass.rf_id = ac.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id INNER JOIN (SELECT a.rf_id FROM assignment as a INNER JOIN documentid as d ON d.rf_id = a.rf_id INNER JOIN assignee as acc ON acc.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = acc.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id  WHERE date_format(d.appno_date,"%Y") > 1999 AND (acc.ee_name = :organisation_name OR r1.representative_name = :organisation_name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id WHERE (ac.or_name = :name OR r.representative_name = :name) AND ';

                customQueryAssignorST += extendString +' GROUP BY ac.rf_id ORDER BY ac.exec_dt ASC';
                
                customQueryAssigneeST = 'SELECT concat(aaa.assignor_and_assignee_id,ac.rf_id) as id, ac.rf_id, aaa.name as raw_name, r.representative_name as normalize_name, ass.convey_ty, ass.employer_assign, (SELECT date_format(ap.exec_dt, "%m-%d-%Y") FROM assignor as ap WHERE ap.rf_id = ac.rf_id ORDER BY ap.exec_dt ASC LIMIT 1) as exec_dt FROM assignee as ac INNER JOIN assignment_conveyance as ass ON ass.rf_id = ac.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id INNER JOIN (SELECT a.rf_id FROM assignment as a INNER JOIN documentid as d ON d.rf_id = a.rf_id INNER JOIN assignment_conveyance as ass ON ass.rf_id = a.rf_id  INNER JOIN assignor as acc ON acc.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = acc.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id WHERE date_format(d.appno_date,"%Y") > 1999 AND (acc.or_name = :organisation_name OR r1.representative_name = :organisation_name) AND  ';

                customQueryAssigneeST += extendString +' GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id WHERE (ac.ee_name = :name OR r.representative_name = :name) GROUP BY ac.rf_id ORDER BY exec_dt ASC';
                
                customQueryAssignorList = 'SELECT ass.rf_id, a_a.name as raw_name, r2.representative_name as normalize_name FROM assignor as ass INNER JOIN assignor_and_assignee as a_a ON a_a.assignor_and_assignee_id = ass.assignor_and_assignee_id LEFT JOIN representative as r2 ON r2.representative_id = a_a.representative_id INNER JOIN (SELECT ac.rf_id FROM assignor as ac INNER JOIN assignment_conveyance as ass ON ass.rf_id = ac.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id INNER JOIN (SELECT a.rf_id FROM assignment as a INNER JOIN documentid as d ON d.rf_id = a.rf_id INNER JOIN assignment_conveyance as ass ON ass.rf_id = a.rf_id INNER JOIN assignee as acc ON acc.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = acc.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id WHERE date_format(d.appno_date,"%Y") > 1999 AND (aa.name = :organisation_name OR r1.representative_name = :organisation_name) AND ';

                customQueryAssignorList += extendString +'  GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id WHERE (aaa.name = :name OR r.representative_name = :name) GROUP BY ac.rf_id ) as p ON p.rf_id = ass.rf_id ORDER BY ass.rf_id ASC';
                
                customQueryAssigneeList = 'SELECT ass.rf_id, a_a.name as raw_name, r2.representative_name as normalize_name FROM assignee as ass INNER JOIN assignor_and_assignee as a_a ON a_a.assignor_and_assignee_id = ass.assignor_and_assignee_id LEFT JOIN representative as r2 ON r2.representative_id = a_a.representative_id INNER JOIN (SELECT ac.rf_id FROM assignee as ac INNER JOIN assignment_conveyance as ass ON ass.rf_id = ac.rf_id INNER JOIN (SELECT a.rf_id FROM assignment as a INNER JOIN documentid as d ON d.rf_id = a.rf_id INNER JOIN assignment_conveyance as ass ON ass.rf_id = a.rf_id INNER JOIN assignor as acc ON acc.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = acc.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE date_format(d.appno_date,"%Y") > 1999 AND (aaa.name = :organisation_name OR r.representative_name = :organisation_name) AND  ';	

                customQueryAssigneeList += extendString +'  GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id WHERE (aa.name = :name OR r1.representative_name = :name) GROUP BY ac.rf_id)  as p ON p.rf_id = ass.rf_id ORDER BY ass.rf_id ASC';

                className = 'blue';                
            } else {
                console.log("Organisation......");
                /*Organisation*/
                customQueryAssignorST = 'SELECT concat(aa.assignor_and_assignee_id,ac.rf_id) as id, ac.rf_id, aa.name as raw_name, r1.representative_name as normalize_name, acc.convey_ty, acc.employer_assign, ac.exec_dt FROM assignor as ac INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id INNER JOIN (SELECT ee.rf_id FROM assignee as ee INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE aaa.name = :name or r.representative_name = :name) as temp ON temp.rf_id = ac.rf_id INNER JOIN documentid as d ON d.rf_id = ac.rf_id WHERE date_format(d.appno_date,"%Y") > 1999 AND ';

                customQueryAssignorST += extendString +'   GROUP BY ac.rf_id';
                
                customQueryAssigneeST = 'SELECT concat(aa.assignor_and_assignee_id,ac.rf_id) as id, ac.rf_id, aa.name as raw_name, r1.representative_name as normalize_name, acc.convey_ty, acc.employer_assign, (SELECT ap.exec_dt FROM assignor as ap WHERE ap.rf_id = ac.rf_id ORDER BY ap.exec_dt ASC LIMIT 1) as exec_dt FROM assignee as ac INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id  INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id INNER JOIN (SELECT or.rf_id FROM assignor as `or` INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = or.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id  WHERE aaa.name = :name or r.representative_name = :name) as temp ON temp.rf_id = ac.rf_id  INNER JOIN documentid as d ON d.rf_id = ac.rf_id WHERE date_format(d.appno_date,"%Y") > 1999 AND ';  
                
                customQueryAssigneeST += extendString +'   GROUP BY ac.rf_id';
                
                customQueryAssignorList = 'SELECT ass.rf_id, aa.name as raw_name, r1.representative_name as normalize_name FROM assignor as ass INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ass.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id INNER JOIN (SELECT ac.rf_id FROM assignee as a INNER JOIN assignor as ac ON ac.rf_id = a.rf_id INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = a.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id INNER JOIN documentid as d ON d.rf_id = ac.rf_id WHERE date_format(d.appno_date,"%Y") > 1999 AND (aaa.name = :name or r.representative_name = :name) AND ';  

                customQueryAssignorList += extendString +'   GROUP BY rf_id) as p ON p.rf_id = ass.rf_id ORDER BY ass.rf_id ASC';
                
                customQueryAssigneeList = `SELECT ass.rf_id, aa.name as raw_name, r1.representative_name as normalize_name FROM assignee as ass INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ass.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id INNER JOIN (SELECT ac.rf_id FROM assignor as a INNER JOIN assignee as ac ON ac.rf_id = a.rf_id INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = a.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id INNER JOIN documentid as d ON d.rf_id = ac.rf_id WHERE date_format(d.appno_date,"%Y") > 1999 AND (aaa.name = :name or r.representative_name = :name) AND `;

                customQueryAssigneeList += extendString +'   GROUP BY rf_id) as p ON p.rf_id = ass.rf_id ORDER BY ass.rf_id ASC';
            }
            /*Assignment organization as assignee i.e purchase, invented, name change, release*/
						
            let getAssignmentData = await connection.application.query(customQueryAssignorST,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: { name: name, organisation_name: organisation },
                }
            );							
        
        /*Assignment organization as assignor i.e sale, security*/
        
        let getAssigneeData = await connection.application.query(customQueryAssigneeST,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: { name: name, organisation_name: organisation },
                }
            );					
        
        
        let getRFAssignorsData = await connection.application.query(customQueryAssignorList,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: { name: name, organisation_name: organisation },
                }
            );
        
        
        let getRFAssigneeData = await connection.application.query(customQueryAssigneeList,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: { name: name, organisation_name: organisation },
                }
            );
            
        res.status(200).json({
            type: 9,
            assignment_assignors: getAssignmentData,
            assignment_assignee: getAssigneeData,
            assignors: getRFAssignorsData,
            assignees: getRFAssigneeData,
            className: className
        });
        } else {
            res.status(400).send("Bad Inputs");
        }
    } catch ( err ) {
        console.log("Timeline:"+err);
        res.status(500).send("error");
    }
});

route.get("/filter/search/:groupId/:startDate/:endDate/:scroll", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        let startDate, endDate, mainStartDate = req.params.startDate, mainEndDate = req.params.endDate, scroll = req.params.scroll;
        const organisationData = await helpers.findOrganisationbyID(req.orgId);
        //console.log(2);
        let limitRows = 10000;
        if(organisationData != null && organisationData.organisation_id > 0 && typeof req.connection_db != "undefined" && req.connection_db != null) {
           /* const allCompaniesList = await helpers.getAllCompaniesList(req.connection_db);

            const getNames = [];
            allCompaniesList.map( c => getNames.push(c.original_name));*/

            console.log(getNames);
            const DATE_FORMAT = 'YYYY-MM-DD';
            /** Add 12 months to end date and substract 12 months to end date */
            startDate = moment(new Date(mainStartDate)).subtract(12, 'months').format(DATE_FORMAT);
            endDate = moment(new Date(mainEndDate)).add(12, 'months').format(DATE_FORMAT);


            let searchData = {}, className = "";
            const groupID = req.params.groupId;	
            if(groupID == 0) {
                searchData = {convey_type: ['assignment', 'employee'], employer_assign: 1, organisation_id: req.orgId, startDate: startDate, endDate: endDate };
                className = "red";
            } else if (groupID == 1) {
                searchData = {convey_type: ['assignment', 'merger' ], employer_assign: 0, organisation_id: req.orgId, startDate: startDate, endDate: endDate};
                className = "blue";
            } else if (groupID == 2) {
                searchData = {convey_type: ['security', 'release' ], employer_assign: 0, organisation_id: req.orgId, startDate: startDate, endDate: endDate};
                className = "yellow";
            } else if (groupID == 3) {
                searchData = {convey_type: ['namechg', 'govern', 'other', 'missing', 'correct' ], employer_assign: 0, organisation_id: req.orgId, startDate: startDate, endDate: endDate};
                className = "green";
            }


            let customQuery = 'SELECT count(t.rf_id) as counter FROM timeline as t INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = t.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE organisation_id = :organisation_id AND convey_ty IN (:convey_type) AND employer_assign = :employer_assign AND exec_dt BETWEEN :startDate AND :endDate  GROUP BY rf_id' ;

            /*Assignment organization as assignee i.e purchase, invented, name change, release*/
           /* let customQuery = 'SELECT count(ac.rf_id) as counter FROM assignor as ac INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id INNER JOIN (SELECT ee.rf_id FROM assignee as ee INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE (aaa.name IN (:name) or r.representative_name IN (:name))) as temp ON temp.rf_id = ac.rf_id WHERE ac.exec_dt BETWEEN :startDate AND :endDate GROUP BY ac.rf_id ORDER BY ac.exec_dt DESC';*/


            let getAssignmentCountData = await connection.application.query(customQuery,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: searchData,
                plain:true
            });
            let getAllTransactionData = [],  uniqueRFIDS = [], getAssignmentData = [], getAssigneeData = [], getRFAssignorsData = [], getRFAssigneeData = [], getMinMaxDate = {min_date: "", max_date:""};

            if(getAssignmentCountData != null && getAssignmentCountData.counter > 0) {
                customAllQuery = 'SELECT t.rf_id as id, SUBSTRING_INDEX(CASE WHEN r.representative_name <> null THEN r.representative_name ELSE aaa.name END, " ", 1)  as content, t.convey_ty, t.exec_dt as start FROM timeline as t INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = t.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE organisation_id = :organisation_id AND convey_ty IN (:convey_type) AND employer_assign = :employer_assign AND exec_dt BETWEEN :startDate AND :endDate  ORDER BY t.exec_dt DESC' ;

                if(getAssignmentCountData.counter <= limitRows) {
                    getAllTransactionData = await connection.application.query(customAllQuery,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        logging: console.log,
                        replacements: searchData,
                    });
                } else {
                    startDate = moment(new Date(mainStartDate)).subtract(6, 'months').format(DATE_FORMAT);
                    endDate = moment(new Date(mainEndDate)).add(6, 'months').format(DATE_FORMAT);
                    searchData.startDate = startDate;
                    searchData.endDate = endDate;
                    getAssignmentCountData = await connection.application.query(customQuery,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        logging: console.log,
                        replacements: searchData,
                        plain:true
                    });
                    if(getAssignmentCountData != null && getAssignmentCountData.counter > 0) {
                        if(getAssignmentCountData.counter <= limitRows) {
                            getAllTransactionData = await connection.application.query(customAllQuery,{
                                type: connection.Sequelize.QueryTypes.SELECT,
                                raw: true,
                                logging: console.log,
                                replacements: searchData,
                            });
                        } else {
                            /*Check Scroll left or right */
                            if(scroll == 1) {
                                /**Scroll Right i.e Start Date - 1month */
                                endDate = moment(new Date(endDate)).add(12, 'months').format(DATE_FORMAT);
                                for(i=1;i<24;i++){
                                    startDate = moment(new Date(mainStartDate)).subtract(i, 'months').format(DATE_FORMAT);
                                    searchData.startDate = startDate;
                                    searchData.endDate = endDate;
                                    getAssignmentCountData = await connection.application.query(customQuery,{
                                        type: connection.Sequelize.QueryTypes.SELECT,
                                        raw: true,
                                        logging: console.log,
                                        replacements: searchData,
                                        plain:true
                                    });

                                    if(getAssignmentCountData != null && getAssignmentCountData.counter > 0 && getAssignmentCountData.counter <= limitRows) {                                        
                                        getAllTransactionData = await connection.application.query(customAllQuery,{
                                            type: connection.Sequelize.QueryTypes.SELECT,
                                            raw: true,
                                            logging: console.log,
                                            replacements: searchData,
                                        });

                                        return false;
                                    }
                                }
                            } else {
                                /**Scroll Left i.e End Date - 1month */
                                startDate = moment(new Date(startDate)).add(12, 'months').format(DATE_FORMAT);
                                for(i=1;i<24;i++){
                                    endDate = moment(new Date(mainEndDate)).subtract(i, 'months').format(DATE_FORMAT);
                                    searchData.startDate = startDate;
                                    searchData.endDate = endDate;
                                    getAssignmentCountData = await connection.application.query(customQuery,{
                                        type: connection.Sequelize.QueryTypes.SELECT,
                                        raw: true,
                                        logging: console.log,
                                        replacements: searchData,
                                        plain:true
                                    });
                                    if(getAssignmentCountData != null && getAssignmentCountData.counter > 0 && getAssignmentCountData.counter <= limitRows) {                                        
                                        getAllTransactionData = await connection.application.query(customAllQuery,{
                                            type: connection.Sequelize.QueryTypes.SELECT,
                                            raw: true,
                                            logging: console.log,
                                            replacements: searchData,
                                        });

                                        return false;
                                    }
                                }
                            }
                        }
                    }
                }

                if(getAllTransactionData.length > 0) {
                    getAllTransactionData.map( assignment => {
                        if(!uniqueRFIDS.includes(parseInt(assignment.rf_id))){
                            uniqueRFIDS.push(parseInt(assignment.rf_id));
                            assignment.type == 'Assignor' ? getAssignmentData.push(assignment) : getAssigneeData.push(assignment);
                            let date = assignment.exec_dt != "" ? new Date(assignment.exec_dt).getTime() : '';
                            getMinMaxDate.max_date = getMinMaxDate.max_date == '' ? date : (date > 0 && date > getMinMaxDate.max_date) ? date : getMinMaxDate.max_date;
                            getMinMaxDate.min_date = getMinMaxDate.min_date == '' ? date : (date > 0 && date < getMinMaxDate.min_date) ? date : getMinMaxDate.min_date;
                        }
                        assignment.type == 'Assignor' ? getRFAssignorsData.push(assignment) : getRFAssigneeData.push(assignment);
                    });
                }                
            }
            res.status(200).json({
                type: 9,
                assignment_assignors: getAssignmentData,
                assignment_assignee: getAssigneeData,
                assignors: getRFAssignorsData,
                assignees: getRFAssigneeData,
                min_date: getMinMaxDate.min_date,
                max_date: getMinMaxDate.max_date,
                className: className,
                group: ["Employee", "Acquisition", "Security", "Other"]
            });
        } else {
            res.status(400).send("Bad Inputs");
        }
    } catch ( err ) {
        console.log("Timeline Filter:"+err);
        res.status(500).send("error");
    }
});


module.exports = route;