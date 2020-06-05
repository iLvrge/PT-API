const express = require("express");

const route = express.Router();

const connection = require("../../config/db.config");

const helpers = require("../../helpers/helper");

//require the Model



const authJWT = require("../../helpers/verifyJwtToken");

const clientDBConnection = require("../../helpers/clientDBConnection");

route.get("/:type", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        /**
         * Connect with client DB and find the list of the companies 
         * and then go to the application database and get the customer list 
         * of those companies
         * For the client connection use middleware function to get the DB connection
         */
        let subsidariesAndCustomer = [];
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const getCompaniesList = await helpers.getCompaniesList(req.connection_db);
            if(getCompaniesList.length > 0) {
                const customerType = req.params.type;					
                if(customerType != "") {                    
                    for(let i = 0; i < getCompaniesList.length; i++) {
                        let org = {id:getCompaniesList[i].representative_id, name: getCompaniesList[i].original_name, child:[], level: 0};
                        let allCustomers = [];
                        if(customerType == "employee") {
                            /**Inventors */
                            const queryEmployee = "SELECT aaa.assignor_and_assignee_id, aaa.name as name, r.representative_name as normalize_name, 'Invented' as type FROM assignor as `or` LEFT JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = or.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id INNER JOIN (SELECT ee.rf_id FROM db_uspto.assignee as ee INNER JOIN assignment_conveyance as ass ON ass.rf_id = ee.rf_id INNER JOIN  assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id WHERE ass.convey_ty = :convey_type AND ass.employer_assign = 1 AND (aa.name = :name OR r1.representative_name=:name)) as temp ON temp.rf_id = or.rf_id GROUP BY or.or_name ORDER BY normalize_name ASC, name ASC";

                            const getEmployeeData = await connection.application.query(queryEmployee,{
                                type: connection.Sequelize.QueryTypes.SELECT,
                                replacements: { name: getCompaniesList[i].original_name, convey_type: 'assignment' },
                                raw: true,
                                logging: console.log,
                                }
                            );
                            allCustomers = getEmployeeData;
                        } else if(customerType == "ownership") {
                            /*Merger, Employee, Assignment, Sale*/
                            const queryPurchase = "SELECT aaa.assignor_and_assignee_id, aaa.name as name, r.representative_name as normalize_name, 'Purchased' as type FROM assignor as `or` LEFT JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = or.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id INNER JOIN (SELECT ee.rf_id FROM assignee as ee INNER JOIN assignment_conveyance as ass ON ass.rf_id = ee.rf_id INNER JOIN  assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id WHERE ass.convey_ty = :convey_type AND ass.employer_assign = 0 AND (aa.name = :name OR r1.representative_name=:name)) as temp ON temp.rf_id = or.rf_id GROUP BY name, normalize_name ORDER BY normalize_name ASC, name ASC";
									
                            const getPurchaseData = await connection.application.query(queryPurchase,{
                                type: connection.Sequelize.QueryTypes.SELECT,
                                replacements: { name: getCompaniesList[i].original_name, convey_type: 'assignment' },
                                raw: true,
                                logging: console.log,
                                }
                            );

                            const querySale = "SELECT aaa.assignor_and_assignee_id, aaa.name as name, r.representative_name as normalize_name, 'Sale' as type FROM assignee as ee LEFT JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id INNER JOIN (SELECT or.rf_id FROM assignor as `or` INNER JOIN assignment_conveyance as ac ON ac.rf_id = or.rf_id INNER JOIN  assignor_and_assignee as aa ON aa.assignor_and_assignee_id = or.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id WHERE ac.convey_ty = :convey_type  AND (aa.name = :name OR r1.representative_name = :name) GROUP BY or.rf_id) as temp ON temp.rf_id = ee.rf_id GROUP BY name, normalize_name ORDER BY normalize_name ASC, name ASC  ";
									
                            const getSaleData = await connection.application.query(querySale,{
                                type: connection.Sequelize.QueryTypes.SELECT,
                                replacements: { name: getCompaniesList[i].original_name, convey_type: 'assignment' },
                                raw: true,
                                logging: console.log,
                                }
                            );

                            const queryMergerIn = "SELECT aaa.assignor_and_assignee_id, aaa.name as name, r.representative_name as normalize_name, 'MergerIn' as type FROM assignor as `or` LEFT JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = or.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id INNER JOIN (SELECT ee.rf_id FROM assignee as ee INNER JOIN assignment_conveyance as ass ON ass.rf_id = ee.rf_id INNER JOIN  assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id WHERE ass.convey_ty = :convey_type AND ass.employer_assign = 0 AND (aa.name = :name OR r1.representative_name = :name) GROUP BY ee.rf_id) as temp ON temp.rf_id = or.rf_id GROUP BY name, normalize_name ORDER BY normalize_name ASC, name ASC ";
									
                            const getMergerInData = await connection.application.query(queryMergerIn,{
                                type: connection.Sequelize.QueryTypes.SELECT,
                                replacements: { name: getCompaniesList[i].original_name, convey_type: 'merger' },
                                raw: true,
                                logging: console.log,
                                }
                            );

                            const queryMergerOut = "SELECT aaa.assignor_and_assignee_id, aaa.name as name, r.representative_name as normalize_name, 'MergerOut' as type FROM assignee as ee LEFT JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id INNER JOIN (SELECT or.rf_id FROM assignor as `or` INNER JOIN assignment_conveyance as ass ON ass.rf_id = or.rf_id INNER JOIN  assignor_and_assignee as aa ON aa.assignor_and_assignee_id = or.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id WHERE ass.convey_ty = :convey_type AND (aa.name = :name OR r1.representative_name = :name) GROUP BY or.rf_id) as temp ON temp.rf_id = ee.rf_id GROUP BY name, normalize_name ORDER BY normalize_name ASC, name ASC ";
									
                            const getMergerOutData = await connection.application.query(queryMergerOut,{
                                type: connection.Sequelize.QueryTypes.SELECT,
                                replacements: { name: getCompaniesList[i].original_name, convey_type: 'merger' },
                                raw: true,
                                logging: console.log,
                              }
                            );
                            
                            allCustomers = [...getPurchaseData, ...getSaleData, ...getMergerInData, ...getMergerOutData];   
                        } else if(customerType == "security") {
                            /** Security, Release */								
                            const querySecurity = "SELECT aaa.assignor_and_assignee_id, aaa.name as name, r.representative_name as normalize_name, 'Security' as type FROM assignee as ee LEFT JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id INNER JOIN (SELECT or.rf_id FROM assignor as `or` INNER JOIN assignment_conveyance as ass ON ass.rf_id = or.rf_id INNER JOIN  assignor_and_assignee as aa ON aa.assignor_and_assignee_id = or.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id WHERE ass.convey_ty = :convey_type AND (aa.name = :name OR r1.representative_name = :name) GROUP BY or.rf_id) as temp ON temp.rf_id = ee.rf_id GROUP BY name, normalize_name ORDER BY normalize_name ASC, name ASC ";
                                
                            const queryRelease = "SELECT aaa.assignor_and_assignee_id, aaa.name as name, r.representative_name as normalize_name, 'Release' as type FROM assignor as `or` LEFT JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = or.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id INNER JOIN (SELECT ee.rf_id FROM assignee as ee INNER JOIN assignment_conveyance as ass ON ass.rf_id = ee.rf_id INNER JOIN  assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id WHERE ass.convey_ty = :convey_type AND (aa.name = :name OR r1.representative_name = :name) GROUP BY ee.rf_id) as temp ON temp.rf_id = or.rf_id GROUP BY name, normalize_name ORDER BY normalize_name ASC, name ASC ";

                            const getSecurityData = await connection.application.query(querySecurity,{
                                type: connection.Sequelize.QueryTypes.SELECT,
                                replacements: { name: getCompaniesList[i].original_name, convey_type: 'security' },
                                raw: true,
                                logging: console.log,
                              }
                            );

                            const getReleaseData = await connection.application.query(queryRelease,{
                                type: connection.Sequelize.QueryTypes.SELECT,
                                replacements: { name: getCompaniesList[i].original_name, convey_type: 'release' },
                                raw: true,
                                logging: console.log,
                              }
                            );
                            
                            allCustomers = [...getSecurityData, ...getReleaseData];
                        } else if(customerType == "other") {
                            /*other, namechg, missing, govern*/
                            const queryNameChange = "SELECT aaa.assignor_and_assignee_id, aaa.name as name, r.representative_name as normalize_name, 'Name Change' as type FROM assignor as `or` LEFT JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = or.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id INNER JOIN (SELECT ee.rf_id FROM assignee as ee INNER JOIN assignment_conveyance as ass ON ass.rf_id = ee.rf_id INNER JOIN  assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id WHERE ass.convey_ty = :convey_type AND (aa.name = :name OR r1.representative_name = :name) GROUP BY ee.rf_id) as temp ON temp.rf_id = or.rf_id GROUP BY name, normalize_name ORDER BY normalize_name ASC, name ASC ";
									
                            const getNameChgData = await connection.application.query(queryNameChange,{
                                type: connection.Sequelize.QueryTypes.SELECT,
                                replacements: { name: getCompaniesList[i].original_name, convey_type: 'namechg' },
                                raw: true,
                                logging: console.log,
                                }
                            );

                            let queryGovernChange = "SELECT aaa.assignor_and_assignee_id, aaa.name as name, r.representative_name as normalize_name, 'Govt.' as type FROM assignor as `or` LEFT JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = or.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id INNER JOIN (SELECT ee.rf_id FROM assignee as ee INNER JOIN assignment_conveyance as ass ON ass.rf_id = ee.rf_id INNER JOIN  assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id WHERE ass.convey_ty = :convey_type AND (aa.name = :name OR r1.representative_name = :name) GROUP BY ee.rf_id) as temp ON temp.rf_id = or.rf_id GROUP BY name, normalize_name ORDER BY normalize_name ASC, name ASC ";
									
                            let getGovernData = await connection.application.query(queryGovernChange,{
                                type: connection.Sequelize.QueryTypes.SELECT,
                                replacements: { name: getCompaniesList[i].original_name, convey_type: 'govern' },
                                raw: true,
                                logging: console.log,
                                }
                            );

                            allCustomers = [...getNameChgData, ...getGovernData];
                        }

                        
                        if(allCustomers.length > 0) {
                            let customers = [];
                            allCustomers.forEach( async customer => {
                                let name = customer.normalize_name;
                                    if(name == "" || name == null){
                                        name = customer.name;
                                    }
                                if( !customers.includes(name) ){
                                    customers.push( name );
                                    await org.child.push({id:customer.assignor_and_assignee_id, name: name, type: customer.type, level: 1});
                                }
                            });
                        }
                        console.log(org);
                        subsidariesAndCustomer.push(org);
                    }
                }
            }
        }
        res.status(200).json(subsidariesAndCustomer);
    } catch( err ) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
});


