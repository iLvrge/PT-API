const express = require("express"),

    route = express.Router(),

    authJWT = require("../../helpers/verifyJwtToken"),

    connection = require("../../config/db.config"),

    epo = require('../../helpers/epo.js'),

    xml2js = require('xml2js');


//require the Model
const PatentFamilyMember = require("../../model/resources/PatentFamilyMember");
const PatentFamilyRelation = require("../../model/resources/PatentFamilyRelation");
const Documentid = require("../../model/application/DocumentIds");

route.get('/family/list/:grantNumber', [authJWT.verifyToken], async (req, res) =>{
    const token = await epo.readToken('HedCET')
    
    if(token !== 'undefined' && token != '') {
        let getFamilyData = await epo.runUrl(token,'family','publication','docdb',`US${req.params.grantNumber}B1`);
        if( !getFamilyData ) {
            getFamilyData = await epo.runUrl(token,'family','publication','docdb',`US${req.params.grantNumber}B2`);
        }
        if( getFamilyData ) {
            const parser = new xml2js.Parser
            const result = await new Promise((resolve, reject) => parser.parseString(getFamilyData, (err, result) => {
                if (err){
                    reject(err);
                } else {
                    resolve(result);
                }
            }));
            console.log('result', JSON.stringify(result))
        }
    }
})

route.get("/family/:applicationNumber", [authJWT.verifyToken], async (req, res) =>{  

    try{
        const applicationNumber = req.params.applicationNumber;

        /* const applicationNumber = '09775636'; */

        let getFamily = [];
    
        const findPatent = await Documentid.findOne({
            attributes: ['rf_id', 'grant_doc_num'],
            where: {appno_doc_num: applicationNumber}
        })
    
        if(findPatent != null && findPatent.rf_id > 0 && findPatent.grant_doc_num != null && findPatent.grant_doc_num != '') {
            /**
            * Custom SubQuery
            */
    
            const queryFamily = 'SELECT * FROM patent_family_member WHERE family_id = (SELECT family_id FROM patent_family_member WHERE patent_number = :patentNumber AND family_id > 0 LIMIT 1) OR (patent_number = :patentNumber AND family_id = 0)';
    
            getFamily = await connection.resources.query(queryFamily,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: {patentNumber: findPatent.grant_doc_num}
            });
        }
        res.status(200).json(getFamily);
    } catch( err ) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
});


route.get("/family/single/:applicationNumber", [authJWT.verifyToken], async (req, res) =>{  

    try{
        const applicationNumber = req.params.applicationNumber;

        /* const applicationNumber = '09775636'; */

        let getFamily = [];
    
        const findPatent = await Documentid.findOne({
            attributes: ['rf_id', 'grant_doc_num'],
            where: {appno_doc_num: applicationNumber}
        })
    
        if(findPatent != null && findPatent.rf_id > 0 && findPatent.grant_doc_num != null && findPatent.grant_doc_num != '') {
            /**
            * Custom SubQuery
            */
    
            const queryFamily = 'SELECT * FROM patent_family_member WHERE family_id = (SELECT family_id FROM patent_family_member WHERE patent_number = :patentNumber LIMIT 1) AND application_number = :applicationNumber';
    
            getFamily = await connection.resources.query(queryFamily,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: { patentNumber: findPatent.grant_doc_num, applicationNumber},
                plain: true
            });
        }
        res.status(200).json(getFamily);
    } catch( err ) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
});

module.exports = route;