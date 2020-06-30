const express = require("express");

const route = express.Router();

const connection = require("../../config/db.config");

const helpers = require("../../helpers/helper");

const authJWT = require("../../helpers/verifyJwtToken");


route.get("/", [authJWT.verifyToken], async(req, res, next) => {
    try{        
        const organisationData = await helpers.findOrganisationbyID(req.orgId);
        //console.log(0);
        if(organisationData != null && organisationData.organisation_id > 0){
            /*Assignment organization as assignee i.e purchase, invented, name change, release*/
            let customQuery = 'SELECT concat(aa.assignor_and_assignee_id,ac.rf_id) as id, ac.rf_id, aa.name as raw_name, r1.representative_name as normalize_name, acc.convey_ty, acc.employer_assign, ac.exec_dt FROM assignor as ac INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id INNER JOIN (SELECT ee.rf_id FROM assignee as ee INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE aaa.name = :name or r.representative_name = :name) as temp ON temp.rf_id = ac.rf_id GROUP BY ac.rf_id ORDER BY ac.exec_dt DESC LIMIT 10';
            
            let getAssignmentData = await connection.application.query(customQuery,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: { name: organisationData.name },
                }
            );

            customQuery = 'SELECT concat(aa.assignor_and_assignee_id,ac.rf_id) as id, ac.rf_id, aa.name as raw_name, r1.representative_name as normalize_name, acc.convey_ty, acc.employer_assign, (SELECT ap.exec_dt FROM assignor as ap WHERE ap.rf_id = ac.rf_id ORDER BY ap.exec_dt ASC LIMIT 1) as exec_dt FROM assignee as ac INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id  INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id INNER JOIN (SELECT or.rf_id FROM assignor as `or` INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = or.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id  WHERE aaa.name = :name or r.representative_name = :name) as temp ON temp.rf_id = ac.rf_id GROUP BY ac.rf_id ORDER BY exec_dt DESC LIMIT 10';
            /*Assignment organization as assignor i.e sale, security*/
            
            let getAssigneeData = await connection.application.query(customQuery,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: { name: organisationData.name },
                }
            );

            const combineAssignorAssignee = [...getAssignmentData, ...getAssigneeData];
            const rfIDs = [];
            combineAssignorAssignee.map(c => rfIDs.push(c.rf_id));
            
            const uniqueRIDs = [...new Set(rfIDs)];

            let customQueryUniqueRf = 'SELECT ass.rf_id, aa.name as raw_name, r1.representative_name as normalize_name FROM assignor as ass INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ass.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id INNER JOIN (SELECT ac.rf_id FROM assignee as a INNER JOIN assignor as ac ON ac.rf_id = a.rf_id INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = a.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE a.rf_id IN (:rfIDs) AND (aaa.name = :name or r.representative_name = :name) GROUP BY rf_id) as p ON p.rf_id = ass.rf_id ORDER BY ass.rf_id ASC ';
						
            let getRFAssignorsData = await connection.application.query(customQueryUniqueRf,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: { name: organisationData.name, rfIDs: uniqueRIDs },
                }
            );

            customQueryUniqueRf = 'SELECT ass.rf_id, aa.name as raw_name, r1.representative_name as normalize_name FROM assignee as ass INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ass.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id INNER JOIN (SELECT ac.rf_id FROM assignor as a INNER JOIN assignee as ac ON ac.rf_id = a.rf_id INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = a.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE a.rf_id IN (:rfIDs) AND (aaa.name = :name or r.representative_name = :name) GROUP BY rf_id) as p ON p.rf_id = ass.rf_id ORDER BY ass.rf_id ASC ';
						
            let getRFAssigneeData = await connection.application.query(customQueryUniqueRf,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    logging: console.log,
                    replacements: { name: organisationData.name, rfIDs: uniqueRIDs },
                    }
                );
            res.status(200).json({
                type: 9,
                assignment_assignors: getAssignmentData,
                assignment_assignee: getAssigneeData,
                assignors: getRFAssignorsData,
                assignees: getRFAssigneeData,
                className: 'red',
                group: ["Employee", "Acquisition", "Security", "Other"]
            });    
        } else {
            res.status(400).send("Bad Inputs");
        }
    } catch ( err ) {
        console.log("Timeline:"+err);
        res.status(500).send("error");
    }
});

