const express = require("express");

const route = express.Router();

const connection = require("../../config/db.config");

//require the Model

const Assets = require("../../model/application/Assets");

const Documentids = require("../../model/application/DocumentIds");

const authJWT = require("../../helpers/verifyJwtToken");

const helpers = require("../../helpers/helper");

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

/*6*/
	/**
     * Get patent JSON data
     */
route.get("/assets/:patentNumber",[authJWT.verifyToken], async (req, res) =>{        
    let patentNumber = req.params.patentNumber;
    Documentids.findAll({
        where:{[connection.Op.or]:[{grant_doc_num: patentNumber},{appno_doc_num: patentNumber}]},
        attributes:['rf_id',['grant_doc_num','number'], ['appno_doc_num','application']],
    })
    .then(p => {
        console.log("CHECKING PATENT");
        console.log('%j',p);     
        if(p != null && p.length > 0){
            console.log(p); 
            helpers.generateJSON(req, res);
        } else {
            res.status(400).send("Invalid number");
        }       
    }).catch(err => {
        console.log(err);
        res.status(400).send("Invalid number");
    })
});

route.get("/assets/:patentNumber/outsource",[authJWT.verifyToken], async (req, res) =>{        
    let patentNumber = req.params.patentNumber;
    Documentids.findOne({
        where:{[connection.Op.or]:[{grant_doc_num: patentNumber},{appno_doc_num: patentNumber}]},
        attributes:['rf_id',['grant_doc_num','number'], ['appno_doc_num','application']],
    })
    .then(p => {
        let type = "patNum";
        console.log('%j',p); 
        let data = p.toJSON();
        if(data.number == null || data.number == ''){
            patentNumber = data.application;
            type = "applNum";
        }      
        res.status(200).json({url:`https://assignment.uspto.gov/patent/index.html#/patent/search/resultAbstract?id=${patentNumber}&type=${type}`});
    }).catch(err => {
        console.log(err);
        res.status(400).send("Invalid number");
    })
});

module.exports = route;