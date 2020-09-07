const express = require("express");

const route = express.Router();

const authJWT = require("../../helpers/verifyJwtToken");

const helpers = require("../../helpers/helper");

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

route.get("/share/:code", async (req, res) =>{     
    const shareCode = req.params.code;
    try {
        if( shareCode != "") {
            const share = await helpers.getShareData(shareCode);
            if( share != null ) {
                req.orgId = share.organisation_id;
                req.userId = share.user_id;
                if(share.subject != "" && share.subject_type == 2) {
                    req.params.patentNumber = share.subject;
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

module.exports = route;