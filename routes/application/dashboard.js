const express = require("express");

const route = express.Router();

const connection = require("../../config/db.config");

const Dashboards = require("../../model/application/Dashboards");


route.get("/", [authJWT.verifyToken], async(req, res, next) => {
    let {companies} = req.query
    if(typeof companies !== '') {
        companies = JSON.parse(companies)
    }
    let where = {organisation_id: req.orgId}
    if(companies.length > 0) {
        where.representative_id = companies
    }

    Dashboards.findAll({
        where
    })
    .then((list)=>{
        res.status(200).json(list);
    }).catch((err)=>{
        console.log(err);
        res.status(500).json({message: "Unable to retrieve assets"})
    });
});

module.exports = route;