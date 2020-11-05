const express = require("express");

const route = express.Router();

//require the Model

const Validity = require("../../model/application/Validity");

const authJWT = require("../../helpers/verifyJwtToken");

const helpers = require("../../helpers/helper");

const connection = require("../../config/db.config");

const clientDBConnection = require("../../helpers/clientDBConnection");

route.get("/validity_counter", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    const rest = {application: 0, patent: 0, encumbered: 0, current_patent: 0, current_application: 0, difference_patent: 0, difference_application: 0};
    if(typeof req.connection_db != "undefined" && req.connection_db != null ) {

        const whereCondition = {organisation_id: req.orgId}, companyList = req.query.companies;

        if(companyList != undefined && companyList != '') {
            const companies = JSON.parse(companyList);
            if(companies.length > 0) {
                whereCondition.representative_id = companies;
            }
        }

        Validity.findOne({
            attributes:[[connection.application.fn('sum', connection.application.col('application')), 'application'], [connection.application.fn('sum', connection.application.col('patent')), 'patent'], [connection.application.fn('sum', connection.application.col('encumbered')), 'encumbered'], [connection.application.fn('sum', connection.application.col('current_patent_year')), 'current_patent'],[connection.application.fn('sum', connection.application.col('current_application_year')), 'current_application'], [connection.application.fn('sum', connection.application.col('difference_patent')), 'difference_patent'], [connection.application.fn('sum', connection.application.col('difference_application')), 'difference_application']],
            where: whereCondition,
            group: ["organisation_id"]
        })
        .then((list)=>{
            res.status(200).json(list);
        }).catch((err)=>{
            console.log(err);
            res.status(200).json(rest);
        });
    } else {
        res.status(200).json(rest);
    }
});

module.exports = route;