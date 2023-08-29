const express = require("express"),

    bcrypt = require('bcrypt'),

    fs = require('fs'),

    moment = require('moment'),

    http = require('http'),

    https = require('https'),

    Stream = require('stream').Transform,
    
    request = require('request'),

    crypto = require("crypto");

const { createLogger, format, transports } = require("winston");

const {google} = require('googleapis');

const SlackHelper = require('../../helpers/slack')

const { v4: uuidv4  } = require('uuid');

const { exec, spawn  } = require("child_process");

const { WebClient } = require('@slack/web-api')

const route = express.Router();

const connection = require("../../config/db.config");

//require the Model

const Organisations = require("../../model/business/Organisations"),

    Users = require("../../model/business/Users"),

    Documentids = require("../../model/application/DocumentIds"),

    Assignees = require("../../model/resources/Assignees"),

    Assignors = require("../../model/resources/Assignors"),

    AdminAccountProcess = require("../../model/resources/AdminAccountProcess"),

    MissingInventorProcess = require("../../model/resources/MissingInventorProcess"),

    authJWT = require("../../helpers/verifyJwtToken"),

    userExist = require("../../helpers/verifySignUp"),

    helpers = require("../../helpers/helper"),

    clientDBConnection = require("../../helpers/clientDBConnection"),

    ClientUsers = require("../../model/client/Users"),

    ProfessionalUsers = require("../../model/client/Professionals"),

    Firms = require("../../model/client/Firms"),

    config = require("../../config/db.config"),

    ClientRepesentative = require("../../model/client/Representatives"),

    RepresentativeTransactions = require("../../model/resources/RepresentativeTransactions"),

    AWS  = require('aws-sdk');
const LogMessages = require("../../model/application/LogMessages");
   
/**Get all documents */
const logger = createLogger({
    format: format.combine(format.timestamp(), format.json()),
    transports: [new transports.File({ filename: "/var/www/html/name_to_domain_api.log" })],
    exceptionHandlers: [new transports.File({ filename: "/var/www/html/name_to_domain_api_exceptions.log" })],
    rejectionHandlers: [new transports.File({ filename: "/var/www/html/name_to_domain_api_rejections.log" })],
});

route.put("/customers/:organisation_id/buttons", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        const { organisation_id } = req.params;
        const { button_id, status } = req.body;

        let findButton = await AdminAccountProcess.findOne({
            where: { organisation_id, button_id}
        })

        if( findButton != null ) {
            findButton.status = status
            buttonData = await findButton.save()
        } else {
            findButton = await AdminAccountProcess.create({organisation_id, button_id, status: 1 })           
        }
        res.status(200).json(findButton);
    } catch(err) {
        console.log(err);
        res.status(400).send("Bad inputs");
    }
})

route.get("/customers/:organisation_id/buttons" , [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        const { organisation_id } = req.params;

        const findButtons = await AdminAccountProcess.findAll({
            where: { organisation_id}
        })
        
        res.status(200).json(findButtons);
    } catch(err) {
        console.log(err);
        res.status(400).send("Bad inputs");
    }
})

/**
 * List all customers
 */

