const express = require("express");

const route = express.Router();

//require the Model

const Transactions = require("../../model/application/Transactions");

const authJWT = require("../../helpers/verifyJwtToken");

const helpers = require("../../helpers/helper");

const connection = require("../../config/db.config");

const clientDBConnection = require("../../helpers/clientDBConnection");

route.get("/transactions/:companyName", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {

    let companyName = req.params.companyName;

    if(companyName == 'undefined') {
        const findMainCompany = await helpers.findOrganisationbyID(req.orgId);
        if(findMainCompany != null) {
            companyName = findMainCompany.name;
        }
    }
    const resultS = {buy: 0, buy_patent: 0, diff_buy_patent: 0, sale: 0, sale_patent: 0, diff_sale_patent: 0, security: 0, security_patent: 0, diff_security_patent: 0, release: 0, release_patent: 0, diff_release_patent: 0, license_in: 0, license_in_patent: 0, diff_license_in_patent: 0, license_out: 0, license_out_patent: 0, diff_license_out_patent: 0};
    if(companyName != 'undefined' || companyName == 0) {
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {

            const whereCondition = {organisation_id: req.orgId}, companyList = req.query.companies;

            if(companyList != undefined && companyList != '') {
                const companies = JSON.parse(companyList);
                if(companies.length > 0) {
                    whereCondition.representative_id = companies;
                }
            }

            Transactions.findOne({
                attributes:[[connection.application.fn('sum', connection.application.col('buy')), 'buy'],[connection.application.fn('sum', connection.application.col('buy_patent')), 'buy_patent'],[connection.application.fn('sum', connection.application.col('diff_buy_patent')), 'diff_buy_patent'], [connection.application.fn('sum', connection.application.col('sale')), 'sale'],[connection.application.fn('sum', connection.application.col('sale_patent')), 'sale_patent'],[connection.application.fn('sum', connection.application.col('diff_sale_patent')), 'diff_sale_patent'], [connection.application.fn('sum', connection.application.col('security')), 'security'],[connection.application.fn('sum', connection.application.col('security_patent')), 'security_patent'],[connection.application.fn('sum', connection.application.col('diff_security_patent')), 'diff_security_patent'], [connection.application.fn('sum', connection.application.col('release')), 'release'],[connection.application.fn('sum', connection.application.col('release_patent')), 'release_patent'],[connection.application.fn('sum', connection.application.col('diff_release_patent')), 'diff_release_patent'], [connection.application.fn('sum', connection.application.col('license_in')), 'license_in'], [connection.application.fn('sum', connection.application.col('license_in_patent')), 'license_in_patent'],[connection.application.fn('sum', connection.application.col('diff_license_in_patent')), 'diff_license_in_patent'],[connection.application.fn('sum', connection.application.col('license_out')), 'license_out'],[connection.application.fn('sum', connection.application.col('license_out_patent')), 'license_out_patent'],[connection.application.fn('sum', connection.application.col('diff_license_out_patent')), 'diff_license_out_patent']],
                where: whereCondition,
                group: ["organisation_id"]
            })
            .then((list)=>{
                if(list != null) {
                    res.status(200).json(list);
                } else {
                    res.status(200).json(resultS);
                } 
            }).catch((err)=>{
                console.log(err);
                res.status(200).json(resultS);
            });
        } else {
            res.status(200).json(resultS);
        }
    } else {
        res.status(200).json(resultS);
    }
});

module.exports = route;