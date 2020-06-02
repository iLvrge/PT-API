const express = require("express");

const route = express.Router();

//require the Model

const Transactions = require("../../model/application/Transactions");

const authJWT = require("../../helpers/verifyJwtToken");

route.get("/transactions", [authJWT.verifyToken], (req, res, next) => {

    Transactions.findAll({
        where: {organisation_id: req.orgId}
    })
    .then((list)=>{
        res.status(200).json(list);
    }).catch((err)=>{
        console.log(err);
        res.status(500).json({message: "Unable to retrieve transactions"})
    });
});

module.exports = route;