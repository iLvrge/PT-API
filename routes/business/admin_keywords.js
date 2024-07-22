const express = require("express"),

    route = express.Router(),

    authJWT = require("../../helpers/verifyJwtToken");

//require the Model

const Keywords = require("../../model/resources/Keywords");

const SuperKeywords = require("../../model/resources/SuperKeywords");

const State = require("../../model/resources/State");
const CompanyKeywords = require("../../model/resources/CompanyKeywords");

/**
 * Get list of keywords
 */
route.get("/keywords", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{

        const getKeywordList = await Keywords.findAll({
            attributes:[['keyword_id', 'id'], ['keyword_name', 'keyword']]
        });
        res.status(200).json(getKeywordList);
    } catch (e) {

    }
});

/**
 * Add a new record in keyword
 */
route.post("/keywords", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        const name = req.body.keyword;

        if(name != undefined && name != '') {
            const addRecord = await Keywords.create({keyword_name: name});

            if(addRecord != null && addRecord.keyword_id > 0) {
                res.status(200).json(addRecord);
            } else {
                res.status(402).send("Error while adding new record.");
            }
        } else {
            res.status(402).send("Keyword name cannot be empty.");
        }
    } catch(err){
        console.log(err);
        res.status(402).send("Internal server error.");
    }
});

/**
 * Update a keyword record
 */
route.put("/keywords/:keywordID", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        const keywordID = req.params.keywordID;

        if(keywordID > 0) {
            const findRecord = await Keywords.findByPk(keywordID);

            if(findRecord != null && findRecord.keyword_id > 0) {
                const name = req.body.keyword;

                if(name != undefined && name != '') {
                    const update = await findRecord.update({keyword_name: name});

                    if(update){
                        //const updatedRecord = findRecord.toJSON();
                        //findRecord.keyword_name = name;
                        res.status(200).json(findRecord);
                    } else {
                        res.status(402).send("Error while update record.");
                    }
                } else {
                    res.status(402).send("Keyword name cannot be empty.");
                }
            } else {
                res.status(404).send("No record found.");
            }
        } else {
            res.status(402).send("Invalid Inputs.");
        }
    } catch(err){
        console.log(err);
        res.status(402).send("Internal server error.");
    }
});

/**
 * Delete a keyword record
 */
route.delete("/keywords/:keywordID", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        const keywordID = req.params.keywordID;

        if(keywordID > 0) {
            const findRecord = await Keywords.findByPk(keywordID);

            if(findRecord != null && findRecord.keyword_id > 0) {
                const deleteRecord = await findRecord.destroy();

                if(deleteRecord)  {
                    res.status(200).send("Record deleted successfully.");
                }
            } else {
                res.status(404).send("No record found.");
            }
        } else {
            res.status(402).send("Invalid Inputs.");
        }
    } catch(err){
        console.log(err);
        res.status(402).send("Internal server error.");
    }
});


/**
 * Get list of superKeyword
 */
route.get("/super_keywords", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{

        const getKeywordList = await SuperKeywords.findAll({
            attributes:[['super_keyword_id', 'id'], ['super_keyword_name', 'keyword']]
        });
        res.status(200).json(getKeywordList);
    } catch (e) {

    }
});


/**
 * Add a new record in superKeyword
 */
route.post("/super_keywords", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        const name = req.body.keyword;

        if(name != undefined && name != '') {
            const addRecord = await SuperKeywords.create({super_keyword_name: name});

            if(addRecord != null && addRecord.super_keyword_id > 0) {
                res.status(200).json(addRecord);
            } else {
                res.status(402).send("Error while adding new record.");
            }
        } else {
            res.status(402).send("Keyword name cannot be empty.");
        }
    } catch(err){
        console.log(err);
        res.status(402).send("Internal server error.");
    }
});


/**
 * Update a superKeyword record
 */
route.put("/super_keywords/:keywordID", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        const keywordID = req.params.keywordID;

        if(keywordID > 0) {
            const findRecord = await SuperKeywords.findByPk(keywordID);

            if(findRecord != null && findRecord.super_keyword_id > 0) {
                const name = req.body.keyword;

                if(name != undefined && name != '') {
                    const update = await findRecord.update({super_keyword_name: name});

                    if(update){
                        //const updatedRecord = findRecord.toJSON();
                        //findRecord.keyword_name = name;
                        res.status(200).json(findRecord);
                    } else {
                        res.status(402).send("Error while update record.");
                    }
                } else {
                    res.status(402).send("Keyword name cannot be empty.");
                }
            } else {
                res.status(404).send("No record found.");
            }
        } else {
            res.status(402).send("Invalid Inputs.");
        }
    } catch(err){
        console.log(err);
        res.status(402).send("Internal server error.");
    }
});


/**
 * Delete a superKeyword record
 */
route.delete("/super_keywords/:keywordID", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        const keywordID = req.params.keywordID;

        if(keywordID > 0) {
            const findRecord = await SuperKeywords.findByPk(keywordID);

            if(findRecord != null && findRecord.super_keyword_id > 0) {
                const deleteRecord = await findRecord.destroy();

                if(deleteRecord)  {
                    res.status(200).send("Record deleted successfully.");
                }
            } else {
                res.status(404).send("No record found.");
            }
        } else {
            res.status(402).send("Invalid Inputs.");
        }
    } catch(err){
        console.log(err);
        res.status(402).send("Internal server error.");
    }
});



