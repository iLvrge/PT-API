const express = require("express");

const route = express.Router();

//require the Model

const Validity = require("../../model/application/Validity");

const authJWT = require("../../helpers/verifyJwtToken");

const helpers = require("../../helpers/helper");

const connection = require("../../config/db.config");

const clientDBConnection = require("../../helpers/clientDBConnection");

route.get("/validity_counter", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {

    if(typeof req.connection_db != "undefined" && req.connection_db != null ) {

        const whereCondition = {organisation_id: req.orgId}, companyList = req.query.companies;

        if(companyList != undefined && companyList != '') {
            const companies = JSON.parse(companyList);
            if(companies.length > 0) {
                whereCondition.representative_id = companies;
            }
        }

        Validity.findOne({
            attributes:[[connection.application.fn('sum', connection.application.col('application')), 'application'], [connection.application.fn('sum', connection.application.col('patent')), 'patent'], [connection.application.fn('sum', connection.application.col('encumbered')), 'encumbered'], [connection.application.fn('sum', connection.application.col('current_year')), 'current'], [connection.application.fn('sum', connection.application.col('difference')), 'difference']],
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