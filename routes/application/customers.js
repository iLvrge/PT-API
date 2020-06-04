const express = require("express");

const route = express.Router();

const connection = require("../../config/db.config");

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
                        let org = {id:getCompaniesList[i].company_id, name: getCompaniesList[i].name, child:[], level: 0};
                        let allCustomers = [];
                        if(customerType == "employee") {
                            /**Inventors */
                            const queryEmployee = "SELECT aaa.id, aaa.name as name, r.representative_name as normalize_name, 'Invented' as type FROM assignor as or LEFT JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = or.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id INNER JOIN (SELECT ee.rf_id FROM db_uspto.assignee as ee INNER JOIN assignment_conveyance as ass ON ass.rf_id = ee.rf_id INNER JOIN  assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id WHERE ass.convey_ty = :convey_type AND ass.employer_assign = 1 AND (aa.name = :name OR r1.representative_name=:name)) as temp ON temp.rf_id = or.rf_id GROUP BY or.or_name ORDER BY normalize_name ASC, name ASC";

                            const getEmployeeData = await connection.application.query(queryEmployee,{
                                type: db.Sequelize.QueryTypes.SELECT,
                                replacements: { name: getCompaniesList[i].name, convey_type: 'assignment' },
                                raw: true,
                                logging: console.log,
                                }
                            );
                            allCustomers = getEmployeeData;
                        } else if(customerType == "ownership") {
                            /*Merger, Employee, Assignment, Sale*/
                            const queryPurchase = "SELECT aaa.id, aaa.name as name, r.representative_name as normalize_name, 'Purchased' as type FROM assignor as or LEFT JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = or.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id INNER JOIN (SELECT ee.rf_id FROM assignee as ee INNER JOIN assignment_conveyance as ass ON ass.rf_id = ee.rf_id INNER JOIN  assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id WHERE ass.convey_ty = :convey_type AND ass.employer_assign = 0 AND (aa.name = :name OR r1.representative_name=:name)) as temp ON temp.rf_id = or.rf_id GROUP BY name, normalize_name ORDER BY normalize_name ASC, name ASC";
									
                            const getPurchaseData = await connection.application.query(queryPurchase,{
                                type: db.Sequelize.QueryTypes.SELECT,
                                replacements: { name: getCompaniesList[i].name, convey_type: 'assignment' },
                                raw: true,
                                logging: console.log,
                                }
                            );

                            const querySale = "SELECT aaa.id, aaa.name as name, r.representative_name as normalize_name, 'Sale' as type FROM assignee as ee LEFT JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = or.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id INNER JOIN (SELECT or.rf_id FROM assignor as `or` INNER JOIN assignment_conveyance as ac ON ac.rf_id or.rf_id INNER JOIN  assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id WHERE ac.convey_ty = :convey_type  AND (aa.name = :name OR r1.representative_name = :name) GROUP BY or.rf_id) as temp ON temp.rf_id = ee.rf_id GROUP BY name, normalize_name ORDER BY normalize_name ASC, name ASC  ";
									
                            const getSaleData = await connection.application.query(querySale,{
                                type: db.Sequelize.QueryTypes.SELECT,
                                replacements: { name: getCompaniesList[i].name, convey_type: 'assignment' },
                                raw: true,
                                logging: console.log,
                                }
                            );

                            const queryMergerIn = "SELECT aaa.id, aaa.name as name, r.representative_name as normalize_name, 'MergerIn' as type FROM assignor as or LEFT JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = or.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id INNER JOIN (SELECT ee.rf_id FROM assignee as ee INNER JOIN assignment_conveyance as ass ON ass.rf_id = ee.rf_id INNER JOIN  assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id WHERE ass.convey_ty = :convey_type AND ass.employer_assign = 0 AND (aa.name = :name OR r1.representative_name = :name) GROUP BY ee.rf_id) as temp ON temp.rf_id = or.rf_id GROUP BY name, normalize_name ORDER BY normalize_name ASC, name ASC ";
									
                            const getMergerInData = await connection.application.query(queryMergerIn,{
                                type: db.Sequelize.QueryTypes.SELECT,
                                replacements: { name: getCompaniesList[i].name, convey_type: 'merger' },
                                raw: true,
                                logging: console.log,
                                }
                            );

                            const queryMergerOut = "SELECT aaa.id, aaa.name as name, r.representative_name as normalize_name, 'MergerOut' as type FROM assignee as ee LEFT JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = or.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id INNER JOIN (SELECT or.rf_id FROM assignor as `or` INNER JOIN assignment_conveyance as ass ON ass.rf_id = or.rf_id INNER JOIN  assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id WHERE ass.convey_ty = :convey_type AND (aa.name = :name OR r1.representative_name = :name) GROUP BY or.rf_id) as temp ON temp.rf_id = ee.rf_id GROUP BY name, normalize_name ORDER BY normalize_name ASC, name ASC ";
									
                            const getMergerOutData = await connection.application.query(queryMergerOut,{
                                type: db.Sequelize.QueryTypes.SELECT,
                                replacements: { name: getCompaniesList[i].name, convey_type: 'merger' },
                                raw: true,
                                logging: console.log,
                              }
                            );
                            
                            allCustomers = [...getPurchaseData, ...getSaleData, ...getMergerInData, ...getMergerOutData];   
                        } else if(customerType == "security") {
                            /** Security, Release */								
                            const querySecurity = "SELECT aaa.id, aaa.name as name, r.representative_name as normalize_name, 'Security' as type FROM assignee as ee LEFT JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = or.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id INNER JOIN (SELECT or.rf_id FROM assignor as `or` INNER JOIN assignment_conveyance as ass ON ass.rf_id = or.rf_id INNER JOIN  assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id WHERE ass.convey_ty = :convey_type AND (aa.name = :name OR r1.representative_name = :name) GROUP BY or.rf_id) as temp ON temp.rf_id = ee.rf_id GROUP BY name, normalize_name ORDER BY normalize_name ASC, name ASC ";
                                
                            const queryRelease = "SELECT aaa.id, aaa.name as name, r.representative_name as normalize_name, 'Release' as type FROM assignor as `or` LEFT JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = or.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id INNER JOIN (SELECT ee.rf_id FROM assignee as ee INNER JOIN assignment_conveyance as ass ON ass.rf_id = or.rf_id INNER JOIN  assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id WHERE ass.convey_ty = :convey_type AND (aa.name = :name OR r1.representative_name = :name) GROUP BY ee.rf_id) as temp ON temp.rf_id = or.rf_id GROUP BY name, normalize_name ORDER BY normalize_name ASC, name ASC ";

                            const getSecurityData = await connection.application.query(querySecurity,{
                                type: db.Sequelize.QueryTypes.SELECT,
                                replacements: { name: getCompaniesList[i].name, convey_type: 'security' },
                                raw: true,
                                logging: console.log,
                              }
                            );

                            const getReleaseData = await connection.application.query(queryRelease,{
                                type: db.Sequelize.QueryTypes.SELECT,
                                replacements: { name: getCompaniesList[i].name, convey_type: 'release' },
                                raw: true,
                                logging: console.log,
                              }
                            );
                            
                            allCustomers = [...getSecurityData, ...getReleaseData];
                        } else if(customerType == "other") {
                            /*other, namechg, missing, govern*/
                            const queryNameChange = "SELECT aaa.id, aaa.name as name, r.representative_name as normalize_name, 'Name Change' as type FROM assignor as `or` LEFT JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = or.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id INNER JOIN (SELECT ee.rf_id FROM assignee as ee INNER JOIN assignment_conveyance as ass ON ass.rf_id = or.rf_id INNER JOIN  assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id WHERE ass.convey_ty = :convey_type AND (aa.name = :name OR r1.representative_name = :name) GROUP BY ee.rf_id) as temp ON temp.rf_id = ac.rf_id GROUP BY name, normalize_name ORDER BY normalize_name ASC, name ASC ";
									
                            const getNameChgData = await connection.application.query(queryNameChange,{
                                type: db.Sequelize.QueryTypes.SELECT,
                                replacements: { name: getAllSubsidariesData[i].name, convey_type: 'namechg' },
                                raw: true,
                                logging: console.log,
                                }
                            );

                            let queryGovernChange = "SELECT aaa.id, aaa.name as name, r.representative_name as normalize_name, 'Govt.' as type FROM assignor as `or` LEFT JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = or.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id INNER JOIN (SELECT ee.rf_id FROM assignee as ee INNER JOIN assignment_conveyance as ass ON ass.rf_id = or.rf_id INNER JOIN  assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id WHERE ass.convey_ty = :convey_type AND (aa.name = :name OR r1.representative_name = :name) GROUP BY ee.rf_id) as temp ON temp.rf_id = ac.rf_id GROUP BY name, normalize_name ORDER BY normalize_name ASC, name ASC ";
									
                            let getGovernData = await connection.application.query(queryGovernChange,{
                                type: db.Sequelize.QueryTypes.SELECT,
                                replacements: { name: getAllSubsidariesData[i].name, convey_type: 'govern' },
                                raw: true,
                                logging: console.log,
                                }
                            );

                            allCustomers = [...getNameChgData, ...getGovernData];
                        }

                        console.log(allCustomers);
                        if(allCustomers.length > 0) {
                            let customers = [];
                            allCustomers.forEach( async customer => {
                                let name = customer.normalize_name;
                                    if(name == "" || name == null){
                                        name = customer.name;
                                    }
                                if( !customers.includes(name) ){
                                    customers.push( name );
                                    await org.child.push({id:customer.id, name: name, type: customer.type, level: 1});
                                }
                            });
                        }
                        subsidariesAndCustomer.push(org);
                    }
                }
            }
        }
        req.status(200).json(subsidariesAndCustomer);
    } catch( err ) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
});

module.exports = route;