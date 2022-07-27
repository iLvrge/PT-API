const express = require("express");

const route = express.Router();

const exec = require("child_process").exec;

const connection = require("../../config/db.config");

const clientDBConnection = require("../../helpers/clientDBConnection");

const {google} = require('googleapis');

//require the Model

const authJWT = require("../../helpers/verifyJwtToken");

const helpers = require("../../helpers/helper");

const Organisations = require('../../model/business/Organisations');

const Representatives = require('../../model/resources/Representatives');

const RepresentativeAddress = require('../../model/resources/RepresentativeAddress');

const RepresentativeCustomer = require('../../model/client/Representatives');

const RepresentativeAssignmentConveyance = require('../../model/resources/RepresentativeAssignmentConveyance');

const AssigneeOrganizations = require('../../model/application/AssigneeOrganizations');

const AssignmentConveyance = require('../../model/application/AssignmentConveyance');

const Assignments = require('../../model/resources/Assignments');

const Assignors = require('../../model/resources/Assignors');

const Assignees = require('../../model/resources/Assignees');

const ApplicantAssignorAndAssignee = require('../../model/resources/ApplicantAssignorAndAssignee');

const AssignorAndAssignee = require('../../model/resources/AssignorAndAssignee');

const RecentTransaction = require('../../model/resources/RecentTransaction');

const AssignmentGroup = require('../../model/resources/AssignmentGroup');

const LawFirms = require('../../model/resources/LawFirms');

const RepresentativeLawFirms = require('../../model/resources/RepresentativeLawFirms');

const Lawyers = require('../../model/resources/Lawyers');

const RepresentativeLawyers = require('../../model/resources/RepresentativeLawyers');

const RepresentativeTransactions = require('../../model/resources/RepresentativeTransactions');

const List2 = require('../../model/resources/List2');

const SheetsHelper = require('../../helpers/sheets');
const ClientAddCompany = require("../../model/application/ClientAddCompany");


const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_SECRET_KEY,
    process.env.ADMIN_REDIRECT_URL
);

let authenticateGoogleToken = async( code ) => {
    let getTokens = {}

    try{
        const {tokens} = await oauth2Client.getToken(code)
        getTokens = tokens
    } catch(e) {
        console.log(e)
    }
    
    return getTokens
}


route.get("/company/request", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try {
        const list = await ClientAddCompany.findAll({
            where: { status: 0 }
        })

        res.status(200).json(list)
        
    } catch (err) {
        console.log(err);
        res.status(500).json({message: "Unable to retrieve companies"})
    }
});

route.put("/company/request", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try {
        let { company_ids, representative_id } = req.body

        if( company_ids != '' ) {
            const company_id = JSON.parse(company_ids)
            if(company_id.length > 0 && representative_id > 0) {
                const update = await ClientAddCompany.update({
                    status: 1,
                    representative_id
                }, {
                    company_id: JSON.stringify(company_ids)
                })
                res.status(200).json(update)
            } else {
                res.status(500).json({message: "Invalid inputs"})
            }   
        } else {
            res.status(500).json({message: "Invalid inputs"})
        } 
    } catch (err) {
        console.log(err);
        res.status(500).json({message: "Unable to retrieve companies"})
    }
});


/**
 * Search entity by name
 */

 route.get("/company/representative/search/:name", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
    try{
        const {name} = req.params;	

        const query = `SELECT representative_id, representative_name FROM db_uspto.representative WHERE MATCH(representative_name) AGAINST (:name IN BOOLEAN MODE)`

        const list  = await connection.resources.query(query,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                replacements: { name },
                logging: console.log,
            }
        );
        res.status(200).json(list);	

    } catch( err ) {
        console.log(err);
        res.status(500).json({message: "Unable to retrieve companies"})
    }
 })

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

route.get("/lawfirm/:ID/search/address", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
    try {
        let lawfirmAddress = [];
        const {ID} = req.params;	
        // search by id
        if(ID != null && ID != undefined && ID.length > 0) {            
            lawfirmAddress  = await helpers.getAddressListByLawfirmID(ID);
        }
        res.status(200).json(lawfirmAddress);           
    } catch(e) {
        console.log(e);
        res.status(402).send("Not found ");
    } 
});

route.get("/company/:ID/search/address/:type", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
    try {
        let companyAddress = [];
        const {ID, type} = req.params;	

        if(ID != null && ID != undefined && ID.length > 0) {   
            console.log(ID, type)         
            companyAddress  = await helpers.getAddressListByCompanyID(ID, type);
        }
        res.status(200).json(companyAddress);           
    } catch(e) {
        console.log(e);
        res.status(402).send("Not found ");
    }
});

route.get("/company/:ID/search/address_with_transactions/:type", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
    try {
        let companyAddressWithTransactions = [];
        const {ID, type} = req.params;	

        if(ID != null && ID != undefined && ID.length > 0) {  
            companyAddressWithTransactions  = await helpers.getAddressWithTransactionsListByCompanyID(ID, type);
        }
        res.status(200).json(companyAddressWithTransactions);           
    } catch(e) {
        console.log(e);
        res.status(402).send("Not found ");
    }
});

route.put("/company/:ID/search/address_with_transactions/:type", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
    try {
        let companyAddressWithTransactions = null, addData = null;
        const {ID, type} = req.params;	
        const {address1, address2} = req.body

        if(ID != null && ID != undefined && ID.length > 0) {  
            companyAddressWithTransactions  = await helpers.getAddressDataFromLastTransaction(ID, address1, address2);
            if(companyAddressWithTransactions != null && companyAddressWithTransactions.rf_id > 0) {
                addData = await RepresentativeAddress.bulkCreate([{
                    representative_id: companyAddressWithTransactions.representativeID,
                    rf_id: companyAddressWithTransactions.rf_id,
                    assignor_and_assignee_id: companyAddressWithTransactions.assignor_and_assignee_id
                }], {ignoreDuplicates: true})
            }
        }
        res.status(200).json(addData);      
    } catch(e) {
        console.log(e);
        res.status(402).send("Not found ");
    }
});

route.post("/lawfirm/:ID/search/address/all", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
    try {
        let searchCompanies = [];
        let address = req.body['address[]']
        const {ID} = req.params;	
        
        if(ID != null && ID != undefined && address.length > 0) {    
            searchCompanies  = await helpers.searchLawfirmIDByAddress(address);
        }
        res.status(200).json(searchCompanies);           
    } catch(e) {
        console.log(e);
        res.status(402).send("Not found ");
    }
});