route.get("/customers/run_query/:representative_name/:query_no", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        const { representative_name, query_no } = req.params
        console.log("ad", representative_name, query_no)
        let  procedureName = null
        /* switch(parseInt(query_no)) {
            case 1:
                procedureName = 'Table_A'
                break;
            case 2:
                procedureName = 'Table_B'
                break;
            case 3:
                procedureName = 'Table_C'
                break;
            case 4:
                procedureName = 'Table_D'
                break;
        } */

        /* const companyArray = [["3",  "Tdk Corp"],[
            "4",  "Tdk Corporation Of America"],[
            "5",  "Tdk Dalian Corp"],[
            "6",  "Tdk Electronics Ag"],[
            "7",  "Tdk Electronics Corp"],[
            "8",  "Tdk Electronics Ireland Ltd"],[
            "9",  "Tdk Family Limited Partnership"],[
            "10",  "Tdk Innoveta Inc"],[
            "11",  "Tdk Innoveta Technologies Inc"],[
            "12",  "Tdk Kabushiki Kaisha"],[
            "13",  "Tdk Korea Corp"],[
            "14",  "Tdk Ltd"],[
            "15",  "Tdk Rf Solutions Inc"],[
            "16",  "Tdk Semiconductor Corp"],[
            "17",  "Tdk Systems Development Center"],[
            "18",  "Tdk Systems Europe Ltd"],[
            "19",  "Tdk Systems Inc"],[
            "20",  "Tdk Taiwan Corp"],[
            "21",  "Tdk Usa Corp"],[
            "22",  "Tdk Xiamen Co Ltd"],[
            "23",  "Tdk-epc Corp"],[
            "24",  "Tdk-lambda Americas Inc"],[
            "25",  "Tdk-lambda Corp"],[
            "26",  "Tdk-lambda Ltd"],[
            "27",  "Tdk-lambda Uk Ltd"],[
            "28",  "Tdk-micronas Gmbh"],[
            "29",  "Toppan Tdk Label Co Ltd"],[
            "30",  "Tdk (zhuhai Ftz) Co Ltd"],[
            "31",  "Tdk Electronics Gmbh & Co Og"],[
            "32",  "Wuxi Tdk-lambda Electronics Co Ltd"],[
            "33",  "Tdk Edison Llc"],[
            "34",  "Tdk Switzerland Gmbh"],[
            "35",  "Panasonic Appliances Microwave Oven (shanghai) China Co Ltd"],[
            "36",  "Panasonic Appliances Refrigeration Devices Singapore"],[
            "37",  "Panasonic Asia Pacific Pte Ltd"],[
            "38",  "Panasonic Automotive & Industrial Systems Europe Gmbh"],[
            "39",  "Panasonic Automotive Systems Company Of America Division Of Panasonic Corporation Of North America"],[
            "40",  "Panasonic Avc Networks Kuala Lumpur Malaysia Sdn Bhd"],[
            "41",  "Panasonic Avc Networks Singapore Pte Ltd"],[
            "42",  "Panasonic Avionics Corp"],[
            "43",  "Panasonic Boston Laboratory"],[
            "44",  "Panasonic Communications Co Ltd"],[
            "45",  "Panasonic Consumer Electronics Co"],[
            "46",  "Panasonic Corp"],[
            "47",  "Panasonic Corporation Of North America"],[
            "48",  "Panasonic Cycle Technology Co Ltd"],[
            "49",  "Panasonic Device Taiko Co Ltd"],[
            "50",  "Panasonic Disc Manufacturing Corporation Of America"],[
            "51",  "Panasonic Disc Services Corp"],[
            "52",  "Panasonic Eco Solutions Power Tools Co Ltd"],[
            "53",  "Panasonic Eco Technology Center Co Ltd"],[
            "54",  "Panasonic Ecology Systems Co Ltd"],[
            "55",  "Panasonic Ecology Systems Guangdong Co Ltd"],[
            "56",  "Panasonic Electric Works Bath & Life Co Ltd"],[
            "57",  "Panasonic Electric Works Co Ltd"],[
            "58",  "Panasonic Electric Works Europe Ag"],[
            "59",  "Panasonic Electric Works Laboratory Of America Inc"],[
            "60",  "Panasonic Electric Works Power Tools Co Ltd"],[
            "61",  "Panasonic Electric Works Sunx Co Ltd"],[
            "62",  "Panasonic Electric Works Taiko Device Co Ltd"],[
            "63",  "Panasonic Electronic Devices Co Ltd"],[
            "64",  "Panasonic Electronic Devices Corporation Of America"],[
            "65",  "Panasonic Electronic Devices De Baja California Sa De Cv"],[
            "66",  "Panasonic Electronic Devices Singapore Pte Ltd"],[
            "67",  "Panasonic Environmental Systems & Engineering Co Ltd"],[
            "68",  "Panasonic Europe Ltd"],[
            "69",  "Panasonic Ev Energy Co Ltd"],[
            "70",  "Panasonic Factory Solutions Asia Pacific"],[
            "71",  "Panasonic Healthcare Co Ltd"],[
            "72",  "Panasonic Healthcare Holdings Co Ltd"],[
            "73",  "Panasonic Home Appliances Company Of America"],[
            "74",  "Panasonic I-pro Sensing Solutions Co Ltd"],[
            "75",  "Panasonic I-pro Sensing Solutions Corporation Of America"],[
            "76",  "Panasonic Idemitsu Oled Lighting Co Ltd"],[
            "77",  "Panasonic Industrial Devices Europe Gmbh"],[
            "78",  "Panasonic Industrial Devices Sunx Co Ltd"],[
            "79",  "Panasonic Industrial Devices Sunx Tatsuno Co Ltd"],[
            "80",  "Panasonic Industrial Devices Taiko Co Ltd"],[
            "81",  "Panasonic Intellectual Property Corporation Of America"],[
            "82",  "Panasonic Intellectual Property Management Co Ltd"],[
            "83",  "Panasonic Liquid Crystal Display Co Ltd"],[
            "84",  "Panasonic Manufacturing Malaysia Berhad"],[
            "85",  "Panasonic Manufacturing Uk Ltd"],[
            "86",  "Panasonic Medical Solutions Co Ltd"],[
            "87",  "Panasonic Mobile Communications Co Ltd"],[
            "88",  "Panasonic Photo & Lighting Co Ltd"],[
            "89",  "Panasonic Plasma Display Laboratory Of America Inc"],[
            "90",  "Panasonic Precision Devices Co Ltd"],[
            "91",  "Panasonic Production Engineering Co Ltd"],[
            "92",  "Panasonic Refrigeration Devices Singapore Pte Ltd"],[
            "93",  "Panasonic Semiconductor Asia Pte Ltd"],[
            "94",  "Panasonic Shikoku Electronics Co Ltd"],[
            "95",  "Panasonic Shikoku Electronics Corporation Of America"],[
            "96",  "Panasonic Singapore Laboratories Pte Ltd"],[
            "97",  "Panasonic System Networks Co Ltd"],[
            "98",  "Panasonic System Networks Corp"],[
            "99",  "Panasonic System Solutions Japan Co Ltd"],[
            "100",  "Panasonic Technologies Inc"],[
            "101",  "Panasonic Wanbao Appliances Electric Iron (guangzhou) Co Ltd"],[
            "102",  "Panasonic Wanbao Home Appliances Electric Iron (guangzhou) Co Ltd"],[
            "103",  "Skyworks Panasonic Filter Solutions Japan Co Ltd"],[
            "104",  "Towerjazz Panasonic Semiconductor Co Ltd"],[
            "105",  "Panasonic Semiconductor Solutions Co Ltd"],[
            "106",  "Panasonic Wanbao Appliances Compressor (guangzhou) Co Ltd"]] */

            const companyArray = [["1", "Avaya Inc"],[
                "2", "Avaya Canada Corp"],[
                "3", "Avaya Communication Israel Ltd"],[
                "4", "Avaya Communications Inc"],[
                "5", "Avaya Ecs Ltd"],[
                "6", "Avaya Gmbh & Co Kg"],[
                "7", "Avaya Holdings Ltd"],[
                "17", "Avaya Integrated Cabinet Solutions Inc"],[
                "18", "Avaya Integrated Cabinet Solutions Llc"],[
                "19", "Avaya Licensing Llc"],[
                "20", "Avaya Management Lp"],[
                "21", "Avaya Technology Corp"],[
                "29", "Avaya Technology Llc"],[
                "30", "Avaya Uk"],[
                "31", "Avaya-tenovis Gmbh & Co Kg"],[
                "54", "Avaya Cloud Canada Inc"]
                ]

        switch(parseInt(query_no)) {
            case 1:
                procedureName = 'routine_list1'
                break;
            case 2:
                procedureName = 'routine_list2'
                break;
            case 3:
                procedureName = 'routine_tableA'
                break;
            case 4:
                procedureName = 'routine_tableB'
                break;
            case 5:
                procedureName = 'routine_tableC'
                break;
            case 6:
                procedureName = 'routine_broken_title'
                break;
            case 7:
                procedureName = 'routine_correct_details'
                break;
            case 8:
                procedureName = 'routine_correct_chain'
                break;
        }
        if(procedureName != null) {
            const replacements = {representative_name, company_id: 99999, organisation_id: 68}

            const findIndex = companyArray.findIndex(row => row[1] === representative_name)
            if(findIndex !== null) {
                replacements.company_id = companyArray[findIndex][0]
            }
            let procedureRun = `CALL ${procedureName}(:representative_name, :company_id, :organisation_id);`
            if(parseInt(query_no) === 6 || parseInt(query_no) === 8) {
                procedureRun = `CALL ${procedureName}(:company_id, :organisation_id);`
            }
            await connection.resources.query(procedureRun,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    logging: console.log,
                    replacements
                }
            )
            console.log("QUERY")

            /*let name = parseInt(query_no) === 1 
                            ? 'db_uspto.list1'
                            : parseInt(query_no) === 2
                                ? 'db_uspto.list2'
                                :
                                    parseInt(query_no) === 3 || parseInt(query_no) === 6 || parseInt(query_no) === 7
                                    ? 'db_new_application.assets'
                                    : parseInt(query_no) === 4
                                        ? 'db_uspto.table_b'
                                        : 'db_uspto.table_c'

             let query = `SELECT * FROM ${name}  `;    
            if(parseInt(query_no) === 1) {
                query = `SELECT assignor_and_assignee_id FROM ${name}  `;    
            } else if(parseInt(query_no) === 4 || parseInt(query_no) === 5) {
                query = `SELECT appno_doc_num FROM ${name}  `;    
            }
            
            query += ' WHERE '
            if(parseInt(query_no) < 3) {
                query += `representative_name = :representative_name AND `;
            }

            query += ` company_id = :company_id AND organisation_id = :organisation_id`
            if(parseInt(query_no) === 1) {
                query = `SELECT assignor_and_assignee_id, name FROM assignor_and_assignee WHERE assignor_and_assignee_id IN (${query}) GROUP BY assignor_and_assignee_id`;
            } else if(parseInt(query_no)  === 4 || parseInt(query_no)  === 5) {
                query = `SELECT appno_doc_num, grant_doc_num FROM documentid WHERE appno_doc_num IN (${query}) GROUP BY appno_doc_num `;
            } else if(parseInt(query_no) === 2) {
                query += " GROUP BY rf_id"
            } */

            let name = parseInt(query_no) === 1 
                            ? 'db_uspto.list1'
                            : parseInt(query_no) === 2
                                ? 'db_uspto.list2'
                                :
                                    parseInt(query_no) === 3 || parseInt(query_no) === 6 || parseInt(query_no) === 7
                                    ? 'db_new_application.assets'
                                    : parseInt(query_no) === 4
                                        ? 'db_uspto.table_b'
                                        : 'db_uspto.table_c'

            let query = `SELECT * FROM ${name}  `;    
            if(parseInt(query_no) === 1 ) {
                query = `SELECT assignor_and_assignee_id FROM ${name}  `
            } else if(parseInt(query_no) === 2) {
                query = `SELECT rf_id FROM ${name}  `
            } else if(parseInt(query_no)  === 4 || parseInt(query_no)  === 5) {
                query = `SELECT appno_doc_num FROM ${name}  `
            }
            query += ' WHERE '
            if(parseInt(query_no) < 3) {
                query += `representative_name = :representative_name AND `;
            }

            query += ` company_id = :company_id AND organisation_id = :organisation_id `


            if(parseInt(query_no)  === 3 || parseInt(query_no)  === 6 || parseInt(query_no)  === 7) {
                replacements.layout_id = parseInt(query_no)  === 6 ? 1 : parseInt(query_no)  === 7 ? 4 : parseInt(query_no)  === 8 ? 99 : 15
                query += ` AND layout_id = :layout_id `
            }

            if(parseInt(query_no) < 6) {
                if(parseInt(query_no) === 1 ) {                    
                    query = `SELECT * FROM (SELECT appno_doc_num, grant_doc_num FROM documentid WHERE rf_id IN (SELECT rf_id FROM assignor WHERE assignor_and_assignee_id IN (${query}) GROUP BY rf_id) UNION SELECT appno_doc_num, grant_doc_num FROM documentid WHERE rf_id IN (SELECT rf_id FROM assignee WHERE assignor_and_assignee_id IN (${query}) GROUP BY rf_id)) AS temp GROUP BY appno_doc_num `;
                } else if(parseInt(query_no) === 2) {                    
                    query = `SELECT appno_doc_num, grant_doc_num FROM documentid WHERE rf_id IN (${query}) GROUP BY appno_doc_num `;
                } else if(parseInt(query_no)  === 4 || parseInt(query_no)  === 5) {
                    query = `SELECT appno_doc_num, grant_doc_num FROM documentid WHERE appno_doc_num IN (${query}) GROUP BY appno_doc_num `;
                }
            }
            
            console.log(query)
            const reports = await connection.resources.query(query,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                replacements,
                logging: console.log,
            });
            res.status(200).json(reports);
        } else {
            res.status(200).json([]);
        }        
    } catch( err ) {
        console.log("Error: ", err)
    }
})

/**
 * List all customers   
 */

route.get("/customers", [authJWT.verifyToken, authJWT.isAdmin], (req, res, next) => {
    try{

        Organisations.findAll({
            attributes: [['organisation_id', 'id'], 'name','logo', 'organisation_type', [connection.Sequelize.literal(0, 'no_of_parties'), 'share_url'], [connection.Sequelize.literal(0, 'assets'), 'assets'], [connection.Sequelize.literal(0, 'no_of_transactions'),'no_of_transactions'], [connection.Sequelize.literal(0, 'no_of_parties'), 'no_of_parties'], [connection.Sequelize.literal(0, 'no_of_entities'), 'no_of_entities'], [connection.Sequelize.literal(0, 'no_of_employees'), 'no_of_employees'], [connection.Sequelize.literal(0, 'product'), 'product']],
            where: {type:{[connection.Op.ne]: 2}},
            order:[
                ['name', 'ASC']
            ]
        })
        .then((list)=>{
            res.status(200).json(list);
        }).catch((err)=>{
            console.log(err);
            res.status(500).json({message: "Unable to retrieve customer list"})
        });
    } catch (e) {
        
    }
});

/**
 * List all admin users
 */
route.get("/users", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        
        const adminUsers = await Users.findAll({
            attributes: ['user_id', 'first_name', 'last_name', 'username'],
            where: {role_id: 1, type: '9', organisation_id: 3}
        })
        
        res.status(200).json(adminUsers);     
    } catch( err ) {
        console.log(err);
        res.status(400).send("Invalid inputs");
    }
});

/**
 * Add admin user
 */

route.post("/users", [authJWT.verifyToken, authJWT.isAdmin, userExist.checkDuplicateAdminUsername], async (req, res, next) =>{
    try{
        const addUser = await Users.create({
            first_name: req.body.first_name,
            last_name: req.body.last_name,
            email_address: '',
            username: req.body.username,						
            password: bcrypt.hashSync(req.body.password ? req.body.password : 123456, 8),
            job_title: '',
            linkedin_url: '',
            type: '9',
            logo: '',
            role_id: 1,
            organisation_id: 3
        })
        if(addUser != null) {   
            const newUser = addUser.toJSON();
            newUser.id = newUser.user_id;
            newUser.password = '';
            newUser.organisation_id = '';
            res.status(200).json(newUser);
        }  else {
            res.status(400).send("Bad inputs");
        } 
    } catch( err ) {
        console.log(err);
        res.status(400).send("Bad inputs");
    }
});

