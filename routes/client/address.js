const express = require("express");

const route = express.Router();



const Address = require("../../model/client/Address");

const Representatives = require("../../model/client/Representatives");

const authJWT = require("../../helpers/verifyJwtToken");

const clientDBConnection = require("../../helpers/clientDBConnection");



/**
 * Add Address
 */
route.post("/address", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        let add = {};
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {

            if(req.body.address != null && req.body.representative_id > 0) {
                
                const postData = req.body;

                const Addresses = req.connection_db.define('Address', Address.mainStructure, Address.options);
    
                add = await Addresses.create(postData);
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
 * Get Address
 */
route.get("/address", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {

            const Addresses = req.connection_db.define('Address', Address.mainStructure, Address.options);

            const Representative = req.connection_db.define('Representatives', Representatives.mainStructure, Representatives.options);

            Representative.hasMany(Addresses, { foreignKey: 'representative_id', as: 'address' });

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
                        model: Addresses,
                        as: 'address',
                        attributes: ['address_id', 'address','created_at','updated_at']
                    }
                ]
            });
            res.status(200).json(list);
        }
    } catch (err) {
        console.log(err);
        res.status(500).send("Internal error");
    }
});

/**
 * Delete Address
 */
route.delete("/address/:addressID", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {

            if(req.params.addressID != null && req.params.addressID > 0) {
                
                const Addresses = req.connection_db.define('Address', Address.mainStructure, Address.options);

                const findData = await Addresses.findOne({
                    where:{address_id: req.params.addressID}
                })

                if(findData != null) {
                    const deleteData = await Addresses.destroy({where:{address_id: req.params.addressID}});
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