const express = require("express");

const route = express.Router();

const connection = require("../../config/db.config");

const clientDBConnection = require("../../helpers/clientDBConnection");

//require the Model

const authJWT = require("../../helpers/verifyJwtToken");

const helpers = require("../../helpers/helper");

const Organisations = require('../../model/business/Organisations');

const Representatives = require('../../model/resources/Representatives');

const RepresentativeAssignmentConveyance = require('../../model/resources/RepresentativeAssignmentConveyance');

const AssignmentConveyance = require('../../model/application/AssignmentConveyance');

const Assignments = require('../../model/resources/Assignments');

const AssignorAndAssignee = require('../../model/resources/AssignorAndAssignee');

const RecentTransaction = require('../../model/resources/RecentTransaction');

const AssignmentGroup = require('../../model/resources/AssignmentGroup');

const LawFirms = require('../../model/resources/LawFirms');

const RepresentativeLawFirms = require('../../model/resources/RepresentativeLawFirms');

const RepresentativeTransactions = require('../../model/resources/RepresentativeTransactions');

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
                console.log(e);
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

route.get("/company/search/:search", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
    try {
        let searchCompanies = [];
        const searchItem = req.params.search;	

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

                /**
                 * This check is to find company is already normalised with other representative company
                 */
                let oldRepresentativeCompanyID = 0, oldRepresentativeCompanyName = "";
                let findIsNormalized  = await AssignorAndAssignee.findOne({
                                            where:{name: name}
                                        });
                if(findIsNormalized != null && findIsNormalized.representative_id > 0) {
                    findIsNormalized  = await Representatives.findOne({
                        where:{representative_id: findIsNormalized.representative_id}
                    });
                } else {
                    findIsNormalized  = await Representatives.findOne({
                        where:{representative_name: name}
                    });
                }

                if(findIsNormalized != null && findIsNormalized.representative_id > 0) {
                    /** 
                     * Find old representative company
                    */
                    oldRepresentativeCompanyID = findIsNormalized.representative_id;
                    oldRepresentativeCompanyName = findIsNormalized.representative_name;
                }

                let  representativeCompany = await helpers.checkRepresentativeCompany(normalize_name);

                /**
                 * Check normalize company is normalize with  another company
                 * 
                 */
                let findNormalizedCompany  = await AssignorAndAssignee.findOne({
                    where:{name: normalize_name}
                });

                console.log(findNormalizedCompany);

                if(findNormalizedCompany != null && findNormalizedCompany.representative_id > 0) {
                    representativeCompany  = await Representatives.findOne({
                        where:{representative_id: findNormalizedCompany.representative_id}
                    });

                    if(representativeCompany != null && representativeCompany.representative_id > 0){
                        await Representatives.update({
                            representative_name: normalize_name
                        }, {where: {representative_id: representativeCompany.representative_id} });
                    }
                }

                
                if(representativeCompany == null) {
                    /**
                     * If Old representative found
                     */                    
                    if(oldRepresentativeCompanyID > 0) {
                        /**
                         * Update old representative company name with new representative name i.e normalize name
                         */
                        await Representatives.update({
                            representative_name: normalize_name
                        }, {where: {representative_id: oldRepresentativeCompanyID} });
                        representativeCompany = await helpers.checkRepresentativeCompany(normalize_name);
                    } else {
                        /**
                         * Insert new representative company in the representative table
                         */                        
                        representativeCompany = await Representatives.create({
                            representative_name: normalize_name
                        });
                    }                    
                }

                

                if(representativeCompany != null && representativeCompany.representative_id > 0) {                    
                   /**
                    * Update representative ID in the AssignorAndAssignee table
                    */
                    const item = {representative_id: representativeCompany.representative_id};
                    
                    if(oldRepresentativeCompanyID == 0) {
                        /**
                         * Update representative ID
                         */
                        await AssignorAndAssignee.update(item, {where: {name: name}});                                             
                    } else {                        
                        await AssignorAndAssignee.update(item, {where: {name: oldRepresentativeCompanyName}});
                        await AssignorAndAssignee.update(item, {where: {representative_id: oldRepresentativeCompanyID}});

                        /**
                         * Checking Client name with same old Company name
                         */
                        const findCustomerWithOldName = await Organisations.findOne({
                            attributes:['name'],
                            where:{type: 0, name: oldRepresentativeCompanyName}
                        });

                        if(findCustomerWithOldName != null) {
                            await findCustomerWithOldName.update({name: representativeCompany.representative_name});
                        }
                    }

                    


                    /**
                     * Check Representative company is the Customer
                     */
                    const findCustomer = await Organisations.findOne({
                        attributes:['name'],
                        where:{type: 0, name: representativeCompany.representative_name}
                    });

                    if(findCustomer != null) {
                        /**
                         * Transfer all RFIDs for the new client
                         */

                        const queryInsertAssignors  = `INSERT IGNORE INTO db_uspto.representative_transactions(representative_id, rf_id) SELECT ${representativeCompany.representative_id} as representative_id, rf_id FROM db_uspto.assignor WHERE assignor_and_assignee_id IN (SELECT assignor_and_assignee_id FROM db_uspto.assignor_and_assignee WHERE name = :name)`;

                        await connection.resources.query(queryInsertAssignors,{
                            type: connection.Sequelize.QueryTypes.INSERT,
                            replacements: { name:  name},
                            raw: true,
                            logging: console.log,
                            }
                        );	

                        const queryInsertAssignees  = `INSERT IGNORE INTO db_uspto.representative_transactions(representative_id, rf_id) SELECT ${representativeCompany.representative_id} as representative_id, rf_id FROM db_uspto.assignee WHERE assignor_and_assignee_id IN (SELECT assignor_and_assignee_id FROM db_uspto.assignor_and_assignee WHERE name = :name)`;

                        await connection.resources.query(queryInsertAssignees,{
                            type: connection.Sequelize.QueryTypes.INSERT,
                            replacements: { name:  name},
                            raw: true,
                            logging: console.log,
                            }
                        );
                    }
                     
                    res.status(200).send("Updated successfully");	
                } else {
                    res.status(200).send("Company not created");	
                }	
            }  else {
                if(name != "" && normalize_name == ""){                           
                    await AssignorAndAssignee.update({representative_id: 0}, {where: {name: name}});
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
 * if customerID is 0 then this is for whole database other it will be for the particular client
 */
route.get("/company/assignments/:id", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID, clientDBConnection.connect], async (req, res, next) => {
    try {
        const customerID = req.params.id, type = [{name: 'assignment', id: 'assignment'},{name: 'addresschg', id: 'addresschg'},{name: 'correct', id: 'correct'},{name: 'courtappointment', id: 'courtappointment'},{name: 'courtorder', id: 'courtorder'},{name: 'employee', id: 'employee'},{name: 'govern', id: 'govern'},{name: 'license', id: 'license'},{name: 'licenseend', id: 'licenseend'},{name: 'missing', id: 'missing'},{name: 'merger', id: 'merger'},{name: 'namechg', id: 'namechg'},{name: 'option', id: 'option'},{name: 'other', id: 'other'},{name: 'partialassignment', id: 'partialassignment'},{name: 'release', id: 'release'},{name: 'restatedsecurity', id: 'restatedsecurity'},{name: 'security', id: 'security'}], assignment_type = {0: 'assignment',1: 'addresschg',2: 'correct',3: 'courtappointment',4: 'courtorder',5: 'employee', 6: 'govern',7: 'license',8: 'licenseend',9: 'missing',10: 'merger',11: 'namechg',12: 'option',13: 'other',14: 'partialassignment',15: 'release',16: 'restatedsecurity',17: 'security'};
        /**
         * Group of all assignment texts and number of occurences
         */
        
        let findAllAssignments  = await helpers.allAssignments(customerID, req);

        res.status(200).json({list:findAllAssignments, type: type, assignment_type: assignment_type});
    } catch(e) {
        console.log(e);
        res.status(402).send("Unable to retrieve data.");
    }
});

route.get("/company/assignments/:id/:representativeID", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID, clientDBConnection.connect], async (req, res, next) => {
    try {
        const customerID = req.params.id, representativeIDs = JSON.parse(req.params.representativeID), type = [{name: 'assignment', id: 'assignment'},{name: 'addresschg', id: 'addresschg'},{name: 'correct', id: 'correct'},{name: 'courtappointment', id: 'courtappointment'},{name: 'courtorder', id: 'courtorder'},{name: 'employee', id: 'employee'},{name: 'govern', id: 'govern'},{name: 'license', id: 'license'},{name: 'licenseend', id: 'licenseend'},{name: 'missing', id: 'missing'},{name: 'merger', id: 'merger'},{name: 'namechg', id: 'namechg'},{name: 'option', id: 'option'},{name: 'other', id: 'other'},{name: 'partialassignment', id: 'partialassignment'},{name: 'release', id: 'release'},{name: 'restatedsecurity', id: 'restatedsecurity'},{name: 'security', id: 'security'}], assignment_type = {0: 'assignment',1: 'addresschg',2: 'correct',3: 'courtappointment',4: 'courtorder',5: 'employee', 6: 'govern',7: 'license',8: 'licenseend',9: 'missing',10: 'merger',11: 'namechg',12: 'option',13: 'other',14: 'partialassignment',15: 'release',16: 'restatedsecurity',17: 'security'};
        /**
         * Group of all assignment texts and number of occurences
         */
        
        let findAllAssignments  = await helpers.allAssignmentsByRepresentativeIDs(customerID, representativeIDs, req);

        res.status(200).json({list:findAllAssignments, type: type, assignment_type: assignment_type});
    } catch(e) {
        console.log(e);
        res.status(402).send("Unable to retrieve data.");
    }
});

/**
 * Update the assignment transaction for the client
 */

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
                 * Insert in this table and we can use it later when admin click on update All
                 */

                await RecentTransaction.create({conveyance_text: text});
                /**
                 * Update in Application database
                 */

                await AssignmentConveyance.update({convey_ty: updateConveyType},{where: {rf_id: uniqueRFIDs}});

                /**
                 * Update Assignment GROUP
                 */

                await AssignmentGroup.update({updated_convey_ty: updateConveyType},{where: {text: text}});
            }
        }
        res.status(200).send(update);
    } catch(e) {
        console.log(e);
        res.status(402).send("Unable to retrieve data.");
    }
});



