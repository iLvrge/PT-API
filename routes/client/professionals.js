const express = require("express");

const route = express.Router();
//require the Model

const Professionals = require("../../model/client/Professionals");

const Firms = require("../../model/client/Firms");

const authJWT = require("../../helpers/verifyJwtToken");


const clientDBConnection = require("../../helpers/clientDBConnection");
/**Get all professionals */
route.get("/", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const Professional = req.connection_db.define('Professionals', Professionals.mainStructure, Professionals.options);
            
            const Firm = req.connection_db.define('Firms', Firms.mainStructure, Firms.options);
            Professional.belongsTo(Firm, { foreignKey: 'firm_id', as: 'firms' });

            Professional.findAll({
                where: {type: 1},
                include:[
                    {
                        model: Firm,
                        as: 'firms',
                        attributes:['firm_name', ['firm_id', 'id']]
                    }
                ]
            })
            .then((list)=>{
                res.status(200).json(list);
            }).catch((err)=>{
                console.log(err);
                res.status(500).json({message: "Unable to retrieve professionals"})
            });
            //.finally(() => req.connection_db.close());
        } else {
            res.status(401).send("Unable to retrieve professionals");
        }
    } catch (err) {
        console.log(err);
        res.status(500).json({message: "Unable to retrieve professionals"})
    }
});
/**Add new professional */
route.post("/", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const Professional = req.connection_db.define('Professionals', Professionals.mainStructure, Professionals.options);
            
            const Firm = req.connection_db.define('Firms', Firms.mainStructure, Firms.options);

            const firmName = req.body.firm_name;

            let firmID = 0;

            let findFirm = await Firm.findOne({
                where: {firm_name: firmName}
            });
            if(findFirm != null && findFirm.firm_id > 0) {
                firmID = findFirm.firm_id;
            } else {
                findFirm = await Firm.create({firm_name: firmName});
                if(findFirm != null && findFirm.firm_id > 0) {
                    firmID = findFirm.firm_id;
                }
            }   

            if(firmID > 0) {
                let logo = '';
                const professionalData = {
                    first_name: req.body.first_name,
                    last_name: req.body.last_name,
                    email_address: req.body.email_address,
                    telephone: req.body.telephone,						
                    telephone1: req.body.telephone1,	
                    linkedin_url: req.body.linkedin_url,				
                    firm_id: firmID,
                    profile_logo: logo,
                    type: 1
                }
                const professional = await Professional.create(professionalData);
                console.log(professional);
                if(professional != null && professional.professional_id > 0) { 
                    console.log("Lawyer"+companyLawyer.id);
                    console.log("Lawyer created successfully");
                    res.status(200).json(professional);
                } else {
                    console.log("Error comes while create professional user");
                    res.status(402).send("Bad inputs.");
                }
            } else {
                console.log("Error while creating new firm");
                res.status(402).send("Bad inputs.");
            }            
        } else {
            console.log("Unable to connect to professional table");
            res.status(401).send("Error to connect professional table.");
        }
    } catch (err) {
        console.log( err );
        res.status(401).send("Error to connect professional table.");
    }
});

route.put("/:professional_id", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const Professional = req.connection_db.define('Professionals', Professionals.mainStructure, Professionals.options);
            Professional.findOne({
                where: {professional_id: req.params.professional_id}
            })
            .then( professional => {
                if( professional != null && professional.professional_id > 0){								
                    let data = professional.toJSON();
                        data.first_name = req.body.first_name;
                        data.last_name = req.body.last_name;
                        data.email_address = req.body.email_address;
                        data.linkedin_url = req.body.linkedin_url;
                        data.telephone = req.body.telephone;
                        data.telephone1 = req.body.telephone1;
                    
                        console.log(data);
                    (async () => {									
                        const u = await Professional.update(data,{where: {professional_id: data.professional_id}});
                        if(u) {
                            res.status(200).send("Updated successfully");
                        } else {
                            console.log("Error while updating professional user");
                            res.status(500).send("Unable to update professional user");
                        }
                    })();
                } else {
                    res.status(400).send("Invalid inputs");
                }
            })
        } else {
            console.log("Unable to connect to professional table");
            res.status(401).send("Error to connect user list.");
        }
    } catch (err) {
        console.log( err );
        res.status(401).send("Error to connect user list.");
    }
});    

route.delete("/:professional_id", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const Professional = req.connection_db.define('Professionals', Professionals.mainStructure, Professionals.options);
            Professional.findOne({
                where: {professional_id: req.params.professional_id}
            })
            .then( professional => {
                if( professional != null && professional.professional_id > 0){
                    Professional.destroy({
                        where: {professional_id: professional.professional_id},
                    })
                    .then( u => {
                        res.status(200).send("Professional deleted.");
                    })
                    .catch(err => {
                        console.log(err);
                        res.status(500).send("Unable to delete professional");
                    })
                } else {
                    res.status(400).send("Not found");
                }
            })
            .catch(err => {
                console.log(err);
                res.status(401).send("Not found");
            })
        } else {
            console.log("Unable to connect to professional table");
            res.status(401).send("Error to connect professional table.");
        }
    } catch (err) {
        console.log( err );
        res.status(401).send("Error to connect professional table.");
    }
});    		
module.exports = route;