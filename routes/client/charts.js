const express = require("express");

const route = express.Router();

const connection = require("../../config/db.config");

//require the Model
const Representatives = require("../../model/client/Representatives");


const authJWT = require("../../helpers/verifyJwtToken");


const clientDBConnection = require("../../helpers/clientDBConnection");
/**Get User List */
route.get("/:type", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        const type = req.params.type;
        let chartData = [];
        if(type == 1) {
            /**Invention */
            const Representative = req.connection_db.define('Representatives', Representatives.mainStructure, Representatives.options);
            const getAllRepresentative = await  Representative.findAll({
                                                    where: {parent_id: 0}
                                                });

            if(getAllRepresentative.length > 0) {
                const names = [];
                await Promise.all(getAllRepresentative.map( r => {
                    let name = r.representative_name;
                    if(name == null || name == '') {
                        name = r.orginal_name;
                    }
                    names.push(name);
                    return r;
                }));

                if(names.length > 0) {
                    const queryInventor = "Select date_format(exec_dt,'%m-%Y') as label1, exec_dt as label, count(or.rf_id) as value, sum(temp1.assets) as assets FROM assignor as `or` INNER JOIN (SELECT  or.rf_id, (select count(d.appno_doc_num) FROM documentid as d where d.rf_id = or.rf_id) as assets from assignor as `or` INNER JOIN (SELECT ee.rf_id FROM assignee as ee INNER JOIN assignment_conveyance as ac ON ac.rf_id = ee.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = ee.assignor_and_assignee_id INNER JOIN representative as r ON r.representative_id = aaa.representative_id WHERE (r.representative_name IN (:names) OR aaa.name IN (:names)) AND ac.employer_assign = :employerAssign AND ac.convey_ty IN ('partialassignment', 'assignment', 'employee')) as temp ON temp.rf_id = or.rf_id GROUP BY or.rf_id) as temp1 ON temp1.rf_id = `or`.rf_id  GROUP BY label1";

                    chartData = await connection.application.query(queryInventor,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        replacements: { names: names, employerAssign: 1},
                        logging: console.log,
                      }
                    );
                }
            }
            
        } else if(type == 2) {
            /**Acquisitions */

            const Representative = req.connection_db.define('Representatives', Representatives.mainStructure, Representatives.options);
            const getAllRepresentative = await  Representative.findAll({
                                                    where: {parent_id: 0}
                                                });
            
            if(getAllRepresentative.length > 0) {
                const names = [];
                await Promise.all(getAllRepresentative.map( r => {
                    let name = r.representative_name;
                    if(name == null || name == '') {
                        name = r.orginal_name;
                    }
                    names.push(name);
                    return r;
                }));

                if(names.length > 0) {
                    const queryAcquisition = "Select date_format(exec_dt,'%m-%Y') as label1, exec_dt as label , count(or.rf_id) as value, sum(temp1.assets) as assets FROM assignor as `or` INNER JOIN (SELECT or.rf_id, (select count(d.appno_doc_num) FROM documentid as d where d.rf_id = or.rf_id) as assets from assignor as `or` INNER JOIN (SELECT ee.rf_id FROM assignee as ee INNER JOIN assignment_conveyance as ac ON ac.rf_id = ee.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = ee.assignor_and_assignee_id INNER JOIN representative as r ON r.representative_id = aaa.representative_id WHERE (r.representative_name IN (:names) OR aaa.name IN (:names)) AND ac.employer_assign = :employerAssign AND ac.convey_ty IN ('partialassignment','assignment')) as temp ON temp.rf_id = or.rf_id GROUP BY or.rf_id) as temp1 ON temp1.rf_id = `or`.rf_id GROUP BY label1";

                    chartData = await connection.application.query(queryAcquisition,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        replacements: { names: names, employerAssign: 0},
                        logging: console.log,
                      }
                    );
                }
            }
        } else if(type == 3) {
            /**Sales */
            const Representative = req.connection_db.define('Representatives', Representatives.mainStructure, Representatives.options);
            const getAllRepresentative = await  Representative.findAll({
                                                    where: {parent_id: 0}
                                                });
            
            if(getAllRepresentative.length > 0) {
                const names = [];
                await Promise.all(getAllRepresentative.map( r => {
                    let name = r.representative_name;
                    if(name == null || name == '') {
                        name = r.orginal_name;
                    }
                    names.push(name);
                    return r;
                }));

                if(names.length > 0) {
                    const queryAcquisition = "Select exec_dt as label , count(or.rf_id) as value, sum(temp1.assets) as assets FROM assignor as `or` INNER JOIN (SELECT ee.rf_id, (select count(d.appno_doc_num) FROM documentid as d where d.rf_id = ee.rf_id) as assets from assignee as `ee` INNER JOIN (SELECT or.rf_id FROM assignor as `or` INNER JOIN assignment_conveyance as ac ON ac.rf_id = or.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = or.assignor_and_assignee_id INNER JOIN representative as r ON r.representative_id = aaa.representative_id WHERE (r.representative_name IN (:names) OR aaa.name IN (:names)) AND ac.employer_assign = :employerAssign AND ac.convey_ty IN ('partialassignment','assignment')) as temp ON temp.rf_id = ee.rf_id GROUP BY ee.rf_id) as temp1 ON temp1.rf_id = `or`.rf_id GROUP BY label";

                    chartData = await connection.application.query(queryAcquisition,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        replacements: { names: names, employerAssign: 0},
                        logging: console.log,
                      }
                    );
                }
            }
        } else if ( type == 4) {
            /**Security */
            const Representative = req.connection_db.define('Representatives', Representatives.mainStructure, Representatives.options);
            const getAllRepresentative = await  Representative.findAll({
                                                    where: {parent_id: 0}
                                                });
            
            if(getAllRepresentative.length > 0) {
                const names = [];
                await Promise.all(getAllRepresentative.map( r => {
                    let name = r.representative_name;
                    if(name == null || name == '') {
                        name = r.orginal_name;
                    }
                    names.push(name);
                    return r;
                }));

                if(names.length > 0) {
                    const querySecurity = "Select exec_dt as label , count(or.rf_id) as value, sum(temp1.assets) as assets FROM assignor as `or` INNER JOIN (SELECT ee.rf_id, (select count(d.appno_doc_num) FROM documentid as d where d.rf_id = ee.rf_id) as assets from assignee as `ee` INNER JOIN (SELECT or.rf_id FROM assignor as `or` INNER JOIN assignment_conveyance as ac ON ac.rf_id = or.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = or.assignor_and_assignee_id INNER JOIN representative as r ON r.representative_id = aaa.representative_id WHERE (r.representative_name IN (:names) OR aaa.name IN (:names)) AND ac.employer_assign = :employerAssign AND ac.convey_ty IN ('security', 'restatedsecurity')) as temp ON temp.rf_id = ee.rf_id GROUP BY ee.rf_id) as temp1 ON temp1.rf_id = `or`.rf_id GROUP BY label";

                    chartData = await connection.application.query(querySecurity,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        replacements: { names: names, employerAssign: 0},
                        logging: console.log,
                      }
                    );
                }
            }
            
        } else if ( type == 5 ) {
            /**Security per assignee per month */
            const Representative = req.connection_db.define('Representatives', Representatives.mainStructure, Representatives.options);
            const getAllRepresentative = await  Representative.findAll({
                                                    where: {parent_id: 0}
                                                });
            /*console.log(getAllRepresentative);*/
            
            if(getAllRepresentative.length > 0) {
                const names = [];
                await Promise.all(getAllRepresentative.map( r => {
                    let name = r.representative_name;
                    if(name == null || name == '') {
                        name = r.orginal_name;
                    }
                    names.push(name);
                    return r;
                }));

                if(names.length > 0) {
                    const querySecurity = "SELECT CASE WHEN r1.representative_name = null THEN aa.name ELSE r1.representative_name END entityName, ((select count(d.appno_doc_num) FROM documentid as d where d.rf_id = ee.rf_id)) as assets, (select ass.exec_dt FROM assignor as ass where ass.rf_id = ee.rf_id GROUP BY rf_id ) as label, count(ee.rf_id) as value from assignee as `ee` INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ee.assignor_and_assignee_id INNER JOIN representative as r1 ON r1.representative_id = aa.representative_id INNER JOIN (SELECT or.rf_id FROM assignor as `or` INNER JOIN assignment_conveyance as ac ON ac.rf_id = or.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = or.assignor_and_assignee_id INNER JOIN representative as r ON r.representative_id = aaa.representative_id WHERE (r.representative_name IN (:names) OR aaa.name IN (:names)) AND ac.employer_assign = :employerAssign AND ac.convey_ty IN ('security', 'restatedsecurity')) as temp ON temp.rf_id = ee.rf_id GROUP BY  entityName, label";

                    chartData = await connection.application.query(querySecurity,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        replacements: { names: names, employerAssign: 0},
                        logging: console.log,
                        }
                    );
                }
            }
        }
        res.status(200).json(chartData);
    } catch (err) {
        console.log(err)
        res.status(500).send("Internal server error");
    }
});
module.exports = route;