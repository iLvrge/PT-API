const express = require("express");

const route = express.Router();

const exec = require("child_process").exec;

const connection = require("../../config/db.config");

const clientDBConnection = require("../../helpers/clientDBConnection");

//require the Model

const authJWT = require("../../helpers/verifyJwtToken");

const helpers = require("../../helpers/helper");

const Organisations = require('../../model/business/Organisations');

const Representatives = require('../../model/resources/Representatives');

const RepresentativeCustomer = require('../../model/client/Representatives');

const RepresentativeAssignmentConveyance = require('../../model/resources/RepresentativeAssignmentConveyance');

const AssignmentConveyance = require('../../model/application/AssignmentConveyance');

const Assignments = require('../../model/resources/Assignments');

const Assignors = require('../../model/resources/Assignors');

const Assignees = require('../../model/resources/Assignees');

const AssignorAndAssignee = require('../../model/resources/AssignorAndAssignee');

const RecentTransaction = require('../../model/resources/RecentTransaction');

const AssignmentGroup = require('../../model/resources/AssignmentGroup');

const LawFirms = require('../../model/resources/LawFirms');

const RepresentativeLawFirms = require('../../model/resources/RepresentativeLawFirms');

const Lawyers = require('../../model/resources/Lawyers');

const RepresentativeLawyers = require('../../model/resources/RepresentativeLawyers');

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

route.get("/company/:ID/search/address", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
    try {
        let companyAddress = [];
        const companyID = req.params.ID;	

        if(companyID != null && companyID != undefined && companyID.length > 0) {            
            companyAddress  = await helpers.getAddressListByCompanyID(companyID);
        }
        res.status(200).json(companyAddress);           
    } catch(e) {
        console.log(e);
        res.status(402).send("Not found ");
    }
});

