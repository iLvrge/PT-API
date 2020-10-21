const express = require("express");

const route = express.Router();

const connection = require("../../config/db.config");

const helpers = require("../../helpers/helper");

//require the Model
const TreeParties = require("../../model/application/TreeParties");
const TreePartiesCollections = require("../../model/application/TreePartiesCollections");
const DocumentIds = require("../../model/application/DocumentIds");


const authJWT = require("../../helpers/verifyJwtToken");

const clientDBConnection = require("../../helpers/clientDBConnection");

route.get("/", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    const representativeIDs = JSON.parse(req.query.portfolio);

    if(representativeIDs.length > 0) {
        const tabCompaniesID = await TreeParties.findAll({
            attributes:['representative_id', 'tab_id', [connection.Sequelize.fn('sum', connection.Sequelize.col('transaction_count')), 'totalTransactions'], [connection.Sequelize.fn('sum', connection.Sequelize.col('assets_count')), 'totalAssets']],
            where:{ representative_id: representativeIDs},
            group: ['tab_id', 'representative_id']
        });

        const tree = [], allRfIDWithAssets=[];

        if(tabCompaniesID != null && tabCompaniesID.length > 0) {
            for(let i = 0; i <= 10; i++ ) {
                const companiesList = [];
                let transaction_count = 0, assets_count = 0;
                const promiseRepresentatives = tabCompaniesID.map( r => {
                    if(r.tab_id == i) {
                        companiesList.push(r.representative_id);
                        transaction_count += r.get('totalTransactions');
                        assets_count += r.get('totalAssets');
                    }
                    return r;
                });

                await Promise.all(promiseRepresentatives);

                /**
                 * 
                 * This process taking time
                 */
                /*
                const getList = await TreeParties.findAll({
                    attributes:['name', ['assignor_and_assignee_id', 'id'], [connection.Sequelize.fn('sum', 'transaction_count'), 'totalTransactions'], [connection.Sequelize.fn('sum', 'assets_count'), 'totalAssets']],
                    where: {tab_id: i,  representative_id: representativeIDs, organisation_id: req.orgId},
                    group: ['tree_parties.tab_id', 'tree_parties.representative_id', 'tree_parties.assignor_and_assignee_id'],
                    include: [
                        {
                            model: TreePartiesCollections,
                            as: 'collections',
                            attributes: ['rf_id', 'exec_dt', [connection.Sequelize.col('assets_count'), 'counter']],
                            include: [
                                {
                                    model: DocumentIds,
                                    as: 'assets',
                                    attributes: ['appno_doc_num', 'grant_doc_num'],
                                    
                                }
                            ]
                        }
                    ]
                });*/

                const customerQuery = "SELECT assignor_and_assignee_id as id, name as label, sum(transaction_count) as transaction_count, sum(assets_count) as assets_count FROM tree_parties WHERE organisation_id =:orgsanitionID AND representative_id IN (:representativeIDs) AND tab_id = :tabID GROUP BY tab_id, representative_id, assignor_and_assignee_id";

                let customerList = await connection.application.query(customerQuery,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    logging: console.log,
                    replacements: { tabID: i,  orgsanitionID: req.orgId, representativeIDs: representativeIDs},
                });
                let customerWithChildren = [];
                if(customerList != null && customerList.length > 0) {
                    const promiseCustomer = customerList.map(async c => {

                        const queryTransactions = "SELECT rf_id, exec_dt, assets_count FROM tree_parties_collection WHERE organisation_id =:organisationID AND representative_id  IN (:representativeIDs) AND tab_id = :tabID AND assignor_and_assignee_id = :assignorAndAssigneeID";

                        let transactionList = await connection.application.query(queryTransactions,{
                            type: connection.Sequelize.QueryTypes.SELECT,
                            raw: true,
                            logging: console.log,
                            replacements: { tabID: i,  organisationID: req.orgId, representativeIDs: representativeIDs, assignorAndAssigneeID: c.id },
                        });
                        let transactionChildren = [];

                        if(transactionList != null && transactionList.length > 0) {
                            
                            const promiseTransaction = transactionList.map( async t => {

                                let checkRFID = [];

                                if(allRfIDWithAssets.length > 0) {
                                    checkRFID = allRfIDWithAssets.filter(item => {
                                        return item.rf_id == t.rf_id ? item : undefined;
                                    })
                                }

                                let children = [];

                                if(checkRFID != undefined && checkRFID.length > 0) {
                                    children.push(item.children);
                                } else {
                                    const queryAssets = "SELECT appno_doc_num, grant_doc_num FROM documentid WHERE rf_id = :rfID";

                                    let assetsList = await connection.application.query(queryAssets,{
                                        type: connection.Sequelize.QueryTypes.SELECT,
                                        raw: true,
                                        logging: console.log,
                                        replacements: { rfID: t.rf_id },
                                    });

                                    allRfIDWithAssets.push({rf_id: t.rf_id, children: assetsList});

                                    children.push(assetsList);
                                }

                                transactionChildren.push({label: `${t.exec_dt} (${t.assets_count})`, rf_id: rf_id, children: children});

                                return t;
                            });
                            
                            await Promise.all(promiseTransaction);
                        }

                        customerWithChildren.push({label: `${c.name} (${c.transaction_count})`, id: c.assignor_and_assignee_id, children: transactionChildren})

                        return c;

                    });

                    await Promise.all(promiseCustomer);
                } 

                tree.push({label: i == 0 ? 'Acquisitions' : i == 1 ? 'Sale' : i == 2 ? 'License In' : i == 3 ? 'License Out' : i == 4 ? 'Securities' : i == 5 ? 'Merger In' : i == 6 ? 'Merger Out' : i == 7 ? 'Options' : i == 8 ? 'Court Orders' : i == 9 ? 'Employees' : 'Other', transaction_count: transaction_count, assets_count: assets_count, childeren: customerWithChildren});
            }
        }
        res.status(200).json(tree);
    }
});

module.exports = route;