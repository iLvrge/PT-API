const express = require("express");

const route = express.Router();

const connection = require("../../config/db.config");

//require the Model

const authJWT = require("../../helpers/verifyJwtToken");

const helpers = require("../../helpers/helper");

const Representatives = require('../../model/resources/Representatives');

const Assignors = require('../../model/resources/Assignors');

const Assignees = require('../../model/resources/Assignees');

const AssignorAndAssignee = require('../../model/resources/AssignorAndAssignee');

/**
 * List all customers
 */

route.get("/company/search/all/", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {

    try {

        let searchCompanies = [];

        let filter = req.query.filter, searchItem = "";	

        if(filter != 'undefined' && filter != undefined){
            try{
                filter = JSON.parse(filter);
                if(Array.isArray(filter) && filter.length > 0) {						
                    if(filter[0].property != ""){
                        queryProperty = filter[0].property;
                    }
                    
                    if(filter[0].value != ""){
                        searchItem = filter[0].value;
                    }						
                }
            } catch(e){
                
            }
        }

        if(searchItem != null && searchItem != undefined && searchItem.length > 0) {
            
            searchCompanies  = await helpers.searchCompany(searchItem);
        }
        res.status(200).json(searchCompanies);           
    } catch(e) {
        console.log(e);
        res.status(402).send("Not found ");
    }
});


route.put("/company/search/all/", [authJWT.verifyToken, authJWT.isAdmin], (req, res, next) => {
    (async () => {
        try {

            let name = req.body.name, normalize_name = req.body.normalize_name;
            if(name != "" && normalize_name != ""){

                /**Is this company already normalised with other representative if yes then find all other companies that point to representative and add new representative company
                 * and point all other companies to the newly added representative Company
                 */
                let oldRepresentativeCompanyID = 0, oldRepresentativeCompanyName = "";
                let findIsNormalized  = await AssignorAndAssignee.findOne({
                                            where:{name: name}
                                        });
                if(findIsNormalized != null && findIsNormalized.representative_id > 0) {
                    findIsNormalized  = await Representatives.findOne({
                        where:{representative_name: name}
                    });
                } else {
                    findIsNormalized  = await Representatives.findOne({
                        where:{representative_name: name}
                    });
                }
                if(findIsNormalized != null && findIsNormalized.representative_id > 0) {
                    console.log("Representative Company Found!");
                    oldRepresentativeCompanyID = findIsNormalized.representative_id;
                    oldRepresentativeCompanyName = findIsNormalized.representative_name;
                }

                let  representativeCompany = await helpers.checkRepresentativeCompany(normalize_name);

                let t = await connection.resources.transaction();	

                if(representativeCompany == null) {
                    /**
                     * Insert representative company
                     */
                    console.log("New Company");
                    representativeCompany = await Representatives.create({
                        representative_name: normalize_name
                    });
                }

                if(representativeCompany != null && representativeCompany.representative_id > 0) {
                    console.log("Updating items!");
                    const item = {representative_id: representativeCompany.representative_id};
                    await AssignorAndAssignee.update(item, {where: {name: name}, transaction: t});
                    if(oldRepresentativeCompanyID > 0) {
                        await AssignorAndAssignee.update(item, {where: {representative_id: oldRepresentativeCompanyID}, transaction: t});
                        await AssignorAndAssignee.update(item, {where: {name: oldRepresentativeCompanyName}, transaction: t});
                        await Representatives.destroy({
                            where:{representative_id: oldRepresentativeCompanyID}
                        })
                    }
                }
                
                if (t) await t.commit();               
                res.status(200).send("Updated successfully");				
            }  else {
                if(name != "" && normalize_name == ""){
                    let t = await connection.resources.transaction();

                    const item = {representative_id: 0};                    
                    await AssignorAndAssignee.update(item, {where: {name: name}, transaction: t});

                    if (t) await t.commit();               
                    res.status(200).send("Updated successfully");		
                } else {
                    res.status(402).send("Bad inputs");
                }
            }      
        } catch(e) {
            console.log(e);
            res.status(402).send("Bad inputs");
        }
    })();
});


module.exports = route;