/**
 * Update admin user
 */

route.put("/users/:user_id", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) =>{
   
    try{
        
        
        const user = await Users.findOne({
            where: {user_id: req.params.user_id, organisation_id: 3, type: '9'}
        })

        if( user != null && user.user_id > 0){				
            if(req.body.password != undefined && req.body.password != null && req.body.password != ""){
                user.first_name = req.body.first_name;
                user.password = bcrypt.hashSync(req.body.password, 8);
                const update = await user.save();
                console.log(update)
                if(update) {
                    res.status(200).send("Updated successfully");
                } else {
                    res.status(500).send("Error while updating user.");
                }                
            } else {
                res.status(400).send("Invalid inputs");
            }
        } else {
            res.status(400).send("Invalid inputs");
        }
    } catch( err ) {
        console.log(err);
        
        res.status(400).send("Invalid inputs");
    }
})

/**
 * Delete admin user
 */

route.delete("/users/:orgId/:user_id", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) =>{
    try{
        const user = await Users.findOne({
            where: {user_id: req.params.user_id, organisation_id: req.params.orgId}
        })

        if( user != null && user.user_id > 0){
            
            const deleteUser = await user.destroy();

            if(deleteUser != null) {
                res.status(200).send("User deleted successfully.");
            } else {
                res.status(500).send("Error while deleting user.");
            }
        } else {
            res.status(500).send("Error while deleting user.");
        }
    } catch( err ) {
        console.log(err);
        res.status(400).send("Invalid inputs");
    }
})

/**
 * Get customer by ID
 */

route.get("/customers/:id", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    (async () => {
        try{
            let organisationID = req.params.id;
            if(organisationID > 0){

                const query = "SELECT BIN_TO_UUID(`uuid`) AS `standard`, `organisation_id`, `name`, `subscribtion`,  `organisation_type`, `address`, `team`, `phone_number`, `email_address`, `logo`, `linkedin_url`, `zipcode`, `city`, `state`, `country_id`, `type`, `status` FROM db_business.`organisation` AS `organisation` WHERE `organisation`.`organisation_id` = :organisationID";   

                const org =  await connection.resources.query(query,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    replacements: { organisationID: organisationID },
                    raw: true,
                    plain: true,
                    logging: console.log,
                    }
                );               
                if(org != null && org.organisation_id > 0) {
                    res.status(200).json({name: org.name, organisation_type: org.organisation_type, organisation_id: org.organisation_id, subscribtion: org.subscribtion, logo: org.logo, standard: org.standard});
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
 * Get List from assignor and assignees
 * 
 */
route.get("/customers/customers/:id/:type", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID, clientDBConnection.connect], async (req, res, next) => {
    try{            
        /*const companyName = req.params.company_name, type = req.params.type;*/
        const organisationID = req.params.id, type = req.params.type;
        const {suggestions, fixed_identicals} = req.query
        let list = [];

        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            list = await helpers.findCompanyEntitiesByAccountID(organisationID, type, req.connection_db, suggestions, fixed_identicals); 
            /* if(typeof suggestions == 'undefined' && typeof fixed_identicals == 'undefined') { 
                list = await helpers.findCompanyEntitiesByAccountID(organisationID, type, req.connection_db, suggestions, fixed_identicals); 
            } else { 
                console.log('Run File Account')
                exec(`/var/www/html/script/node_modules/.bin/env-cmd node /var/www/html/script/normalize_names.js ${req.orgId} '[]' ${type} ${suggestions} ${fixed_identicals}`, async (error, std, stderr) => {
                    console.log('Accound Suggestion')
                    console.log('Err', error)
                    console.log('std', std)
                    console.log('stderr', stderr)
                    return []
                }) 
            } */
        }
        res.status(200).json(list); 
    } catch (e){
        console.log(e);
        res.status(402).send("No customers found");
    }
});

route.get("/customers/static_file/read_entity_file", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
    try{            
        /*const companyName = req.params.company_name, type = req.params.type;*/
        
        const {fileName} = req.query
       
        let list = [];
        console.log(fileName)
        if(fileName != '') {
            const fullPath = `/var/www/html/script/${fileName}`
            fs.readFile(fullPath, async function(err, data) {
                if (!err) {
                    try {            
                        if(data != '') {
                            list = JSON.parse(data)
                            res.status(200).json(list);
                        }
                    } catch( e ) { 
                        console.log("Error while reading entity file", e) 
                        res.status(200).json(list);
                    } 
                } else {
                    console.log("Error while reading entity file", err) 
                    res.status(200).json(list);
                }
            })
        } else { 
            res.status(200).json(list);
        }
    } catch (e){
        console.log(e);
        res.status(402).send("No customers found");
    }

});

/**
 * Get List from assignor and assignees
 * 
 */
route.get("/customers/customers/:id/:representativeID/:type", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID, clientDBConnection.connect], async (req, res, next) => {
    try{            
        /*const companyName = req.params.company_name, type = req.params.type;*/
        const organisationID = req.params.id, type = req.params.type, representativeIDs = JSON.parse(req.params.representativeID);
        const {suggestions, fixed_identicals} = req.query
        console.log(req.query)
        let list = [];

        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            list = await helpers.findCompanyEntitiesByAccountIDByRepresentativeIDs(organisationID, representativeIDs, type, req.connection_db, suggestions, fixed_identicals);

            
            /* if(typeof suggestions == 'undefined' && typeof fixed_identicals == 'undefined') { 
                list = await helpers.findCompanyEntitiesByAccountIDByRepresentativeIDs(organisationID, representativeIDs, type, req.connection_db, suggestions, fixed_identicals);
            } else { 
                console.log('Run File')
                exec(`/var/www/html/script/node_modules/.bin/env-cmd node /var/www/html/script/normalize_names.js ${req.orgId} ${req.params.representativeID}  ${type} ${suggestions} ${fixed_identicals}`);
            } */ 
        }
        res.status(200).json(list);
    } catch (e){
        console.log(e);
        res.status(402).send("No customers found");
    }
});
/**
 * Client Portfolios list
 */

route.get("/customers/:id/companies", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID, clientDBConnection.connect], async (req, res, next) => {
    try{
        let organisationID = req.params.id;
        if(organisationID > 0){
            const organisation  = await helpers.findOrganisationbyID(organisationID);
            if(organisation != null && organisation.organisation_id > 0){
                if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
                    /*const getCompaniesList = await helpers.getCompaniesWithChildren(req.connection_db);*/
                    const getCompaniesList = await helpers.getCompaniesListWithReports(req.connection_db, organisationID);
                    res.status(200).json(getCompaniesList);
                } else {
                    res.status(200).json([]);
                }
            } else {
                res.status(200).json([]);
            }
        } else {
            res.status(400).send("Invalid inputs");
        }       
    } catch( err ) {
        console.log(err);
        res.status(400).send("Invalid inputs");
    } 
});

/**
 * Delete Parent Companies
 */
