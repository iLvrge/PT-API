const express = require("express");

const route = express.Router();

const Lawfirm = require("../../model/client/Lawfirm");

const LawfirmAddress = require("../../model/client/LawfirmAddress");

const Representatives = require("../../model/client/Representatives");

const CompanyLawfirm = require("../../model/client/CompanyLawfirm");

const authJWT = require("../../helpers/verifyJwtToken");

const clientDBConnection = require("../../helpers/clientDBConnection");

/**
 * Add CompanyLawyer
 */
route.post("/lawfirm", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        let add = {};
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            if(req.body.name != null && req.body.name != undefined) {
                
                const postData = req.body;

                const companyLawfirm = req.connection_db.define('Lawfirm', Lawfirm.mainStructure, Lawfirm.options);

                add = await companyLawfirm.create(postData);
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

route.put("/lawfirm/:lawfirmID", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        let add = {};
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            if(req.params.lawfirmID != null && req.params.lawfirmID != undefined && req.params.lawfirmID > 0) {

                const companyLawfirm = req.connection_db.define('Lawfirm', Lawfirm.mainStructure, Lawfirm.options);

                const findData = await companyLawfirm.findByPk(req.params.lawfirmID);

                if(findData != null && findData.lawfirm_id > 0) {
                    const update = await findData.update(req.body)

                    if(update) {
                        res.status(200).json(findData);        
                    } else {
                        res.status(500).send("Unable to update.");        
                    }
                } else {
                    res.status(402).send("Invalid inputs");        
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


/**
 * Get CompanyLawyer
 */
route.get("/lawfirm", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {

            const Lawfirms = req.connection_db.define('Lawfirm', Lawfirm.mainStructure, Lawfirm.options);

            const LawfirmAddre = req.connection_db.define('LawfirmAddress', LawfirmAddress.mainStructure, LawfirmAddress.options);

            const RepresentativeLawfirms = req.connection_db.define('CompanyLawfirm', CompanyLawfirm.mainStructure, CompanyLawfirm.options);

            const Representative = req.connection_db.define('Representatives', Representatives.mainStructure, Representatives.options);

            Lawfirms.hasMany(LawfirmAddre, { foreignKey: 'lawfirm_id', as: 'lawfirm_address' });

            Lawfirms.hasMany(RepresentativeLawfirms, { foreignKey: 'lawfirm_id', as: 'companylawfirm' });
            
            RepresentativeLawfirms.belongsTo(Representative, { foreignKey: 'representative_id', as: 'companylawfirm_representative', otherKey: 'representative_id' });


            let where = {};

            if(req.query.companies != undefined && req.query.companies != null) {
                const representativeIDs = JSON.parse(req.query.companies);
                where = {representative_id: representativeIDs};
            }

            const list = await Lawfirms.findAll({
                include: [
                    {
                        model: LawfirmAddre,
                        as: 'lawfirm_address',
                        required:false
                    },
                    {
                        model: RepresentativeLawfirms,
                        as: 'companylawfirm',
                        attributes: ['representative_id','lawfirm_id', 'company_lawfirm_id'],
                        where: where,
                        required:false,
                        include:[
                            {
                                model: Representative,
                                as: 'companylawfirm_representative',
                                attributes:['representative_id','original_name','representative_name']
                            }
                        ]
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
 * Delete Lawyer
 */
route.delete("/lawfirm/:lawfirmID", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {

            if(req.params.lawfirmID != null && req.params.lawfirmID > 0) {
                
                const companyLawfirm = req.connection_db.define('Lawfirm', Lawfirm.mainStructure, Lawfirm.options);

                const findData = await companyLawfirm.findOne({
                    where:{lawfirm_id: req.params.lawfirmID}
                })

                if(findData != null) {
                    const deleteData = await companyLawyer.destroy({where:{lawfirm_id: req.params.lawfirmID}});
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