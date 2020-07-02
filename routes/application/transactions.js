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
    if(companyName != 'undefined' || companyName == 0) {
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            if(companyName != 'undefined' && companyName != 0) {
                const queryFindParent = "SELECT representative_id FROM representative WHERE (original_name = :name OR representative_name = :name) AND parent_id = 0";
                
                const findParent = await req.connection_db.query(queryFindParent,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    replacements: { name: companyName },
                    raw: true,
                    plain: true,
                    logging: console.log,
                    }
                ); 

                if(findParent != null && findParent.representative_id > 0) {
                    Transactions.findOne({
                        attributes:['buy', 'sale', 'security','release', 'license_in', 'license_out'],
                        where: {organisation_id: req.orgId, representative_id: findParent.representative_id}
                    })
                    .then((list)=>{
                        res.status(200).json(list);
                    }).catch((err)=>{
                        console.log(err);
                        res.status(500).json({message: "Unable to retrieve transactions"})
                    });
                } else {
                    res.status(200).json({buy: 0, sale: 0, security: 0, release: 0, license_in: 0, license_out: 0});
                }
            } else {
                Transactions.findOne({
                    attributes:[[connection.application.fn('sum', connection.application.col('buy')), 'buy'], [connection.application.fn('sum', connection.application.col('sale')), 'sale'], [connection.application.fn('sum', connection.application.col('security')), 'security'], [connection.application.fn('sum', connection.application.col('release')), 'release'], [connection.application.fn('sum', connection.application.col('license_in')), 'license_in'], [connection.application.fn('sum', connection.application.col('license_out')), 'license_out']],
                    where: {organisation_id: req.orgId},
                    group: ["organisation_id"]
                })
                .then((list)=>{
                    res.status(200).json(list);
                }).catch((err)=>{
                    console.log(err);
                    res.status(500).json({message: "Unable to retrieve transactions"})
                });
            }
        } else {
            res.status(200).json({buy: 0, sale: 0, security: 0, release: 0, license_in: 0, license_out: 0});
        }
    } else {
        res.status(200).json({buy: 0, sale: 0, security: 0, release: 0, license_in: 0, license_out: 0});
    }
});

module.exports = route;