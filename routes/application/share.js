const express = require("express"), 
    route = express.Router(), 
    authJWT = require("../../helpers/verifyJwtToken"), 
    helpers = require("../../helpers/helper"),
    connection = require("../../config/db.config");


route.post("/share", [authJWT.verifyToken], async (req, res) =>{     
    const params = req.body;
            params.organisation_id = req.orgId ;
            params.user_id = req.userId;
    try {
        let code = await helpers.getNewCode();
        if(code != undefined){
            params.code = code;
            let shareURL = await helpers.shareURL(params);
            if(shareURL) {
                res.status(200).send(shareURL);
            } else {
                res.status(500).send("Unable to create share url.");
            }
        }
    }catch(e){
        console.log(e); 
        res.status(500).send("Unable to create share url.");
    }
});

route.get("/share/illustration/:asset/:code",  async (req, res) =>{     
    const { asset, code } = req.params;
    try {
        if( code != "") {
            const share = await helpers.getShareDataByCode(code);
            if( share != null ) {
                const params = {
                    assets: JSON.stringify([asset]),
                    organisation_id: share.organisation_id,
                    user_id: share.user_id
                }
                let newCode = await helpers.getNewCode();
                if(newCode != undefined){
                    params.code = newCode;
                    let shareURL = await helpers.shareURL(params);
                    if(shareURL) {
                        res.status(200).send(shareURL);
                    } else {
                        res.status(500).send("Unable to create share url.");
                    }
                } else {
                    res.status(500).send("Unable to create share url.");
                }
            } else {
                res.status(500).send("Unable to create share url.");
            }
        } else {
            res.status(500).send("Unable to create share url.");
        }        
    }catch(e){
        console.log(e);
        res.status(500).send("Unable to create share url.");
    }
});

route.get("/share/:code/:type", async (req, res) =>{     
    const { code, type } = req.params;
    try {
        if( code != "") {
            const share = await helpers.getShareList(code, type);
            if( share != null ) {
                const query = `SELECT logo FROM db_business.organisation WHERE organisation_id IN (SELECT organisation_id FROM db_new_application.share WHERE code = :code)`
                
                const findCompanyLogo = await connection.applicationNew.query(query,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    logging: console.log,
                    replacements: {code},
                    plain: true
                })    
                console.log('findCompanyLogo', findCompanyLogo)            
                res.status(200).json({list: share, total_records: share.length, logo: findCompanyLogo != null ? findCompanyLogo.logo : ''})
            } else {
                res.status(500).send("Invalid url.");
            }
        } else {
            res.status(500).send("Invalid url.");
        }
    }catch(e){
        console.log(e);
        res.status(500).send("Invalid url.");
    }
});

route.get("/share/data/:asset/:code", async (req, res) =>{     
    const { asset, code } = req.params;
    try {
        if( code != "") {
            const share = await helpers.getShareData(code, asset);
            if( share != null ) {
                req.orgId = share.organisation_id;
                req.userId = share.user_id;
                if(share  != null ) {
                    req.params.patentNumber = asset;
                    helpers.generateJSON(req, res);
                }
            } else {
                res.status(500).send("Invalid url.");
            }
        } else {
            res.status(500).send("Invalid url.");
        }
    }catch(e){
        console.log(e);
        res.status(500).send("Invalid url.");
    }
});

