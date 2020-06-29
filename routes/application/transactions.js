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
    if(companyName != 'undefined') {
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
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
                Transactions.findAll({
                    where: {organisation_id: req.orgId, representative_id: findParent.representative_id}
                })
                .then((list)=>{
                    res.status(200).json(list);
                }).catch((err)=>{
                    console.log(err);
                    res.status(500).json({message: "Unable to retrieve transactions"})
                });
            } else {
                res.status(200).json([]);
            }
        } else {
            res.status(200).json([]);
        }
    } else {
        res.status(200).json([]);
    }
});

module.exports = route;