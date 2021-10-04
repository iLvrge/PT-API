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

route.get("/share/illustrate/show/:code", async (req, res) =>{     
    const { code } = req.params;
    try {
        if( code != "") {
            const assetList = await helpers.getShareList(code, 0);
            if( assetList.length > 0 ) {
                const share = await helpers.getShareData(code, assetList[0].asset);
                if( share != null ) {
                    req.orgId = share.organisation_id;
                    req.userId = share.user_id;
                    if(share  != null ) {
                        req.params.patentNumber = assetList[0].asset;
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