route.delete("/customers/:id/companies", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID, clientDBConnection.connect], async(req, res, next) => {
    try{
        let IDs = req.query.companies;
        if(IDs === undefined || IDs.length == 0) { 
            IDs = req.body.companies;
        }
        if(IDs.length > 0) {
            IDs = JSON.parse(IDs)
            const Representative = req.connection_db.define('ClientRepesentative', ClientRepesentative.mainStructure, ClientRepesentative.options);
            const findCompanies = await Representative.findAll({
                attributes:['representative_id', 'parent_id', 'original_name', 'company_id'],
                where:{representative_id: IDs},
                group:[                                                                                                                'company_id']
            });
            const updateKPICompanies=[],  deleteParentCompanies = [], reUpdateCompanies = [], deleteCompanies = [], activityLogs = [], currentDate = moment(new Date()).format('YYYY-MM-DD hh:mm:ss');
            if(findCompanies.length > 0) {
                const promise = findCompanies.map(c => {
                    if(c.parent_id == 0) {
                        deleteParentCompanies.push(c.representative_id);
                        updateKPICompanies.push(c.company_id);
                    } else {
                        if(!updateKPICompanies.includes(c.company_id)){
                            updateKPICompanies.push(c.company_id); 
                            reUpdateCompanies.push(c.company_id);
                        }
                    }
                    deleteCompanies.push(c.representative_id);                   
                    return c;
                });

                await Promise.all(promise);

                if(deleteParentCompanies.length > 0) {
                    const findParentSubCompanies = await Representative.findAll({
                        attributes:['representative_id'],
                        where:{parent_id: deleteParentCompanies}                        
                    });

                    if(findParentSubCompanies.length) {
                        const promise = findParentSubCompanies.map(c => {
                            deleteCompanies.push(c.representative_id);
                            return c;
                        });
                        await Promise.all(promise);
                    }
                }


                if(deleteCompanies.length > 0) {
                    
                    const destroyAllCompanies = await  Representative.destroy({
                        where: {representative_id: deleteCompanies},
                    })

                    if(destroyAllCompanies != null) {
                        
                        if(deleteParentCompanies.length > 0) {
                            const destroyAllTransactions = await RepresentativeTransactions.destroy({
                                where: {representative_id: deleteParentCompanies, organisation_id: req.orgId},
                            });
                            console.log("destroyAllTransactions", destroyAllTransactions);
                            if(destroyAllTransactions) {
                                /**
                                 * Delete KPI counter, Tree, Timeline, Error
                                 */
                                //remove from list 1, list 2, assets, transactions

                                /* await Validity.destroy({
                                    where: {representative_id: deleteParentCompanies, organisation_id: req.orgId},
                                });
                                await Transactions.destroy({
                                    where: {representative_id: deleteParentCompanies, organisation_id: req.orgId},
                                });
                                await TreeParties.destroy({
                                    where: {representative_id: deleteParentCompanies, organisation_id: req.orgId},
                                });
                                await TreePartiesCollections.destroy({
                                    where: {representative_id: deleteParentCompanies, organisation_id: req.orgId},
                                });
                                await Errors.destroy({
                                    where: {representative_id: deleteParentCompanies, organisation_id: req.orgId},
                                });

                                await Timelines.destroy({
                                    where: {representative_id: deleteParentCompanies, organisation_id: req.orgId},
                                }); */
                            }
                        }


                        if(reUpdateCompanies.length > 0) {
                            /**
                             * Delete from Representative Transaction and add transactions again
                             */
                            const destroyAllTransactions = await RepresentativeTransactions.destroy({
                                where: {representative_id: reUpdateCompanies},
                            });

                            if(destroyAllTransactions) {
                                const findPCompanies = await Representative.findAll({
                                    attributes:['company_id'],
                                    where:{representative_id: reUpdateCompanies, type: 0}                        
                                });

                                if(findPCompanies.length > 0) {
                                    const promiseAddRFIDs = findPCompanies.map(async (company, index) => {
                                        console.log(`php -f /var/www/html/trash/add_representative_rfids.php "${req.orgId}" "${company.company_id}"`);
                                        await exec(`php -f /var/www/html/trash/add_representative_rfids.php "${req.orgId}" "${company.company_id}"`, async (error, std, stderr) => {
                                            /*await exec(`php -f /var/www/html/trash/tree_script_client.php "${company.original_name}"`, async (error, stdout, stderr) => {

                                            });*/
                                            console.log(error);
                                            console.log(std);
                                            console.log(stderr);


                                            exec(`php -f /var/www/html/trash/create_data_for_company_db_application.php "${req.orgId}" "${company.company_id}"`, (error, stdd, stderr)=> {
                                                console.log("fill database ....")
                                                console.log(error); 
                                                console.log(stderr);
                                                console.log(stdd);
                                                console.log("DONE");

                                            }); 
                                        });
                                        return company;
                                    });
                                    await Promise.all(promiseAddRFIDs);

                                    /**
                                     * Recreate KPI and Tree
                                     */
                                    /* exec(`php -f /var/www/html/trash/fix_inventor_timeline_tree_transaction_assests_updates.php "${req.orgId}" ""`, async (error, std, stderr) => {
                                        console.log(error);
                                        console.log(std);
                                        console.log(stderr);
                                    }); */
                                    res.status(200).send("Companies deleted.");
                                }
                            }
                        } else {
                            /**
                             * Recreate KPI and Tree
                             */
                            console.log("DELETE");
                            exec(`php -f /var/www/html/trash/create_data_for_company_db_application.php "${req.orgId}" ""`, (error, stdd, stderr)=> {
                                console.log("fill database ....")
                                console.log(error); 
                                console.log(stderr);
                                console.log(stdd);
                                console.log("DONE");
                            }); 

                            res.status(200).send("Companies deleted.");
                        }
                    } else {
                        res.status(500).send("Error while deleting companies.");
                    }                    
                } else {
                    res.status(402).send("No company found");
                }
            } else {
                res.status(402).send("No company found");
            }
        }
    } catch( err ) {
        console.log(err);
        res.status(500).json({message: "Error while deleting companies."})
    }    
});

route.delete("/customers/:id/share", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID, clientDBConnection.connect], async (req, res, next) => {
    try{
        const { id } = req.params
        if(id > 0) {
            await helpers.removeAllOldSharingUrl(id)
            res.status(200).send("Share url deleted.");
        } else {
            res.status(402).send("Invalid inputs");
        }
    } catch( err ) {
        console.log(err)
        res.status(500).send(null)
    }
})

route.get("/customers/:id/reports", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID, clientDBConnection.connect], async (req, res, next) => {
    try{
        let organisationID = req.params.id;
        if(organisationID > 0){
            const organisation  = await helpers.findOrganisationbyID(organisationID);
            if(organisation != null && organisation.organisation_id > 0){
                if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
                    /*const getCompaniesList = await helpers.getCompaniesWithChildren(req.connection_db);*/
                    const getCompaniesReport = await helpers.getCompaniesListSumWithReports(req.connection_db, organisationID);
                    res.status(200).json(getCompaniesReport);
                } else {
                    res.status(200).json([]);
                }
            } else {
                res.status(200).json([]);
            }
        } else {
            res.status(400).send("Invalid inputs");
        }       
    } catch( err ) {
        console.log(err);
        res.status(400).send("Invalid inputs");
    } 
});

route.get("/customers/:id/reclassify", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
    try{
        const organisationID = req.params.id;
        const {companies} = req.query
        if(organisationID > 0){
            const getClassifyData = await LogMessages.findAll({
                where: {organisation_id: organisationID, company_id: companies},
                order: [['id','ASC']]
            })

            const logData = [];

            if(getClassifyData.length > 0) {

                const promise = await getClassifyData.map((row, index) => {
                    const item = row.toJSON()
                    if(index > 0) { 
                        item.start_time = getClassifyData[index - 1].end_time 
                    }
                    logData.push(item)
                })

                await Promise.all(promise)
            } 
            console.log(logData)
            res.status(200).json(logData);
        } else {
            res.status(400).send("Invalid inputs");
        }       
    } catch( err ) {
        console.log(err);
        res.status(400).send("Invalid inputs");
    } 
});


route.get("/customers/:id/users", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID, clientDBConnection.connect], (req, res, next) => {
    (async () => {
        try{
            let organisationID = req.params.id;
            if(organisationID > 0){
                const organisation  = await helpers.findOrganisationbyID(organisationID);
                if(organisation != null && organisation.organisation_id > 0){
                    /* const list = await helpers.getAllUsers(organisation.organisation_id);
                    res.status(200).json(list); */
                    if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
                        const dbUser = await req.connection_db.define('Users', ClientUsers.mainStructure, ClientUsers.options);
                        const list = await dbUser.findAll();
                        res.status(200).json(list);
                    }
                } else {
                    res.status(200).json([]);
                }
            } else {
                res.status(400).send("Invalid inputs2");
            }       
        } catch( err ) {
            console.log(err);
            res.status(400).send("Invalid inputs1");
        }
    })(); 
});

/**
 * Create new user in same organisation
 */


route.post("/customers/:id/users", [authJWT.verifyToken, authJWT.isAdmin, userExist.checkDuplicateUsername, authJWT.addClientID, clientDBConnection.connect], async function (req, res, next){
    try{
        let organisationID = req.params.id;
        if(organisationID > 0){
            const organisation  = await helpers.findOrganisationbyID(organisationID);
            if(organisation != null && organisation.organisation_id > 0){
                console.log(req.body);
                Users.create({
                    first_name: req.body.first_name,
                    last_name: req.body.last_name,
                    email_address: req.body.email_address,
                    username: req.body.email_address,						
                    password: bcrypt.hashSync(req.body.password ? req.body.password : req.body.last_name, 8),
                    job_title: req.body.job_title,
                    linkedin_url: req.body.person_linkedin_url,
                    type: req.body.type,
                    logo: req.body.logo,
                    role_id: req.body.type == 0 ? 1 : 2,
                    organisation_id: organisationID
                })
                .then(function( user ){
                    if(user != null) {   
                        console.log(req.connection_db); 
                        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
                            /** */
                            (async () => {
                                const dbUser = await req.connection_db.define('Users', ClientUsers.mainStructure, ClientUsers.options);
                                
                                const clientUser = {
                                    user_id: user.user_id,
                                    first_name: req.body.first_name,
                                    last_name: req.body.last_name,
                                    email_address: req.body.email_address,
                                    username: req.body.email_address,		
                                    job_title: req.body.job_title,
                                    linkedin_url: req.body.person_linkedin_url,
                                    telephone1: req.body.telephone1,
                                    telephone: req.body.telephone,
                                    role_id: req.body.type == 0 ? 1 : 2,
                                    logo: req.body.logo
                                }

                                const addClientUser = await dbUser.create(clientUser);
                                console.log("addClientUser", addClientUser);

                                if(addClientUser != null) {

                                    /**
                                     * Invite user to client workspace
                                    */
                
                                    const slack = await new SlackHelper()
                                    //find public channels
                                    slack.adminConversationSearch({
										team_ids: organisation.team
									}, function(response) {
										if(response.length > 0) {
											const params = {
												channel_ids: response[0].id,
												team_id: organisation.team,
												email: req.body.email_address,
												resend: true,
												custom_message: 'You are invited to Join workspace '
											}
											console.log(params)
											slack.addInvite(params, function(response){
                                                console.log('user invited', response)                                                
                                                if(response.ok == true || response.data.error === 'already_in_team') {
                                                    slack.updateMembersToUserGroup(0, organisation.team, process.env.USERGROUP_NAME)
                                                }
											})
										}
									})




                                    const Firm = await req.connection_db.define('Firms', Firms.mainStructure, Firms.options);

                                    let firmID = 0;

                                    let findFirm = await Firm.findOne({
                                                    where: {firm_name: organisation.name}
                                                });
                                    if(findFirm != null && findFirm.firm_id > 0) {
                                        firmID = findFirm.firm_id;
                                    } else {
                                        findFirm = await Firm.create({firm_name: organisation.name});
                                        if(findFirm != null && findFirm.firm_id > 0) {
                                            firmID = findFirm.firm_id;
                                        }
                                    } 
                                    if(firmID > 0) {
                                        const Professional = await req.connection_db.define('Professionals', ProfessionalUsers.mainStructure, ProfessionalUsers.options);  
                                        const addUserToProfessional = {
                                            first_name: req.body.first_name,
                                            last_name: req.body.last_name,
                                            email_address: req.body.email_address,
                                            job_title: req.body.job_title,
                                            linkedin_url: req.body.person_linkedin_url,
                                            telephone1: req.body.telephone1,
                                            telephone: req.body.telephone,
                                            type: 0,
                                            profile_logo: req.body.logo,
                                            firm_id: firmID
                                        }
                                        const professionalUser = await Professional.create(addUserToProfessional);
                                        if(professionalUser != null) {
                                            console.log("User"+professionalUser.professional_id);
                                            console.log("User created successfully");
                                        }
                                    }
                                }
                            })();
                        }
                        console.log("User"+user.user_id);
                        console.log("User created successfully");
                        const newUser = user.toJSON();
                        newUser.id = newUser.user_id;
                        res.status(200).json(newUser);
                    }  else {
                        res.status(401).send("Bad inputs");
                    }                  
                })
                .catch(function(err){
                    console.log(err);
                    res.status(401).send("Bad inputs");
                })
            } else {
                res.status(401).send("Bad inputs");
            }
        } else {
            res.status(401).send("Bad inputs");
        }
    } catch( err ) {
        console.log(err);
        res.status(401).send("Invalid inputs");
    }
});
	
