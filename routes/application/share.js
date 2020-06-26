const express = require("express");

const route = express.Router();

const authJWT = require("../../helpers/verifyJwtToken");

const helpers = require("../../helpers/helper");

route.post("/share", [authJWT.verifyToken], async (req, res) =>{     
    const params = req.body;
            params.organisation_id = req.orgId;
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

module.exports = route;