route.post("/company/:ID/search/address/all/:type", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
    try {
        let searchCompanies = [];
        let address = req.body['address[]']
        const {ID, type} = req.params;	
        
        if(ID != null && ID != undefined && address.length > 0) {    
            searchCompanies  = await helpers.searchCompanyIDByAddress(address, type);
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


route.get("/company/search/country/:name", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
    try {
        let searchCompanies = [];
        const searchItem = req.params.name;	

        if(searchItem != null && searchItem != undefined && searchItem.length > 0) {            
            searchCompanies  = await helpers.searchCompanyByCountry(searchItem, 1);
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

let allRepresentativesFirmCheckAndDelete = async (allRepresentatives) => {
    const findRepresentativeCount = await LawFirms.findAll({
        attributes: ['representative_id', [connection.Sequelize.fn('COUNT', 'law_firm_id'), 'counter']],
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
            await RepresentativeLawFirms.destroy({
                where: {representative_id: destroyRepresentatives}
            })
        }
    } else {
         await RepresentativeLawFirms.destroy({
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

        let {normalize_name, IDs, selected_rows}  = req.body ;
        const otherIDs = [];
        if(IDs.length > 0 || selected_rows != undefined) {
            let applicantAssignorAndAssigneeIDs = [];
            if(selected_rows != undefined) {
                selected_rows = JSON.parse(selected_rows)
            }
            
            if(selected_rows.length > 0) {
                if(selected_rows[0].flag != undefined) {
                    IDs = []
                    selected_rows.forEach(row => {
                        if(row.flag == 2) {
                            applicantAssignorAndAssigneeIDs.push(row.id)
                        } else {
                            IDs.push(row.id)
                        }
                    })
                } else {
                    IDs = JSON.parse(IDs)
                }
            }
            
            if(normalize_name != "") {
                console.log("POST->ID", IDs);
                
                
                /**
                 * Is Rep is already a Rep
                */
                let  representativeCompany = await helpers.checkRepresentativeCompany(normalize_name); 

                console.log("representativeCompany", representativeCompany)

                let allRepresentatives = []; 
                if(IDs.length > 0) {
                    let getList = await AssignorAndAssignee.findAll({
                        where:{assignor_and_assignee_id: IDs}
                    });
                    
                    console.log("getList->length", getList.length);
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
                }
                
               

                 
              
                console.log("RepresentativeID->", representativeCompany.representative_id)
                const item = {representative_id: representativeCompany.representative_id};

                if(IDs.length > 0) {

                
                    //Associate Target With Rep
                    await AssignorAndAssignee.update(item, {where: {assignor_and_assignee_id: IDs}}); 
    
                    // Associate the Rep with Rep
                    await AssignorAndAssignee.update(item, {where: {name: normalize_name}}); 


                }

                // Check Applicant Assignees

                if(applicantAssignorAndAssigneeIDs.length > 0) {
                    await ApplicantAssignorAndAssignee.update(item, {where: {assignor_and_assignee_id: applicantAssignorAndAssigneeIDs}}); 
                }
                
                // Delete other rep
                if(allRepresentatives.length > 0) {
                    console.log("allRepresentatives1", allRepresentatives)
                    await allRepresentativesCheckAndDelete(allRepresentatives);
                }	
            } else {
                // Remove Representative
                const  allRepresentatives = [], replaceNames = [], otherIDs = [];
                if(IDs.length > 0) {
                    let getList = await AssignorAndAssignee.findAll({
                        attributes:['assignor_and_assignee_id', 'representative_id', 'name'],
                        where:{assignor_and_assignee_id: IDs}
                    });                
    
                    
                    if(getList.length > 0) {
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
                    }
                }
                


                // Check Applicant Assignees

                if(applicantAssignorAndAssigneeIDs.length > 0) {
                    await ApplicantAssignorAndAssignee.update({representative_id: 0}, {where: {assignor_and_assignee_id: applicantAssignorAndAssigneeIDs}}); 
                }

                if(allRepresentatives > 0) {
                    await allRepresentativesCheckAndDelete(allRepresentatives);
                }
            }
            // Get all list including normalize company and other names
            let list = [], applicantList = []
            if(IDs.length > 0) {
                let queryCompany = `SELECT a.assignor_and_assignee_id as id, a.assignor_and_assignee_id, a.name, a.instances as counter, c.representative_name as normalize_name, (select rr.representative_name FROM representative as rr WHERE rr.representative_name = a.name GROUP BY rr.representative_name) as representative_company, (SELECT concat(ass.reel_no,'-', ass.frame_no) FROM assignee as ee INNER JOIN assignment as ass ON ass.rf_id = ee.rf_id WHERE ee.assignor_and_assignee_id = a.assignor_and_assignee_id LIMIT 1) as assigneeRFID, (SELECT concat(asss.reel_no,'-', asss.frame_no) FROM assignor as assi INNER JOIN assignment as asss ON asss.rf_id = assi.rf_id WHERE assi.assignor_and_assignee_id = a.assignor_and_assignee_id LIMIT 1) as assignorRFID, '1' AS flag FROM assignor_and_assignee as a LEFT JOIN representative as c ON c.representative_id = a.representative_id WHERE a.assignor_and_assignee_id IN (:IDs) OR a.name = :normalizeName `;

                const replacements = {normalizeName:  normalize_name, IDs}
    
                if(otherIDs.length > 0) {
                    replacements.representative_id = otherIDs
                    queryCompany += ` OR a.representative_id IN (:representative_id)`
                }
    
                list = await connection.resources.query(queryCompany,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    replacements: replacements,
                    logging: console.log,
                    }
                );
    
            }
            
            

            if(applicantAssignorAndAssigneeIDs.length > 0) {
                // Get all list including normalize company and other names
                let queryApplicant = `SELECT a.assignor_and_assignee_id as id, a.assignor_and_assignee_id, a.name, a.instances as counter, c.representative_name as normalize_name, (SELECT rr.representative_name FROM representative as rr WHERE rr.representative_name = a.name GROUP BY rr.representative_name) as representative_company, (SELECT appno_doc_num FROM db_patent_application_bibliographic.applicant WHERE name = a.name LIMIT 1) as assigneeRFID, (SELECT appno_doc_num FROM db_patent_grant_bibliographic.applicant WHERE name = a.name LIMIT 1) as assignorRFID, '2' AS flag FROM db_patent_application_bibliographic.assignor_and_assignee as a LEFT JOIN db_uspto.representative as c ON c.representative_id = a.representative_id WHERE a.assignor_and_assignee_id IN (:applicantAssignorAndAssigneeIDs) OR a.name = :normalizeName `;

                const replacement = {normalizeName:  normalize_name, applicantAssignorAndAssigneeIDs}

                if(otherIDs.length > 0) {
                    replacement.representative_id = otherIDs
                    queryCompany += ` OR a.representative_id IN (:representative_id)`
                }

                applicantList = await connection.resources.query(queryApplicant,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    replacements: replacement,
                    logging: console.log,
                    }
                );
            }
            

            res.status(200).json([...list, ...applicantList]);
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
        const customerID = req.params.id, type = [{name: 'assignment', id: 'assignment'},{name: 'addresschg', id: 'addresschg'},{name: 'correspondchange', id: 'correspondchange'},{name: 'correct', id: 'correct'},{name: 'courtappointment', id: 'courtappointment'},{name: 'courtorder', id: 'courtorder'},{name: 'employee', id: 'employee'},{name: 'govern', id: 'govern'},{name: 'license', id: 'license'},{name: 'licenseend', id: 'licenseend'},{name: 'missing', id: 'missing'},{name: 'merger', id: 'merger'},{name: 'namechg', id: 'namechg'},{name: 'option', id: 'option'},{name: 'other', id: 'other'},{name: 'partialassignment', id: 'partialassignment'},{name: 'partialrelease', id: 'partialrelease'},{name: 'release', id: 'release'},{name: 'restatedsecurity', id: 'restatedsecurity'},{name: 'security', id: 'security'}], assignment_type = {0: 'assignment',1: 'addresschg',2: 'correct',3: 'courtappointment',4: 'courtorder',5: 'employee', 6: 'govern',7: 'license',8: 'licenseend',9: 'missing',10: 'merger',11: 'namechg',12: 'option',13: 'other',14: 'partialassignment',15: 'release',16: 'restatedsecurity',17: 'security', 18: 'correspondchange', 19: 'partialrelease'}, conveyance = [{name: "assignment"}, {name: "namechg"}, {name: "merger"}, {name: "other"}, {name: "security"}, {name: "correct"}, {name: "missing"}, {name: "release"}, {name: "govern"}, {name: "employee"}, {name: "license"}];
        /**
         * Group of all assignment texts and number of occurences
         */
        
        let findAllAssignments  = await helpers.allAssignments(customerID, req);

        res.status(200).json({list:findAllAssignments, conveyance, type: type, assignment_type: assignment_type});
    } catch(e) {
        console.log(e);
        res.status(402).send("Unable to retrieve data.");
    }
});

route.get("/company/transactions/:id/:representativeID", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID, clientDBConnection.connect], async (req, res, next) => {
    try {
        const customerID = req.params.id, representativeIDs = JSON.parse(req.params.representativeID), type = [{name: 'assignment', id: 'assignment'},{name: 'addresschg', id: 'addresschg'},{name: 'correspondchange', id: 'correspondchange'},{name: 'correct', id: 'correct'},{name: 'courtappointment', id: 'courtappointment'},{name: 'courtorder', id: 'courtorder'},{name: 'employee', id: 'employee'},{name: 'govern', id: 'govern'},{name: 'license', id: 'license'},{name: 'licenseend', id: 'licenseend'},{name: 'missing', id: 'missing'},{name: 'merger', id: 'merger'},{name: 'namechg', id: 'namechg'},{name: 'option', id: 'option'},{name: 'other', id: 'other'},{name: 'partialassignment', id: 'partialassignment'},{name: 'partialrelease', id: 'partialrelease'},{name: 'release', id: 'release'},{name: 'restatedsecurity', id: 'restatedsecurity'},{name: 'security', id: 'security'}], assignment_type = {0: 'assignment',1: 'addresschg',2: 'correct',3: 'courtappointment',4: 'courtorder',5: 'employee', 6: 'govern',7: 'license',8: 'licenseend',9: 'missing',10: 'merger',11: 'namechg',12: 'option',13: 'other',14: 'partialassignment',15: 'release',16: 'restatedsecurity',17: 'security', 18: 'correspondchange', 19: 'partialrelease'}, conveyance = [{name: "assignment"}, {name: "namechg"}, {name: "merger"}, {name: "other"}, {name: "security"}, {name: "correct"}, {name: "missing"}, {name: "release"}, {name: "govern"}, {name: "employee"}, {name: "license"}];
        /**
         * Group of all assignment texts and number of occurences
         */
        
        let findAllAssignments  = await helpers.allAssignmentsByRepresentativeIDs(customerID, representativeIDs, req);

        res.status(200).json({list: findAllAssignments.list, conveyance: findAllAssignments.conveyance, type: type, assignment_type: assignment_type});
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

route.get("/company/lender", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
    try {        
        
       const  { search } = req.query;
       let searchLenders = []
        if(search != null && search != undefined && search.length > 0) {            
            searchLenders  = await helpers.searchLenders(search);            
        }
        res.status(200).json(searchLenders);     
    } catch(e) {
        console.log(e);
        res.status(402).send("Unable to retrieve data.");
    }
});

route.get("/company/lenders/:id/companies", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
    try{
        const {id} = req.params
        let querySearchResult = []

        const query = `SELECT assignor_and_assignee_id FROM db_uspto.assignor_and_assignee AS assignor_and_assignee WHERE assignor_and_assignee.representative_id IN (SELECT representative.representative_id FROM db_uspto.representative AS representative INNER JOIN db_uspto.assignor_and_assignee AS assignor_and_assignee ON representative.representative_id = assignor_and_assignee.representative_id WHERE assignor_and_assignee.assignor_and_assignee_id = :assignor_and_assignee_id) AND assignor_and_assignee.representative_id > 0 GROUP BY assignor_and_assignee_id`

        const findAllLenders = await connection.resources.query(query,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                replacements: { assignor_and_assignee_id: id },
                logging: console.log,
            }
        );

        if( findAllLenders.length > 0 ) {
            const firmIDs = []
            const promise = findAllLenders.map( lender => firmIDs.push(lender.assignor_and_assignee_id))

            await Promise.all(promise)

            if( firmIDs.length > 0 ) {
                const  queryCompany = `SELECT a.assignor_and_assignee_id AS id, a.assignor_and_assignee_id, a.name, COUNT(assignor.assignor_and_assignee_id) AS counter, (SELECT COUNT(*) FROM (SELECT assignor.rf_id FROM assignor INNER JOIN assignment ON assignment.rf_id = assignor.rf_id INNER JOIN representative_assignment_conveyance ON representative_assignment_conveyance.rf_id = assignor.rf_id WHERE assignor.assignor_and_assignee_id = a.assignor_and_assignee_id AND date_format(assignment.record_dt, '%Y') >= :year AND representative_assignment_conveyance.convey_ty IN (:conveyanceTypes) GROUP BY assignor.rf_id ) AS temp_total) AS total_occurences, c.representative_name as normalize_name, (select rr.representative_name FROM representative as rr WHERE rr.representative_name = a.name GROUP BY rr.representative_name) as representative_company, concat(assignment.reel_no,'-', assignment.frame_no) as assignorRFID, '' as assigneeRFID  FROM assignor_and_assignee as a LEFT JOIN representative as c ON c.representative_id = a.representative_id INNER JOIN assignor ON assignor.assignor_and_assignee_id = a.assignor_and_assignee_id INNER JOIN assignment ON assignment.rf_id = assignor.rf_id INNER JOIN representative_assignment_conveyance ON assignment.rf_id = representative_assignment_conveyance.rf_id WHERE representative_assignment_conveyance.convey_ty IN (:conveyanceTypes) AND date_format(assignment.record_dt, '%Y') >= :year AND assignor.rf_id IN (SELECT rf_id FROM assignee WHERE assignor_and_assignee_id  IN (:assignorAndAssigneeIDs)) GROUP BY a.name ORDER BY counter DESC`;

                querySearchResult = await connection.resources.query(queryCompany,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    replacements: { assignorAndAssigneeIDs: firmIDs, year: 1997, conveyanceTypes: ['security', 'restatedsecurity'] },
                    logging: console.log,
                });
            }
        }
        res.status(200).json(querySearchResult);
    } catch(e) {
        console.log(e);
        res.status(402).send("Unable to retrieve data.");
    }
})

route.get("/company/:companyID/law_firms", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
    try {        
        
        const findIDs = `SELECT assignor_and_assignee_id FROM db_uspto.assignor_and_assignee AS assignor_and_assignee WHERE assignor_and_assignee.representative_id IN (SELECT representative.representative_id FROM db_uspto.representative AS representative INNER JOIN db_uspto.assignor_and_assignee AS assignor_and_assignee ON representative.representative_id = assignor_and_assignee.representative_id WHERE assignor_and_assignee.assignor_and_assignee_id = :assignor_and_assignee_id) AND assignor_and_assignee.representative_id > 0 GROUP BY assignor_and_assignee_id`

        const findAllIDs = await connection.resources.query(findIDs,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                replacements: { assignor_and_assignee_id: req.params.companyID },
                logging: console.log,
            }
        );

        const allIDs = []

        if( findAllIDs.length > 0 ) {
            
            const promise = findAllIDs.map( c => allIDs.push(c.assignor_and_assignee_id))

            await Promise.all(promise)
        } else {
            allIDs.push(req.params.companyID)
        }
        
        const query = `SELECT law_firms.law_firm_id, law_firms.name,  COUNT(assignment.law_firm_id) AS counter, law_firms.instances AS total_occurences, representative_law_firm.representative_id, representative_law_firm.representative_name 
        FROM db_uspto.law_firm AS law_firms 
        LEFT JOIN db_uspto.representative_law_firm AS representative_law_firm ON representative_law_firm.representative_id =  law_firms.representative_id 
                INNER JOIN assignment ON assignment.law_firm_id = law_firms.law_firm_id
                INNER JOIN assignee ON assignee.rf_id = assignment.rf_id 
                WHERE assignee.assignor_and_assignee_id IN (:allIDs)
        GROUP BY law_firms.law_firm_id`

        const findAllLawFirms = await connection.resources.query(query,{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            replacements: { allIDs },
            logging: console.log,
            }
        );
        res.status(200).json(findAllLawFirms);
    } catch(e) {
        console.log(e);
        res.status(402).send("Unable to retrieve data.");
    }
});


route.get("/company/law_firms", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
    try {        
        /*const query = req.query.search;
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
        */

        const query = `SELECT law_firm_id, name, (SELECT COUNT(assignment.rf_id) FROM db_uspto.assignment AS assignment WHERE assignment.law_firm_id = law_firms.law_firm_id) AS counter, (SELECT SUM(instances) FROM db_uspto.law_firm WHERE representative_id = representative_law_firm.representative_id AND representative_law_firm.representative_id IS NOT NULL) AS total_occurences, representative_law_firm.representative_id, representative_law_firm.representative_name FROM db_uspto.law_firm AS law_firms LEFT JOIN db_uspto.representative_law_firm AS representative_law_firm ON representative_law_firm.representative_id =  law_firms.representative_id WHERE MATCH(name) AGAINST(:search IN BOOLEAN MODE)`

        const findAllLawFirms = await connection.resources.query(query,{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            replacements: { search: req.query.search },
            logging: console.log,
            }
        );

        res.status(200).json(findAllLawFirms);
    } catch(e) {
        console.log(e);
        res.status(402).send("Unable to retrieve data.");
    }
});

route.get("/company/law_firms/:id/companies", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
    try{
        const {id} = req.params
        let querySearchResult = []

        const query = `SELECT law_firm_id FROM db_uspto.law_firm AS law_firm WHERE law_firm.representative_id IN (SELECT representative_law_firm.representative_id FROM db_uspto.representative_law_firm AS representative_law_firm INNER JOIN db_uspto.law_firm AS law_firm ON representative_law_firm.representative_id = law_firm.representative_id WHERE law_firm.law_firm_id = :lawfirmID) AND law_firm.representative_id > 0`

        const findAllLawFirms = await connection.resources.query(query,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                replacements: { lawfirmID: id },
                logging: console.log,
            }
        );

        if( findAllLawFirms.length > 0 ) {
            const firmIDs = []
            const promise = findAllLawFirms.map( lawfirm => firmIDs.push(lawfirm.law_firm_id))

            await Promise.all(promise)

            if( firmIDs.length > 0 ) {
                const  queryCompany = `SELECT a.assignor_and_assignee_id as id, a.assignor_and_assignee_id, a.name,  (SELECT COUNT(*) FROM ( SELECT assignment1.rf_id FROM db_uspto.assignment AS assignment1 INNER JOIN (SELECT rf_id FROM db_uspto.assignor where assignor_and_assignee_id = a.assignor_and_assignee_id UNION SELECT rf_id FROM db_uspto.assignee where assignor_and_assignee_id = a.assignor_and_assignee_id) as aTemp ON aTemp.rf_id = assignment1.rf_id  WHERE law_firm_id IN (:lawFirmIDs) GROUP BY rf_id ) as temp) as counter, a.instances as total_occurences, c.representative_name as normalize_name, (select rr.representative_name FROM representative as rr WHERE rr.representative_name = a.name GROUP BY rr.representative_name) as representative_company, (SELECT concat(ass.reel_no,'-', ass.frame_no) FROM assignee as ee INNER JOIN assignment as ass ON ass.rf_id = ee.rf_id  WHERE ee.assignor_and_assignee_id = a.assignor_and_assignee_id  LIMIT 1) as assigneeRFID, '' as assignorRFID  FROM assignor_and_assignee as a 
                LEFT JOIN representative as c ON c.representative_id = a.representative_id 
                INNER JOIN LATERAL (Select assignee.assignor_and_assignee_id from assignment
                    INNER JOIN assignee ON assignee.rf_id = assignment.rf_id
                    WHERE date_format(assignment.record_dt, '%Y') >= :year AND assignee.assignor_and_assignee_id = a.assignor_and_assignee_id
                    GROUP BY assignee.ee_name                
                ) as tempAssignorAndAssignee 
                WHERE a.assignor_and_assignee_id IN (SELECT assignor_and_assignee_id FROM assignee INNER JOIN assignment ON assignment.rf_id = assignee.rf_id WHERE assignment.law_firm_id IN (:lawFirmIDs) GROUP BY assignor_and_assignee_id) GROUP BY a.name ORDER BY counter DESC`;

                querySearchResult = await connection.resources.query(queryCompany,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    replacements: { lawFirmIDs: firmIDs, year: 2000 },
                    logging: console.log,
                });
            }
        }
        res.status(200).json(querySearchResult);
    } catch(e) {
        console.log(e);
        res.status(402).send("Unable to retrieve data.");
    }
})

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
                        model: List2,
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
                    const dataJson = r.lawfirm.toJSON()
                    let representativeID = null, representativeName = null
                    if( dataJson.representativelawfirm != null ) {
                        representativeID = dataJson.representativelawfirm.representative_id
                        representativeName = dataJson.representativelawfirm.representative_name
                    }
                    dataJson.representative_id =  representativeID
                    dataJson.representative_name =  representativeName
                    findAllLawFirms.push(dataJson);
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