/**
 * UPdate Users list
 */

route.put("/customers/:id/users/:user_id", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID, clientDBConnection.connect], async (req, res)=>{
    (async () => {
        
        try{
            let organisationID = req.params.id;
            if(organisationID > 0){
                const t = await connection.business.transaction();		
                const organisation  = await helpers.findOrganisationbyID(organisationID);
                if(organisation != null && organisation.organisation_id > 0){
                    Users.findOne({
                        where: {user_id: req.params.user_id, organisation_id: organisationID}
                    })
                    .then( async u => {
                        if( u != null && u.user_id > 0){						
                            
                            let user = {};
                            if(req.body.password != undefined && req.body.password != null && req.body.password != ""){
                                user.password = bcrypt.hashSync(req.body.password, 8);
                            } else {
                                user.first_name = req.body.first_name;
                                user.last_name = req.body.last_name;
                                user.email_address = req.body.email_address;
                                user.username = req.body.email_address;
                                user.linkedin_url = req.body.linkedin_url;
                                user.type = req.body.type;
                                user.role_id = req.body.type == 0 ? 1 : 2;
                            }
                            console.log(user);							
                            const update = await Users.update(user,{where: {user_id: req.params.user_id}});
                            if(update) {

                                const dbUser = await req.connection_db.define('Users', ClientUsers.mainStructure, ClientUsers.options);

                                const getUser = await dbUser.findOne({
                                    where: {username: u.username}
                                })
                                console.log('getUser', getUser)
                                if(getUser !== null) {
                                    const updateCurrentUser = {}
                                    updateCurrentUser.first_name = req.body.first_name;
                                    updateCurrentUser.last_name = req.body.last_name;
                                    updateCurrentUser.email_address = req.body.email_address;
                                    updateCurrentUser.username = req.body.email_address;
                                    updateCurrentUser.linkedin_url = req.body.linkedin_url;
                                    updateCurrentUser.role_id = req.body.type == 0 ? 1 : 2,
                                   
                                    await dbUser.update(updateCurrentUser,{where: {user_id: getUser.user_id}});
                                }        
                            }
                            
                            res.status(200).send("Updated successfully");
                        } else {
                            res.status(400).send("Invalid inputs");
                        }
                    })
                } else {
                    res.status(400).send("Invalid inputs");
                }
            } else {
                res.status(400).send("Invalid inputs");
            }       
        } catch( err ) {
            console.log(err);
            if (t) await t.rollback();
            res.status(400).send("Invalid inputs");
        }
    })();    
});

let downloadImageFromUrl = async (org, res, url, filename, contentType, callback) => {
    console.log("Calling downloadImageFromUrl.....")
    /* var client = http;
    if (url.toString().indexOf("https") !== -1){
        client = https;
        console.log("sending HTTPS request");
    }
    
    client.request(url, async (response)=> {  
        const data = new Stream();                                                    

        response.on('data', function(chunk) { 
            data.push(chunk);                                                         
        });                                                                         

        response.on('end', async () => {                
            const bucketConfig = config.bucketConfig;  
            
            filename = filename.replace(/\s+/g, '-');
           
            let s3 = new AWS.S3({
                credentials: {
                    accessKeyId: bucketConfig.accessKeyId,
                    secretAccessKey: bucketConfig.secretAccessKey,
                },
                region: bucketConfig.region
            })
           
            const params = {
                Key: `${bucketConfig.dirName}/${filename}`,
                Bucket: bucketConfig.bucketName,
                Body: data.read(),
                ACL: 'public-read',
                ContentType: contentType,
                ContentDisposition: 'inline'
            }
           console.log("params", params)
            s3.putObject(params, async function(err, data) {
                console.log(err, data);
                if(err == null) {
                    filename = `https://s3-${bucketConfig.region}.amazonaws.com/${bucketConfig.bucketName}/${bucketConfig.dirName}/${filename}`;
                    await org.update({
                        logo: filename
                    })
                    res.status(200).json({name: org.name, logo: org.logo});    
                } else {
                    res.status(200).json({name: org.name, logo: ''});    
                }
            });
        });                                                                         
    }).end(); */
    try{

        request.head(url, (err, response, body) => {
            const path = url.split('/').pop(), pathDirectory = '/var/www/html/betapp/'  
            request(url)
            .pipe(fs.createWriteStream(`${pathDirectory}${path}`))
            .on('close', () => {
                const imageData = fs.readFileSync(`${pathDirectory}${path}`, {flag:'r'});
                console.log('imageData', imageData)
                if(imageData){
                    const bucketConfig = config.bucketConfig;  
                
                    filename = filename.replace(/\s+/g, '-');
                   
                    let s3 = new AWS.S3({
                        credentials: {
                            accessKeyId: bucketConfig.accessKeyId,
                            secretAccessKey: bucketConfig.secretAccessKey,
                        },
                        region: bucketConfig.region
                    })
                   
                    const params = {
                        Key: `${bucketConfig.dirName}/${filename}`,
                        Bucket: bucketConfig.bucketName,
                        Body: imageData,
                        ACL: 'public-read',
                        ContentType: contentType,
                        ContentDisposition: 'inline'
                    }
                    console.log("params", params)
                    s3.putObject(params, async function(err, data) {
                        console.log(err, data);
                        if(err == null) {
                            filename = `https://s3-${bucketConfig.region}.amazonaws.com/${bucketConfig.bucketName}/${bucketConfig.dirName}/${filename}`;
                            await org.update({
                                logo: filename
                            })
                            spawn('rm', [`${pathDirectory}${path}`]);
                            res.status(200).json({name: org.name, logo: org.logo});    
                        } else {
                            res.status(200).json({name: org.name, logo: ''});    
                        }
                    });
                }
            })
        })
    } catch (e) {
        console.log('Error', e)
    }
};

route.put("/customers/:id/logo", [authJWT.verifyToken, authJWT.isAdmin], async (req, res) => {
        try{
            let organisationID = req.params.id;
            if(organisationID > 0){
                let org = await helpers.findOrganisationbyID( organisationID );
                if(org != null && org.organisation_id > 0) {
                    console.log(organisationID);
                    console.log(req.files);
                    let logoURL = req.body.url_customer_logo;
                    if(logoURL != "" && logoURL != 'null' && logoURL != "undefined") {
                        /**Download file from URL */
                        console.log("DOWNLOAD URL");
                        let contentType = "", base64IndexOf = -1;
                        base64IndexOf = logoURL.toString().indexOf(';base64,');
                        if(base64IndexOf !== -1){
                            //Image content
                            console.log("Image content");
                            const bucketConfig = config.bucketConfig;  
                            let s3 = new AWS.S3({
                                credentials: {
                                    accessKeyId: bucketConfig.accessKeyId,
                                    secretAccessKey: bucketConfig.secretAccessKey,
                                },
                                region: bucketConfig.region
                            })
                            let name = `logo_${organisationID}`;
                            if(logoURL.indexOf('image/jpeg') >= 0){
                                name += ".jpeg";
                                contentType = "image/jpeg";
                            } else if(logoURL.indexOf('image/svg+xml') >= 0) {
                                name += ".svg";
                                contentType = "image/svg+xml";
                            } else if(logoURL.indexOf('image/bmp') >= 0){
                                name += ".bmp";
                                contentType = "image/bmp";
                            } else {
                                name += ".png";
                                contentType = "image/png";
                            }
                            logoURL = logoURL.substr(base64IndexOf + 8, logoURL.length -1);
                            logoURL  +=  logoURL.replace('+', ' ');
                            logoURL = Buffer.from(logoURL, 'base64');
                            const params = {
                                Key: `${bucketConfig.documentDir}/${name}`,
                                Bucket: bucketConfig.bucketName,
                                Body: logoURL,
                                ACL: 'public-read',
                                ContentType: contentType,
                                ContentDisposition: 'inline'
                            }

                            console.log(params)
                             s3.upload(params, async function(err, data) {
                                if(err == null) {
                                    org.logo = `${bucketConfig.s3Url}${data.key}`;
                                    await org.update({
                                        logo: org.logo
                                    });
                                    res.status(200).json({name: org.name, logo: org.logo});
                                } else {
                                    res.status(500).send("ERROR: "+err);	
                                }
                            }) 
                        } else {
                            //Image file
                            console.log("Image file");
                            const extension = logoURL.toString().split('.').pop().toLowerCase();
                            
                            if(extension.indexOf('jpg') >= 0){
                                contentType = "image/jpeg";
                            } else if(extension.indexOf('svg') >= 0) {
                                contentType = "image/svg+xml";
                            } else if(extension.indexOf('bmp') >= 0){
                                contentType = "image/bmp";
                            } else {
                                contentType = "image/png";
                            }
                            console.log("contentType", contentType);
                            await downloadImageFromUrl(org, res, logoURL, org.name+'.'+extension, contentType);
                        }
                        
                    } else if(req.files != null && req.files.file != null && req.files.file != undefined) {
                        let mimeType = req.files.file.mimetype;
                        console.log(mimeType);
                        if(mimeType.toLowerCase().indexOf('.exe') < 0){
                            let fileObject = req.files.file;
                            const bucketConfig = config.bucketConfig;  
                            let s3 = new AWS.S3({
                                credentials: {
                                    accessKeyId: bucketConfig.accessKeyId,
                                    secretAccessKey: bucketConfig.secretAccessKey,
                                },
                                region: bucketConfig.region
                            })
                            let name = fileObject.name;
                                name = name.replace(/\s+/g, '-');
                            const params = {
                                Key: `${bucketConfig.documentDir}/${name}`,
                                Bucket: bucketConfig.bucketName,
                                Body: fileObject.data,
                                ACL: 'public-read'
                            }
                            
                            s3.upload(params, async function(err, data) {
                                if(err == null) {
                                    org.logo = `${bucketConfig.s3Url}${data.key}`;
                                    await org.update({
                                        logo: org.logo
                                    });
                                    res.status(200).json({name: org.name, logo: org.logo});
                                } else {
                                    res.status(500).send("ERROR: "+err);	
                                }
                            })
                        } else {
                            res.status(400).send("Invalid file format.");	
                        }
                    } else {
                        res.status(400).send("Please select file first.");	
                    }
                } else {
                    res.status(400).send("Invalid customer");	
                }
            } else {
                res.status(400).send("Invalid customer");	
            }
        } catch(e) {
            console.log(e);
            res.status(500).send("Error while uploading file.");	
        }
});