route.get("/share/timeline/list/:code", async (req, res) =>{    
    try {
        const { code } = req.params;
        let list = [], groups = []
        if( code != "") {
            const getShareCodeData = await helpers.getShareDataByCodeWithAssets(code)
            if( getShareCodeData !== null ) {
                const getTransactions = getShareCodeData.transactions
                let transactions = []
                if(getTransactions !== null) {
                    transactions = JSON.parse(getTransactions) 
                }
                if(transactions.length == 0) {
                    if(getShareCodeData.share_lists.length > 0) {
                        const patents = [], applications = []
                        getShareCodeData.share_lists.forEach( item => {
                            if(item.type == 4) {
                                patents.push(item.asset)
                            }
                            if(item.type == 5) {
                                applications.push(item.asset)
                            }
                        })
                        if(patents.length > 0 || applications.length> 0) {
                            let query = "SELECT rf_id FROM documentid WHERE ";
                            let patentAdded = false
                            if(patents.length > 0) {
                                patentAdded = true
                                query += " grant_doc_num IN (:patents)"
                            }

                            if(applications.length > 0) {
                                if(patentAdded === true) {
                                    query += " OR ";
                                }
                                query += " appno_doc_num IN (:applications)  "
                            }

                            query += " GROUP BY rf_id  "

                            const rfIDsList = await connection.resources.query(query,{
                                type: connection.Sequelize.QueryTypes.SELECT,
                                raw: true,
                                logging: console.log,
                                replacements: {patents, applications},
                            })   
                            
                            if(rfIDsList.length > 0) {
                                rfIDsList.forEach( row => {
                                    transactions.push(row.rf_id)
                                })
                            }
                        }
                    }
                }

                if(transactions.length > 0) {
                    let query = "SELECT activity_parties_transactions.rf_id as id, exec_dt, assignor_and_assignee.name AS customerName, activity_id AS tab_id, (CASE WHEN (activity_id = 8 OR activity_id = 9 OR activity_id = 14) THEN 1 WHEN (activity_id = 5 OR activity_id = 11 OR activity_id = 12 OR activity_id = 13) THEN 2 WHEN (activity_id = 3 OR activity_id = 4) THEN 3 WHEN (activity_id = 1 OR activity_id = 2 OR activity_id = 6 OR activity_id = 7) THEN 4 WHEN (activity_id = 10) THEN 5 END) AS `group`, company_id AS `company`, COUNT(doc.appno_doc_num) AS totalAssets FROM activity_parties_transactions INNER JOIN db_uspto.documentid AS doc ON doc.rf_id = activity_parties_transactions.rf_id INNER JOIN db_uspto.assignor_and_assignee AS assignor_and_assignee ON assignor_and_assignee.assignor_and_assignee_id = activity_parties_transactions.assignor_and_assignee_id WHERE activity_parties_transactions.organisation_id = :organisation_id  AND activity_parties_transactions.rf_id IN (:rf_ids)  GROUP BY activity_parties_transactions.rf_id ORDER BY exec_dt DESC "

                    list =  await connection.applicationNew.query(query, {
                            type: connection.Sequelize.QueryTypes.SELECT,
                            raw: true,
                            logging: console.log,
                            replacements: {layoutID: 15, organisation_id: getShareCodeData.organisation_id, rf_ids: transactions },
                        }
                    );
                }
                res.status(200).json({list, groups});
            } else {
                res.status(400).send("Invalid code.");
            }
        } else {
            res.status(400).send("Invalid code.");
        }
    } catch (err) {
        console.log("SHARE TIMELINE=> ERROR", err)
        res.status(500).send("Internal server error.");
    }
})

route.get("/share/dashboard/list/:code", async (req, res) =>{  
    const { code } = req.params;
    try {
        if( code != "") {
            const data = await helpers.getShareList(code, 9);
            if(data != null) {
                res.status(200).json(JSON.parse(data.transactions));
            } else {
                res.status(402).send("Invalid code.");
            }
        }
    } catch (err) {
        console.log("SHARE DASHBOARD=> ERROR", err)
        res.status(500).send("Internal server error.");
    }
})

route.get("/share/illustrate/show/:code", async (req, res) =>{     
    const { code } = req.params;
    try {
        if( code != "") {
            const assetList = await helpers.getShareList(code, 1);
            if( assetList.length > 0 ) {
                const share = await helpers.getShareData(code, assetList[0].asset);
                if( share != null ) {
                    req.orgId = share.organisation_id;
                    req.userId = share.user_id;
                    if(share  != null ) {
                        req.params.asset = assetList[0].asset;
                        req.query.flag = assetList[0].asset_type == 0 ? 1 : 0;
                        console.log(req.query, assetList)
                        helpers.generateJSON(req, res);
                    }
                } else {
                    res.status(500).send("Invalid url.");
                }
            } else {
                res.status(500).send("Invalid url.");
            }
        } else {
            res.status(500).send("Invalid url.");
        }
    }catch(e){
        console.log(e);
        res.status(500).send("Invalid url.");
    }
});
module.exports = route;