route.get("/:organisation/:name/:depth", [authJWT.verifyToken], async(req, res, next) => {
    try{
        //console.log(1);
        const organisationData = await helpers.findOrganisationbyID(req.orgId);

        if(organisationData != null && organisationData.organisation_id > 0){

            let organisation = req.params.organisation, name = req.params.name, depth = (req.params.depth != undefined && req.params.depth != null && req.params.depth != '') ? parseInt(req.params.depth) : 0;

            let customQueryAssignorST, customQueryAssigneeST, customQueryAssignorList, customQueryAssigneeList, className = 'red';

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
                customQueryAssignorST += ' ) as temp on temp.rf_id = ee.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = `ee`.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE ( aaa.name = :organisation_name OR r.representative_name = :organisation_name )) as t ON t.rf_id = or.rf_id INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = `or`.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id INNER JOIN assignment_conveyance as acc ON acc.rf_id = or.rf_id  GROUP BY or.rf_id ORDER BY or.exec_dt ASC ';                
                
                
                customQueryAssigneeST = 'SELECT concat(aa.assignor_and_assignee_id,ee.rf_id) as id, ee.rf_id, aa.name as raw_name, r1.representative_name as normalize_name, acc.convey_ty, acc.employer_assign, (SELECT ap.exec_dt FROM assignor as ap WHERE ap.rf_id = ee.rf_id ORDER BY ap.exec_dt ASC LIMIT 1) as exec_dt from assignee as `ee`  INNER JOIN (SELECT or.rf_id from assignor as `or` INNER JOIN (SELECT d.rf_id from documentid as d WHERE ';
                
                if(patentNumber != null && patentNumber.rf_id > 0) {
                    customQueryAssigneeST += ' ( d.grant_doc_num = :name ) ';
                } else {
                    customQueryAssigneeST += ' ( d.appno_doc_num = :name ) ';
                }
                
                customQueryAssigneeST += '  ) as temp on temp.rf_id = or.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = `or`.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE ( aaa.name = :organisation_name  OR r.representative_name = :organisation_name )) as t ON t.rf_id = ee.rf_id INNER JOIN assignment_conveyance as acc ON acc.rf_id = ee.rf_id INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = `ee`.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id GROUP BY ee.rf_id ORDER BY exec_dt ASC ';   
                
                customQueryAssignorList = "SELECT or.rf_id, aa.name as raw_name, r1.representative_name as normalize_name FROM assignor as `or` INNER JOIN (SELECT ee.rf_id from assignee as `ee` INNER JOIN (SELECT d.rf_id from documentid as d WHERE ";
                
                if(patentNumber != null && patentNumber.rf_id > 0) {
                    customQueryAssignorList += ' ( d.grant_doc_num = :name ) ';
                } else {
                    customQueryAssignorList += ' ( d.appno_doc_num = :name ) ';
                }

                customQueryAssignorList += ' ) as temp on temp.rf_id = ee.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = `ee`.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE ( aaa.name = :organisation_name OR r.representative_name = :organisation_name )) as t ON t.rf_id = or.rf_id INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = `or`.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id INNER JOIN assignment_conveyance as acc ON acc.rf_id = or.rf_id  ORDER BY or.exec_dt ASC ';
                
                customQueryAssigneeList = "SELECT ee.rf_id, aa.name as raw_name, r1.representative_name as normalize_name from assignee as `ee`  INNER JOIN (SELECT or.rf_id from assignor as `or` INNER JOIN (SELECT d.rf_id from documentid as d WHERE ";
                
                if(patentNumber != null && patentNumber.rf_id > 0) {
                    customQueryAssigneeList += " ( d.grant_doc_num = :name ) ";
                } else {
                    customQueryAssigneeList += " ( d.appno_doc_num = :name ) ";
                }
                
                customQueryAssigneeList += "  ) as temp on temp.rf_id = or.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = `or`.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE ( aaa.name = :organisation_name  OR r.representative_name = :organisation_name )) as t ON t.rf_id = ee.rf_id INNER JOIN assignment_conveyance as acc ON acc.rf_id = ee.rf_id INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = `ee`.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id";                
                                
                className = 'green';                
            } else if( depth === 2 ){ 
                /*RF ID*/
                customQueryAssignorST = 'SELECT concat(aaa.assignor_and_assignee_id,or.rf_id) as id, or.rf_id, aaa.name as raw_name, r.representative_name as normalize_name, acc.convey_ty, acc.employer_assign, or.exec_dt from assignor as `or` INNER JOIN assignment_conveyance as acc ON acc.rf_id = or.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = `or`.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE or.rf_id = :name AND ( aaa.name <> :organisation_name OR r.representative_name <> :organisation_name ) GROUP BY or.rf_id';
							
                customQueryAssigneeST = 'SELECT concat(aaa.assignor_and_assignee_id,ee.rf_id) as id, ee.rf_id, aaa.name as raw_name, r.representative_name as normalize_name, acc.convey_ty, acc.employer_assign, (SELECT ap.exec_dt FROM assignor as ap WHERE ap.rf_id = ee.rf_id ORDER BY ap.exec_dt ASC LIMIT 1) as exec_dt FROM assignee as ee INNER JOIN assignment_conveyance as acc ON acc.rf_id = ee.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = `ee`.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE ee.rf_id = :name AND ( aaa.name <> :organisation_name OR r.representative_name <> :organisation_name ) GROUP BY ee.rf_id';
                
                customQueryAssignorList = 'SELECT or.rf_id, aaa.name as raw_name, r.representative_name as normalize_name from assignor as `or` INNER JOIN assignment_conveyance as acc ON acc.rf_id = or.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = `or`.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE or.rf_id = :name AND ( aaa.name <> :organisation_name OR r.representative_name <> :organisation_name ) ORDER BY or.exec_dt ASC';
                
                customQueryAssigneeList = 'SELECT concat(aaa.assignor_and_assignee_id,ee.rf_id) as id, ee.rf_id, aaa.name as raw_name, r.representative_name as normalize_name, acc.convey_ty, acc.employer_assign, (SELECT ap.exec_dt FROM assignor as ap WHERE ap.rf_id = ee.rf_id ORDER BY ap.exec_dt ASC LIMIT 1) as exec_dt FROM assignee as ee INNER JOIN assignment_conveyance as acc ON acc.rf_id = ee.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = `ee`.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE ee.rf_id = :name AND ( aaa.name <> :organisation_name OR r.representative_name <> :organisation_name )  ORDER BY exec_dt ASC';
                
                className = 'orange';
            } else if ( depth === 1 ) {
                /*Customer*/
                customQueryAssignorST = 'SELECT concat(aaa.assignor_and_assignee_id,ac.rf_id) as id, ac.rf_id, aaa.name as raw_name, r.representative_name as normalize_name, ass.convey_ty, ass.employer_assign, ac.exec_dt FROM assignor as ac INNER JOIN assignment_conveyance as ass ON ass.rf_id = ac.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id INNER JOIN (SELECT a.rf_id FROM assignment as a INNER JOIN assignee as acc ON acc.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = acc.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id WHERE (acc.ee_name = :organisation_name OR r1.representative_name = :organisation_name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id WHERE (ac.or_name = :name OR r.representative_name = :name) GROUP BY ac.rf_id ORDER BY ac.exec_dt ASC';
                
                customQueryAssigneeST = 'SELECT concat(aaa.assignor_and_assignee_id,ac.rf_id) as id, ac.rf_id, aaa.name as raw_name, r.representative_name as normalize_name, ass.convey_ty, ass.employer_assign, (SELECT date_format(ap.exec_dt, "%m-%d-%Y") FROM assignor as ap WHERE ap.rf_id = ac.rf_id ORDER BY ap.exec_dt ASC LIMIT 1) as exec_dt FROM assignee as ac INNER JOIN assignment_conveyance as ass ON ass.rf_id = ac.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id INNER JOIN (SELECT a.rf_id FROM assignment as a INNER JOIN assignment_conveyance as ass ON ass.rf_id = a.rf_id INNER JOIN assignor as acc ON acc.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = acc.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id WHERE (acc.or_name = :organisation_name OR r1.representative_name = :organisation_name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id WHERE (ac.ee_name = :name OR r.representative_name = :name) GROUP BY ac.rf_id ORDER BY exec_dt ASC';
                
                customQueryAssignorList = 'SELECT ass.rf_id, a_a.name as raw_name, r2.representative_name as normalize_name FROM assignor as ass INNER JOIN assignor_and_assignee as a_a ON a_a.assignor_and_assignee_id = ass.assignor_and_assignee_id LEFT JOIN representative as r2 ON r2.representative_id = a_a.representative_id INNER JOIN (SELECT ac.rf_id FROM assignor as ac INNER JOIN assignment_conveyance as ass ON ass.rf_id = ac.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id INNER JOIN (SELECT a.rf_id FROM assignment as a INNER JOIN assignment_conveyance as ass ON ass.rf_id = a.rf_id INNER JOIN assignee as acc ON acc.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = acc.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id WHERE (aa.name = :organisation_name OR r1.representative_name = :organisation_name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id WHERE (aaa.name = :name OR r.representative_name = :name) GROUP BY ac.rf_id ) as p ON p.rf_id = ass.rf_id ORDER BY ass.rf_id ASC';
                
                customQueryAssigneeList = 'SELECT ass.rf_id, a_a.name as raw_name, r2.representative_name as normalize_name FROM assignee as ass INNER JOIN assignor_and_assignee as a_a ON a_a.assignor_and_assignee_id = ass.assignor_and_assignee_id LEFT JOIN representative as r2 ON r2.representative_id = a_a.representative_id INNER JOIN (SELECT ac.rf_id FROM assignee as ac INNER JOIN assignment_conveyance as ass ON ass.rf_id = ac.rf_id INNER JOIN (SELECT a.rf_id FROM assignment as a INNER JOIN assignment_conveyance as ass ON ass.rf_id = a.rf_id INNER JOIN assignor as acc ON acc.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = acc.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE (aaa.name = :organisation_name OR r.representative_name = :organisation_name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id WHERE (aa.name = :name OR r1.representative_name = :name) GROUP BY ac.rf_id)  as p ON p.rf_id = ass.rf_id ORDER BY ass.rf_id ASC';	

                className = 'blue';                
            } else {
                console.log("Organisation......");
                /*Organisation*/
                customQueryAssignorST = "SELECT concat(aa.assignor_and_assignee_id,ac.rf_id) as id, ac.rf_id, aa.name as raw_name, r1.representative_name as normalize_name, acc.convey_ty, acc.employer_assign, ac.exec_dt FROM assignor as ac INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id INNER JOIN (SELECT ee.rf_id FROM assignee as ee INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE aaa.name = :name or r.representative_name = :name) as temp ON temp.rf_id = ac.rf_id GROUP BY ac.rf_id";
                
                customQueryAssigneeST = 'SELECT concat(aa.assignor_and_assignee_id,ac.rf_id) as id, ac.rf_id, aa.name as raw_name, r1.representative_name as normalize_name, acc.convey_ty, acc.employer_assign, (SELECT ap.exec_dt FROM assignor as ap WHERE ap.rf_id = ac.rf_id ORDER BY ap.exec_dt ASC LIMIT 1) as exec_dt FROM assignee as ac INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id  INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id INNER JOIN (SELECT or.rf_id FROM assignor as `or` INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = or.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id  WHERE aaa.name = :name or r.representative_name = :name) as temp ON temp.rf_id = ac.rf_id GROUP BY ac.rf_id';               
                
                customQueryAssignorList = 'SELECT ass.rf_id, aa.name as raw_name, r1.representative_name as normalize_name FROM assignor as ass INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ass.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id INNER JOIN (SELECT ac.rf_id FROM assignee as a INNER JOIN assignor as ac ON ac.rf_id = a.rf_id INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = a.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE (aaa.name = :name or r.representative_name = :name) GROUP BY rf_id) as p ON p.rf_id = ass.rf_id ORDER BY ass.rf_id ASC';  
                
                customQueryAssigneeList = 'SELECT ass.rf_id, aa.name as raw_name, r1.representative_name as normalize_name FROM assignee as ass INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ass.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id INNER JOIN (SELECT ac.rf_id FROM assignor as a INNER JOIN assignee as ac ON ac.rf_id = a.rf_id INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = a.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE (aaa.name = :name or r.representative_name = :name) GROUP BY rf_id) as p ON p.rf_id = ass.rf_id ORDER BY ass.rf_id ASC';
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

route.get("/filter/search/:startDate/:endDate", [authJWT.verifyToken], async(req, res, next) => {
    try{
        const startDate = req.params.startDate, endDate = req.params.endDate;
        const organisationData = await helpers.findOrganisationbyID(req.orgId);
        //console.log(2);
        if(organisationData != null && organisationData.organisation_id > 0){
            /*Assignment organization as assignee i.e purchase, invented, name change, release*/
            let customQuery = 'SELECT concat(aa.assignor_and_assignee_id,ac.rf_id) as id, ac.rf_id, aa.name as raw_name, r1.representative_name as normalize_name, acc.convey_ty, acc.employer_assign, ac.exec_dt FROM assignor as ac INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id INNER JOIN (SELECT ee.rf_id FROM assignee as ee INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE aaa.name = :name or r.representative_name = :name) as temp ON temp.rf_id = ac.rf_id WHERE ac.exec_dt BETWEEN :startDate AND :endDate GROUP BY ac.rf_id ORDER BY ac.exec_dt DESC LIMIT 100';
            
            let getAssignmentData = await connection.application.query(customQuery,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: { name: organisationData.name, startDate: startDate, endDate: endDate},
                }
            );

            customQuery = 'SELECT concat(aa.assignor_and_assignee_id,ac.rf_id) as id, ac.rf_id, aa.name as raw_name, r1.representative_name as normalize_name, acc.convey_ty, acc.employer_assign, (SELECT ap.exec_dt FROM assignor as ap WHERE ap.rf_id = ac.rf_id ORDER BY ap.exec_dt ASC LIMIT 1) as exec_dt FROM assignee as ac INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id  INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id INNER JOIN (SELECT or.rf_id FROM assignor as `or` INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = or.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id  WHERE (or.exec_dt BETWEEN :startDate AND :endDate ) AND aaa.name = :name or r.representative_name = :name) as temp ON temp.rf_id = ac.rf_id GROUP BY ac.rf_id ORDER BY exec_dt DESC LIMIT 100';
            /*Assignment organization as assignor i.e sale, security*/
            
            let getAssigneeData = await connection.application.query(customQuery,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: { name: organisationData.name, startDate: startDate, endDate: endDate },
                }
            );

            const combineAssignorAssignee = [...getAssignmentData, ...getAssigneeData];
            const rfIDs = [];
            combineAssignorAssignee.map(c => rfIDs.push(c.rf_id));
            
            const uniqueRIDs = [...new Set(rfIDs)];

            let customQueryUniqueRf = 'SELECT ass.rf_id, aa.name as raw_name, r1.representative_name as normalize_name FROM assignor as ass INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ass.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id INNER JOIN (SELECT ac.rf_id FROM assignee as a INNER JOIN assignor as ac ON ac.rf_id = a.rf_id INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = a.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE a.rf_id IN (:rfIDs) AND (aaa.name = :name or r.representative_name = :name) GROUP BY rf_id) as p ON p.rf_id = ass.rf_id ORDER BY ass.rf_id ASC ';
						
            let getRFAssignorsData = await connection.application.query(customQueryUniqueRf,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: { name: organisationData.name, rfIDs: uniqueRIDs },
                }
            );

            customQueryUniqueRf = 'SELECT ass.rf_id, aa.name as raw_name, r1.representative_name as normalize_name FROM assignee as ass INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ass.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id INNER JOIN (SELECT ac.rf_id FROM assignor as a INNER JOIN assignee as ac ON ac.rf_id = a.rf_id INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = a.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE a.rf_id IN (:rfIDs) AND (aaa.name = :name or r.representative_name = :name) GROUP BY rf_id) as p ON p.rf_id = ass.rf_id ORDER BY ass.rf_id ASC ';
						
            let getRFAssigneeData = await connection.application.query(customQueryUniqueRf,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    logging: console.log,
                    replacements: { name: organisationData.name, rfIDs: uniqueRIDs },
                    }
                );
            res.status(200).json({
                type: 9,
                assignment_assignors: getAssignmentData,
                assignment_assignee: getAssigneeData,
                assignors: getRFAssignorsData,
                assignees: getRFAssigneeData,
                className: 'red',
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