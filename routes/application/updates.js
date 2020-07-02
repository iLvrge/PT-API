const express = require("express");

const route = express.Router();

//require the Model

const Updates = require("../../model/application/Updates");

const authJWT = require("../../helpers/verifyJwtToken");

const helpers = require("../../helpers/helper");

const connection = require("../../config/db.config");

const clientDBConnection = require("../../helpers/clientDBConnection");

route.get("/updates/:companyName", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
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
                    Updates.findOne({
                        attributes:['weekly_transactions', 'weekly_applications', 'monthly_transactions', 'montly_applications', 'quaterly_transactions', 'quaterly_applications'],
                        where: {organisation_id: req.orgId, representative_id: findParent.representative_id}
                    })
                    .then((list)=>{
                        res.status(200).json(list);
                    }).catch((err)=>{
                        console.log(err);
                        res.status(500).json({message: "Unable to retrieve transactions"})
                    });
                } else {
                    res.status(200).json({weekly: 0, monthly: 0, quaterly: 0});
                }
            } else {
                Updates.findOne({
                    attributes:[[connection.application.fn('sum', connection.application.col('weekly_transactions')), 'weekly_transactions'], [connection.application.fn('sum', connection.application.col('weekly_applications')), 'weekly_applications'], [connection.application.fn('sum', connection.application.col('monthly_transactions')), 'monthly_transactions'], [connection.application.fn('sum', connection.application.col('montly_applications')), 'montly_applications'], [connection.application.fn('sum', connection.application.col('quaterly_transactions')), 'quaterly_transactions'], [connection.application.fn('sum', connection.application.col('quaterly_applications')), 'quaterly_applications']],
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
            res.status(200).json({weekly_transactions: 0, weekly_applications: 0, monthly_transactions: 0, montly_applications: 0, quaterly_transactions: 0, quaterly_applications: 0});
        }
    } else {
        res.status(200).json({weekly_transactions: 0, weekly_applications: 0, monthly_transactions: 0, montly_applications: 0, quaterly_transactions: 0, quaterly_applications: 0});
    }    
});

module.exports = route;