route.post("/company/:ID/search/address/all", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
    try {
        let searchCompanies = [];
        let address = req.body['address[]']
        const companyID = req.params.ID
        
        if(companyID != null && companyID != undefined && address.length > 0) {    
            searchCompanies  = await helpers.searchCompanyIDByAddress(address, 1);
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

route.get("/company/search/address/:address", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
    try {
        let searchCompanies = [];
        const searchItem = req.params.address;	

        if(searchItem != null && searchItem != undefined && searchItem.length > 0) {            
            searchCompanies  = await helpers.searchCompanyByAddress(searchItem, 1);
        }
        res.status(200).json(searchCompanies);           
    } catch(e) {
        console.log(e);
        res.status(402).send("Not found ");
    }
});

let updateDataAndShowData = async (representativeCompany, name, oldRepresentativeCompanyID, oldRepresentativeCompanyName, findRow, res) => {
    const item = {representative_id: representativeCompany.representative_id};
                
    if(oldRepresentativeCompanyID == 0) {
        /**
         * Update representative ID
         */
        await AssignorAndAssignee.update(item, {where: {name: name}});                                             
    } else {                        
        await AssignorAndAssignee.update(item, {where: {name: oldRepresentativeCompanyName}});
        await AssignorAndAssignee.update(item, {where: {representative_id: oldRepresentativeCompanyID}});
    }

    if(findRow != null && findRow.representative_id > 0) {
        const findData = await helpers.checkRepresentativeCompany(name);

        if(findData != null) {
            const findCount = await AssignorAndAssignee.count({
                where: {representative_id: findData.representative_id}
            });

            if(findCount == 0) {
                await Representatives.destroy({
                    where: {representative_id: findData.representative_id}
                })
            }
        }                    
    }

    const queryCompany = `SELECT a.assignor_and_assignee_id as id, a.assignor_and_assignee_id, a.name, a.instances as counter, c.representative_name as normalize_name, (select rr.representative_name FROM representative as rr WHERE rr.representative_name = a.name GROUP BY rr.representative_name) as representative_company, (SELECT concat(ass.reel_no,'-', ass.frame_no) FROM assignee as ee INNER JOIN assignment as ass ON ass.rf_id = ee.rf_id WHERE ee.assignor_and_assignee_id = a.assignor_and_assignee_id LIMIT 1) as assigneeRFID, (SELECT concat(asss.reel_no,'-', asss.frame_no) FROM assignor as assi INNER JOIN assignment as asss ON asss.rf_id = assi.rf_id WHERE assi.assignor_and_assignee_id = a.assignor_and_assignee_id LIMIT 1) as assignorRFID  FROM assignor_and_assignee as a LEFT JOIN representative as c ON c.representative_id = a.representative_id WHERE a.name = :name `;

    findRow = await connection.resources.query(queryCompany,{
        type: connection.Sequelize.QueryTypes.SELECT,
        raw: true,
        replacements: { name: name },
        plain: true,
        logging: console.log,
        }
    );
    res.status(200).json(findRow);	
}

let allRepresentativesCheckAndDelete = async (allRepresentatives) => {
    const findRepresentativeCount = await AssignorAndAssignee.findAll({
        attributes: ['representative_id', [connection.Sequelize.fn('COUNT', 'assignor_and_assignee_id'), 'counter']],
        where: {representative_id: allRepresentatives},
        group:['representative_id']
    });
    if(findRepresentativeCount.length > 0) {
        const destroyRepresentatives = [];
        const promise = findRepresentativeCount.map(r => {
            if(r.representative_id > 0 && r.get('counter') == 0) {
                destroyRepresentatives.push(r.representative_id);
            }
            return r;
        })
        await Promise.all(promise);

        if(destroyRepresentatives.length > 0) {
            await Representatives.destroy({
                where: {representative_id: destroyRepresentatives}
            })
        }
    } else {
         await Representatives.destroy({
            where: {representative_id: allRepresentatives}
        }) 
    }
}

/**
 * Example
 * Target A, Rep is B
 * Check A is Rep if yes then check B is rep if No replace A with B . If No Check B is rep No create B then Associate A with B and B with B
 * 
 * 
 */
route.put("/company/search/all/", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
    try {

        let normalize_name = req.body.normalize_name, IDs = JSON.parse(req.body.IDs);
        const otherIDs = [];
        if(IDs.length > 0) {
            if(normalize_name != "") {
                console.log("POST->ID", IDs);
                
                let getList = await AssignorAndAssignee.findAll({
                    where:{assignor_and_assignee_id: IDs}
                });

                console.log("getList->length", getList.length);
                /**
                 * Is Rep is already a Rep
                */
                let  representativeCompany = await helpers.checkRepresentativeCompany(normalize_name); 

                console.log("representativeCompany", representativeCompany)

                
                let allRepresentatives = []; 

                const replaceNames = [];

                const promiseName = getList.map( company => {
                    replaceNames.push(company.name)  
                })
                await Promise.all(promiseName)
                /**
                 * Is Target a Rep
                 */
                const getReplaceNameRepresentative = await Representatives.findAll({
                    where:{ representative_name: replaceNames}
                })
               
                console.log("Replaced Old normalize company list length->", getReplaceNameRepresentative.length)

                if(getReplaceNameRepresentative.length > 0) {
                    //Yes
                    /**
                     * Is Rep is already a Rep
                    */
                    if(representativeCompany == null) {
                        //NO
                        const firstCompany = getReplaceNameRepresentative[0].representative_id;
                        
                        await Representatives.update({
                            representative_name: normalize_name
                        }, {where: {representative_id: firstCompany} });

                        representativeCompany  = await Representatives.findOne({
                            where:{representative_id: firstCompany}
                        });
                    } 
                    const promiseIDs = getReplaceNameRepresentative.map( representative => otherIDs.push(representative.representative_id))
                    await Promise.all(promiseIDs)
                    console.log("UPDATE", otherIDs)

                    const findOldRows = await AssignorAndAssignee.findAll({
                        attributes:['assignor_and_assignee_id'],
                        where: {
                            [connection.Op.or]: [
                            {representative_id: otherIDs},
                            {name: replaceNames}
                        ]}
                    })

                    console.log("findOldRows", findOldRows)

                    if(findOldRows.length > 0) {
                        console.log("findOldRowsIDs", IDs)
                        const promiseR = findOldRows.map(row => IDs.push(row.assignor_and_assignee_id))
                        await Promise.all(promiseR)
                        console.log("findOldRowsIDs1", IDs)
                        allRepresentatives = [...allRepresentatives, ...otherIDs]
                        console.log("allRepresentatives", allRepresentatives)
                    }
                } else {
                    //NO
                    if(representativeCompany == null) {
                        //NO
                        representativeCompany = await Representatives.create({
                            representative_name: normalize_name
                        });
                    }
                    console.log("Update old representatives", otherIDs)                    
                } 
              
                console.log("RepresentativeID->", representativeCompany.representative_id)
                const item = {representative_id: representativeCompany.representative_id};
                
                //Associate Target With Rep
                await AssignorAndAssignee.update(item, {where: {assignor_and_assignee_id: IDs}}); 

                // Associate the Rep with Rep
                await AssignorAndAssignee.update(item, {where: {name: normalize_name}}); 
                
                // Delete other rep
                if(allRepresentatives > 0) {
                    console.log("allRepresentatives1", allRepresentatives)
                    await allRepresentativesCheckAndDelete(allRepresentatives);
                }	
            } else {
                let getList = await AssignorAndAssignee.findAll({
                    attributes:['assignor_and_assignee_id', 'representative_id', 'name'],
                    where:{assignor_and_assignee_id: IDs}
                });                

                
                if(getList.length > 0) {
                    const  allRepresentatives = [], replaceNames = [], otherIDs = [];
                    IDs = []
                    const promise = getList.map(r => {
                        IDs.push(r.assignor_and_assignee_id)
                        if(r.representative_id > 0) {
                            allRepresentatives.push(r.representative_id)
                        }
                        replaceNames.push(r.name)
                        return r;
                    })
                    await Promise.all(promise);

                    const getReplaceNameRepresentative = await Representatives.findAll({
                        where:{ representative_name: replaceNames}
                    })
                    if(getReplaceNameRepresentative.length > 0) {
                        const promiseIDs = getReplaceNameRepresentative.map( representative => otherIDs.push(representative.representative_id))
                        await Promise.all(promiseIDs)
                        const findOldRows = await AssignorAndAssignee.findAll({
                            attributes:['assignor_and_assignee_id'],
                            where: {
                                [connection.Op.or]: [
                                {representative_id: otherIDs},
                                {name: replaceNames}
                            ]}
                        })
                        if(findOldRows.length > 0) {
                            console.log("findOldRowsIDs", IDs)
                            const promiseR = findOldRows.map(row => IDs.push(row.assignor_and_assignee_id))
                            await Promise.all(promiseR)
                            console.log("findOldRowsIDs1", IDs)                            
                        }
                    }


                    await AssignorAndAssignee.update({representative_id: 0}, {where: {assignor_and_assignee_id: IDs}});

                    if(allRepresentatives > 0) {
                        await allRepresentativesCheckAndDelete(allRepresentatives);
                    }
                }   
            }
            // Get all list including normalize company and other names
            let queryCompany = `SELECT a.assignor_and_assignee_id as id, a.assignor_and_assignee_id, a.name, a.instances as counter, c.representative_name as normalize_name, (select rr.representative_name FROM representative as rr WHERE rr.representative_name = a.name GROUP BY rr.representative_name) as representative_company, (SELECT concat(ass.reel_no,'-', ass.frame_no) FROM assignee as ee INNER JOIN assignment as ass ON ass.rf_id = ee.rf_id WHERE ee.assignor_and_assignee_id = a.assignor_and_assignee_id LIMIT 1) as assigneeRFID, (SELECT concat(asss.reel_no,'-', asss.frame_no) FROM assignor as assi INNER JOIN assignment as asss ON asss.rf_id = assi.rf_id WHERE assi.assignor_and_assignee_id = a.assignor_and_assignee_id LIMIT 1) as assignorRFID  FROM assignor_and_assignee as a LEFT JOIN representative as c ON c.representative_id = a.representative_id WHERE a.assignor_and_assignee_id IN (:IDs) OR a.name = :normalizeName `;

            const replacements = {normalizeName:  normalize_name, IDs}

            if(otherIDs.length > 0) {
                replacements.representative_id = otherIDs
                queryCompany += ` OR a.representative_id IN (:representative_id)`
            }

            getList = await connection.resources.query(queryCompany,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                replacements: replacements,
                logging: console.log,
                }
            );
            res.status(200).json(getList);
        }     
    } catch(e) {
        console.log(e);
        res.status(402).send("Bad inputs");
    }
});

