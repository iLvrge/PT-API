const express = require("express"),

    route = express.Router(),

    authJWT = require("../../helpers/verifyJwtToken"),

    connection = require("../../config/db.config");


//require the Model
const PatentFamilyMember = require("../../model/resources/PatentFamilyMember");
const PatentFamilyRelation = require("../../model/resources/PatentFamilyRelation");
const Documentid = require("../../model/application/DocumentIds");

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
    
            const queryFamily = 'SELECT * FROM patent_family_member WHERE family_id = (SELECT family_id FROM patent_family_member WHERE patent_number = :patentNumber LIMIT 1)';
    
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

module.exports = route;