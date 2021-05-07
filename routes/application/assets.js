const express = require("express");

const route = express.Router();

const connection = require("../../config/db.config");

//require the Model
const { WebClient } = require('@slack/web-api')

const ResourcesDocumentids = require("../../model/resources/DocumentIds");
const ResourcesAssignments = require("../../model/resources/Assignments");

const AssetsTransfer = require("../../model/application/AssetsTransfer");

const Assets = require("../../model/application/Assets");

const Documentids = require("../../model/application/DocumentIds");

const Assignments = require("../../model/application/Assignments");

const Assignees = require("../../model/application/Assignees");

const Assignors = require("../../model/application/Assignors");

const AssignorAndAssignee = require("../../model/application/AssignorAndAssignee");

const Representatives = require("../../model/client/Representatives");

const RepresentativeTransactions = require('../../model/resources/RepresentativeTransactions');

const authJWT = require("../../helpers/verifyJwtToken");

const helpers = require("../../helpers/helper");

const clientDBConnection = require("../../helpers/clientDBConnection");

route.get("/assets", [authJWT.verifyToken], async(req, res, next) => {

    Assets.findAll({
        where: {organisation_id: req.orgId}
    })
    .then((list)=>{
        res.status(200).json(list);
    }).catch((err)=>{
        console.log(err);
        res.status(500).json({message: "Unable to retrieve assets"})
    });
});

route.get("/assets/:patentNumber/files/:channelID/slack/:token", [authJWT.verifyToken], async(req, res, next) => {

    try {
        const { patentNumber, token, channelID } = req.params
        let assetsFiles = [], type = 1
        let findNumber = await ResourcesDocumentids.findOne({
            where:{grant_doc_num: patentNumber},
            attributes:['grant_doc_num', 'appno_doc_num'],
            group: ['grant_doc_num', 'appno_doc_num']
        })

        if( findNumber == null ) {
            type = 0
            findNumber = await ResourcesDocumentids.findOne({
                where:{appno_doc_num: patentNumber},
                attributes:['grant_doc_num', 'appno_doc_num'],
                group: ['grant_doc_num', 'appno_doc_num']
            })
        }

        if( findNumber != null ) {
            const where = {}

            /* if( findNumber.grant_doc_num != '' && findNumber.grant_doc_num != null ) {
                where.grant_doc_num = findNumber.grant_doc_num 
            } else {
                where.appno_doc_num = findNumber.appno_doc_num 
            } */


            let query = 'SELECT assignment.rf_id as id, "usptodrive" as external_type, date_format(assignor.exec_dt, "%m-%d-%Y") as title, representative_assignment_conveyance.convey_ty, CASE WHEN assignment.status = 1 THEN CONCAT("https://s3-us-west-1.amazonaws.com/static.patentrack.com/assignments/var/www/html/beta/resources/shared/data/assignment-pat-",reel_no,"-",frame_no,".pdf") ELSE CONCAT("https://legacy-assignments.uspto.gov/assignments/assignment-pat-",reel_no,"-",frame_no,".pdf") END as url_private, (SELECT sum(no_of_parties) FROM report_representative_assets_transactions_parties WHERE report_representative_assets_transactions_parties.rf_id = assignment.rf_id GROUP BY report_representative_assets_transactions_parties.rf_id ) as count_parties, (SELECT assignee FROM report_representative_assets_transactions WHERE report_representative_assets_transactions.rf_id = assignment.rf_id LIMIT 1) as assignee, (SELECT assignor FROM report_representative_assets_transactions WHERE report_representative_assets_transactions.rf_id = assignment.rf_id LIMIT 1) as assignor FROM assignment INNER JOIN assignor ON assignor.rf_id = assignment.rf_id INNER JOIN documentid ON documentid.rf_id = assignment.rf_id INNER JOIN representative_assignment_conveyance ON representative_assignment_conveyance.rf_id = assignment.rf_id'

            if(type == 0) {
                query += ' WHERE appno_doc_num =:appno_doc_num '                
                where.appno_doc_num = findNumber.appno_doc_num 
            } else if(type == 1) {
                query += ' WHERE grant_doc_num =:grant_doc_num '
                where.grant_doc_num = findNumber.grant_doc_num 
            }

            query +=' GROUP BY assignment.rf_id'

            assetsFiles =  await connection.resources.query(query,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    replacements: where,
                    raw: true,
                    logging: console.log,
                }
            );
        }

        if(token != '' && token != undefined && token != 'undefined' && channelID != '' && channelID != undefined && channelID != 'undefined') {
            
            const web = new WebClient(token);
            
            // channel name without space and no special characters
            const result = await web.files.list({
                channel: channelID
            })
            //console.log(result);

            if(result && result.ok === true) {
                const { files } = result;
                assetsFiles = [...assetsFiles, ...files]
            }
        }
        res.status(200).json(assetsFiles);
    } catch (err) {
        console.log(err);
        res.status(400).send("Invalid number");
    }
});