/**
 * Get all Assignment Text from USPTO database 
 * if customerID is 0 then this is for whole database other it will be for the particular client
 */
route.get("/company/transactions/:id", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID, clientDBConnection.connect], async (req, res, next) => {
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

route.get("/company/transactions/:id/:representativeID", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID, clientDBConnection.connect], async (req, res, next) => {
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

route.put("/company/transactions/:customerID", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
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
                const updateFields = {convey_ty: updateConveyType};

                if(updateConveyType == 'employee') {
                    updateFields.flag = 1;
                }

                update = await RepresentativeAssignmentConveyance.update(updateFields,{where: {rf_id: uniqueRFIDs}});

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

                await AssignmentConveyance.update(updateFields,{where: {rf_id: uniqueRFIDs}});

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



route.get("/company/law_firms", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID, clientDBConnection.connect], async (req, res, next) => {
    try {        
        const query = req.query.search;
        const where = {law_firm_id:{[connection.Op.gt]: 0}};
        
        if(query != undefined && query != null) {
            where.name = {[connection.Op.like]: '%' + query + '%'};
        }
        
        const findAllLawFirms = await LawFirms.findAll({
            attributes: ['law_firm_id', 'name', ['instances', 'counter']],
            where: where,
            include: [
                {
                    model: RepresentativeLawFirms,
                    as: "representativelawfirm",
                    attributes: ['representative_id','representative_name'],
                    required:false
                }
            ]
        });
        res.status(200).json(findAllLawFirms);
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
        if(customerID > 0) {
            const where = {organisation_id: customerID};
            let whereRepresentative = {};
            if(representativeIDs.length > 0) {
                where.representative_id = representativeIDs;
                whereRepresentative = {
                    [connection.Op.or]: [
                        {parent_id: representativeIDs},
                        {representative_id: representativeIDs}
                    ]
                }
            }

            const assignorAndAssigneeIDs = [];

            if(req.connection_db != null) {
                const RepresentativeClient = req.connection_db.define('Representatives', RepresentativeCustomer.mainStructure, RepresentativeCustomer.options);
                const findRepresentativeCompanies = await RepresentativeClient.findAll({
                    attributes:['original_name'],
                    where:whereRepresentative
                });
    
                if(findRepresentativeCompanies != null && findRepresentativeCompanies.length > 0) {
                   const allNames = [];
                    const promises = findRepresentativeCompanies.map( company => {
                        allNames.push(company.original_name);
                        return company;
                    });
    
                    await Promise.all(promises);
    
                    const findAssignorAndAssignee = await AssignorAndAssignee.findAll({
                        attributes: ['assignor_and_assignee_id'],
                        where:{name: allNames}
                    });
    
                    if(findAssignorAndAssignee != null && findAssignorAndAssignee.length > 0) {
                        const assignorAndAssigneePromises = findAssignorAndAssignee.map( assignor_and_assignee => {
                            assignorAndAssigneeIDs.push(assignor_and_assignee.assignor_and_assignee_id);
                            return assignor_and_assignee;
                        });
        
                        await Promise.all(assignorAndAssigneePromises);
                    }
                }
            }

            const whereAssignor = {};
            if(assignorAndAssigneeIDs.length > 0) {
                whereAssignor.assignor_and_assignee_id = assignorAndAssigneeIDs;
            }

            const list = await Assignments.findAll({
                attributes: ['law_firm_id'], 
                group: ['law_firm_id'], 
                where: {law_firm_id:{[connection.Op.gt]: 0}},                
                include: [
                    {
                        model: RepresentativeTransactions,
                        as: "representativetransaction",
                        attributes: [],
                        where: where,  
                        include: [
                            {
                                model: Assignees,
                                as: 'assignee',
                                attributes: [],
                                where: whereAssignor
                            }
                        ]                      
                    },
                    {
                        model: LawFirms,
                        as: "lawfirm",
                        attributes: ['law_firm_id', 'name', [connection.Sequelize.fn('COUNT', 'law_firm_id'), 'counter'], ['instances', 'total_occurences']],
                        group: ['law_firm_id'],   
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

            if(list.length > 0) {
                const promises = list.map( r => {
                    findAllLawFirms.push(r.lawfirm);
                    return r;
                });

                await Promise.all(promises);
            }
        }
        res.status(200).json(findAllLawFirms);
    } catch(e) {
        console.log(e);
        res.status(402).send("Unable to retrieve data.");
    }
});

route.put("/company/law_firms", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID, clientDBConnection.connect], async (req, res, next) => {
    try{
        let IDs = JSON.parse(req.body.law_firm_ids), normalize_name = req.body.normalize_name;

        console.log(IDs);
        console.log(normalize_name);

        if(IDs.length > 0) {
            if(normalize_name != '') {
                const promises = IDs.map(async lawFirmID => {

                    let oldRepresentativeCompanyID = 0, oldRepresentativeCompanyName = "";

                    let findIsNormalized  = await LawFirms.findOne({
                                            where:{law_firm_id: lawFirmID}
                                        });
                    if(findIsNormalized != null ) {
                        if(findIsNormalized.representative_id > 0) {
                            findIsNormalized  = await RepresentativeLawFirms.findOne({
                                where:{representative_id: findIsNormalized.representative_id}
                            });
                        } else {
                            findIsNormalized  = await RepresentativeLawFirms.findOne({
                                where:{representative_name: findIsNormalized.name}
                            });
                        }                        
                    } 

                    if(findIsNormalized != null && findIsNormalized.representative_id > 0) {
                        /** 
                         * Find old representative company
                        */
                        oldRepresentativeCompanyID = findIsNormalized.representative_id;
                        oldRepresentativeCompanyName = findIsNormalized.representative_name;
                    }

                    let  representativeLawFirm = await RepresentativeLawFirms.findOne({
                        where: {representative_name: normalize_name}
                    });

                    /**
                     * Check normalize company is normalize with  another company
                     * 
                     */
                    let findNormalizedCompany  = await LawFirms.findOne({
                        where:{name: normalize_name}
                    });

                    if(findNormalizedCompany != null && findNormalizedCompany.representative_id > 0) {
                        representativeLawFirm  = await RepresentativeLawFirms.findOne({
                            where:{representative_id: findNormalizedCompany.representative_id}
                        });
        
                        if(representativeLawFirm != null && representativeLawFirm.representative_id > 0){
                            await RepresentativeLawFirms.update({
                                representative_name: normalize_name
                            }, {where: {representative_id: representativeLawFirm.representative_id} });
                        }
                    }

                    if(representativeLawFirm == null) {
                        /**
                         * If Old representative found
                         */                    
                        if(oldRepresentativeCompanyID > 0) {
                            /**
                             * Update old representative company name with new representative name i.e normalize name
                             */
                            await RepresentativeLawFirms.update({
                                representative_name: normalize_name
                            }, {where: {representative_id: oldRepresentativeCompanyID} });

                            representativeLawFirm = await RepresentativeLawFirms.findOne({
                                where: {representative_name: normalize_name}
                            });
                        } else {
                            /**
                             * Insert new representative company in the representative table
                             */                        
                            representativeLawFirm = await RepresentativeLawFirms.create({
                                representative_name: normalize_name
                            });
                        }                    
                    }

                    if(representativeLawFirm != null && representativeLawFirm.representative_id > 0) { 
                        const item = {representative_id: representativeLawFirm.representative_id};

                        if(oldRepresentativeCompanyID == 0) {
                            /**
                             * Update representative ID
                             */
                            await LawFirms.update(item, {where: {law_firm_id: lawFirmID}});                                             
                        } else {  
                            
                            await LawFirms.update(item, {where: {representative_id: oldRepresentativeCompanyID}});

                            await LawFirms.update(item, {where: {name: oldRepresentativeCompanyName}});


                        }
                    }

                    return lawFirmID;
                })

                await Promise.all(promises);
                res.status(200).send("Updated successfully");	
                /**
                 * This check is to find company is already normalised with other representative company
                 */
                
            } else {
                await LawFirms.update({representative_id: 0}, {where: {law_firm_id: IDs}});
                res.status(200).send("Updated successfully");	
            }
        } else {
            res.status(403).send("Please select lawfirms");
        }
    } catch(e) {
        console.log(e);
        res.status(402).send("Unable to update data.");
    }
});


route.get("/company/lawyers", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID, clientDBConnection.connect], async (req, res, next) => {
    try {
        const findAllLawers = await Lawyers.findAll({
            attributes: ['lawyer_id', 'name', ['instances', 'counter']],
            include: [
                {
                    model: RepresentativeLawyers,
                    as: "representativelawyers",
                    attributes: ['representative_lawyer_id','representative_name'],
                    required:false
                },
                {
                    model: LawFirms,
                    as: "lawfirms",
                    attributes: ['law_firm_id',['name', 'law_firm_name']],
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
        res.status(200).json(findAllLawers);
    } catch(e) {
        console.log(e);
        res.status(402).send("Unable to retrieve data.");
    }
});

route.get("/company/lawyers/:id", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID, clientDBConnection.connect], async (req, res, next) => {
    try {
        const customerID = req.params.id, representativeIDs = JSON.parse(req.query.portfolios != undefined ? req.query.portfolios : "[]");

        /*const findAllLawFirms =  await helpers.findAllLawFirms(customerID, representativeIDs, req);*/
        let findAllLawers = [];
        if(customerID > 0) {
            let whereRepresentative = {};
            const where = {organisation_id: customerID};
            if(representativeIDs.length > 0) {
                where.representative_id = representativeIDs;
                whereRepresentative = {
                    [connection.Op.or]: [
                        {parent_id: representativeIDs},
                        {representative_id: representativeIDs}
                    ]
                }
            }

            const assignorAndAssigneeIDs = [];

            if(req.connection_db != null) {
                const RepresentativeClient = req.connection_db.define('Representatives', RepresentativeCustomer.mainStructure, RepresentativeCustomer.options);
                const findRepresentativeCompanies = await RepresentativeClient.findAll({
                    attributes:['original_name'],
                    where:whereRepresentative
                });
    
                if(findRepresentativeCompanies != null && findRepresentativeCompanies.length > 0) {
                   const allNames = [];
                    const promises = findRepresentativeCompanies.map( company => {
                        allNames.push(company.original_name);
                        return company;
                    });
    
                    await Promise.all(promises);
    
                    const findAssignorAndAssignee = await AssignorAndAssignee.findAll({
                        attributes: ['assignor_and_assignee_id'],
                        where:{name: allNames}
                    });
    
                    if(findAssignorAndAssignee != null && findAssignorAndAssignee.length > 0) {
                        const assignorAndAssigneePromises = findAssignorAndAssignee.map( assignor_and_assignee => {
                            assignorAndAssigneeIDs.push(assignor_and_assignee.assignor_and_assignee_id);
                            return assignor_and_assignee;
                        });
        
                        await Promise.all(assignorAndAssigneePromises);
                    }
                }
            }


            const whereAssignor = {};
            if(assignorAndAssigneeIDs.length > 0) {
                whereAssignor.assignor_and_assignee_id = assignorAndAssigneeIDs;
            }


            const list = await Assignments.findAll({
                attributes: ['law_firm_id', 'caddress_1'],    
                group: ['law_firm_id', 'caddress_1'],
                where : {
                    caddress_1: {
                        [connection.Op.ne]: ''
                    }
                },
                include: [
                    {
                        model: RepresentativeTransactions,
                        as: "representativetransaction",
                        attributes: [],
                        where: where,  
                        include: [
                            {
                                model: Assignees,
                                as: 'assignee',
                                attributes: [],
                                where: whereAssignor
                            }
                        ]                    
                    }
                ]
            });

            const allLawFirms = [], lawer_names = [];

            if(list.length > 0) {
                const promises = list.map( r => {
                    allLawFirms.push(r.law_firm_id);
                    lawer_names.push(r.caddress_1);
                    return r;
                });

                await Promise.all(promises);



                findAllLawers = await Lawyers.findAll({
                    attributes: ['lawyer_id', 'name',[connection.Sequelize.fn('COUNT', 'lawyer_id'), 'counter'], ['instances', 'total_occurences']],
                    where: {law_firm_id: allLawFirms, name: lawer_names},
                    group: ['lawyer_id'],
                    include: [
                        {
                            model: RepresentativeLawyers,
                            as: "representativelawyers",
                            attributes: ['representative_lawyer_id','representative_name'],
                            required:false
                        },
                        {
                            model: LawFirms,
                            as: "lawfirms",
                            attributes: ['law_firm_id',['name', 'law_firm_name']],
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
        }
        res.status(200).json(findAllLawers);
    } catch(e) {
        console.log(e);
        res.status(402).send("Unable to retrieve data.");
    }
});

route.put("/company/lawyers", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID, clientDBConnection.connect], async (req, res, next) => {
    try{
        let IDs = JSON.parse(req.body.lawyer_ids), normalize_name = req.body.normalize_name;

        console.log(IDs);
        console.log(normalize_name);

        if(IDs.length > 0) {
            if(normalize_name != '') {
                const promises = IDs.map(async lawyerID => {

                    let oldRepresentativeCompanyID = 0, oldRepresentativeCompanyName = "";

                    let findIsNormalized  = await Lawyers.findOne({
                                            where:{law_firm_id: lawyerID}
                                        });
                    if(findIsNormalized != null ) {
                        if(findIsNormalized.representative_lawyer_id > 0) {
                            findIsNormalized  = await RepresentativeLawyers.findOne({
                                where:{representative_lawyer_id: findIsNormalized.representative_lawyer_id}
                            });
                        } else {
                            findIsNormalized  = await RepresentativeLawyers.findOne({
                                where:{representative_name: findIsNormalized.name}
                            });
                        }                        
                    } 

                    if(findIsNormalized != null && findIsNormalized.representative_lawyer_id > 0) {
                        /** 
                         * Find old representative company
                        */
                        oldRepresentativeCompanyID = findIsNormalized.representative_lawyer_id;
                        oldRepresentativeCompanyName = findIsNormalized.representative_name;
                    }

                    let  representativeLawyer = await RepresentativeLawyers.findOne({
                        where: {representative_name: normalize_name}
                    });

                    /**
                     * Check normalize company is normalize with  another company
                     * 
                     */
                    let findNormalizedCompany  = await Lawyers.findOne({
                        where:{name: normalize_name}
                    });

                    if(findNormalizedCompany != null && findNormalizedCompany.representative_lawyer_id > 0) {
                        representativeLawyer  = await RepresentativeLawyers.findOne({
                            where:{representative_lawyer_id: findNormalizedCompany.representative_lawyer_id}
                        });
        
                        if(representativeLawyer != null && representativeLawyer.representative_lawyer_id > 0){
                            await RepresentativeLawyers.update({
                                representative_name: normalize_name
                            }, {where: {representative_lawyer_id: representativeLawyer.representative_lawyer_id} });
                        }
                    }

                    if(representativeLawyer == null) {
                        /**
                         * If Old representative found
                         */                    
                        if(oldRepresentativeCompanyID > 0) {
                            /**
                             * Update old representative company name with new representative name i.e normalize name
                             */
                            await RepresentativeLawyers.update({
                                representative_name: normalize_name
                            }, {where: {representative_lawyer_id: oldRepresentativeCompanyID} });

                            representativeLawyer = await RepresentativeLawyers.findOne({
                                where: {representative_name: normalize_name}
                            });
                        } else {
                            /**
                             * Insert new representative company in the representative table
                             */                        
                            representativeLawyer = await RepresentativeLawyers.create({
                                representative_name: normalize_name
                            });
                        }                    
                    }

                    if(representativeLawyer != null && representativeLawyer.representative_lawyer_id > 0) { 
                        const item = {representative_lawyer_id: representativeLawyer.representative_lawyer_id};

                        if(oldRepresentativeCompanyID == 0) {
                            /**
                             * Update representative ID
                             */
                            await Lawyers.update(item, {where: {lawyer_id: lawyerID}});                                             
                        } else {  
                            
                            await Lawyers.update(item, {where: {representative_lawyer_id: oldRepresentativeCompanyID}});

                            await Lawyers.update(item, {where: {name: oldRepresentativeCompanyName}});

                        }
                    }

                    return lawyerID;
                })

                await Promise.all(promises);
                res.status(200).send("Updated successfully");	
                /**
                 * This check is to find company is already normalised with other representative company
                 */
                
            } else {
                await LawFirms.update({representative_lawyer_id: 0}, {where: {law_firm_id: IDs}});
                res.status(200).send("Updated successfully");	
            }
        } else {
            res.status(403).send("Please select lawyers");
        }
    } catch(e) {
        console.log(e);
        res.status(402).send("Unable to update data.");
    }
});


route.get("/company/raw/assignments/:id", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID, clientDBConnection.connect], async (req, res, next) => {

    const customerID = req.params.id, representativeIDs = JSON.parse(req.query.portfolios != undefined ? req.query.portfolios : "[]");
    let getList = [];
    if(customerID > 0) {
        const where = {organisation_id: customerID};
        let whereRepresentative = {};
        if(representativeIDs.length > 0) {
            where.representative_id = representativeIDs;
            whereRepresentative = {
                [connection.Op.or]: [
                    {parent_id: representativeIDs},
                    {representative_id: representativeIDs}
                ]
            }
        }

        const assignorAndAssigneeIDs = [];

        if(req.connection_db != null) {
            const RepresentativeClient = req.connection_db.define('Representatives', RepresentativeCustomer.mainStructure, RepresentativeCustomer.options);
            const findRepresentativeCompanies = await RepresentativeClient.findAll({
                attributes:['original_name'],
                where:whereRepresentative
            });

            if(findRepresentativeCompanies != null && findRepresentativeCompanies.length > 0) {
                const allNames = [];
                const promises = findRepresentativeCompanies.map( company => {
                    allNames.push(company.original_name);
                    return company;
                });

                await Promise.all(promises);

                const findAssignorAndAssignee = await AssignorAndAssignee.findAll({
                    attributes: ['assignor_and_assignee_id'],
                    where:{name: allNames}
                });

                if(findAssignorAndAssignee != null && findAssignorAndAssignee.length > 0) {
                    const assignorAndAssigneePromises = findAssignorAndAssignee.map( assignor_and_assignee => {
                        assignorAndAssigneeIDs.push(assignor_and_assignee.assignor_and_assignee_id);
                        return assignor_and_assignee;
                    });
    
                    await Promise.all(assignorAndAssigneePromises);
                }
            }
        }

        const whereAssignor = {};
        if(assignorAndAssigneeIDs.length > 0) {
            whereAssignor.assignor_and_assignee_id = assignorAndAssigneeIDs;
        }

        getList = await Assignments.findAll({
            attributes: [['rf_id', 'id'], 'rf_id', 'cname', 'caddress_1', 'caddress_2','caddress_7','caddress_5','caddress_6','caddress_3','caddress_4', 'reel_no', 'frame_no'],  
            /*where: {
                [connection.Op.or]: [
                    {caddress_1: {[connection.Op.ne]: ''}},
                    {caddress_2: {[connection.Op.ne]: ''}}
                ]
            },  */  
            group:['cname', 'caddress_1', 'caddress_2','caddress_7','caddress_5','caddress_6','caddress_3','caddress_4'],    
            include: [
                {
                    model: RepresentativeTransactions,
                    as: "representativetransaction",
                    attributes: [],
                    where: where,
                    include: [
                        {
                            model: Assignees,
                            as: 'assignee',
                            attributes: [],
                            where: whereAssignor
                        }
                    ]                      
                }
            ]
        });
    }   
    res.status(200).json(getList);
});

route.put("/company/raw/assignments/:id", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID, clientDBConnection.connect], async (req, res, next) => {
    const customerID = req.params.id, representativeIDs = JSON.parse(req.query.portfolios != undefined ? req.query.portfolios : "[]");
    exec(`php -f /var/www/html/trash/address_swapping.php "${customerID}" "${representativeIDs}"`, function (error, stdout, stderr) {
        console.log(error);
        console.log(stdout);
        console.log(stderr);
    });
    res.status(200).send("In process");
});


route.get("/company/assignments", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
    const getList = await Assignments.findAll({
        attributes: [['rf_id', 'id'], 'rf_id', 'cname', 'caddress_1', 'caddress_2', 'reel_no', 'frame_no'],
        where: {
            [connection.Op.or]: [
                {caddress_1: {[connection.Op.ne]: ''}},
                {caddress_2: {[connection.Op.ne]: ''}}
            ]
        }, 
        group: ['caddress_1','caddress_2'],   
    });
    res.status(200).json(getList);
});

route.get("/company/assignments/:id", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID, clientDBConnection.connect], async (req, res, next) => {

    const customerID = req.params.id, representativeIDs = JSON.parse(req.query.portfolios != undefined ? req.query.portfolios : "[]");
    let getList = [];
    if(customerID > 0) {
        const where = {organisation_id: customerID};
        let whereRepresentative = {};
        if(representativeIDs.length > 0) {
            where.representative_id = representativeIDs;
            whereRepresentative = {
                [connection.Op.or]: [
                    {parent_id: representativeIDs},
                    {representative_id: representativeIDs}
                ]
            }
        }

        const assignorAndAssigneeIDs = [];

        if(req.connection_db != null) {
            const RepresentativeClient = req.connection_db.define('Representatives', RepresentativeCustomer.mainStructure, RepresentativeCustomer.options);
            const findRepresentativeCompanies = await RepresentativeClient.findAll({
                attributes:['original_name'],
                where:whereRepresentative
            });

            if(findRepresentativeCompanies != null && findRepresentativeCompanies.length > 0) {
                const allNames = [];
                const promises = findRepresentativeCompanies.map( company => {
                    allNames.push(company.original_name);
                    return company;
                });

                await Promise.all(promises);

                const findAssignorAndAssignee = await AssignorAndAssignee.findAll({
                    attributes: ['assignor_and_assignee_id'],
                    where:{name: allNames}
                });

                if(findAssignorAndAssignee != null && findAssignorAndAssignee.length > 0) {
                    const assignorAndAssigneePromises = findAssignorAndAssignee.map( assignor_and_assignee => {
                        assignorAndAssigneeIDs.push(assignor_and_assignee.assignor_and_assignee_id);
                        return assignor_and_assignee;
                    });
    
                    await Promise.all(assignorAndAssigneePromises);
                }
            }
        }

        const whereAssignor = {};
        if(assignorAndAssigneeIDs.length > 0) {
            whereAssignor.assignor_and_assignee_id = assignorAndAssigneeIDs;
        }

        getList = await Assignments.findAll({
            attributes: [['rf_id', 'id'], 'rf_id', 'cname', 'caddress_1', 'caddress_2', 'reel_no', 'frame_no'],  
            where: {
                [connection.Op.or]: [
                    {caddress_1: {[connection.Op.ne]: ''}},
                    {caddress_2: {[connection.Op.ne]: ''}}
                ]
            },  
            group: ['caddress_1','caddress_2'],           
            include: [
                {
                    model: RepresentativeTransactions,
                    as: "representativetransaction",
                    attributes: [],
                    where: where,
                    include: [
                        {
                            model: Assignees,
                            as: 'assignee',
                            attributes: [],
                            where: whereAssignor
                        }
                    ]                      
                }
            ]
        });
    }   
    res.status(200).json(getList);
});

route.put("/company/assignments", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
    try{
        const rfID = req.body.rf_id;
        if(rfID > 0) {
            const getData = await Assignments.findOne({
                where: {rf_id: rfID}
            });
    
            if(getData != null && getData.rf_id > 0) {
                
                /**
                 * Other Records
                 */
                const findOtherRecords = await Assignments.findAll({
                    attributes: ['rf_id','law_firm_id', 'caddress_1', 'caddress_2'],
                    where: {caddress_1: getData.caddress_1, caddress_2: getData.caddress_2, law_firm_id:{[connection.Op.gt]: 0}}
                })


                if(findOtherRecords.length > 0) {
                    const promise = findOtherRecords.map(async assignment => {
                        console.log(assignment);
                        const updateData = {};
                        if(req.body.type == 1) {
                            updateData.caddress_1 = assignment.caddress_2;
                            updateData.caddress_2 = '';
                        } else {
                            updateData.caddress_6 = assignment.caddress_2;
                            updateData.caddress_2 = '';
                            if(req.body.type == 3) {
                                updateData.caddress_5 = assignment.caddress_1;
                                updateData.caddress_1 = '';
                            }
                        }

                        const updateRecord = await Assignments.update(updateData, {where:{rf_id: assignment.rf_id}});
                        if(updateRecord) {
                            if(req.body.type == 1) {   
                                console.log(1);
                                const lawyerData = await Lawyers.findOne({
                                    where: {law_firm_id: assignment.law_firm_id,  name: assignment.caddress_1}
                                });
                                if(lawyerData != null && lawyerData.lawyer_id > 0) {
                                    console.log(2);
                                    const findAnother  = await Lawyers.findOne({
                                        where: {law_firm_id: assignment.law_firm_id,  name: assignment.caddress_2}
                                    });
                                    if(findAnother == null) {
                                        console.log(3);
                                        await Lawyers.update({name: assignment.caddress_2},{where: {lawyer_id: lawyerData.lawyer_id}});
                                    } else {
                                        console.log(4);
                                        await Lawyers.destroy({where: {lawyer_id: lawyerData.lawyer_id}});
                                        await Lawyers.update({instance: findAnother.instance + 1},{where: {lawyer_id: findAnother.lawyer_id}});
                                    }
                                }
                            }
                            if(updateData.caddress_1 == '') {
                                console.log(5);
                                const lawyerData = await Lawyers.findOne({
                                    where: {law_firm_id: assignment.law_firm_id,  name: assignment.caddress_1}
                                });
        
                                if(lawyerData != null && lawyerData.lawyer_id > 0) {
                                    console.log(6);
                                    await Lawyers.destroy({where: {lawyer_id: lawyerData.lawyer_id}});
                                }
                            }
                        }
                        return assignment;
                    })

                    await Promise.all(promise);

                    res.status(200).send("Records Updated");
                } else {
                    res.status(401).send("Unable to update records");
                }
            } else {
                res.status(402).send("Invalid inputs");
            }
        } else {
            res.status(402).send("Invalid inputs");
        }
    } catch(e) {
        console.log(e);
        res.status(402).send("Unable to update data.");
    }    
});

/**
 * Find All Transaction with conveyanceType and Entity Type
 */
route.get("/all/transactions/:conveyanceType", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
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


/**
 * Creating Report
 */
route.get("/company/report", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
    try {

        const queryReport = `SELECT representative_id, representative_name, no_of_assets as assets, no_of_transactions, no_of_parties, (no_of_parties - no_of_transactions) as product FROM representative_reports`;

        let reports = await connection.resources.query(queryReport,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                replacements: { },
                logging: console.log,
                }
            );
        res.status(200).json(reports);            
        /* connection.resources.query("CALL `companies_report`();",{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            logging: console.log,
            replacements: {},
            }
        ).spread(result => {
            let reports = []
            if (result) {
                reports = Object.values(result)
            }
            res.status(200).json(reports);
        }) */
    } catch(e) {
        console.log(e);
        res.status(402).send("Unable to retrieve data.");
    } 
});

/**
 * Creating Report
 */
route.get("/company/:representativeID/event_maintainence", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
    try {

        const { representativeID } = req.params;

        const queryAbaondants = `SELECT event_date FROM representative_ota_event WHERE representative_id = :representativeID AND event_code IN (:eventCode)`;

        let abaondants = await connection.resources.query(queryAbaondants,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                replacements: { representativeID, eventCode: ['EXP.', 'EXPX'] },
                logging: console.log,
                }
            );

        const queryRenewal = `SELECT event_date FROM representative_ota_event WHERE representative_id = :representativeID AND event_code IN (:eventCode)`;

        let renewal = await connection.resources.query(queryRenewal,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                replacements: { representativeID, eventCode: ['M1551', 'M2551', 'M3551', 'M1552', 'M2552', 'M3552', 'M1553', 'M2553', 'M3553'] },
                logging: console.log,
                }
            );
        res.status(200).json({abaondants, renewal});
        /* connection.resources.query("CALL `companies_report`();",{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            logging: console.log,
            replacements: {},
            }
        ).spread(result => {
            let reports = []
            if (result) {
                reports = Object.values(result)
            }
            res.status(200).json(reports);
        }) */
    } catch(e) {
        console.log(e);
        res.status(402).send("Unable to retrieve data.");
    } 
});

module.exports = route;