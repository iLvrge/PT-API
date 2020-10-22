const express = require("express");

const route = express.Router();

const moment = require('moment');

const connection = require("../../config/db.config");

const Timelines = require("../../model/application/Timelines");

const DocumentIds = require("../../model/application/DocumentIds");

const helpers = require("../../helpers/helper");

const authJWT = require("../../helpers/verifyJwtToken");

const clientDBConnection = require("../../helpers/clientDBConnection");


route.get("/", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    const from = req.query.from, to = req.query.to, companyList = req.query.companies, tabList = req.query.tabs; 
    let timelineList = [], limit = req.query.limit, offset = req.query.offset;
    try {                
        const organisationData = await helpers.findOrganisationbyID(req.orgId);
        //console.log(0);
        if(organisationData != null && organisationData.organisation_id > 0 && typeof req.connection_db != "undefined" && req.connection_db != null){
            
            const where = {organisation_id: req.orgId}, DATE_FORMAT = 'YYYY-MM-DD';
            if(from != undefined && to != undefined) {
                console.log(to);
                where.exec_dt = {[connection.Op.between]: [moment(new Date(from)).format(DATE_FORMAT), moment(new Date(to)).add(1, 'days').format(DATE_FORMAT)]}
            } else if(from != undefined) {
                where.exec_dt = {[connection.Op.gte]: moment(new Date(from)).format(DATE_FORMAT)}
            } else if(to != undefined) {
                where.exec_dt = {[connection.Op.lte]: moment(new Date(to)).add(1, 'days').format(DATE_FORMAT)}
            }
            if(companyList != undefined && companyList != '') {
                const companies = JSON.parse(companyList);
                where.representative_id = companies;
            }
            if(tabList != undefined && tabList != '') {
                const tabs = JSON.parse(tabList);
                where.tab = tabs;
            }

           const whereConstraint = {
                attributes:[['rf_id', 'id'], 'exec_dt', ['original_name', 'customerName'], ['tab', 'tab_id'], ['assets_count', 'totalAssets']],
                where: where,
            };

            if(limit != undefined && limit != null) {
                limit = limit > 0 ? parseInt(limit) : 100;
                offset = offset > 0 ? parseInt(offset) : 0;

                whereConstraint.limit = limit;
                whereConstraint.offset = offset;
            }

            whereConstraint.order = [['exec_dt', 'DESC']];
            timelineList = await Timelines.findAll(whereConstraint);
            // const result = await Timelines.findAll(whereConstraint);

            // if(result.length > 0) {
            //     const promises = result.map(async timeline => {
            //         /**
            //          * Get Count of all the Application number from all the rf_id from the parties collection table
            //          */
            //         const queryFindTotalAssets = "SELECT COUNT('appno_doc_num') as totalAssets FROM documentid WHERE rf_id = :rf_id";

            //         const findCounter =  await connection.application.query(queryFindTotalAssets,{
            //             type: connection.Sequelize.QueryTypes.SELECT,
            //             raw: true,
            //             logging: console.log,
            //             plain: true,
            //             replacements: { rf_id: timeline.get('id')},
            //           }
            //         );
            //         const timelineJSON = timeline.toJSON();
                    
            //         timelineJSON.totalAssets = 0; 
            //         if(findCounter != null && findCounter.totalAssets > 0) {                                
            //             timelineJSON.totalAssets = findCounter.totalAssets;                               
            //         }
            //         timelineList.push(timelineJSON);
            //         return findCounter;
            //     });
            //     await Promise.all(promises);
            // }
        }
        res.status(200).json(timelineList);
    } catch ( err ) {
        console.log("Timeline:"+err);
        res.status(500).send("Internal server error.");
    }
})





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

            let customQuery = 'SELECT t.rf_id as id, SUBSTRING_INDEX(CASE WHEN r.representative_name <> null THEN r.representative_name ELSE aaa.name END, " ", 1)  as content, "point" as type, t.exec_dt as start FROM timeline as t INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = t.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE organisation_id = :organisation_id AND convey_ty IN (:convey_type) AND employer_assign = :employer_assign GROUP BY rf_id  ORDER BY t.exec_dt DESC LIMIT :recordLimit' ;

            
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
            
            let searchData = {}, className="", nameQuery = "CASE WHEN r.representative_name <> null THEN r.representative_name ELSE aaa.name END  as content";
            const groupID = req.params.groupId;	
            searchData = {tab:groupID, organisation_id: req.orgId};
            if(groupID == 8) {                
                className = "red";
                nameQuery = 'SUBSTRING_INDEX(CASE WHEN r.representative_name <> null THEN r.representative_name ELSE aaa.name END, " ", 1)  as content';
            }
            /*const todaysDate = new Date(), startDate = moment(todaysDate).subtract(1, 'year').format('YYYY'), endDate = moment(todaysDate).format('YYYY');

            searchData.start = startDate;
            searchData.end = endDate;*/
            searchData.recordLimit = 5000;


            let customQuery = `SELECT t.rf_id as id, ${nameQuery}, t.exec_dt as start, "point" as type FROM timeline as t INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = t.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE organisation_id = :organisation_id AND tab = :tab GROUP BY rf_id  ORDER BY t.exec_dt DESC LIMIT :recordLimit` ;

            
            let getAllTransactionData = await connection.application.query(customQuery,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: searchData,
            }); 

            res.status(200).json({
                className: className,
                items: getAllTransactionData,                
            });    
        } else {
            res.status(400).send("Bad Inputs");
        }
    } catch ( err ) {
        console.log("Timeline:"+err);
        res.status(500).send("error");
    }
});

