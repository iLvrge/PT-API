const express = require("express");

const route = express.Router();

//require the Model

const Organisations = require("../../model/business/Organisations");

const authJWT = require("../../helpers/verifyJwtToken");

const helpers = require("../../helpers/helper");

/**
 * List all customers
 */

route.get("/customers", [authJWT.verifyToken, authJWT.isAdmin], (req, res, next) => {

    Organisations.findAll({
        attributes: ['organisation_id', 'name']
    })
    .then((list)=>{
        res.status(200).json(list);
    }).catch((err)=>{
        console.log(err);
        res.status(500).json({message: "Unable to retrieve customer list"})
    });
});

/**
 * Get customer by ID
 */

route.get("/customers/:id", [authJWT.verifyToken, authJWT.isAdmin], (req, res, next) => {
    (async () => {
        try{
            let organisationID = req.params.id;
            if(organisationID > 0){
                let org = await helpers.findOrganisationbyID( organisationID );
                if(org != null && org.organisation_id > 0) {
                    res.status(200).json(org);
                } else {
                    res.status(402).send("Not found");
                }
            } else {
                res.status(402).send("Not found ");
            } 
        } catch (e) {
            console.log(e);
            res.status(402).send("Not found ");
        }         
    })();     
});


/**
 * Get customer by ID
 */

route.get("/customers/:id/libraries/:company_name", [authJWT.verifyToken, authJWT.isAdmin], (req, res, next) => {
    (async () => {
        try{
            let organisationID = req.params.id;
            if(organisationID > 0){
                let org = await helpers.findOrganisationbyID( organisationID );
                if(org != null && org.organisation_id > 0) {
                    /**
                     * Get list of all from resources database.
                     */
                    let companyName = req.params.company_name;

                    let companiesList = [];

                    if(companyName != undefined  && companyName.length > 0) {

                        let allList = [];

                        const employee = await helpers.getCompanyListByEmployee(companyName);
                        const ownership = await helpers.getCompanyListByOwnership(companyName);
                        const security = await helpers.getCompanyListBySecurity(companyName);
                        const other = await helpers.getCompanyListByOther(companyName);

                        allList = [...employee, ...ownership, ...security, ...other];

                        if(allList.length > 0) {
                            let nameList = [];
                            allList.map(company => {
                                let name = company.normalize_name;
                                if(name == null || name == '') {
                                    name = company.name;
                                }
                                if(!nameList.includes(name)) {
                                   nameList.push(name);
                                   companiesList.push({name: name, type: company.type, company_name: company.name, normalize_name: company.normalize_name});
                                }
                            })
                        }
                    }
                    res.status(200).json(companiesList);
                } else {
                    res.status(402).send("Not found");
                }
            } else {
                res.status(402).send("Not found ");
            } 
        } catch (e) {
            console.log(e);
            res.status(402).send("Not found ");
        }         
    })();     
});

/**
 * Create new Customer
 */

route.post("/customers", [authJWT.verifyToken, authJWT.isAdmin], (req, res, next) => {
    (async () => {
        try{
            let companyName = req.body.company_name;

            if(companyName != undefined && companyName.length > 0) {
                Organisation.create({
                    name: req.body.company_name,
                    country_id:1,
                }).then( org => {
                    if(org != null && org.organisation_id > 0){
                        res.status(200).json(org);
                    } else {
                        res.status(500).send("Internal server error");
                    }
                }).catch(err => {
                    console.log(err);
                    res.status(400).send("Bad inputs");
                });
            }
        } catch (e) {
            console.log(e);
            res.status(402).send("Not able to create new customer ");
        }         
    })();     
});

module.exports = route;