route.get("/:name/collections",[authJWT.verifyToken], async(req, res, next) => {    
    try{
        if(req.orgId == 46) {
            req.orgId = 9
        }else if(req.orgId == 52) {
            req.orgId = 10;
        }
        const organisationData = await helpers.findOrganisationbyID(req.orgId);
        let allFrames = [];
        if(organisationData != null && organisationData.organisation_id > 0){
            
            const customerName = req.params.name;					
            if(customerName != "") {
                let customQueryAssignee = "SELECT ac.rf_id, ac.rf_id as name, date_format(ac.exec_dt, '%m-%d-%Y') as exec_dt FROM assignor as ac INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as rr ON rr.representative_id = aa.representative_id INNER JOIN (SELECT a.rf_id FROM assignment as a INNER JOIN assignment_conveyance as ass ON ass.rf_id = a.rf_id INNER JOIN assignee as acc ON acc.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = acc.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE (aaa.name = :name OR r.representative_name = :name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id WHERE (aa.name = :customer_name OR rr.representative_name = :customer_name) GROUP BY ac.rf_id ORDER BY exec_dt ASC, ac.rf_id ASC";
                
                let getAssignorData = await connection.application.query(customQueryAssignee,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    replacements: { name: organisationData.name, customer_name: customerName },
                    raw: true,
                    logging: console.log,
                    }
                );

                let customQueryAssignor = "SELECT ac.rf_id, ac.rf_id as name,  (SELECT date_format(ap.exec_dt, '%m-%d-%Y') FROM assignor as ap WHERE ap.rf_id = ac.rf_id ORDER BY ap.exec_dt ASC LIMIT 1) as exec_dt  FROM assignee as ac INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ac.assignor_and_assignee_id LEFT JOIN representative as rr ON rr.representative_id = aa.representative_id INNER JOIN (SELECT a.rf_id FROM assignment as a INNER JOIN assignment_conveyance as ass ON ass.rf_id = a.rf_id INNER JOIN assignor as acc ON acc.rf_id = a.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = acc.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE (aaa.name = :name OR r.representative_name = :name) GROUP BY a.rf_id) as temp ON temp.rf_id = ac.rf_id WHERE (aa.name = :customer_name OR rr.representative_name = :customer_name) GROUP BY ac.rf_id ORDER BY exec_dt ASC, ac.rf_id ASC";
                
                let getAssigneeData = await connection.application.query(customQueryAssignor,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    replacements: { name: organisationData.name, customer_name: customerName },
                    raw: true,
                    logging: console.log,
                    }
                );
                
                let allReelFrames = [...getAssignorData, ...getAssigneeData];
                
                if(allReelFrames.length > 0) {
                    let allReel = [];
                    console.log(allReelFrames);
                    if(allReelFrames.length > 0) {
                        allReelFrames.forEach( async reel => {									
                            if( !allReel.includes(reel.rf_id) ){
                                allReel.push( reel.rf_id );
                                const newReel = {...reel};
                                newReel.id = reel.rf_id;
                                newReel.level = 2;
                                await allFrames.push(newReel);
                            }
                        });
                    }
                }
                
            }
        }
        res.status(200).json(allFrames);				
    } catch ( err ) {
        console.log(err);
        res.status(500).send("Internal error");
    }
});	

route.get("/:rf_id/assets",[authJWT.verifyToken], async(req, res, next) => {   
    try{
        if(req.orgId == 46) {
            req.orgId = 9
        }else if(req.orgId == 52) {
            req.orgId = 10;
        }
        const organisationData = await helpers.findOrganisationbyID(Organisation, req.orgId);
        let allPatents = [];
        if(organisationData != null && organisationData.id > 0){
            const rfID = req.params.rf_id;					
            if(rfID > 0) {
                let customQueryList = "Select id, CASE WHEN grant_doc_num = '' THEN appno_doc_num ELSE grant_doc_num END as name, CASE WHEN grant_doc_num = '' THEN 1 ELSE 0 END as type,  appno_doc_num, grant_doc_num, 3 as level FROM documentids_copy WHERE rf_id = :rf_id ORDER BY grant_doc_num ASC, appno_doc_num ASC";
                
                allPatents = await connection.application.query(customQueryList,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    replacements: { rf_id: rfID},
                    raw: true,
                    logging: console.log,
                    }
                );
                //console.log(allPatents);
            }
        }
        res.status(200).json(allPatents);				
    } catch ( err ) {
        console.log(err);
        res.status(500).send("Internal error");
    }
});

module.exports = route;