route.get("/company/law_firms/:id", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID, clientDBConnection.connect], async (req, res, next) => {
    try {
        const customerID = req.params.id, representativeIDs = JSON.parse(req.query.portfolios);

        /*const findAllLawFirms =  await helpers.findAllLawFirms(customerID, representativeIDs, req);*/
        let findAllLawFirms = [];
        if(customerID == 0) {
            findAllLawFirms = await LawFirms.findAll({
                attributes: ['law_firm_id', 'name', ['instances', 'counter']],
                include: [
                    {
                        model: RepresentativeLawFirms,
                        as: "representativelawfirm",
                        attributes: ['representative_id','representative_name'],
                        required:false
                    }
                ]
            });
        } else {
            const where = {organisation_id: customerID};
            if(representativeIDs.length > 0) {
                where.representative_id = representativeIDs;
            }

            findAllLawFirms = await Assignments.findAll({
                attributes: ['law_firm_id'],               
                include: [
                    {
                        model: RepresentativeTransactions,
                        as: "representativetransaction",
                        attributes: [],
                        where: where,                        
                    },
                    {
                        model: LawFirms,
                        as: "lawfirm",
                        attributes: ['law_firm_id', 'name', ['instances', 'counter']],
                        include: [
                            {
                                model: RepresentativeLawFirms,
                                as: "representativelawfirm",
                                attributes: ['representative_id','representative_name'],
                                required:false
                            }
                        ]
                    }
                ]
            });
        }
        res.status(200).json(findAllLawFirms);
    } catch(e) {
        console.log(e);
        res.status(402).send("Unable to retrieve data.");
    }
});


/**
 * Find All Transaction with conveyanceType and Entity Type
 */
route.get("/company/transactions/:conveyanceType", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
    try {
        const conveyanceType = req.params.conveyanceType;

        const findAllAssignments  = await helpers.allTransactionEntities(conveyanceType);

        res.status(200).json(findAllAssignments);
    } catch(e) {
        console.log(e);
        res.status(402).send("Unable to retrieve data.");
    }
});

/**
 * Find  Entity Holding Assets
 */
route.get("/company/assets/:entityID", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
    try {
        const entityID = req.params.entityID;

        const holdingAssetsCounter  = await helpers.findEntityAssets(entityID);

        res.status(200).json({entity_id: entityID, count: holdingAssetsCounter});
    } catch(e) {
        console.log(e);
        res.status(402).send("Unable to retrieve data.");
    }
});

module.exports = route;