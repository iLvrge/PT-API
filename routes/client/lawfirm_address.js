const express = require("express");

const route = express.Router();

const LawfirmAddress = require("../../model/client/LawfirmAddress");

const Representatives = require("../../model/client/Representatives");

const CompanyLawfirm = require("../../model/client/CompanyLawfirm");


const authJWT = require("../../helpers/verifyJwtToken");

const clientDBConnection = require("../../helpers/clientDBConnection");

/**
 * Add CompanyLawyer
 */
route.post("/lawfirm_address", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        let add = {};
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            if(req.body.lawfirm_id != undefined && req.body.lawfirm_id > 0) {
                
                const postData = req.body;

                const companyLawfirmAddresss = req.connection_db.define('LawfirmAddress', LawfirmAddress.mainStructure, LawfirmAddress.options);

                add = await companyLawfirmAddresss.create(postData);
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

route.put("/lawfirm_address/:lawfirmAddressID", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            if(req.params.lawfirmAddressID != null && req.params.lawfirmAddressID > 0) {
                const companyLawfirmAddresss = req.connection_db.define('LawfirmAddress', LawfirmAddress.mainStructure, LawfirmAddress.options);
                const findData = await companyLawfirmAddresss.findOne({
                    where:{address_id: req.params.lawfirmAddressID}
                })

                if(findData != null) {                
                   const postData = req.body;
                   const update = await findData.update(postData);
                   if(update)  {
                    res.status(200).json(findData);        
                   } else {
                    res.status(500).send("Unable to update data.");
                   }
                }
            } else {
                res.status(402).send("Invalid inputs");        
            } 
        } else {
            res.status(402).send("Invalid inputs");        
        }
    } catch (e) {
        console.log(e);
        res.status(500).send("Internal error");
    }
});


/**
 * Get Lawfirm Address
 */
route.get("/lawfirm_address", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {

            const companyLawfirmAddresss = req.connection_db.define('LawfirmAddress', LawfirmAddress.mainStructure, LawfirmAddress.options);

            const list = await companyLawfirmAddresss.findAll();
            
            res.status(200).json(list);
        }
    } catch (e) {
        res.status(500).send("Internal error");
    }
});

/**
 * Get Lawfirm Address
 */
route.get("/lawfirm_address/:lawfirmID", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {

            const companyLawfirmAddresss = req.connection_db.define('LawfirmAddress', LawfirmAddress.mainStructure, LawfirmAddress.options);

            const list = await companyLawfirmAddresss.findAll({
                where:{lawfirm_id: req.params.lawfirmID}
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
route.delete("/lawfirm_address/:lawfirmAddressID", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {

            if(req.params.lawfirmAddressID != null && req.params.lawfirmAddressID > 0) {
                
                const companyLawfirmAddresss = req.connection_db.define('LawfirmAddress', LawfirmAddress.mainStructure, LawfirmAddress.options);

                const findData = await companyLawfirmAddresss.findOne({
                    where:{address_id: req.params.lawfirmAddressID}
                })

                if(findData != null) {
                    const deleteData = await companyLawfirmAddresss.destroy({where:{address_id: req.params.lawfirmAddressID}});
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


route.post("/company_lawfirm", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        let add = {};
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            if(req.body.representative_id != null && req.body.representative_id != undefined && req.body.representative_id > 0 && req.body.lawfirm_id != undefined && req.body.lawfirm_id > 0) {
                
                const postData = req.body;

                const RepresentativeLawfirm = req.connection_db.define('RepresentativeLawfirm', CompanyLawfirm.mainStructure, CompanyLawfirm.options);

                add = await RepresentativeLawfirm.create(postData);
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


route.delete("/company_lawfirm/companyLawfirmID", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        let add = {};
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            if(req.params.companyLawfirmID != null && req.params.companyLawfirmID != undefined && req.params.companyLawfirmID > 0) {
                
                const RepresentativeLawfirm = req.connection_db.define('RepresentativeLawfirm', CompanyLawfirm.mainStructure, CompanyLawfirm.options);

                const findData = RepresentativeLawfirm.findByPk(req.params.companyLawfirmID);

                if(findData != null && findData.company_lawfirm_id > 0) {
                    const deleteData = await RepresentativeLawfirm.destroy({
                        where:{company_lawfirm_id: req.params.companyLawfirmID}
                    })

                    if(deleteData) {
                        res.status(200).send("Record delete successfully");    
                    } else {
                        res.status(500).send("Deleting data failed.");    
                    } 
                }
            } else {
                res.status(402).send("Invalid inputs");        
            } 
        } else {
            res.status(402).send("Invalid inputs");        
        } 
    } catch (e) {
        console.log(e);
        res.status(500).send("Internal error");
    }
});

module.exports = route;