/* route.put("/company/law_firms", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID, clientDBConnection.connect], async (req, res, next) => { */
route.put("/company/law_firms", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
    try{
        let IDs = JSON.parse(req.body.law_firm_ids), normalize_name = req.body.normalize_name;

        
        const client_id = req.body.client_id , otherIDs = [];

        if(IDs.length > 0) {
            if(normalize_name != '') {

                console.log("POST->ID", IDs);

                let getList = await LawFirms.findAll({
                    where:{law_firm_id: IDs}
                });

                console.log("getList->length", getList.length);

                /**
                 * Is Rep is already a Rep
                */

                console.log("CHECKING REPRESENTATIVE COMPANY: "+normalize_name);
              
                let  representativeFirm = await RepresentativeLawFirms.findOne({
                        where:{representative_name: normalize_name}
                });

                console.log("representativeFirm", representativeFirm)

                let allRepresentatives = []; 

                const replaceNames = [];

                const promiseName = getList.map( lawFirm => {
                    replaceNames.push(lawFirm.name)  
                })
                await Promise.all(promiseName)
                /**
                 * Is Target a Rep
                 */
                const getReplaceNameRepresentative = await RepresentativeLawFirms.findAll({
                    where:{ representative_name: replaceNames}
                })
               
                console.log("Replaced Old normalize company list length->", getReplaceNameRepresentative.length)

                if(getReplaceNameRepresentative.length > 0) {
                    //Yes
                    /**
                     * Is Rep is already a Rep
                    */
                    if(representativeFirm == null) {
                        const firstCompany = getReplaceNameRepresentative[0].representative_id;

                        await RepresentativeLawFirms.update({
                            representative_name: normalize_name
                        }, {where: {representative_id: firstCompany} });

                        representativeFirm  = await RepresentativeLawFirms.findOne({
                            where:{representative_id: firstCompany}
                        });
                    }
                    const promiseIDs = getReplaceNameRepresentative.map( representative => otherIDs.push(representative.representative_id))
                    await Promise.all(promiseIDs)

                    console.log("UPDATE", otherIDs)

                    const findOldRows = await LawFirms.findAll({
                        attributes:['law_firm_id'],
                        where: {
                            [connection.Op.or]: [
                            {representative_id: otherIDs},
                            {name: replaceNames}
                        ]}
                    })
                    console.log("findOldRows", findOldRows)
                    if(findOldRows.length > 0) {
                        console.log("findOldRowsIDs", IDs)
                        const promiseR = findOldRows.map(row => IDs.push(row.law_firm_id))
                        await Promise.all(promiseR)
                        console.log("findOldRowsIDs1", IDs)
                        allRepresentatives = [...allRepresentatives, ...otherIDs]
                        console.log("allRepresentatives", allRepresentatives)
                    }
                } else {
                    //NO
                    if(representativeFirm == null) {
                        //NO
                        representativeFirm = await RepresentativeLawFirms.create({
                            representative_name: normalize_name
                        });
                    }
                    console.log("Update old representatives", otherIDs)  
                }
                console.log("RepresentativeID->", representativeFirm.representative_id)
                const item = {representative_id: representativeFirm.representative_id};
                //Associate Target With Rep
                await LawFirms.update(item, {where: {law_firm_id: IDs}}); 

                // Associate the Rep with Rep
                await LawFirms.update(item, {where: {name: normalize_name}}); 

                // Delete other rep
                if(allRepresentatives > 0) {
                    console.log("allRepresentatives1", allRepresentatives)
                    await allRepresentativesFirmCheckAndDelete(allRepresentatives);
                }                
            } else {
                let getList = await LawFirms.findAll({
                    attributes:['law_firm_id', 'representative_id', 'name'],
                    where:{law_firm_id: IDs}
                }); 

                if(getList.length > 0) {
                    const  allRepresentatives = [], replaceNames = [], otherIDs = [];
                    IDs = []
                    const promise = getList.map(r => {
                        IDs.push(r.law_firm_id)
                        if(r.representative_id > 0) {
                            allRepresentatives.push(r.representative_id)
                        }
                        replaceNames.push(r.name)
                        return r;
                    })
                    await Promise.all(promise);
                    const getReplaceNameRepresentative = await RepresentativeLawFirms.findAll({
                        where:{ representative_name: replaceNames}
                    })
                    if(getReplaceNameRepresentative.length > 0) {
                        const promiseIDs = getReplaceNameRepresentative.map( representative => otherIDs.push(representative.representative_id))
                        await Promise.all(promiseIDs)
                        const findOldRows = await LawFirms.findAll({
                            attributes:['law_firm_id'],
                            where: {
                                [connection.Op.or]: [
                                {representative_id: otherIDs},
                                {name: replaceNames}
                            ]}
                        })
                        if(findOldRows.length > 0) {
                            console.log("findOldRowsIDs", IDs)
                            const promiseR = findOldRows.map(row => IDs.push(row.law_firm_id))
                            await Promise.all(promiseR)
                            console.log("findOldRowsIDs1", IDs)                            
                        }
                    }
                    await LawFirms.update({representative_id: 0}, {where: {law_firm_id: IDs}});

                    if(allRepresentatives > 0) {
                        await allRepresentativesFirmCheckAndDelete(allRepresentatives);
                    }
                }
            }

            let where = {
                    [connection.Op.or]: [
                        {law_firm_id: IDs},
                        {name: normalize_name}
                    ]
                }

            if(otherIDs.length > 0) {
                where = {
                    [connection.Op.or]: [
                        {law_firm_id: IDs},
                        {name: normalize_name},
                        {representative_id: otherIDs}
                    ]
                }
            }

            // Get all list including normalize company and other names
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
                        model: List2,
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
            where.company_id = representativeIDs;
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
        Promise.all([
            Assignments.findAll({
                attributes: [['rf_id', 'id'], 'rf_id', 'cname', 'caddress_1', 'caddress_2','caddress_7','caddress_5','caddress_6','caddress_3','caddress_4', 'reel_no', 'frame_no'],  
                /*where: {
                    [connection.Op.or]: [
                        {caddress_1: {[connection.Op.ne]: ''}},
                        {caddress_2: {[connection.Op.ne]: ''}}
                    ]
                },  */  
                /* group:['cname', 'caddress_1', 'caddress_2','caddress_7','caddress_5','caddress_6','caddress_3','caddress_4'],    */ 
                group:['cname', 'caddress_1', 'caddress_2'], 
                include: [
                    {
                        model: List2,
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
            }),
            Assignments.findAll({
                attributes: [['rf_id', 'id'], 'rf_id', 'cname', 'caddress_1', 'caddress_2','caddress_7','caddress_5','caddress_6','caddress_3','caddress_4', 'reel_no', 'frame_no'],  
                where: {
                    caddress_1: '',
                    caddress_2: '',
                    cname: ''
                }, 
                /* group:['cname', 'caddress_1', 'caddress_2','caddress_7','caddress_5','caddress_6','caddress_3','caddress_4'],    */ 
                
                include: [
                    {
                        model: List2,
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
            })
        ]).then(modelReturn => {
            if(modelReturn.length > 0) {
                modelReturn.forEach(item => {
                    getList = [...getList, ...item]
                })
                //console.log(getList)
                res.status(200).json(getList);
            }
        })
    }  else {
        res.status(200).json(getList);
    }
    
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
        group: ['cname','caddress_1','caddress_2'],   
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
            group: ['cname','caddress_1','caddress_2'],           
            include: [
                {
                    model: List2,
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
        const {rf_id, type, cname, caddress_1, caddress_2, caddress_7, caddress_5, caddress_6, caddress_3, caddress_4} = req.body;
        if(rf_id > 0) {
            const getData = await Assignments.findOne({
                where: {rf_id}
            });
    
            if(getData != null && getData.rf_id > 0) {
                 /**
                 * Other Records
                 */
                let findOtherRecords = [];
                if(type == 0) {
                    findOtherRecords = await Assignments.findAll({
                        attributes: ['rf_id','law_firm_id', 'caddress_1', 'caddress_2'],
                    where: {cname: getData.cname , caddress_1: getData.caddress_1, caddress_2: getData.caddress_2/*, law_firm_id:{[connection.Op.gt]: 0}*/}
                    })
                }
                getData.cname = cname
                getData.caddress_1 = caddress_1
                getData.caddress_2 = caddress_2
                getData.caddress_7 = caddress_7
                getData.caddress_5 = caddress_5
                getData.caddress_6 = caddress_6
                getData.caddress_3 = caddress_3
                getData.caddress_4 = caddress_4
                await getData.save()
                if(type == 1 && findOtherRecords.length > 0) {
                    const promise = findOtherRecords.map(async assignment => {
                        console.log(assignment);
                        const updateData = {cname, caddress_1, caddress_2};

                        const updateRecord = await Assignments.update(updateData, {where:{rf_id: assignment.rf_id}});
                        if(updateRecord) {
                            /* if(updateData.cname  != '') {   
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
                                        conßsole.log(4);
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
                            } */
                        }
                        return assignment;
                    })

                    await Promise.all(promise);

                    res.status(200).send("Records Updated");
                } else {
                    res.status(200).send("Records Updated");
                }
                /**
                 * Other Records
                 */
                /* const findOtherRecords = await Assignments.findAll({
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
                } */
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
 * 
 */

 route.put("/company/:id/company_selection/", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID, clientDBConnection.connect], async (req, res, next) => {
    try{
        const {id} = req.params
        const {representative_id, status} = req.body

        if(id > 0) {
            const Representative = req.connection_db.define('Representatives', RepresentativeCustomer.mainStructure, RepresentativeCustomer.options);
            const updateCompany = await Representative.update({
                status
            }, {where: {representative_id}});

            const findParentData = await Representative.findOne({
                attributes: ['parent_id'],
                where: {representative_id}
            })

            if(findParentData !== null && findParentData.parent_id > 0 ) {
                const findChild = await Representative.count({
                    where: {parent_id: findParentData.parent_id, status: 1}
                })
                let groupStatus = 0
                if(findChild > 0) {
                    groupStatus = 1
                }

                await Representative.update({
                    status: groupStatus
                }, {where: {representative_id: findParentData.parent_id}});
            }

            res.status(200).json(updateCompany);
        } else {
            res.status(402).send("Invalid inputs");
        }
        console.log(req.body)
    } catch(e) {
        console.log(e);
        res.status(500).send("Unable to update data.");
    }  
})


/**
 * Report Dashboard Example Data
 */
route.post("/company/report_dashboard:id/", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID, clientDBConnection.connect], async (req, res, next) => {
    try{
        const {account_id, type, value} = req.body
        
        console.log(req.body)
    } catch(e) {
        console.log(e);
        res.status(500).send("Unable to update data.");
    }  
})

/**
 * Report Dashboard Example Data
 */
route.post("/company/:id/add_bulk_companies", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID, clientDBConnection.connect], async (req, res, next) => {
    try{
        let {representative_ids} = req.body
        const client_id = req.params.id

        if(client_id > 0) {
            if(representative_ids != "") {
                representative_ids = JSON.parse(representative_ids)
            }
            const query = "SELECT aaa.assignor_and_assignee_id, aaa.name AS name, r.representative_name, r.representative_id FROM assignor_and_assignee as aaa LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE aaa.assignor_and_assignee_id IN (:IDs) GROUP BY name";
                    
            const getNamesList = await connection.resources.query(query,{
                type: connection.Sequelize.QueryTypes.SELECT,
                replacements: { IDs: representative_ids },
                raw: true,
                logging: console.log,
                }
            ); 

            if(getNamesList.length > 0) {
                const representativeNamesList = []
                const promises = getNamesList.map( c => {
                    const name = c.representative_id !== null ? c.representative_name : c.name
                    if(!representativeNamesList.includes(name)) {
                        representativeNamesList.push(name)
                    }
                })
                await Promise.all(promises)

                if(representativeNamesList.length > 0) {
                    const querySubsidaryCompany = "SELECT aaa.assignor_and_assignee_id, aaa.name, r.representative_name, aaa.instances, r.representative_id, (SELECT sum(a.instances) as counter FROM assignor_and_assignee as a WHERE a.representative_id IN( SELECT representative_id FROM representative WHERE representative_name = r.representative_name) GROUP BY a.representative_id) as representative_instances FROM assignor_and_assignee as aaa LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE aaa.name IN (:names)";
                    
                    const getList = await connection.resources.query(querySubsidaryCompany,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: { names: representativeNamesList },
                        raw: true,
                        logging: console.log,
                        }
                    ); 

                    let companies = [], originalNames = [], representativeNames = [];
                    const Representative = req.connection_db.define('Representatives', RepresentativeCustomer.mainStructure, RepresentativeCustomer.options);
                    if(getList.length > 0) {                
                        const promiseList = getList.map( async company => {
                            let representativeName = "", instances = company.instances;
                            if(company.representative_instances  > 0 ) {
                                instances = company.representative_instances
                            }

                            if(company.name != null) {
                                originalNames.push(company.name);
                            } 
                            if(company.representative_name != null) {
                                representativeNames.push(company.representative_name);
                                representativeName = company.representative_name;
                            } else {
                                representativeName = company.name;
                            }
                            
                            companies.push({
                                instances: instances, representative_id: company.representative_id, original_name: company.name, representative_name: representativeName
                            });
                        });
                        await Promise.all(promiseList)
                    }

                    //console.log('COMPANIES_LIST', companies)
                    if(companies.length > 0) {      
                        let whereC = "";
                        if(originalNames.length > 0 && representativeNames.length > 0) {
                            whereC = {[connection.Op.or]:[{original_name: originalNames}, {representative_name: representativeNames}]};
                        } else if(originalNames.length > 0) {
                            whereC = {original_name: originalNames};
                        }
                        const findParentCompanies = await Representative.findAll({
                            where: whereC
                        });
                        if(findParentCompanies.length == 0) {
                            let addRecord = 0,  mainCompanies = [], parentCompaniesID = [];  

                            for(let i = 0; i < companies.length; i++) {
                                
                                /** Add in Client Representative */
                                let representativeName = companies[i].representative_name != null ? companies[i].representative_name : companies[i].original_name;

                                const addParent = await Representative.create({
                                    original_name: companies[i].original_name, representative_name: representativeName, instances: companies[i].instances
                                });

                                if(addParent != null && addParent.representative_id > 0){

                                    
                                    /**
                                     * Find Normalize companies
                                     */
                                    parentCompaniesID.push(addParent.representative_id);
                                    let nameR = companies[i].representative_id > 0 ? companies[i].representative_name : companies[i].original_name;
    
                                    mainCompanies.push(nameR);
                                    addRecord++;
                                    
                                    let findCompaniesQuery = "";

                                    if(companies[i].representative_id > 0) {
                                        findCompaniesQuery = "SELECT aaa.*, r.representative_name  FROM assignor_and_assignee as aaa LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE aaa.representative_id = :representativeID AND aaa.name <> :name";
                                    } else {
                                        findCompaniesQuery = "SELECT aaa.*, r.representative_name  FROM assignor_and_assignee as aaa LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE aaa.representative_id IN (SELECT representative_id FROM representative WHERE representative_name = :name) AND aaa.name <> :name";
                                    }
                                    
                                    const list  = await connection.resources.query(findCompaniesQuery,{
                                        type: connection.Sequelize.QueryTypes.SELECT,
                                        replacements: { representativeID: companies[i].representative_id, name: nameR },
                                        raw: true,
                                        logging: console.log,
                                        }
                                    ); 

                                    if(list.length > 0) {
                                        const childCompanies = [];
                                        list.forEach( company => {
                                            let nameRepre = company.representative_name != null ? company.representative_name : company.name;
                                            childCompanies.push({original_name: company.name, representative_name: nameRepre, instances: company.instances, parent_id: addParent.representative_id});
                                        });
                                        if(childCompanies.length > 0) {
                                            const addChildCompanies = await Representative.bulkCreate(childCompanies);
                                            if(addChildCompanies) {
                                                addRecord++;
                                            }
                                        }
                                    }
                                   
                                }
                            }
                            if(addRecord > 0) { 
                                console.log(mainCompanies);
                                if(mainCompanies.length > 0){
                                    await exec(`php -f /var/www/html/trash/run_add_companies_script.php "${client_id}" "${JSON.stringify(parentCompaniesID)}"`, async (error, stdout, stderr) => {
                                        console.log(error);
                                        console.log(stdout);
                                        console.log(stderr);
                                    })
                                }
                                res.status(200).send("Companies added");
                            } else {
                                res.status(500).json("Internal server error");
                            }
                        } else { 
                            const addedCompanies = [],  mainCompanies = [], parentCompaniesID = [];           
                            let addRecord = 0;    
                            findParentCompanies.map(c => {
                                addedCompanies.push(c.original_name);
                                addedCompanies.push(c.representative_name);
                            })
                            for(let i = 0; i < companies.length; i++) {
                                if(!addedCompanies.includes(companies[i].original_name) && !addedCompanies.includes(companies[i].representative_name)){
                                    const addParent = await Representative.create({
                                        original_name: companies[i].original_name, representative_name: companies[i].representative_name, instances: companies[i].instances
                                    });
                                    if(addParent != null && addParent.representative_id > 0){
                                        parentCompaniesID.push(addParent.representative_id);
                                        let nameR = companies[i].representative_id > 0 ? companies[i].representative_name : companies[i].original_name;
    
                                        mainCompanies.push(nameR);
                                        addRecord++;
                                        if(companies[i].representative_id > 0) {
                                            const findCompaniesQuery = "SELECT aaa.*, r.representative_name  FROM assignor_and_assignee as aaa LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE aaa.representative_id = :representativeID  AND aaa.name <> :name";
        
                                            const list  = await connection.resources.query(findCompaniesQuery,{
                                                type: connection.Sequelize.QueryTypes.SELECT,
                                                replacements: { representativeID: companies[i].representative_id, name: nameR },
                                                raw: true,
                                                logging: console.log,
                                                }
                                            ); 
        
                                            if(list.length > 0) {
                                                const childCompanies = [];
                                                list.map( company => {
                                                    childCompanies.push({original_name: company.name, representative_name: company.representative_name, instances: companies[i].instances, parent_id: addParent.representative_id});
                                                });
                                                if(childCompanies.length > 0) {
                                                    const addChildCompanies = await Representative.bulkCreate(childCompanies);
                                                    if(addChildCompanies) {
                                                        addRecord++;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            if(addRecord > 0) {
                                console.log(mainCompanies);
                                if(mainCompanies.length > 0){
                                    await exec(`php -f /var/www/html/trash/run_add_companies_script.php "${client_id}" "${JSON.stringify(parentCompaniesID)}"`, async (error, stdout, stderr) => {
                                        console.log(error);
                                        console.log(stdout);
                                        console.log(stderr);
                                    })
                                }
                                res.status(200).send("Companies added");
                            } else {
                                res.status(500).json("Internal server error");
                            }
                        }
                    } else {
                        res.status(402).send("Invalid inputs");
                    }                  
                } else {
                    res.status(200).send("No records found");
                } 
            } else {
                res.status(200).send("No records found");
            }
        } else {
            res.status(200).send("No records found");
        }
    } catch(e) {
        console.log(e);
        res.status(500).send("Unable to update data.");
    }  
})

route.post("/company/cited/:id/export", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID, clientDBConnection.connect], async (req, res, next) => {
    const {portfolios, token} = req.body

    const customerID = req.params.id, representativeIDs = JSON.parse(portfolios != undefined ? portfolios : "[]");
    let citedAssignees = [], organizations = [];
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

        if(req.connection_db != null) {
            const RepresentativeClient = req.connection_db.define('Representatives', RepresentativeCustomer.mainStructure, RepresentativeCustomer.options);
            const findRepresentativeCompanies = await RepresentativeClient.findAll({
                attributes:['representative_id'],
                where:whereRepresentative
            });

            if(findRepresentativeCompanies != null && findRepresentativeCompanies.length > 0) {
                const companies = [];
                const promises = findRepresentativeCompanies.map( company => {
                    companies.push(company.representative_id);
                    return company;
                });
                await Promise.all(promises);

                const queryCitedPatentsAssignee = `SELECT ao.assignee_organization, assignee_query FROM assignee_organizations AS ao 
                                        INNER JOIN cited_patents AS cp ON cp.assignee_id = ao.assignee_id
                                        INNER JOIN assets AS a ON a.grant_doc_num = cp.patent_number
                                        WHERE a.layout_id = :layout_id AND a.organisation_id = :organisationID AND a.company_id IN (:companiesIDs) AND ao.organisation_id = 0
                                        GROUP BY ao.assignee_id LIMIT 998, 998`
                
                citedAssignees = await connection.applicationNew.query(queryCitedPatentsAssignee,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        replacements: {organisationID: customerID, companiesIDs: companies, layout_id: 15 },
                        logging: console.log,
                    }
                );

                if(citedAssignees.length > 0) {
                    const spreadsheetID = `18ZdO_58z9jJ3hkdUY1DrjiddRRNGWpfGMCNS8IGdp54`
                    const sheetHelper = new SheetsHelper(token), newDate = new Date()
                    const request = {
                        spreadsheetId: spreadsheetID, 
                        resource: {
                            requests: [
                                {
                                    addSheet: {
                                        properties: {
                                            title: `SHEET - ${newDate.getTime()}`,
                                            gridProperties: {
                                                frozenRowCount: 1
                                            }
                                        }
                                    }
                                }
                            ]
                        }
                    }
                    sheetHelper.batchUpdate(request, async function(sheet) {
                        if( sheet !== null ) {
                            if(Object.keys(sheet).length > 0) {
                                const assignees = []
                                citedAssignees.forEach( assignee => {
                                    assignees.push(assignee.assignee_query !== '' && assignee.assignee_query !== null ? assignee.assignee_query : assignee.assignee_organization )
                                })
                                assignees.splice(0,0, 'Assignee')
                                await addNewDataToSheet(sheetHelper, spreadsheetID, sheet.replies[sheet.replies.length - 1].addSheet.properties.sheetId, 0, assignees, res)
                            }
                        }
                    })
                } else {
                    res.status(402).send('Assignee list is empty');
                }
            } else {
                res.status(401).send('Invalid input');
            }
        } else {
            res.status(401).send('Invalid input');
        }
    } else {
        res.status(401).send('Invalid input');
    }
    
})

/**
 * Assignees list of cited patents
 */

route.get("/company/cited/:id", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID, clientDBConnection.connect], async (req, res, next) => {
    const customerID = req.params.id;
    const { portfolios, sort_by, sort_direction, rows_per_page, current_page } = req.query
    const representativeIDs = JSON.parse(portfolios != undefined ? portfolios : "[]");
    let citedAssignees = [], organizations = [], total_records = 0;
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

        if(req.connection_db != null) {
            const RepresentativeClient = req.connection_db.define('Representatives', RepresentativeCustomer.mainStructure, RepresentativeCustomer.options);
            const findRepresentativeCompanies = await RepresentativeClient.findAll({
                attributes:['representative_id'],
                where:whereRepresentative
            });

            if(findRepresentativeCompanies != null && findRepresentativeCompanies.length > 0) {
                const companies = [];
                const promises = findRepresentativeCompanies.map( company => {
                    companies.push(company.representative_id);
                    return company;
                });
                await Promise.all(promises);

                let queryCitedPatentsAssignee = `SELECT ao.assignee_id, COUNT(ao.assignee_id) AS occurences, ao.assignee_organization, ao.assignee_query, ao.domain, ao.domain2, ao.domain3, IF(ao.api_logo <> "null", ao.api_logo, "") AS api_logo, IF(ao.api_logo1 <> "null", ao.api_logo1, "") AS api_logo1, IF(ao.api_logo2 <> "null", ao.api_logo2, "") AS api_logo2, IF(ao.api_logo3 <> "null", ao.api_logo3, "") AS api_logo3, IF(ao.api_logo4 <> "null", ao.api_logo4, "") AS api_logo4, IF(ao.api_logo5 <> "null", ao.api_logo5, "") AS api_logo5, IF(ao.api_logo6 <> "null", ao.api_logo6, "") AS api_logo6, IF(ao.api_logo7 <> "null", ao.api_logo7, "") AS api_logo7, IF(ao.api_logo8 <> "null", ao.api_logo8, "") AS api_logo8, IF(ao.api_logo9 <> "null", ao.api_logo9, "") AS api_logo9, without_square, image_url, '' AS img FROM assignee_organizations AS ao 
                                        INNER JOIN cited_patents AS cp ON cp.assignee_id = ao.assignee_id
                                        INNER JOIN assets AS a ON a.grant_doc_num = cp.patent_number
                                        WHERE a.layout_id = :layout_id AND a.organisation_id = :organisationID AND a.company_id IN (:companiesIDs) AND ao.organisation_id = 0
                                        GROUP BY ao.assignee_id`


                const recordsResult = await connection.applicationNew.query(`SELECT COUNT(*) as total_records FROM (${queryCitedPatentsAssignee}) as temp`,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        replacements: {organisationID: customerID, companiesIDs: companies, layout_id: 15 },
                        logging: console.log,
                        plain: true
                    }
                );

                if(recordsResult !== null) {
                    total_records = recordsResult.total_records
                }

                queryCitedPatentsAssignee += ` ORDER BY   ${typeof sort_by !== "undefined" ? sort_by : "occurences "} ${typeof sort_direction !== "undefined" ? sort_direction : "desc "} `


                queryCitedPatentsAssignee += ` LIMIT  ${typeof current_page !== "undefined" ? current_page * rows_per_page + ", " : " 0, "} ${typeof rows_per_page !== "undefined" ? rows_per_page : " 50 "} `
                
                citedAssignees = await connection.applicationNew.query(queryCitedPatentsAssignee,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        replacements: {organisationID: customerID, companiesIDs: companies, layout_id: 15 },
                        logging: console.log,
                    }
                );

                /* const queryOrganisations = `SELECT organisation_id, organisation_name FROM organisations`
                organizations = await connection.applicationNew.query(queryOrganisations,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        replacements: { },
                        logging: console.log,
                    }
                ); */
            }
        }
    }
    res.status(200).json({citedAssignees, organizations, total_records});
})

route.put("/company/cited/:id", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID], async (req, res, next) => {
    try{
        let { organisation_id, assignee_id } = req.body
        const { id } = req.params, data = ''

        if(id > 0) {
            assignee_id = JSON.parse(assignee_id)
            if(assignee_id.length > 0) {
                data = await AssigneeOrganizations.update({organisation_id}, {where : { assignee_id}})
            }
        }
        res.status(200).send(data);
    } catch ( e ) {
        console.log('update => /company/cited/', e)
    }
})

route.delete("/company/cited/:id", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID], async (req, res, next) => {
    try{
        let { organisation_id, assignee_id } = req.body
        const { id } = req.params, data = ''

        if(id > 0) {
            assignee_id = JSON.parse(assignee_id)
            if(assignee_id.length > 0) {
                data = await AssigneeOrganizations.update({organisation_id: 0}, {where : { assignee_id}})
            }
        }
        res.status(200).send(data);
    } catch ( e ) {
        console.log('delete => /company/cited/', e)
    }
})

route.post("/company/cited/:id", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID], async (req, res, next) => {
    try {
        
        const {assignee_organisation, token, account} = req.body;

        const spreadsheetID = `18ZdO_58z9jJ3hkdUY1DrjiddRRNGWpfGMCNS8IGdp54`, sheetID = '150866887'

        const sheetHelper = new SheetsHelper(token)

        sheetHelper.getData({
            spreadsheetId: spreadsheetID,
            majorDimension: 'COLUMNS',
            range: 'Sheet1'
        }, async function( sourceList ){
            console.log('sourceList', sourceList)
            if(Object.keys(sourceList).length > 0 && typeof sourceList.values !== 'undefined' && sourceList.values.length > 0 && sourceList.values[0].length > 0) {
                const assignees = JSON.parse(assignee_organisation)

                if(assignees.length > 0) {
                    await addNewDataToSheet(sheetHelper, spreadsheetID, sheetID, sourceList.values[0].length, assignees, res)
                }
            }
        })


    } catch (err) {

    }
})

route.put("/company/assignees/query_name", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID], async (req, res, next) => {
    try{
        let { assignee_query, domain, domain2, domain3, api_logo, api_logo1, api_logo2, api_logo3, api_logo4, api_logo5, api_logo6, api_logo7, api_logo8, api_logo9, without_square, image_url, assignee_id } = req.body

        if(assignee_id > 0) {

            const assignee = await AssigneeOrganizations.findOne({
                where: {assignee_id}
            })

            if(assignee !== null) {
                if(typeof assignee_query !== 'undefined') {
                    await assignee.update({assignee_query})
                } else if(typeof api_logo !== 'undefined') {
                    await assignee.update({api_logo, api_logo1, api_logo2, api_logo3, api_logo4, api_logo5, api_logo6, api_logo7, api_logo8, api_logo9, without_square, image_url})
                } else if(typeof image_url !== 'undefined') {
                    await assignee.update({image_url})
                }           
                res.status(200).send("Record updated.");
            } else {
                res.status(401).send("Invalid data");
            }
        } else {
            res.status(401).send("Invalid data");
        }
    } catch (err) {
        console.log('Error /company/assignees/query_name', err)
        res.status(500).send("Internal server error.");
    }
})

route.put("/company/assignees/logos", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID], async (req, res, next) => {
    try{
        let { type, assignee_id} = req.body

        if(assignee_id !== '') {
            assignee_id = JSON.parse(assignee_id)
            if(assignee_id.length > 0) {
                if(type === 'clear') {
                    await AssigneeOrganizations.update({domain: '', api_logo: '', api_logo1: '', api_logo2: '', api_logo3: '', api_logo4: '', api_logo5: '', api_logo6: '', api_logo7: '', api_logo8: '', api_logo9: '', without_square: '', image_url: '', cited: 0}, {where : { assignee_id}})
                    res.status(200).send("Assignee data cleared");
                } else if(type === 'download') {
                    exec(`./node_modules/.bin/env-cmd node /var/www/html/script/download_assignees_logos.js ${JSON.stringify(assignee_id)}`, function (error, stdout, stderr) {
                        console.log(error);
                        console.log(stdout);
                        console.log(stderr);
                    });
                    res.status(200).send("Assignee logo download script start.");
                }
            } else {
                res.status(401).send("Invalid data");
            }
        } else {
            res.status(401).send("Invalid data");
        }
    } catch (err) {
        console.log('Error /company/assignees/logos', err)
        res.status(500).send("Internal server error.");
    }
})

const buildRows = async(assets) => {
    return assets.map(function(asset) {        
        return {
            values: [
                {
                    userEnteredValue: {
                    stringValue: asset
                    }
                }
            ]
        };
    });
}

const addNewDataToSheet = async(sheetInstance, spreadsheetID, sheetID, index, assets, res) => {
    const rows = await buildRows(assets)

    const request = {
        spreadsheetId: spreadsheetID,
        resource: {
            requests: [
                {
                    updateCells: {
                        start: {
                            sheetId: sheetID,
                            rowIndex: index,
                            columnIndex: 0
                        },
                        rows,
                        fields: '*'
                    }
                }
            ]
        }
    };
    console.log('addNewDataToSheet', JSON.stringify(request))
    await sheetInstance.batchUpdate(request, function(updateData){
        console.log('addNewDataToSheet=>', updateData)
        res.status(200).json({error: '', message: "Assignees added to sheet"});   
    })
}


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
 * Recent 100 rf_id with most no of assets
 */

route.get("/company/recent_transactions", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
    try {
        const queryTransactions = `SELECT records.rf_id, records.reel_frame, records.frame_no, records.reel_no, date_format(records.record_dt,"%b %d, %Y") AS record_dt, rac.convey_ty, records.counter AS assets,
        date_format(records.exec_dt,"%b %d, %Y") AS exec_dt, DATEDIFF(records.record_dt, records.exec_dt ) AS date_difference, 
        (SELECT GROUP_CONCAT(or_name) FROM assignor WHERE assignor.rf_id = records.rf_id) AS assingor, 
        (SELECT GROUP_CONCAT(ee_name) FROM assignee WHERE assignee.rf_id = records.rf_id) AS assingee
        FROM (
        SELECT CONCAT(a.reel_no, '/', a.frame_no) AS reel_frame, a.frame_no, a.reel_no,  a.record_dt, a.rf_id, temp.counter, (SELECT exec_dt FROM assignor WHERE assignor.rf_id = a.rf_id LIMIT 1) AS exec_dt FROM assignment AS a
        INNER JOIN (SELECT d.rf_id, count(d.appno_doc_num) as counter FROM documentid as d
        GROUP BY d.rf_id) as temp ON temp.rf_id = a.rf_id
        ORDER BY temp.counter DESC, a.record_dt DESC
        LIMIT 100
        ) as records
        INNER JOIN representative_assignment_conveyance as rac ON rac.rf_id = records.rf_id`
        let transactions = await connection.resources.query(queryTransactions,{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            replacements: { },
            logging: console.log,
            }
        );
        res.status(200).json(transactions);        
    } catch(e) {
        console.log(e);
        res.status(402).send("Unable to retrieve data.");
    }
})


