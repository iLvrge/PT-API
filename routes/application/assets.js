const express = require("express");

const route = express.Router();

const connection = require("../../config/db.config");

//require the Model

const Assets = require("../../model/application/Assets");

const Documentids = require("../../model/application/DocumentIds");

const Assignments = require("../../model/application/Assignments");

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



route.get("/assets/:patentNumber/:type/outsource",[authJWT.verifyToken], async (req, res) =>{        
    let patentNumber = req.params.patentNumber, type = req.params.type;
    
    if(type == 1) {
        Documentids.findOne({
            where:{[connection.Op.or]:[{grant_doc_num: patentNumber},{appno_doc_num: patentNumber}]},
            attributes:['rf_id',['grant_doc_num','number'], ['appno_doc_num','application']],
        })
        .then(p => {
            if(p != null) {
                let type = "patNum";
                console.log('%j',p); 
                let data = p.toJSON();
                if(patentNumber == data.application){
                    patentNumber = data.application;
                    type = "applNum";
                }      
                res.status(200).json({url:`https://assignment.uspto.gov/patent/index.html#/patent/search/resultAbstract?id=${patentNumber}&type=${type}`});
            } else {
                res.status(200).send("");
            }        
        }).catch(err => {
            console.log(err);
            res.status(400).send("Invalid number");
        })
    } else if(type == 0){
        Assignments.findOne({
            where:{rf_id: patentNumber},
            attributes:['reel_no', 'frame_no']
        })
        .then( a => {
            if(a != null) {
                let frame = a.frame_no.toString();
                frame = frame.length == 1 ? '000'+frame : frame.length == 2 ? '00'+frame : frame.length == 3 ? '0'+frame : frame;
                let searchInput = `${a.reel_no}-${frame}`;
                let ID = `${a.reel_no}-${a.frame_no}`;
                res.status(200).json({url:`https://assignment.uspto.gov/patent/index.html#/patent/search/resultAssignment?searchInput=${searchInput}&id=${ID}`});
            } else {
                res.status(200).send("");
            }
        })
    }    
});

route.post("/assets/search",[authJWT.verifyToken], async (req, res) => {        
    console.log(req.body.value);
})

module.exports = route;