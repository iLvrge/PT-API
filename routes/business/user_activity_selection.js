const express = require("express");

const route = express.Router();

const authJWT = require("../../helpers/verifyJwtToken");

//require the Model

const User = require("../../model/business/Users");

const UserActivitySelection = require("../../model/business/UserActivitySelection");

/**
 * Middleware to check authentication code 
 * get list of user selected company from database
 */

route.get("/user_activity_selection", [authJWT.verifyToken], async (req, res, next) => {
    try{
        console.log('UserActivitySelection', UserActivitySelection)
        const list = await UserActivitySelection.findOne({
            attributes: ['activity_id'],
            where: {user_id: req.userId, organisation_id: req.orgId}
        })
        res.status(200).json(list);
    } catch( e ) {
        console.log("Error while adding user company selection", e)
        res.status(500).send("Error while adding selection.");
    } 
})


/**
 * Middleware to check authentication code 
 * Add user company selection to database
 */
route.post("/user_activity_selection", [authJWT.verifyToken], async (req, res, next) => {
    let list = {}
    try{
        let { activity_id } = req.body;

        if(activity_id != undefined && activity_id  > 0 ) {

            //truncate previous records
            await UserActivitySelection.destroy({
                where: {user_id: req.userId, organisation_id: req.orgId}
            }) 

            const addData = {
                activity_id: activity_id,
                user_id: req.userId,
                organisation_id: req.orgId
            };
            
            const addedRecords = await UserActivitySelection.create(addData, { returning: true })
            if( addedRecords ) {
                list = await UserActivitySelection.findOne({
                    attributes: ['activity_id'],
                    where: {user_id: req.userId, organisation_id: req.orgId}
                })
            }            
        }
        res.status(200).json(list);
       
    } catch( e ) {
        console.log("Error while adding user company selection", e)
        res.status(500).send("Error while adding selection.");
    }     
});

/**
 * Middleware to check authentication code 
 * Delete user company selection to database
 */
route.put("/user_activity_selection", [authJWT.verifyToken], async (req, res, next) => {
    try{
        let { activity_id } = req.body;

        if(activity_id != undefined && activity_id  > 0 ) {

            //truncate previous records
            await UserActivitySelection.destroy({
                where: {user_id: req.userId, organisation_id: req.orgId, activity_id }
            }) 
        } else if(activity_id != undefined && activity_id  == 0 ) {
            //truncate previous records
            await UserActivitySelection.destroy({
                where: {user_id: req.userId, organisation_id: req.orgId }
            }) 
        }
        res.status(200).send("Delete selection")
    } catch( e ) {
        console.log("Error while adding user company selection", e)
        res.status(500).send("Error while adding selection.");
    }     
});

module.exports = route;