/**
 * Creating Report
 */
route.get("/company/report", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
    try {

        const queryReport = `SELECT representative_id, representative_name, no_of_assets as assets, no_of_transactions, no_of_parties, (no_of_parties - no_of_transactions) as product, (no_of_transactions / no_of_assets ) as tranaction_assets, no_of_loans, no_of_banks FROM admin_representative_reports`;    

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

        const queryAbaondants = `SELECT date_format(event_date, '%Y-%m-%d') as event_date FROM representative_ota_event WHERE representative_id = :representativeID AND event_code IN (:eventCode)`;

        let abaondants = await connection.resources.query(queryAbaondants,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                replacements: { representativeID, eventCode: ['EXP.', 'EXPX'] },
                logging: console.log,
                }
            );

        const queryRenewal = `SELECT date_format(event_date, '%Y-%m-%d') as event_date FROM representative_ota_event WHERE representative_id = :representativeID AND event_code IN (:eventCode)`;

        let renewals = await connection.resources.query(queryRenewal,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                replacements: { representativeID, eventCode: ['M1551', 'M2551', 'M3551', 'M1552', 'M2552', 'M3552', 'M1553', 'M2553', 'M3553'] },
                logging: console.log,
                }
            );
        res.status(200).json({abaondants, renewals});
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


route.get("/company/auth_token", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    const { code } = req.query
    try{
        if(code != '' && code != undefined) {
            const token = await authenticateGoogleToken( code )
            console.log('token', token)
            res.status(200).json(token);
        } else {
            res.status(401).send("Authentication code is missing");
        }
    } catch(e) {
        console.log(e)
        res.status(500).send("Unable to authenticate token");
    }
})


module.exports = route;