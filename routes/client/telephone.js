const express = require("express");

const route = express.Router();

const Telephone = require("../../model/client/Telephone");
const Representatives = require("../../model/client/Representatives");

const authJWT = require("../../helpers/verifyJwtToken");

const clientDBConnection = require("../../helpers/clientDBConnection");



/**
 * Add Telephone
 */
route.post("/telephone", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        let add = {};
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {


            if(req.body.telephone_number != null && req.body.representative_id > 0) {
                
                const postData = req.body;

                const Telephones = req.connection_db.define('Telephone', Telephone.mainStructure, Telephone.options);

                add = await Telephones.create(postData);
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
 * Get Telephone
 */
route.get("/telephone", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {

            const Telephones = req.connection_db.define('Telephone', Telephone.mainStructure, Telephone.options);

            const Representative = req.connection_db.define('Representatives', Representatives.mainStructure, Representatives.options);

            Representative.hasMany(Telephones, { foreignKey: 'representative_id', as: 'telephone' });

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
                        model: Telephones,
                        as: 'telephone',
                        attributes: ['telephone_id', 'telephone_number']
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
 * Delete Telephone
 */
route.delete("/telephone/:telephoneID", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {

            if(req.params.telephoneID != null && req.params.telephoneID > 0) {
                
                const Telephones = req.connection_db.define('Telephone', Telephone.mainStructure, Telephone.options);

                const findData = Telephones.findOne({
                    where:{telephone_id: req.params.telephoneID}
                })

                if(findData != null) {
                    await findData.destroy();
                    res.status(200).send("Record delete successfully");    
                } else {
                    res.status(402).send("Invalid telephone ID");    
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