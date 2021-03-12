const express = require("express");

const route = express.Router();

const authJWT = require("../../helpers/verifyJwtToken");

//require the Model

const User = require("../../model/business/Users");

const UserCompanySelection = require("../../model/business/UserCompanySelection");

/**
 * Middleware to check authentication code 
 * get list of user selected company from database
 */

route.post("/user_company_selection", [authJWT.verifyToken], async (req, res, next) => {
    try{
        const list = await UserCompanySelection.findAll({
            attributes: ['user_company_selection_id', 'user_id', 'organisation_id', 'representative_id'],
            where: {user_id: req.userId, organisation_id: req.orgId}
        })
        res.status(200).json({list});
    } catch( e ) {
        console.log("Error while adding user company selection", e)
        res.status(500).send("Error while adding selection.");
    } 
})


/**
 * Middleware to check authentication code 
 * Add user company selection to database
 */
route.post("/user_company_selection", [authJWT.verifyToken], async (req, res, next) => {
    let list = []
    try{
        let { representative_id } = req.body;

        if(representative_id != undefined && representative_id != '') {
            representative_id = JSON.parse(representative_id)

            if(representative_id.length > 0) {
                //truncate previous records
                await UserCompanySelection.destroy({
                    where: {user_id: req.userId, organisation_id: req.orgId}
                }) 

                const addData = [];
                const proimse = representative_id.map( representative => {
                    addData.push({
                        representative_id: representative,
                        user_id: req.userId,
                        organisation_id: req.orgId
                    })
                    return representative
                })
                
                Promise.all(proimse)
    
                const addedRecords = await UserCompanySelection.bulkCreate(addData, { returning: true })
                if( addedRecords ) {
                    list = await UserCompanySelection.findAll({
                        attributes: ['user_company_selection_id', 'user_id', 'organisation_id', 'representative_id'],
                        where: {user_id: req.userId, organisation_id: req.orgId}
                    })
                }
            }            
        }
        res.status(200).json({list});
       
    } catch( e ) {
        console.log("Error while adding user company selection", e)
        res.status(500).send("Error while adding selection.");
    }     
});
/* 
route.put("/user_company_selection", [authJWT.verifyToken], async (req, res, next) => {
    let list = []
    try{
        const { representative_id } = req.body;
        const removeCompany = await UserCompanySelection.destroy({
            where: {user_id: req.userId, organisation_id: req.orgId, representative_id: representative_id}
        })

        if(removeCompany) {
            list = await UserCompanySelection.findAll({
                attributes: ['user_company_selection_id', 'user_id', 'organisation_id', 'representative_id'],
                where: {user_id: req.userId, organisation_id: req.orgId}
            })
        }
        res.status(200).json({list});
    } catch( e ) {
        console.log("Error while adding user company selection", e)
        res.status(500).send("Error while adding selection.");
    }     
});

route.delete("/user_company_selection", [authJWT.verifyToken], async (req, res, next) => {
    let list = []
    try{        
        await UserCompanySelection.destroy({
            where: {user_id: req.userId, organisation_id: req.orgId}
        })        
        res.status(200).json({list});
    } catch( e ) {
        console.log("Error while adding user company selection", e)
        res.status(500).send("Error while adding selection.");
    }     
});
 */
module.exports = route;