/**
 * Get list of superKeyword
 */
route.get("/state", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{

        const getKeywordList = await State.findAll({
            attributes:[['state_id', 'id'], ['name', 'keyword']]
        });
        res.status(200).json(getKeywordList);
    } catch (e) {
        
    }
});


/**
 * Add a new record in superKeyword
 */
route.post("/state", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        const name = req.body.keyword;

        if(name != undefined && name != '') {
            const addRecord = await State.create({name: name});

            if(addRecord != null && addRecord.state_id > 0) {
                res.status(200).json(addRecord);
            } else {
                res.status(402).send("Error while adding new record.");
            }
        } else {
            res.status(402).send("Keyword name cannot be empty.");
        }
    } catch(err){
        console.log(err);
        res.status(402).send("Internal server error.");
    }
});


/**
 * Update a superKeyword record
 */
route.put("/state/:stateID", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        const stateID = req.params.stateID;

        if(stateID > 0) {
            const findRecord = await State.findByPk(stateID);

            if(findRecord != null && findRecord.state_id > 0) {
                const name = req.body.keyword;

                if(name != undefined && name != '') {
                    const update = await findRecord.update({name: name});

                    if(update){
                        //const updatedRecord = findRecord.toJSON();
                        //findRecord.keyword_name = name;
                        res.status(200).json(findRecord);
                    } else {
                        res.status(402).send("Error while update record.");
                    }
                } else {
                    res.status(402).send("Keyword name cannot be empty.");
                }
            } else {
                res.status(404).send("No record found.");
            }
        } else {
            res.status(402).send("Invalid Inputs.");
        }
    } catch(err){
        console.log(err);
        res.status(402).send("Internal server error.");
    }
});


/**
 * Delete a superKeyword record
 */
route.delete("/state/:stateID", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        const stateID = req.params.stateID;

        if(stateID > 0) {
            const findRecord = await State.findByPk(stateID);

            if(findRecord != null && findRecord.state_id > 0) {
                const deleteRecord = await State.destroy({where:{state_id: findRecord.state_id}});

                if(deleteRecord)  {
                    res.status(200).send("Record deleted successfully.");
                }
            } else {
                res.status(404).send("No record found.");
            }
        } else {
            res.status(402).send("Invalid Inputs.");
        }
    } catch(err){
        console.log(err);
        res.status(402).send("Internal server error.");
    }
});



/**
 * Get list of company keywords
 */
 route.get("/company_keywords", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{

        const getKeywordList = await CompanyKeywords.findAll({
            attributes:[['keyword_id', 'id'], ['keyword_name', 'keyword']]
        });
        res.status(200).json(getKeywordList);
    } catch (e) {
        
    }
});


/**
 * Add a new record in keyword
 */
 route.post("/company_keywords", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        const name = req.body.keyword;

        if(name != undefined && name != '') {
            const addRecord = await CompanyKeywords.create({keyword_name: name});

            if(addRecord != null && addRecord.keyword_id > 0) {
                res.status(200).json(addRecord);
            } else {
                res.status(402).send("Error while adding new record.");
            }
        } else {
            res.status(402).send("Keyword name cannot be empty.");
        }
    } catch(err){
        console.log(err);
        res.status(402).send("Internal server error.");
    }
});

/**
 * Update a keyword record
 */
route.put("/company_keywords/:keywordID", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        const keywordID = req.params.keywordID;

        if(keywordID > 0) {
            const findRecord = await CompanyKeywords.findByPk(keywordID);

            if(findRecord != null && findRecord.keyword_id > 0) {
                const name = req.body.keyword;

                if(name != undefined && name != '') {
                    const update = await findRecord.update({keyword_name: name});

                    if(update){
                        //const updatedRecord = findRecord.toJSON();
                        //findRecord.keyword_name = name;
                        res.status(200).json(findRecord);
                    } else {
                        res.status(402).send("Error while update record.");
                    }
                } else {
                    res.status(402).send("Keyword name cannot be empty.");
                }
            } else {
                res.status(404).send("No record found.");
            }
        } else {
            res.status(402).send("Invalid Inputs.");
        }
    } catch(err){
        console.log(err);
        res.status(402).send("Internal server error.");
    }
});

/**
 * Delete a keyword record
 */
route.delete("/company_keywords/:keywordID", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        const keywordID = req.params.keywordID;

        if(keywordID > 0) {
            const findRecord = await CompanyKeywords.findByPk(keywordID);

            if(findRecord != null && findRecord.keyword_id > 0) {
                const deleteRecord = await findRecord.destroy();

                if(deleteRecord)  {
                    res.status(200).send("Record deleted successfully.");
                }
            } else {
                res.status(404).send("No record found.");
            }
        } else {
            res.status(402).send("Invalid Inputs.");
        }
    } catch(err){
        console.log(err);
        res.status(402).send("Internal server error.");
    }
});

module.exports = route;