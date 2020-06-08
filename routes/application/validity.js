const express = require("express");

const route = express.Router();

//require the Model

const Validity = require("../../model/application/Validity");

const authJWT = require("../../helpers/verifyJwtToken");

route.get("/validity_counter", [authJWT.verifyToken], async(req, res, next) => {

    Validity.findAll({
        where: {organisation_id: req.orgId}
    })
    .then((list)=>{
        res.status(200).json(list);
    }).catch((err)=>{
        console.log(err);
        res.status(500).json({message: "Unable to retrieve assets validity"})
    });
});

module.exports = route;