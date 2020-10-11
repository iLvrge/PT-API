const express = require("express");

const route = express.Router();

const Lawyer = require("../../model/client/Lawyer");
const Representatives = require("../../model/client/Representatives");

const authJWT = require("../../helpers/verifyJwtToken");

const clientDBConnection = require("../../helpers/clientDBConnection");

/**
 * Add CompanyLawyer
 */
route.post("/lawyer", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        let add = {};
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {

            const postData = {		
                name: req.body.name,
                representative_id: req.params.representativeID,
            }

            if(req.body.name != null && req.body.representative_id > 0) {
                
                const postData = req.body;

                const companyLawyer = req.connection_db.define('Lawyer', Lawyer.mainStructure, Lawyer.options);

                add = await companyLawyer.create(postData);
            } else {
                res.status(402).send("Invalid inputs");        
            } 
        }
        res.status(200).json(add);
    } catch (e) {
        console.log(e);
        res.status(500).send("Internal error");
    }
});


/**
 * Get CompanyLawyer
 */
route.get("/lawyer", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {

            const companyLawyer = req.connection_db.define('Lawyer', Lawyer.mainStructure, Lawyer.options);

            const Representative = req.connection_db.define('Representatives', Representatives.mainStructure, Representatives.options);

            Representative.hasMany(companyLawyer, { foreignKey: 'representative_id', as: 'lawyer' });

            let where = {};

            if(req.query.companies != undefined && req.query.companies != null) {
                const representativeIDs = JSON.parse(req.query.companies);
                where = {representative_id: representativeIDs};
            }

            const list = await Representative.findAll({
                attributes: ['representative_id'],
                where: where,
                include: [
                    {
                        model: companyLawyer,
                        as: 'lawyer',
                        attributes: ['lawyer_id', 'name','created_at','updated_at']
                    }
                ]
            });
            
            res.status(200).json(list);
        }
    } catch (e) {
        res.status(500).send("Internal error");
    }
});


/**
 * Delete Lawyer
 */
route.delete("/lawyer/:lawyerID", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {

            if(req.params.lawyerID != null && req.params.lawyerID > 0) {
                
                const companyLawyer = req.connection_db.define('Lawyer', Lawyer.mainStructure, Lawyer.options);

                const findData = await companyLawyer.findOne({
                    where:{lawyer_id: req.params.lawyerID}
                })

                if(findData != null) {
                    const deleteData = await companyLawyer.destroy({where:{lawyer_id: req.params.lawyerID}});
                    if(deleteData) {
                        res.status(200).send("Record delete successfully");    
                    } else {
                        res.status(500).send("Deleting data failed.");    
                    } 
                } else {
                    res.status(402).send("Invalid address ID");    
                }
            } else {
                res.status(402).send("Invalid inputs");        
            } 
        }
        
    } catch (e) {
        console.log(e);
        res.status(500).send("Internal error");
    }
});

module.exports = route;