/*6*/
	/**
     * Get patent JSON data
     */
route.get("/assets/:patentNumber",[authJWT.verifyToken], async (req, res) =>{        
    let patentNumber = req.params.patentNumber;
    Documentids.findAll({
        where:{[connection.Op.or]:[{grant_doc_num: patentNumber},{appno_doc_num: patentNumber}]},
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
});



route.get("/assets/:patentNumber/:type/outsource",[authJWT.verifyToken], async (req, res) =>{        
    let patentNumber = req.params.patentNumber, type = req.params.type;
    
    if(type == 1) {
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
    } else if(type == 0){
        Assignments.findOne({
            where:{rf_id: patentNumber},
            attributes:['reel_no', 'frame_no']
        })
        .then( a => {
            if(a != null) {
                let frame = a.frame_no.toString();
                frame = frame.length == 1 ? '000'+frame : frame.length == 2 ? '00'+frame : frame.length == 3 ? '0'+frame : frame;
                let searchInput = `${a.reel_no}-${frame}`;
                let ID = `${a.reel_no}-${a.frame_no}`;
                res.status(200).json({url:`https://assignment.uspto.gov/patent/index.html#/patent/search/resultAssignment?searchInput=${searchInput}&id=${ID}`});
            } else {
                res.status(200).send("");
            }
        })
    }    
});

/**
 * Move asset to other layout
 */
route.post("/assets/move",[authJWT.verifyToken], async (req, res) => { 
    try{
        const { moved_assets } = req.body
        let addedData = []
        if( moved_assets != null  && moved_assets != 'undefined') {
            const list = JSON.parse(moved_assets)
            if( list.length > 0 ) {
                const assets = []
                let query = [], queryCondition = {}
                let a = 0;
                list.map( (row, index) => {
                    let layout_id = row.move_category == 0 ? row.currentLayout : row.move_category
                    let status = row.move_category == 0 ? 0 : 1
                    assets.push({
                        grant_doc_num: row.grant_doc_num,
                        appno_doc_num: row.appno_doc_num,
                        organisation_id: req.orgId,
                        layout_id,
                        status
                    })
                    if( row.move_category != 0 ) {
                        assets.push({
                            grant_doc_num: row.grant_doc_num,
                            appno_doc_num: row.appno_doc_num,
                            organisation_id: req.orgId,
                            layout_id: row.currentLayout,
                            status: 0
                        })
                    }
                    query.push(`(grant_doc_num = :grant${index} AND appno_doc_num = :appno${a} AND layout_id = :layout${a} AND status = :status${a}) `)
                    queryCondition[`grant${a}`] = row.grant_doc_num
                    queryCondition[`appno${a}`] = row.appno_doc_num
                    queryCondition[`layout${a}`] = layout_id
                    queryCondition[`status${a}`] = status
                    a++
                    if( row.move_category != 0 ) {
                        query.push(`(grant_doc_num = :grant${a} AND appno_doc_num = :appno${a} AND layout_id = :layout${a} AND status = :status${a}) `)
                        queryCondition[`grant${a}`] = row.grant_doc_num
                        queryCondition[`appno${a}`] = row.appno_doc_num
                        queryCondition[`layout${a}`] = row.currentLayout
                        queryCondition[`status${a}`] = 0
                    }
                    a++
                    
                })
                addedBulkData = await AssetsTransfer.bulkCreate(assets)  
                if(addedBulkData) {                    
                    const findQuery = `SELECT asset_id FROM assets_transfer WHERE ${query.join(' OR ')}`
                    addedData = await connection.application.query(findQuery,{
                            type: connection.Sequelize.QueryTypes.SELECT,
                            replacements: queryCondition,
                            raw: true,
                            logging: console.log,
                        });
                    
                } 
            }                   
        }
        res.status(200).json(addedData);
    } catch (err) {
        console.log(err);
        res.status(400).send("Invalid data");
    }    
});

/**
 * Rollback assets
 */
route.delete("/assets/rollback",[authJWT.verifyToken], async (req, res) => { 
    try{
        const { revert } = req.query
        let deleted = false
        if( revert != null  && revert != 'undefined') {
            const assetIDs = JSON.parse(revert)
            if( assetIDs.length > 0 ) {                
                const deleteList = await AssetsTransfer.destroy({
                    where: { asset_id: assetIDs }
                })                
                if( deleteList ) {
                    deleted = true
                } 
            }                   
        }
        res.status(200).send(deleted);
    } catch (err) {
        console.log(err);
        res.status(400).send("Invalid data");
    }    
});

/**
 * Search value from company, customers, transaction, assets
 */

route.post("/assets/search",[authJWT.verifyToken, clientDBConnection.connect], async (req, res) => {        
    const query = req.body.value;

    if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
        const Representative = req.connection_db.define('Representatives', Representatives.mainStructure, Representatives.options);
        /**
         * Company
         */
        const customers = [];
        let transactions = [], assets = [];
        const companies = await Representative.findAll({
            attributes: [['representative_id', 'id'],'original_name', 'representative_name'],
            where: {
                [connection.Op.or] : [
                    {original_name: {[connection.Op.like]: '%' + query + '%'}},
                    {representative_name: {[connection.Op.like]: '%' + query + '%'}},
                ]
            }
        });

        

        const findRFIDs = await RepresentativeTransactions.findAll({
            attributes: ['rf_id'],
            where: {organisation_id: req.orgId}
        });

        if(findRFIDs != null) {
            const allRFIDs = [];
            const promises = findRFIDs.map( rfID => {
                allRFIDs.push(rfID.rf_id);
                return rfID;
            });

            await Promise.all(promises);

            const where = {name: {[connection.Op.like]: '%' + query + '%'}};

            const assignees = await Assignees.findAll({
                attributes: [connection.Sequelize.col('assignee.assignor_and_assignee_id'), connection.Sequelize.col('assignor_and_assignee.name')],
                where: {rf_id: allRFIDs},
                group: [connection.Sequelize.col('assignee.assignor_and_assignee_id')],
                include: [
                    {
                        model: AssignorAndAssignee,
                        as: 'assignor_and_assignee',
                        where: where
                    }
                ]
            });

            const assignors = await Assignors.findAll({
                attributes: [connection.Sequelize.col('assignor.assignor_and_assignee_id'), connection.Sequelize.col('assignor_and_assignee.name')],
                where: {rf_id: allRFIDs},
                group: [connection.Sequelize.col('assignor.assignor_and_assignee_id')],
                include: [
                    {
                        model: AssignorAndAssignee,
                        as: 'assignor_and_assignee',
                        attributes: ['assignor_and_assignee_id', 'name'],
                        where: where
                    }
                ]
            });

            const customerIDs = [];
            console.log(assignees);
            console.log(assignees.length);
            if(assignees.length > 0) {
                const promises = assignees.map( assignee => {
                    if(!customerIDs.includes(assignee.assignor_and_assignee.assignor_and_assignee_id)) {
                        customerIDs.push(assignee.assignor_and_assignee.assignor_and_assignee_id);
                        customers.push({id: assignee.assignor_and_assignee.assignor_and_assignee_id, name: assignee.assignor_and_assignee.name});
                    }
                    return assignee;
                });

                await Promise.all(promises);
            }
            
            if(assignors.length > 0) {
                
                const promises = assignors.map( assignor => {                   
                    if(!customerIDs.includes(assignor.assignor_and_assignee.assignor_and_assignee_id)) {
                        customerIDs.push(assignor.assignor_and_assignee.assignor_and_assignee_id);
                        customers.push({id: assignor.assignor_and_assignee.assignor_and_assignee_id, name: assignor.assignor_and_assignee.name});
                        console.log(customers);
                    }

                    return assignor;
                });

                await Promise.all(promises);
            }

            /**
             * Transactions
             */
            transactions = await Assignments.findAll({
                attributes: ['rf_id', 'record_dt'],
                where: {rf_id: allRFIDs, rf_id: query},
                order: [
                    ['record_dt', 'ASC']
                ]
            });

            /**
             * Assets
             */

            assets = await Documentids.findAll({
                attributes: ['appno_doc_num', 'grant_doc_num'],
                where: {rf_id: allRFIDs, [connection.Op.or] : [
                    {appno_doc_num: query},
                    {grant_doc_num: query},
                ]}
            });
        }
        res.status(200).json({companies: companies, customers: customers, transactions: transactions, assets: assets});
    }
})

module.exports = route;