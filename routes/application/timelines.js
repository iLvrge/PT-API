const express = require("express");

const route = express.Router();

const connection = require("../../config/db.config");

const helpers = require("../../helpers/helper");

const authJWT = require("../../helpers/verifyJwtToken");


route.get("/", [authJWT.verifyToken], async(req, res, next) => {
    try{
        if(req.orgId == 46) {
            req.orgId = 9
        }else if(req.orgId == 52) {
            req.orgId = 10;
        }
        const organisationData = await helpers.findOrganisationbyID(req.orgId);

        if(organisationData != null && organisationData.organisation_id > 0){
            /*Assignment organization as assignee i.e purchase, invented, name change, release*/
            let customQuery = 'SELECT concat(aa.assignor_and_assignee_id,ac.rf_id) as id, ac.rf_id, aa.name as raw_name, r1.representative_name as normalize_name, acc.convey_ty, acc.employer_assign, ac.exec_dt FROM assignor as ac INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id INNER JOIN (SELECT ee.rf_id FROM assignee as ee INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE aaa.name = :name or r.representative_name = :name) as temp ON temp.rf_id = ac.rf_id GROUP BY ac.rf_id';
            
            let getAssignmentData = await connection.application.query(customQuery,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: { name: organisationData.name },
                }
            );

            customQuery = 'SELECT concat(aa.assignor_and_assignee_id,ac.rf_id) as id, ac.rf_id, aa.name as raw_name, r1.representative_name as normalize_name, acc.convey_ty, acc.employer_assign, (SELECT ap.exec_dt FROM assignor as ap WHERE ap.rf_id = ac.rf_id ORDER BY ap.exec_dt ASC LIMIT 1) as exec_dt FROM assignee as ac INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id  INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id INNER JOIN (SELECT or.rf_id FROM assignor as `or` INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = or.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id  WHERE aaa.name = :name or r.representative_name = :name) as temp ON temp.rf_id = ac.rf_id GROUP BY ac.rf_id';
            /*Assignment organization as assignor i.e sale, security*/
            
            let getAssigneeData = await connection.application.query(customQuery,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: { name: organisationData.name },
                }
            );

            let customQueryUniqueRf = 'SELECT ass.rf_id, aa.name as raw_name, r1.representative_name as normalize_name FROM assignor as ass INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ass.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id INNER JOIN (SELECT ac.rf_id FROM assignee as a INNER JOIN assignor as ac ON ac.rf_id = a.rf_id INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = a.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE (aaa.name = :name or r.representative_name = :name) GROUP BY rf_id) as p ON p.rf_id = ass.rf_id ORDER BY ass.rf_id ASC';
						
            let getRFAssignorsData = await connection.application.query(customQueryUniqueRf,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: { name: organisationData.name },
                }
            );

            customQueryUniqueRf = 'SELECT ass.rf_id, aa.name as raw_name, r1.representative_name as normalize_name FROM assignee as ass INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ass.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id INNER JOIN (SELECT ac.rf_id FROM assignor as a INNER JOIN assignee as ac ON ac.rf_id = a.rf_id INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = a.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE (aaa.name = :name or r.representative_name = :name) GROUP BY rf_id) as p ON p.rf_id = ass.rf_id ORDER BY ass.rf_id ASC';
						
            let getRFAssigneeData = await connection.application.query(customQueryUniqueRf,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    logging: console.log,
                    replacements: { name: organisationData.name },
                    }
                );
            res.status(200).json({
                type: 9,
                assignment_assignors: getAssignmentData,
                assignment_assignee: getAssigneeData,
                assignors: getRFAssignorsData,
                assignees: getRFAssigneeData,
                className: 'red',
                group: ["Employees", "Acquisition", "Security", "Other"]
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
        if(req.orgId == 46) {
            req.orgId = 9
        }else if(req.orgId == 52) {
            req.orgId = 10;
        }
        const organisationData = await helpers.findOrganisationbyID(req.orgId);

        if(organisationData != null && organisationData.organisation_id > 0){

            let organisation = req.params.organisation, name = req.params.name, depth = (req.params.depth != undefined && req.params.depth != null && req.params.depth != '') ? parseInt(req.params.depth) : 0;

            let customQueryAssignorST, customQueryAssigneeST, customQueryAssignorList, customQueryAssigneeList, className = 'red';

            if( depth === 3 ) {
                /*Asset Number*/
                
                customQueryAssignorST = 'SELECT concat(aaa.assignor_and_assignee_id,ac.rf_id) as id, ac.rf_id, aaa.name as raw_name, r.representative_name as normalize_name, acc.convey_ty, acc.employer_assign, ac.exec_dt FROM assignee as a INNER JOIN assignor as ac ON ac.rf_id = a.rf_id INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id INNER JOIN documentid as dc ON dc.rf_id = ac.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = a.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE ';
                
                let patentNumber = await connection.application.query("SELECT rf_id FROM documentid WHERE grant_doc_num = :name LIMIT 1",{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    logging: console.log,
                    replacements: { name: name },
                    plain:true
                  }
                );	
                
                if(patentNumber != null && patentNumber.rf_id > 0) {
                    customQueryAssignorST += ' ( dc.grant_doc_num = :name ) ';
                } else {
                    customQueryAssignorST += ' ( dc.appno_doc_num = :name ) ';
                }
                
                customQueryAssignorST += '  AND ( ac.or_name <> :organisation_name AND r.representative_name <> :organisation_name ) GROUP BY ac.rf_id';
                
                customQueryAssigneeST = 'SELECT concat(aaa.assignor_and_assignee_id,ac.rf_id) as id, ac.rf_id, ac.ee_name as raw_name, r.representative_name as normalize_name, acc.convey_ty, acc.employer_assign, (SELECT ap.exec_dt FROM assignor as ap WHERE ap.rf_id = a.rf_id ORDER BY ap.exec_dt ASC LIMIT 1) as exec_dt FROM assignor as a INNER JOIN assignee as ac ON ac.rf_id = a.rf_id INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id INNER JOIN documentid as dc ON dc.rf_id = ac.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = a.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE ';
                
                if(patentNumber != null && patentNumber.rf_id > 0) {
                    customQueryAssigneeST += ' ( dc.grant_doc_num = :name ) ';
                } else {
                    customQueryAssigneeST += ' ( dc.appno_doc_num = :name ) ';
                }
                
                customQueryAssigneeST += '  AND ( ac.ee_name <> :organisation_name AND r.representative_name <> :organisation_name )  GROUP BY ac.rf_id ';   
                
                customQueryAssignorList = "SELECT ass.rf_id, aaa.name as raw_name, r.representative_name as normalize_name FROM assignor as ass INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = ass.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id  INNER JOIN ( SELECT ac.rf_id FROM assignee as a INNER JOIN assignor as ac ON ac.rf_id = a.rf_id INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id INNER JOIN documentid as dc ON dc.rf_id = ac.rf_id WHERE ";
                
                if(patentNumber != null && patentNumber.rf_id > 0) {
                    customQueryAssignorList += " ( dc.grant_doc_num = :name ) ";
                } else {
                    customQueryAssignorList += " ( dc.appno_doc_num = :name ) ";
                }
                
                customQueryAssignorList += " GROUP BY ac.rf_id ) as p ON p.rf_id = ass.rf_id WHERE  ( ass.or_name <> :organisation_name AND r.representative_name <> :organisation_name ) ORDER BY ass.rf_id ASC";
                
                customQueryAssigneeList = "SELECT ass.rf_id, aaa.name as raw_name, r.representative_name as normalize_name FROM assignee as ass INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = ass.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id  INNER JOIN ( SELECT ac.rf_id FROM assignor as a INNER JOIN assignee as ac ON ac.rf_id = a.rf_id INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id INNER JOIN documentid as dc ON dc.rf_id = ac.rf_id WHERE ";
                
                if(patentNumber != null && patentNumber.id > 0) {
                    customQueryAssigneeList += " ( dc.grant_doc_num = :name ) ";
                } else {
                    customQueryAssigneeList += " ( dc.appno_doc_num = :name ) ";
                }
                
                customQueryAssigneeList += "  GROUP BY ac.rf_id ) as p ON p.rf_id = ass.rf_id WHERE  ( ass.ee_name <> :organisation_name AND r.representative_name <> :organisation_name ) ORDER BY ass.rf_id ASC ";                
                                
                className = 'green';
                
            } else if( depth === 2 ){ 
                /*RF ID*/
                customQueryAssignorST = 'SELECT concat(aaa.assignor_and_assignee_id,ac.rf_id) as id, ac.rf_id, aaa.name as raw_name, r.representative_name as normalize_name, acc.convey_ty, acc.employer_assign, ac.exec_dt FROM assignee as a INNER JOIN assignor as ac ON ac.rf_id = a.rf_id INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = a.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id  WHERE ac.rf_id = :name AND ( aaa.name <> :organisation_name AND r.representative_name <> :organisation_name ) GROUP BY ac.rf_id';
							
                customQueryAssigneeST = 'SELECT concat(aaa.assignor_and_assignee_id,ac.rf_id) as id, ac.rf_id, aaa.name as raw_name, r.representative_name as normalize_name, acc.convey_ty, acc.employer_assign, (SELECT ap.exec_dt FROM assignor as ap WHERE ap.rf_id = a.rf_id ORDER BY ap.exec_dt ASC LIMIT 1) as exec_dt FROM assignor as a INNER JOIN assignee as ac ON ac.rf_id = a.rf_id INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = a.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id  WHERE ac.rf_id = :name AND ( aaa.name <> :organisation_name AND r.representative_name <> :organisation_name )  GROUP BY ac.rf_id';
                
                customQueryAssignorList = 'SELECT ass.rf_id, aa.name as raw_name, r.representative_name as normalize_name FROM assignor as ass INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ass.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aa.representative_id INNER JOIN (SELECT ac.rf_id FROM assignee as a INNER JOIN assignor as ac ON ac.rf_id = a.rf_id INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id WHERE ac.rf_id = :name GROUP BY ac.rf_id) as p ON p.rf_id = ass.rf_id WHERE ( aa.name <> :organisation_name AND r.representative_name <> :organisation_name ) ORDER BY ass.rf_id ASC';
                
                customQueryAssigneeList = 'SELECT ass.rf_id, aa.name as raw_name, r.representative_name as normalize_name FROM assignee as ass INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ass.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aa.representative_id INNER JOIN (SELECT ac.rf_id FROM assignor as a INNER JOIN assignee as ac ON ac.rf_id = a.rf_id INNER JOIN assignment_conveyance as acc ON acc.rf_id = ac.rf_id WHERE ac.rf_id = :name GROUP BY ac.rf_id) as p ON p.rf_id = ass.rf_id WHERE  ( aa.name <> :organisation_name AND r.representative_name <> :organisation_name ) ORDER BY ass.rf_id ASC';
                
                className = 'orange';
            } else if ( depth === 1 ) {
                /*Customer*/
                customQueryAssignorST = 'SELECT concat(aaa.assignor_and_assignee_id,ac.rf_id) as id, ac.rf_id, aaa.name as raw_name, r.representative_name as normalize_name, ass.convey_ty, ass.employer_assign, ac.exec_dt FROM assignor as ac INNER JOIN assignment_conveyance as ass ON ass.rf_id = ac.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id INNER JOIN (SELECT a.rf_id FROM assignment as a INNER JOIN assignee as acc ON acc.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = acc.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id WHERE (acc.ee_name = :organisation_name OR r1.representative_name = :organisation_name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id WHERE (ac.or_name = :name OR r.representative_name = :name) GROUP BY ac.rf_id ORDER BY ac.exec_dt ASC';
                
                customQueryAssigneeST = 'SELECT concat(aaa.assignor_and_assignee_id,ac.rf_id) as id, ac.rf_id, aaa.name as raw_name, r.representative_name as normalize_name, ass.convey_ty, ass.employer_assign, (SELECT date_format(ap.exec_dt, "%m-%d-%Y") FROM assignor as ap WHERE ap.rf_id = ac.rf_id ORDER BY ap.exec_dt ASC LIMIT 1) as exec_dt FROM assignee as ac INNER JOIN assignment_conveyance as ass ON ass.rf_id = ac.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id INNER JOIN (SELECT a.rf_id FROM assignment as a INNER JOIN assignment_conveyance as ass ON ass.rf_id = a.rf_id INNER JOIN assignor as acc ON acc.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = acc.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id WHERE (acc.or_name = :organisation_name OR r1.representative_name = :organisation_name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id WHERE (ac.ee_name = :name OR r.representative_name = :name) GROUP BY ac.rf_id ORDER BY exec_dt ASC';
                
                customQueryAssignorList = 'SELECT ass.rf_id, a_a.name as raw_name, r2.representative_name as normalize_name FROM assignor as ass INNER JOIN assignor_and_assignee as a_a ON a_a.assignor_and_assignee_id = ass.assignor_and_assignee_id LEFT JOIN representative as r2 ON r2.representative_id = a_a.representative_id INNER JOIN (SELECT ac.rf_id FROM assignor as ac INNER JOIN assignment_conveyance as ass ON ass.rf_id = ac.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id INNER JOIN (SELECT a.rf_id FROM assignment as a INNER JOIN assignment_conveyance as ass ON ass.rf_id = a.rf_id INNER JOIN assignee as acc ON acc.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = acc.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id WHERE (aa.name = :organisation_name OR r1.representative_name = :organisation_name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id WHERE (aaa.name = :name OR r.representative_name = :name) GROUP BY ac.rf_id ) as p ON p.rf_id = ass.rf_id ORDER BY ass.rf_id ASC';
                
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


module.exports = route;