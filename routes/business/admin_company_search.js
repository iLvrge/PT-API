const express = require("express");

const route = express.Router();

const exec = require("child_process").exec;

const connection = require("../../config/db.config");

//require the Model

const authJWT = require("../../helpers/verifyJwtToken");

const helpers = require("../../helpers/helper");

const Organisations = require('../../model/business/Organisations');

const Representatives = require('../../model/resources/Representatives');

const RepresentativeAssignmentConveyance = require('../../model/resources/RepresentativeAssignmentConveyance');

const AssignmentConveyance = require('../../model/application/AssignmentConveyance');

const Assignments = require('../../model/resources/Assignments');

const AssignorAndAssignee = require('../../model/resources/AssignorAndAssignee');

const RepresentativesApplication = require('../../model/application/Representatives');
const AssignorAndAssigneeApplication = require('../../model/application/AssignorAndAssignee');
const Assignors = require('../../model/application/Assignors');
const Assignees = require('../../model/application/Assignees');

/**
 * Search entity by name
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
            
            searchCompanies  = await helpers.searchCompany(searchItem, 1);
        }
        res.status(200).json(searchCompanies);           
    } catch(e) {
        console.log(e);
        res.status(402).send("Not found ");
    }
});

/**
 * Update normalize name of the Entity
 */
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
                    console.log('FIND ASSINGOR AND ASSIGNEE');
                    findIsNormalized  = await Representatives.findOne({
                        where:{representative_id: findIsNormalized.representative_id}
                    });
                } else {
                    console.log('NOT FIND ASSINGOR AND ASSIGNEE');
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

                

                if(representativeCompany == null) {
                    /**
                     * If Old representative found
                     */
                    console.log("New Company");
                    if(oldRepresentativeCompanyID > 0) {
                        console.log("UPDATE REPRESENTATIVE COMPANY")
                        await Representatives.update({
                            representative_name: normalize_name
                        }, {where: {representative_id: oldRepresentativeCompanyID} });
                        representativeCompany = await helpers.checkRepresentativeCompany(normalize_name);
                    } else {
                        /**
                         * Insert representative company
                         */
                        console.log("New Company");
                        representativeCompany = await Representatives.create({
                            representative_name: normalize_name
                        });
                    }                    
                }

                if(representativeCompany != null && representativeCompany.representative_id > 0) {
                    //let t = await connection.resources.transaction();	
                    console.log("Updating items!");
                    const item = {representative_id: representativeCompany.representative_id};
                    console.log(item);
                    /*await AssignorAndAssignee.update(item, {where: {name: name}, transaction: t});*/
                    if(oldRepresentativeCompanyID == 0) {
                        const updateItem = await AssignorAndAssignee.update(item, {where: {name: name}});
                        console.log(updateItem);
                    }
                    if(oldRepresentativeCompanyID > 0) {
                        console.log("FOUND OLD");
                        /*await AssignorAndAssignee.update(item, {where: {representative_id: oldRepresentativeCompanyID}, transaction: t});*/
                        /*const updateItem2 = await AssignorAndAssignee.update(item, {where: {representative_id: oldRepresentativeCompanyID}});
                        console.log(updateItem2);
                        console.log("NAME:"+oldRepresentativeCompanyName);*/
                        /*await AssignorAndAssignee.update(item, {where: {name: oldRepresentativeCompanyName}, transaction: t});*/
                        console.log("NAME:"+oldRepresentativeCompanyName);
                        const updateItem3 = await AssignorAndAssignee.update(item, {where: {name: oldRepresentativeCompanyName}});
                        console.log(updateItem3);
                        /*await Representatives.destroy({
                            where:{representative_id: oldRepresentativeCompanyID}
                        })*/
                    }
                   // if (t) await t.commit();    
                    res.status(200).send("Updated successfully");	
                } else {
                    res.status(200).send("Company not created");	
                }	
            }  else {
                if(name != "" && normalize_name == ""){
                    //let t = await connection.resources.transaction();

                    const item = {representative_id: 0};                    
                    /*await AssignorAndAssignee.update(item, {where: {name: name}, transaction: t});*/
                    const updateItem4 = await AssignorAndAssignee.update(item, {where: {name: name}});
                    console.log(updateItem4);
                    /*if (t) await t.commit();  */             
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

/**
 * Get all Assignment Text from USPTO database
 */
route.get("/company/assignments/:customerID", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
    try {
        const customerID = req.params.customerID;
        let findAllAssignments  = await helpers.allAssignments(customerID);
        res.status(200).json({list:findAllAssignments, type: [{name: 'assignment', id: 'assignment'},{name: 'addresschg', id: 'addresschg'},{name: 'correct', id: 'correct'},{name: 'courtappointment', id: 'courtappointment'},{name: 'courtorder', id: 'courtorder'},{name: 'employee', id: 'employee'},{name: 'govern', id: 'govern'},{name: 'license', id: 'license'},{name: 'licenseend', id: 'licenseend'},{name: 'missing', id: 'missing'},{name: 'merger', id: 'merger'},{name: 'namechg', id: 'namechg'},{name: 'other', id: 'other'},{name: 'partialassignment', id: 'partialassignment'},{name: 'release', id: 'release'},{name: 'restatedsecurity', id: 'restatedsecurity'},{name: 'security', id: 'security'}]});
    } catch(e) {
        console.log(e);
        res.status(402).send("Unable to retrieve data.");
    }
});

route.put("/company/assignments/:customerID", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
    try {
        let text = req.body.text, updateConveyType = req.body.updated_convey_ty, update = 0;
        const customerID = req.params.customerID;
        let findAllRfIDs = [];
        if(customerID > 0 && req.body.rf_id > 0) {
            findAllRfIDs = await Assignments.findAll({
                attributes: ['rf_id'],
                where: {rf_id: req.body.rf_id}
            });
        } else {
            findAllRfIDs = await Assignments.findAll({
                attributes: ['rf_id'],
                where: {convey_text: text}
            });
        }

        if(findAllRfIDs.length > 0) {
            let uniqueRFIDs = [];
            findAllRfIDs.map( r => uniqueRFIDs.push(r.rf_id));
            if(uniqueRFIDs.length > 0) {
                /**
                 * Update RFIDs already exists in USPTO 
                 */
                update = await RepresentativeAssignmentConveyance.update({convey_ty: updateConveyType},{where: {rf_id: uniqueRFIDs}});

                /**INSERT Faster than using bulkCreate function of Sequelize because first have to reteive data from assignment_conveyance table 
                 * Create array and then use bulkCreate option to insert multiple records and also this query will ignore if the record already exists.
                 */

                const queryINSERT = `INSERT IGNORE representative_assignment_conveyance(rf_id, convey_ty, employer_assign) SELECT rf_id, '${updateConveyType}' as convey_ty, employer_assign FROM assignment_conveyance WHERE rf_id IN (:rfIDs)`;

                await connection.resources.query(queryINSERT,{
                    type: connection.Sequelize.QueryTypes.INSERT,
                    replacements: { rfIDs: uniqueRFIDs },
                    raw: true,
                    logging: console.log,
                });

                /**
                 * Update in Application database
                 */

                await AssignmentConveyance.update({convey_ty: updateConveyType},{where: {rf_id: uniqueRFIDs}});

                /**
                 * Find Customers based on the RFIDs
                 */

                const findAllAssignors = await Assignors.findAll({
                    attributes: ['assignor_and_assignee_id'],
                    include: [
                        {
                            model: AssignorAndAssigneeApplication,
                            as: 'assignor_and_assignee',
                            attributes: ['assignor_and_assignee_id']
                        }
                    ],
                    where: {rf_id: uniqueRFIDs}
                });

                const findAllAssignees = await Assignees.findAll({
                    attributes: ['assignor_and_assignee_id'],
                    include: [
                        {
                            model: AssignorAndAssigneeApplication,
                            as: 'assignor_and_assignee',
                            attributes: ['assignor_and_assignee_id']
                        }
                    ],
                    where: {rf_id: uniqueRFIDs}
                });

                let allAssignorAndAssignees = [];
                if(findAllAssignors.length > 0 && findAllAssignees.length > 0){
                    allAssignorAndAssignees = [...findAllAssignors, ...findAllAssignees];
                } else if(findAllAssignees.length > 0){
                    allAssignorAndAssignees = [...findAllAssignees];
                } else if(findAllAssignors.length > 0) {
                    allAssignorAndAssignees = [...findAllAssignors];
                }

                if(allAssignorAndAssignees.length > 0) {

                    const findAllCustomer = await Organisations.findAll({
                        attributes:['name'],
                        where:{type: 0, org_key: {[connection.Op.ne]: ''}, org_key: {[connection.Op.ne]: null}}
                    });
                    console.log(allAssignorAndAssignees);
                    const allIDs = [], allCustomersName = [];
                    allAssignorAndAssignees.map( a => allIDs.push(a.assignor_and_assignee_id));
                    findAllCustomer.map( c => allCustomersName.push(c.name));
                    
                    if(findAllCustomer.length > 0) {
                        const findCustomers = await AssignorAndAssigneeApplication.findAll({
                            attributes:['name', 'representative_id'],
                            where:{assignor_and_assignee_id: allIDs},
                            include:[
                                {
                                    model: RepresentativesApplication,
                                    as: 'representative',
                                    attributes: ['representative_name']
                                }
                            ]
                        });

                        if(findCustomers.length > 0) {
                            const customerName = [];
                            findCustomers.map(c => {
                                if(c.representative_id > 0 && c.representative.representative_name != '' &&  c.representative.representative_name != null) {
                                    customerName.push(c.representative.representative_name);
                                } else {
                                    customerName.push(c.name);
                                }
                            });

                            if(customerName.length > 0) {
                                const customers = await Organisations.findAll({
                                    attributes:['name','organisation_id'],
                                    where:{type: 0, org_key: {[connection.Op.ne]: ''}, org_key: {[connection.Op.ne]: null}, name: customerName}
                                });
                                /**
                                 * Run script to update customer Timeline and Tree table
                                 */
                                customers.map( async c => {
                                    console.log(`php -f /var/www/html/trash/timeline.php "${c.organisation_id}" ""`);
                                    await exec(`php -f /var/www/html/trash/timeline.php "${c.organisation_id}" ""`, async (error, std, stderr) => {
                                        console.log("timeline create one table");
                                        console.log(error);
                                        console.log(stderr);
                                        console.log(std);
                                        console.log(`php -f /var/www/html/trash/tree.php "${c.organisation_id}" ""`);
                                        await exec(`php -f /var/www/html/trash/tree.php "${c.organisation_id}" ""`, async (error, stdd, stderr)=> {
                                            console.log("Tree create one table");
                                            console.log(error);
                                            console.log(stderr);
                                            console.log(stdd);
                                            console.log("DONE>>>>>>>>>>>");
                                        });
                                    });
                                })
                            }                            
                        }
                    }
                }  
            }
        }
        res.status(200).send(update);
    } catch(e) {
        console.log(e);
        res.status(402).send("Unable to retrieve data.");
    }
});

module.exports = route;