/**
 * Get customer by ID
 */

route.get("/customers/:id/libraries", [authJWT.verifyToken, authJWT.isAdmin], (req, res, next) => {
    
    (async () => {
        try{
            let organisationID = req.params.id;
            if(organisationID > 0){
                let org = await helpers.findOrganisationbyID( organisationID );
                if(org != null && org.organisation_id > 0) {
                    /**
                     * Get list of all from resources database.
                     */
                    let companyName = org.name;
                    let companyData = await helpers.checkRepresentativeCompany(companyName);
                    let list = [];
                    if(companyData != null && companyData.representative_id > 0) {
/*                      list = await helpers.findCompanyCustomersByID(companyData.representative_id);*/
                        list = await helpers.findCompanyCustomersByName(companyName);
                    }
                    res.status(200).json(list);
                } else {
                    res.status(402).send("Not found ");
                }
            } else {
                res.status(402).send("Not found ");
            }
        } catch(e) {
            console.log(e);
            res.status(402).send("Not found ");
        }
    })();
});

route.get("/customers/:organisation_id/create_tree", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        let organisationID = req.params.organisation_id;
        if(organisationID > 0){
            let org = await helpers.findOrganisationbyID( organisationID );
            if(org != null && org.organisation_id > 0) {
                /**
                 * Get list of all from resources database.
                 */
                let companyName = org.name;
                /*let companyData = await helpers.checkRepresentativeCompany(companyName);
                if(companyData != null && companyData.representative_id > 0) {
                    console.log(`php -f /var/www/html/trash/tree_script.php "${companyName}"`);
                    await exec(`php -f /var/www/html/trash/tree_script.php "${companyName}"`, function (error, stdout, stderr) {
                        console.log(error);
                        console.log(stderr);
                        res.status(200).send(stdout);
                    });
                } else {
                    res.status(402).send("Bad Inputs");
                }*/
                console.log(`php -f /var/www/html/trash/tree_script.php "${companyName}"`);
                await exec(`php -f /var/www/html/trash/tree_script.php "${companyName}"`, function (error, stdout, stderr) {
                    console.log(error);
                    console.log(stderr);
                    res.status(200).send(stdout);
                });
            } else {
                res.status(402).send("Bad Inputs");
            }
        } else {
            res.status(402).send("Bad Inputs");
        }
        
    } catch(e) {
        console.log("ERROR:");
        console.log(e);
        res.status(402).send("Not found ");
    } 
});

/**
 * (async () => {
        try{
            let organisationID = req.params.id;
            if(organisationID > 0){
                let org = await helpers.findOrganisationbyID( organisationID );
                if(org != null && org.organisation_id > 0) {
                    
                    let companyName = org.name;

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
                                   companiesList.push({id: uuidv4(),name: name, type: company.type, company_name: company.name, normalize_name: company.normalize_name});
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
 */

/**
 * Create new Customer 
 * Create Account in Business Database and create database for the customer
 */

route.post("/customers", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {   
    try{
        let companyName = req.body.company_name;
        if(companyName != undefined && companyName.length > 0) {
            /**
             * Check customer already exist!
             */
            let org = await Organisations.findOne({
                where: {name: companyName}
            })

            if(org == null) {
                /**
                 * Create account
                 */
                org =  await Organisations.create({
                    name: req.body.company_name,
                    country_id:1,
                    organisation_type: req.body.organisation_type,
                    subscribtion: 3
                })
            }
            if(org != null && org.organisation_id > 0){
                let organisationID = org.organisation_id;

                /**
                 * Create new workspace in slack
                 */
                const randomBytes = crypto.randomBytes(20).toString('hex')
                const params = {
                    team_domain: `${randomBytes.substring(0, 20)}`,
                    team_name: req.body.company_name,
                    team_discoverability: 'open'
                }
                console.log('Slack Params', params)
                const slack = await new SlackHelper()
                slack.createWorkSpace(params, function(err, response){
                    console.log('slack.createWorkSpace', err, response)
                    if(err === null) {
                        if(response.team !== null) {
                            org.update({
                                team: response.team
                            })
                            /**
                             * create a usergroup
                             */
                            slack.createUserGroups({
                                name: process.env.USERGROUP_NAME,
                                team_id: response.team
                            }, function(result){
                                console.log('usergroupResult', result)
                            })
                        }
                    }
                })
               
                console.log(`php -f /var/www/html/trash/script_create_customer_db.php "${organisationID}"`);
                exec(`php -f /var/www/html/trash/script_create_customer_db.php "${organisationID}"`, async (error, std, stderr) => {
                    console.log("script_create_customer_db");
                    console.log(error);
                    console.log(stderr);
                    console.log(std);
                });        

                
                /**
                 * Run script for creating database
                 */
                const query = "UPDATE db_business.organisation SET uuid=UUID_TO_BIN(UUID()) WHERE organisation_id = :organisation_id"

                connection.resources.query(query,{
                    type: connection.Sequelize.QueryTypes.UPDATE,
                    replacements: { organisation_id: organisationID },
                    raw: true,
                    logging: console.log,
                }); 

                res.status(200).json(org);                                       
            } else {
                res.status(500).send("Internal server error");
            }
        }
    } catch (e) {
        console.log(e);
        res.status(402).send("Not able to create new customer ");
    }    
});

route.put("/customers" , [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
    try{
        const companyName = req.body.company_name, clientID = req.body.organisation_id;
        if(companyName != undefined && companyName.length > 0 && clientID > 0) {
            /**
             * Check customer exist!
             */
            const org = await Organisations.findOne({
                where: {organisation_id: clientID}
            })
            if(org != null) {
                await org.update({
                    name: req.body.company_name,
                    organisation_type: req.body.organisation_type,
                    subscribtion: typeof req.body.subscribtion  !== 'undefined' ? req.body.subscribtion : 3
                });
                res.status(200).json({name: org.name, logo: org.logo, organisation_type: org.organisation_type, subscribtion: org.subscribtion, organisation_id: org.organisation_id});   
            } else {
                res.status(403).send("Client not found");
            }
        } else {
            res.status(400).send("Name cannot be blank");
        }
    }catch(e){
        res.status(402).send("Not able to update client account ");
    }
})



route.get("/customers/:id/patents", [authJWT.verifyToken, authJWT.isAdmin], async (req, res, next) => {
    try{
        let organisationID = req.params.id;
        let { direction, representativeID } = req.query
        let patentList = [];
        if(organisationID > 0){
            let org = await helpers.findOrganisationbyID( organisationID );
            if(org != null && org.organisation_id > 0) {
                if(typeof representativeID !== 'undefined' && representativeID != '') {
                    representativeID = JSON.parse(representativeID)
                }
                let queryAllPatentList = '';
                if(Array.isArray(representativeID) && representativeID.length > 0) {
                    queryAllPatentList = 'SELECT CASE WHEN grant_doc_num = "" OR grant_doc_num IS NULL THEN appno_doc_num ELSE grant_doc_num END AS number, appno_doc_num as application, CASE WHEN grant_doc_num = "" OR grant_doc_num IS NULL THEN 1 ELSE 0 END AS asset_type FROM assets WHERE (organisation_id = 0 OR organisation_id IS NULL) AND company_id IN (:representativeID) AND date_format(grant_date, "%Y") >= :year GROUP BY number, application';
                } else {
                    queryAllPatentList = 'SELECT CASE WHEN grant_doc_num = "" OR grant_doc_num IS NULL THEN appno_doc_num ELSE grant_doc_num END AS number, appno_doc_num as application, CASE WHEN grant_doc_num = "" OR grant_doc_num IS NULL THEN 1 ELSE 0 END AS asset_type FROM assets WHERE organisation_id = :organisationID AND date_format(grant_date, "%Y") >= :year GROUP BY number, application ';
                }

                queryAllPatentList += ` ORDER BY asset_type ASC, ABS(number) ${typeof direction === 'undefined' ? "ASC" : direction}`

                if(queryAllPatentList !== '')  {
                    patentList = await connection.applicationNew.query(queryAllPatentList,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: { organisationID, representativeID, year: connection.DEFAULT_YEAR },
                        raw: true,
                        logging: console.log,
                        }
                    );
                }           
            }
        }
        res.status(200).json(patentList);
    } catch(e) {
        console.log(e);
        res.status(402).send("No patents");
    }
});

