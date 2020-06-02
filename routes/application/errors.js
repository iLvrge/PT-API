const express = require("express");

const route = express.Router();

//require the Model

const Errors = require("../../model/application/Errors");

const authJWT = require("../../helpers/verifyJwtToken");

route.get("/errors", [authJWT.verifyToken], (req, res, next) => {

    Errors.findAll({
        where: {organisation_id: req.orgId}
    })
    .then((list)=>{
        res.status(200).json(list);
    }).catch((err)=>{
        console.log(err);
        res.status(500).json({message: "Unable to retrieve errors"})
    });
});

module.exports = route;