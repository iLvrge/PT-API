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
        if(type == 1) {
            /**Invention */
            const Representative = req.connection_db.define('Representatives', Representatives.mainStructure, Representatives.options);
            const getAllRepresentative = await  Representative.findAll({
                                                    where: {parent_id: 0}
                                                });
            let inventorData = []
            if(getAllRepresentative.length > 0) {
                const IDs = [];
                getAllRepresentative.map( r => IDs.push(r.representative_id));

                if(IDs.length > 0) {
                    const queryInventor = "Select date_format(exec_dt,'%b') as label, count(or.rf_id) as value, date_format(exec_dt,'%m') as monthly FROM assignor as `or` INNER JOIN (SELECT  or.rf_id from assignor as `or` INNER JOIN (SELECT ee.rf_id FROM assignee as ee INNER JOIN assignment_conveyance as ac ON ac.rf_id = ee.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = ee.assignor_and_assignee_id INNER JOIN representative as r ON r.representative_id = aaa.representative_id WHERE r.representative_id IN (:IDs) AND ac.employer_assign = :employerAssign AND ac.convey_ty IN ('assignment', 'employee')) as temp ON temp.rf_id = or.rf_id GROUP BY or.rf_id) as temp1 ON temp1.rf_id = `or`.rf_id GROUP BY label ORDER BY monthly ASC";

                    inventorData = await connection.application.query(queryInventor,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        replacements: { IDs: IDs.join(','), employerAssign: 1},
                        logging: console.log,
                      }
                    );
                }
            }
            res.status(200).json(inventorData);
        } else if(type == 2) {
            /**Acquisitions */

            const Representative = req.connection_db.define('Representatives', Representatives.mainStructure, Representatives.options);
            const getAllRepresentative = await  Representative.findAll({
                                                    where: {parent_id: 0}
                                                });
            let acquisitionData = []
            if(getAllRepresentative.length > 0) {
                const IDs = [];
                getAllRepresentative.map( r => IDs.push(r.representative_id));

                if(IDs.length > 0) {
                    const queryAcquisition = "Select date_format(exec_dt,'%b') as label, count(or.rf_id) as value, date_format(exec_dt,'%m') as monthly FROM assignor as `or` INNER JOIN (SELECT  or.rf_id from assignor as `or` INNER JOIN (SELECT ee.rf_id FROM assignee as ee INNER JOIN assignment_conveyance as ac ON ac.rf_id = ee.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = ee.assignor_and_assignee_id INNER JOIN representative as r ON r.representative_id = aaa.representative_id WHERE r.representative_id IN (:IDs) AND ac.employer_assign = :employerAssign AND ac.convey_ty = 'assignment') as temp ON temp.rf_id = or.rf_id GROUP BY or.rf_id) as temp1 ON temp1.rf_id = `or`.rf_id GROUP BY label ORDER BY monthly ASC";

                    acquisitionData = await connection.application.query(queryAcquisition,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        replacements: { IDs: IDs.join(','), employerAssign: 1},
                        logging: console.log,
                      }
                    );
                }
            }
            res.status(200).json(acquisitionData);
        }
    } catch (err) {
        console.log(err)
        res.status(500).send("Internal server error");
    }
});
module.exports = route;