route.get("/customers/:organisation_id/flag_automatic", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        let organisationID = req.params.organisation_id, companyID = req.query.representative_id;
        if(organisationID > 0){
            let org = await helpers.findOrganisationbyID( organisationID );
            if(org != null && org.organisation_id > 0) {
                
                console.log(`php -f /var/www/html/trash/update_flag.php "${organisationID}" "${companyID}"`);
                exec(`php -f /var/www/html/trash/update_flag.php "${organisationID}" "${companyID}"`, (error, stdout, stderr) => {  
                    console.log(error, stdout, stderr);
                });
                res.status(200).send("Fixing flag in process");
            } else {
                res.status(402).send("Customer not exist.");
            }
        } else {
            res.status(402).send("Invalid parameters.");
        }
    }catch(e) {
        console.log(e);
        res.status(402).send("Error while updating flag");
    }
});

route.get("/customers/:organisation_id/transaction_missing_conveyance", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        let organisationID = req.params.organisation_id, companyID = req.query.representative_id;
        if(organisationID > 0){
            let org = await helpers.findOrganisationbyID( organisationID );
            if(org != null && org.organisation_id > 0) {
                
                console.log(`php -f /var/www/html/trash/update_missing_type.php "${organisationID}" "${companyID}"`);
                exec(`php -f /var/www/html/trash/update_missing_type.php "${organisationID}" "${companyID}"`, (error, stdout, stderr) => {  
                    console.log(error, stdout, stderr);
                });
                res.status(200).send("Fixing flag in process");
            } else {
                res.status(402).send("Customer not exist.");
            }
        } else {
            res.status(402).send("Invalid parameters.");
        }
    }catch(e) {
        console.log(e);
        res.status(402).send("Error while updating flag");
    }
});

route.get("/customers/:organisation_id/:representative_id/missing_inventor", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        let organisationID = req.params.organisation_id;
        if(organisationID > 0){
            let org = await helpers.findOrganisationbyID( organisationID );
            if(org != null && org.organisation_id > 0) {
                const findProcess = await MissingInventorProcess.findOne({
                    where: {organisation_id: org.organisation_id, representative_id: req.params.representative_id, status: 0}
                })

                if( findProcess == null ) {
                    MissingInventorProcess
                    .create({organisation_id: org.organisation_id, representative_id: req.params.representative_id, status: 0})
                    .then( data => {
                        console.log(data);
                        console.log(`php -f /var/www/html/trash/find_missing_from_api_inventor_xml.php "${organisationID}" "${req.params.representative_id}"`);
                        exec(`php -f /var/www/html/trash/find_missing_from_api_inventor_xml.php "${organisationID}" "${req.params.representative_id}"`, (error, stdout, stderr) => {  
                            console.log(error, stdout, stderr);
                        });
                        res.status(200).send("Finding the number of assignment with missing inventor.");
                    })
                } else {
                    res.status(200).send("Already in process.");
                }
            } else {
                res.status(402).send("Customer not exist.");
            }
        } else {
            res.status(402).send("Invalid parameters.");
        }
    }catch(e) {
        console.log(e);
        res.status(402).send("Error while updating flag");
    }
})

route.get("/customers/:organisation_id/:representative_id/missing_inventor/stop", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        let organisationID = req.params.organisation_id;
        if(organisationID > 0){
            let org = await helpers.findOrganisationbyID( organisationID );
            if(org != null && org.organisation_id > 0) {
                const where = {organisation_id: org.organisation_id};
                const representativeID = req.params.representative_id;
                if(representativeID > 0) {
                    where['representative_id'] = representativeID;
                }
                const data = await MissingInventorProcess.findOne({where: where});

                if(data != null && data.process_id > 0) {
                   const updateData =  await MissingInventorProcess.update({status: 1}, {where: where});
                    if(updateData) {
                        res.status(200).send("Process stopped");
                    } else {
                        res.status(200).send("Error while stopping process.");
                    }
                } else {
                    res.status(200).send("Error while stopping process.");
                }
            } else {
                res.status(200).send("AccountID missing.");
            }
        } else {
            res.status(200).send("AccountID missing.");
        }
    }catch(e) {
        console.log(e);
        res.status(402).send("Error while stopping process");
    }
})

route.get("/customers/:organisation_id/:representative_id/find_inventor", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        let organisationID = req.params.organisation_id;
        if(organisationID > 0){
            let org = await helpers.findOrganisationbyID( organisationID );
            if(org != null && org.organisation_id > 0) {
                MissingInventorProcess
                .create({organisation_id: org.organisation_id, representative_id: req.params.representative_id})
                .then( data => {
                    console.log(data);
                    console.log(`php -f /var/www/html/trash/missing_inventor_from_api_2000_2004.php "${organisationID}" "${req.params.representative_id}"`);
                    exec(`php -f /var/www/html/trash/missing_inventor_from_api_2000_2004.php "${organisationID}" "${req.params.representative_id}"`, (error, stdout, stderr) => {  
                        console.log(error, stdout, stderr);
                    });
                    res.status(200).send("Finding the number of assignment with missing inventor from 2000-2004.");
                })
            } else {
                res.status(402).send("Customer not exist.");
            }
        } else {
            res.status(402).send("Invalid parameters.");
        }
    } catch(e) {
        console.log(e);
        res.status(402).send("Error while updating flag");
    }
})


route.get("/customers/:organisation_id/publish", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        let organisationID = req.params.organisation_id;
        let {company_id} = req.query

        if(company_id != '' && company_id != undefined && company_id != null && company_id != '[]') {
            company_id = JSON.parse(company_id)
        } else {
            company_id = []
        }
        if(organisationID > 0){
            let org = await helpers.findOrganisationbyID( organisationID );
            if(org != null && org.organisation_id > 0) {
                /**
                 * Get list of all from resources database.
                 */
                const findUsers = await Users.count({
                    where:{organisation_id: org.organisation_id},
                    col: 'user_id'
                });
                if(findUsers > 0) {
                    if(company_id.length == 0) {
                        console.log(`php -f /var/www/html/trash/create_data_for_company_db_application.php "${organisationID}"  ""`);
                        await exec(`php -f /var/www/html/trash/create_data_for_company_db_application.php "${organisationID}"  ""`, async (error, stdout, stderr) => {  
                                                
                        });
                        res.status(200).send("UPDATED!");   
                    } else {
                        const queryRepresentativeName = `SELECT representative_name, company_id FROM db_uspto.list1 WHERE company_id IN (:company_id) AND organisation_id = :organisationID GROUP BY representative_name`;
                        const companyNames =  await connection.applicationNew.query(queryRepresentativeName,{
                            type: connection.Sequelize.QueryTypes.SELECT,
                            replacements: { organisationID, company_id  },
                            raw: true,
                            logging: console.log,
                            }
                        );

                        if(companyNames.length > 0) {
                            companyNames.map( async company => { 
                                console.log(`php -f /var/www/html/trash/create_data_for_company_db_application.php "${organisationID}"  "${company.company_id}" "1"`)
                                await exec(`php -f /var/www/html/trash/create_data_for_company_db_application.php "${organisationID}"  "${company.company_id}" "1"`, async (error, stdout, stderr) => {   
                                                         
                                });
                            })
                            res.status(200).send("UPDATED!");   
                        }

                    }
                } else {
                    res.status(200).send("Please create a admin user first for this customer.");
                }

                
            } else {
                res.status(402).send("Bad Inputs");
            }
        } else {
            res.status(402).send("Bad Inputs");
        }
        
    } catch(e) {
        console.log("ERROR:");
        console.log(e);
        res.status(402).send("Not found ");
    } 
});

route.get("/customers/:organisation_id/address/publish", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        let organisationID = req.params.organisation_id;
        if(organisationID > 0){
            let org = await helpers.findOrganisationbyID( organisationID );
            if(org != null && org.organisation_id > 0) {
                console.log(`php -f /var/www/html/trash/update_client_companies_address.php "${organisationID}"  ""`);
                    await exec(`php -f /var/www/html/trash/update_client_companies_address.php "${organisationID}"  ""`, async (error, stdout, stderr) => {    
                        console.log("tree_script");
                        console.log(error);
                        console.log(stderr);
                                             
                    });
                    res.status(200).send("UPDATED!");   
            } else {
                res.status(402).send("Bad Inputs");
            }
        } else {
            res.status(402).send("Bad Inputs");
        }
        
    } catch(e) {
        console.log("ERROR:");
        console.log(e);
        res.status(402).send("Not found ");
    } 
});

route.put("/customers/:id/flag_update_manually", [authJWT.verifyToken, authJWT.isAdmin, authJWT.addClientID, clientDBConnection.connect], async(req, res, next) => {
    try{

        let inventors = req.body.inventors, organisationID = req.params.id, flag = req.body.flag;
    
        if(inventors != undefined && inventors.length > 0) {
            if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
                let update = await helpers.updateAllCustomerInventor(organisationID, inventors, flag, req.connection_db);
                res.status(200).json(update);
            } else {
                res.status(400).send("No companies found ");
            }
        } else {
            res.status(400).send("No list found! ");
        }
    } catch (e) {
        
    }
});

route.delete("/customers/:organisation_id", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        let organisationID = req.params.organisation_id;
        if(organisationID > 0){
            let org = await helpers.findOrganisationbyID( organisationID );
            if(org != null && org.organisation_id > 0) {
                if(org.org_usr != "" && org.org_pass != "" && org.org_host != "" && org.org_db != "") {
                    res.status(403).send("Cannot delete customer account.");
                } else {
                    let t = await connection.resources.transaction();

                    const deleteCompany = await Organisations.destroy({
                        where:{representative_id: organisationID}, transaction: t
                    });

                    if(deleteCompany != null) {
                        res.status(200).send("Customer deleted successfully.");
                    } else {
                        res.status(500).send("Error while deleting customer.");
                    }
                }
            } else {
                res.status(402).send("Bad Inputs");
            }
        } else {
            res.status(402).send("Bad Inputs");
        }
    } catch(e) {
        console.log("ERROR:");
        console.log(e);
        res.status(402).send("Not found ");
    } 
});


