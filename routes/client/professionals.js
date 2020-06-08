const express = require("express");

const route = express.Router();

const connection = require("../../config/db.config");

//require the Model

const Professionals = require("../../model/client/Professionals");

const Firms = require("../../model/client/Firms");

const authJWT = require("../../helpers/verifyJwtToken");


const clientDBConnection = require("../../helpers/clientDBConnection");

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
        }
    } catch (err) {

    }
});



module.exports = route;