route.get("/:organisation/:name/:depth/:groupId", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        const organisationData = await helpers.findOrganisationbyID(req.orgId);

        if(organisationData != null && organisationData.organisation_id > 0){

            let organisation = req.params.organisation, name = req.params.name, depth = (req.params.depth != undefined && req.params.depth != null && req.params.depth != '') ? parseInt(req.params.depth) : 0, groupID = req.params.groupId;

            const representativeCompany = await helpers.checkCustomerCompany(req.connection_db, organisation);

            let customQuery, className = 'red', subNameQuery = 'CASE WHEN r.representative_name <> null THEN r.representative_name ELSE aa.name END  as content';

            if(groupID == 9) {
                subNameQuery = 'SUBSTRING_INDEX(CASE WHEN r.representative_name <> null THEN r.representative_name ELSE aa.name END, " ", 1)  as content';
            }
            let patentN = 'grant_doc_num';
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

                if(patentNumber == null ) {                       
                    patentN = 'appno_doc_num'   ;    
                }

                customQuery = `SELECT t.rf_id as id, ${subNameQuery}, "point" as type, t.exec_dt as start FROM timeline as t INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = t.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aa.representative_id WHERE t.rf_id IN (SELECT rf_id FROM documentid WHERE ${patentN} IN (:name)) AND t.tab = :tab AND t.organisation_id = :organisation_id AND t.representative_id = :representative_id  GROUP BY id ORDER BY start ASC `; 
                                
                className = 'green';                
            } else if( depth === 2 ){ 
                /*RF ID*/
                console.log('Transactions...')
                customQuery = `SELECT t.rf_id as id, ${subNameQuery}, "point" as type, t.exec_dt as start FROM timeline as t INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = t.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aa.representative_id WHERE t.rf_id = :name AND t.tab = :tab  AND t.organisation_id = :organisation_id AND t.representative_id = :representative_id  GROUP BY id ORDER BY start ASC `; 
                
                className = 'orange';
            } else if ( depth === 1 ) {
                /*Customer*/
                console.log("Parties......");

                customQuery = `SELECT t.rf_id as id, ${subNameQuery}, "point" as type, t.exec_dt as start FROM timeline as t INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = t.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aa.representative_id WHERE (r.representative_name = :name OR aa.name = :name) AND t.tab = :tab  AND t.organisation_id = :organisation_id AND t.representative_id = :representative_id  GROUP BY id ORDER BY start ASC `; 
                
                className = 'blue';                
            } else {
                console.log("Organisation......");
                /*Organisation*/
                customQuery = `SELECT t.rf_id as id, ${subNameQuery}, "point" as type, t.exec_dt as start FROM timeline as t INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = t.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aa.representative_id WHERE t.tab = :tab  AND t.organisation_id = :organisation_id AND t.representative_id = :representative_id  GROUP BY id ORDER BY start ASC `; 
                
            }           
						
            const allItems = await connection.application.query(customQuery,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: {name:name, representative_id: representativeCompany.representative_id, organisation_id: req.orgId, tab: groupID },
                }
            );	

            res.status(200).json({
                className: className,
                items: allItems            
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