route.get("/patents/:asset",[authJWT.verifyToken, authJWT.isAdmin], async (req, res) =>{       
    try{

        let asset = req.params.asset;
        let where = {
            [connection.Op.or]:[{grant_doc_num: asset},{appno_doc_num: asset}]
        }
        if(typeof flag !== 'undefined' && flag >= 0) {
            if(flag == 1) {
                where = {
                    grant_doc_num: asset
                }
            } else if(flag == 0) {
                where = {
                    appno_doc_num: asset
                }
            }
        }
        Documentids.findAll({
            where,
            attributes:['rf_id',['grant_doc_num','number'], ['appno_doc_num','application']],
        })
        .then(p => {
            console.log("CHECKING PATENT");
            console.log('%j',p);     
            if(p != null && p.length > 0){
                console.log(p); 
                helpers.generateJSON(req, res);
            } else {
                res.status(400).send("Invalid number");
            }       
        }).catch(err => {
            console.log(err);
            res.status(400).send("Invalid number");
        })
    } catch (e) {
        
    } 
});

route.get("/patents/:patentNumber/comments",[authJWT.verifyToken, authJWT.isAdmin], async (req, res) =>{        
    res.status(200).json({});
});

route.get("/patents/:patentNumber/outsource",[authJWT.verifyToken, authJWT.isAdmin], async (req, res) =>{ 
    try{

        let patentNumber = req.params.patentNumber;       
        Documentids.findOne({
            where:{[connection.Op.or]:[{grant_doc_num: patentNumber},{appno_doc_num: patentNumber}]},
            attributes:['rf_id',['grant_doc_num','number'], ['appno_doc_num','application']],
        })
        .then(p => {
            if(p != null) {
                let type = "patNum";
                console.log('%j',p); 
                let data = p.toJSON();
                if(patentNumber == data.application){
                    patentNumber = data.application;
                    type = "applNum";
                }      
                res.status(200).json({url:`https://assignment.uspto.gov/patent/index.html#/patent/search/resultAbstract?id=${patentNumber}&type=${type}`});
            } else {
                res.status(200).send("");
            }        
        }).catch(err => {
            console.log(err);
            res.status(400).send("Invalid number");
        })
    } catch (e) {
        
    }
});

route.get("/patents/:patentNumber/assignments",[authJWT.verifyToken, authJWT.isAdmin], async (req, res) =>{ 
    try{

        let patentNumber = req.params.patentNumber; 
        Documentids.findOne({
            where:{[connection.Op.or]:[{grant_doc_num: patentNumber},{appno_doc_num: patentNumber}]},
            attributes:['rf_id',['grant_doc_num','number'], ['appno_doc_num','application']],
        })
        .then(p => {
            if(p != null) {
                let type = "patNum";
                console.log('%j',p); 
                let data = p.toJSON();
                if(patentNumber == data.application){
                    patentNumber = data.application;
                    type = "applNum";
                }      
    
                let queryAssignments = "SELECT a.rf_id, a.convey_text, ac.convey_ty, '' as file, r.representative_type FROM assignment as a INNER JOIN assignor as `or` ON `or`.rf_id = a.rf_id INNER JOIN assignment_conveyance as ac ON ac.rf_id = a.rf_id INNER JOIN documentid as d ON d.rf_id = a.rf_id LEFT JOIN representative_assignment_conveyance as r ON r.rf_id = a.rf_id WHERE ";
    
                if(type == "patNum") {
                    queryAssignments += " d.grant_doc_num = :number";
                } else if(type == "applNum") {
                    queryAssignments += " d.appno_doc_num = :number";
                }
    
                queryAssignments +=" ORDER BY a.exec_dt ASC";
                (async () => {
                    let getAssignmentList = await connection.resources.query(queryAssignments,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        replacements: { number: patentNumber },
                        raw: true,
                        logging: console.log,
                        }
                    );	
        
                    if(getAssignmentList.length > 0) {
                        const path = '/var/wwww/html/PatenTrack/resources/shared/data/';
                        getAssignmentList.map( (a, index) => {
                            let fileName = `assignment-pat-${a.reel_no}-${a.frame_no}.pdf`;
                            if (fs.existsSync(path+fileName)) {
                                //file exists
                                getAssignmentList[index].file = `https://patentrack.com/resources/shared/data/${fileName}`;
                            }
                        });
                    }
                    res.status(200).json(getAssignmentList);
                }) ();
                
            } else {
                res.status(200).send("");
            }        
        }).catch(err => {
            console.log(err);
            res.status(400).send("Invalid number");
        })
    } catch (e) {
        
    }
});


route.get("/customers/retrieve_cited_patents/:customerID",[authJWT.verifyToken, authJWT.isAdmin], async (req, res) =>{ 
    try {
        const {customerID} = req.params
        const {companies, type} = req.query
        console.log('companies', '/var/www/html/script/retrieve_cited_patents_assignees.js', customerID, `${companies}`, `${type}`);
        const script = spawn('node', ['/var/www/html/script/retrieve_cited_patents_assignees.js', customerID, `${companies}`, `${type}`]);
        script.stdout.on('data', function(data) {
            console.log(data)
        })
        res.status(200).send("Run retireved assignee script");
    } catch (err) {
        res.status(500).send("Invalid input");
    }
    
})

route.get("/customers/retrieve_cited_patents_domain/:customerID/:apiName",[authJWT.verifyToken, authJWT.isAdmin], async (req, res) =>{ 
    try{

        const {customerID, apiName} = req.params
        const {assignees, type} = req.query
        //console.log('retrieve_cited_patents_domain')
        /* exec(`node /var/www/html/script/name_to_domain_api.js ${customerID} ${apiName} ${assignees} 0 > name_to_domain_api.log  2>&1`, function(err, stdout, stderr){
            console.log(`assigneeLogos downloadFileSpawn.stdout: ${stdout}`)
            console.log(`Error assigneeLogos downloadFileSpawn.stderr: ${stderr}`)
            console.log(`Error assigneeLogos downloadFileSpawn.err: ${err}`)
        }); */
        //logger.info('Sending request to RapidAPI script')
        
        /* const assigneeLogos = spawn('node', ['/var/www/html/script/name_to_domain_api.js', customerID, apiName, assignees, 0]); */
        spawn('node', ['/var/www/html/script/name_to_domain_api.js', customerID, apiName, assignees, 0]);
    
        /* assigneeLogos.stdout.on('data', (data) => {
            logger.info(data)
            console.log(`assigneeLogos downloadFileSpawn.stdout: ${data}`)
        });
        assigneeLogos.stderr.on('data', (data) => {
            logger.info(data)
            console.log(`Error assigneeLogos downloadFileSpawn.stderr: ${data}`)
            //reject(data)
        });
    
        assigneeLogos.on('close', (code) => {
            logger.info(code)
            resolve(`download assigneeLogos downloadFileSpawn.close ${code}`)    
        })  */
    
    
        res.status(200).send("run logo script");
    } catch (e) {
        console.log("Error in downloading image", e)
        res.status(500).send(e);
    }
})

route.post("/customers/retrieve_cited_patents_logo",[authJWT.verifyToken, authJWT.isAdmin], async (req, res) =>{ 
    try {

        const {client_id, api_name, assignees, all, company_id, type, source_data} = req.body
        console.log('retrieve_cited_patents_logo')
        /* exec(`node /var/www/html/script/name_to_domain_api.js ${client_id} ${api_name} ${assignees} 1 > name_to_domain_api.log  2>&1`, function(err, stdout, stderr){
            console.log(`assigneeLogos downloadFileSpawn.stdout: ${stdout}`)
            console.log(`Error assigneeLogos downloadFileSpawn.stderr: ${stderr}`)
            console.log(`Error assigneeLogos downloadFileSpawn.err: ${err}`)
        }); */ 
    
        /* logger.info('Sending request to RapidAPI script')
        console.log('/var/www/html/script/name_to_domain_api.js', client_id, api_name, assignees, 1, company_id, all, type) */
        /* const assigneeLogos = spawn('node', ['/var/www/html/script/name_to_domain_api.js', client_id, api_name, assignees, 1, company_id, all, type, source_data]); */
        spawn('node', ['/var/www/html/script/name_to_domain_api.js', client_id, api_name, assignees, 1, company_id, all, type, source_data]);
    
        /* assigneeLogos.stdout.on('data', (data) => {
            logger.info(data)
            console.log(`assigneeLogos downloadFileSpawn.stdout: ${data}`)
        });
        assigneeLogos.stderr.on('data', (data) => {
            logger.info(data)
            console.log(`Error assigneeLogos downloadFileSpawn.stderr: ${data}`)
            //reject(data)
        });
    
        assigneeLogos.on('close', (code) => {
            logger.info(code)
            resolve(`download assigneeLogos downloadFileSpawn.close ${code}`)    
        })  */
    
    
        res.status(200).send("run logo script");
    } catch (err) {
        console.log("Error in downloading image", err)
        res.status(500).send(err);
    }
})


route.get("/customers/team/create/:customerID", [authJWT.verifyToken, authJWT.isAdmin], async (req, res) =>{ 
    try{
        const {customerID} = req.params

        const {token, refresh_token} = req.query

        const web = new WebClient(token);

        console.log(web.app)

        const params = {
            team_domain: 'chemistrypatrackteam',
            team_name: 'Chemistry',
            team_discoverability: 'open'
        }

        const result = await web.admin.teams.create( params )

    } catch (err) {
        console.log("Create Error", err)
    }
})

module.exports = route;