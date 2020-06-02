const express = require("express");

const route = express.Router();

//require the Model

const Assets = require("../../model/application/Assets");

const authJWT = require("../../helpers/verifyJwtToken");

route.get("/assets", [authJWT.verifyToken], (req, res, next) => {

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

module.exports = route;