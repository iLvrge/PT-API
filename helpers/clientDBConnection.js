const Sequelize = require('sequelize');

const Op = Sequelize.Op;

const helpers = require("./helper");

let connect = async(req, res, next) => {
    console.log("connection");

    if(req.orgId) {
        
        if(req.orgId == 46) {
            req.orgId = 9
        }else if(req.orgId == 52) {
            req.orgId = 10;
        }

        const organisation = await helpers.findOrganisationbyID(req.orgId);

        if( organisation != null && organisation.organisation_id > 0) {
            /**
             * Make DB Connection
             */
            try{
                const newConnection = new Sequelize(organisation.org_db, organisation.org_usr, organisation.org_pass, {
                    host: organisation.org_host,
                    dialect: 'mysql',
                    operatorsAliases: Op,
                   
                    /*pool: {
                        max: 100,
                        min: 1,
                        acquire: 1000000,
                        idle: 5000
                    }*/
                });
                req.connection_db = newConnection;
            }catch( err ){
                console.log(err);
                console.log("Unable to connect with client DB....");
                req.connection_db = null;
            }
        } else {
            /**
             * No organistation exist.
             */
            req.connection_db = null;
        }
    } else {
        req.connection_db = null;
    }
    next();
}

const clientDBConnection = {};

clientDBConnection.connect = connect;  
  
module.exports = clientDBConnection;