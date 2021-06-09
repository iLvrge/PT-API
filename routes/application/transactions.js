const express = require("express");

const route = express.Router();

//require the Model

const Transactions = require("../../model/application/Transactions");
const Assignments = require("../../model/resources/Assignments");
const Assignees = require("../../model/resources/Assignees");
const Assignors = require("../../model/resources/Assignors");
const AssignorAndAssignee = require("../../model/resources/AssignorAndAssignee");
const Documentids = require("../../model/resources/DocumentIds");
const Representatives = require("../../model/resources/Representatives");

const authJWT = require("../../helpers/verifyJwtToken");

const helpers = require("../../helpers/helper");

const connection = require("../../config/db.config");

const clientDBConnection = require("../../helpers/clientDBConnection");

route.get("/transactions", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {

    const resultS = {buy: 0, buy_patent: 0, diff_buy_patent: 0, sale: 0, sale_patent: 0, diff_sale_patent: 0, security: 0, security_patent: 0, diff_security_patent: 0, release: 0, release_patent: 0, diff_release_patent: 0, license_in: 0, license_in_patent: 0, diff_license_in_patent: 0, license_out: 0, license_out_patent: 0, diff_license_out_patent: 0};
    if(typeof req.connection_db != "undefined" && req.connection_db != null ) {

        const whereCondition = {organisation_id: req.orgId}, companyList = req.query.companies;

        if(companyList != undefined && companyList != '') {
            const companies = JSON.parse(companyList);
            if(companies.length > 0) {
                whereCondition.representative_id = companies;
            }
        }

        Transactions.findOne({
            attributes:[[connection.application.fn('sum', connection.application.col('buy')), 'buy'],[connection.application.fn('sum', connection.application.col('buy_patent')), 'buy_patent'],[connection.application.fn('sum', connection.application.col('diff_buy_patent')), 'diff_buy_patent'], [connection.application.fn('sum', connection.application.col('sale')), 'sale'],[connection.application.fn('sum', connection.application.col('sale_patent')), 'sale_patent'],[connection.application.fn('sum', connection.application.col('diff_sale_patent')), 'diff_sale_patent'], [connection.application.fn('sum', connection.application.col('security')), 'security'],[connection.application.fn('sum', connection.application.col('security_patent')), 'security_patent'],[connection.application.fn('sum', connection.application.col('diff_security_patent')), 'diff_security_patent'], [connection.application.fn('sum', connection.application.col('release')), 'release'],[connection.application.fn('sum', connection.application.col('release_patent')), 'release_patent'],[connection.application.fn('sum', connection.application.col('diff_release_patent')), 'diff_release_patent'], [connection.application.fn('sum', connection.application.col('license_in')), 'license_in'], [connection.application.fn('sum', connection.application.col('license_in_patent')), 'license_in_patent'],[connection.application.fn('sum', connection.application.col('diff_license_in_patent')), 'diff_license_in_patent'],[connection.application.fn('sum', connection.application.col('license_out')), 'license_out'],[connection.application.fn('sum', connection.application.col('license_out_patent')), 'license_out_patent'],[connection.application.fn('sum', connection.application.col('diff_license_out_patent')), 'diff_license_out_patent']],
            where: whereCondition,
            group: ["organisation_id"]
        })
        .then((list)=>{
            if(list != null) {
                res.status(200).json(list);
            } else {
                res.status(200).json(resultS);
            } 
        }).catch((err)=>{
            console.log(err);
            res.status(200).json(resultS);
        });
    } else {
        res.status(200).json(resultS);
    }
});

route.get("/transactions/:transactionId", [authJWT.verifyToken], async(req, res, next) => {
    try {
        const {transactionId} = req.params

        const assignees = await Assignees.findAll({
                            attributes: [['ee_name', 'name'], 'assignor_and_assignee_id'],
                            where:{rf_id: transactionId},
                            include:[
                                {
                                    model: AssignorAndAssignee,
                                    as: "assignor_and_assignee",
                                    attributes: ['name', ['representative_id', 'id']],
                                    include:[
                                        {
                                            model: Representatives,
                                            as: "representative",
                                            attributes: [['representative_name', 'name']],
                                        }
                                    ]
                                }
                            ],
                            group: ['assignor_and_assignee_id', 'rf_id']
                        })

        const assignors = await Assignors.findAll({
            attributes: [['or_name', 'name'], 'assignor_and_assignee_id'],
            where:{rf_id: transactionId},
            include:[
                {
                    model: AssignorAndAssignee,
                    as: "assignor_and_assignee",
                    attributes: ['name', ['representative_id', 'id']],
                    include:[
                        {
                            model: Representatives,
                            as: "representative",
                            attributes: [['representative_name', 'name']],
                        }
                    ]
                }
            ],
            group: ['assignor_and_assignee_id', 'rf_id']
        })

        const assignments = await Assignments.findOne({
                                attributes: [['cname', 'name'], 'caddress_1', 'caddress_2',['rf_id', 'id']],
                                where:{rf_id: transactionId},
                            })
        const patent = await Documentids.findAll({
                                attributes: [['appno_doc_num', 'application'], ['grant_doc_num', 'patent']],
                                where:{rf_id: transactionId},
                                group: ['appno_doc_num', 'grant_doc_num']
                            })
        
        res.status(200).json({assignees, assignors, assignments, patent});
    } catch (err) {
        console.log("Err Transaction", err )
        res.status(500).send('Error while get details.')
    }
})

module.exports = route;