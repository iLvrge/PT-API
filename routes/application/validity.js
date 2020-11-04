const express = require("express");

const route = express.Router();

//require the Model

const Validity = require("../../model/application/Validity");

const authJWT = require("../../helpers/verifyJwtToken");

const helpers = require("../../helpers/helper");

const connection = require("../../config/db.config");

const clientDBConnection = require("../../helpers/clientDBConnection");

route.get("/validity_counter/:companyName", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {

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
                    Validity.findOne({
                        attributes:['application', 'patent', 'encumbered', ['current_year', 'current'], 'difference'],
                        where: {organisation_id: req.orgId, representative_id: findParent.representative_id}
                    })
                    .then((list)=>{
                        res.status(200).json(list);
                    }).catch((err)=>{
                        console.log(err);
                        res.status(500).json({message: "Unable to retrieve assets validity"})
                    });
                } else {
                    res.status(200).json({application: 0, patent: 0, encumbered: 0});
                }
            } else {
                Validity.findOne({
                    attributes:[[connection.application.fn('sum', connection.application.col('application')), 'application'], [connection.application.fn('sum', connection.application.col('patent')), 'patent'], [connection.application.fn('sum', connection.application.col('encumbered')), 'encumbered'], [connection.application.fn('sum', connection.application.col('current_year')), 'current'], [connection.application.fn('sum', connection.application.col('difference')), 'difference']],
                    where: {organisation_id: req.orgId},
                    group: ["organisation_id"]
                })
                .then((list)=>{
                    res.status(200).json(list);
                }).catch((err)=>{
                    console.log(err);
                    res.status(500).json({message: "Unable to retrieve assets validity"})
                });
            }
        } else {
            res.status(200).json({application: 0, patent: 0, encumbered: 0});
        }
    } else {
        res.status(200).json({application: 0, patent: 0, encumbered: 0});
    }
});

module.exports = route;