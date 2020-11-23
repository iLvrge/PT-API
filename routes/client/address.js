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

            if(req.body.street_address != null && req.body.representative_id > 0) {
                
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
            where.parent_id = 0;
            const list = await Representative.findAll({
                attributes: ['representative_id'],
                where: where,
                include: [
                    {
                        model: Addresses,
                        as: 'address',
                        attributes: ['address_id', 'street_address','suite','city','state','zip_code', 'telephone', 'telephone_2', 'telephone_3',[clientDBConnection.Sequelize.fn('date_format', sequelize.col('created_at'), '%Y-%m-%d'), 'created_at'],[clientDBConnection.Sequelize.fn('date_format', sequelize.col('updated_at'), '%Y-%m-%d'), 'updated_at']]
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
 * Get Address
 */
route.put("/address/:addressID", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {

            const addressID = req.params.addressID;

            const Addresses = req.connection_db.define('Address', Address.mainStructure, Address.options);

            const findAddress = Addresses.findByPk(addressID);

            if(findAddress != null && findAddress.address_id > 0) {
                const update = findAddress.update({
                    street_address: req.body.street_address,
                    suite: req.body.suite,
                    city: req.body.city,
                    state: req.body.state,
                    zip_code: req.body.zip_code,
                    telephone: req.body.telephone,
                    telephone_2: req.body.telephone_2,
                    telephone_3: req.body.telephone_3,
                });

                if(update) {
                    res.status(200).json(findAddress);
                } else {
                    res.status(500).send("Internal server error");
                }
            } else {
                res.status(402).send("Invalid input");
            }            
        }
    } catch (err) {
        console.log(err);
        res.status(500).send("Internal server error");
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