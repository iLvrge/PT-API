const Sequelize = require('sequelize');

const Op = Sequelize.Op;

const helpers = require("./helper");

const connect = async(req, res, next) => {
    let { check } = req.body
    console.log("clientDBConnection connect", check);
    if(req.orgId && (typeof check == 'undefined' || (typeof check != 'undefined' && check == 0))) {
        
        console.log('Going to connect with client DB')

        const organisation = await helpers.findOrganisationbyID(req.orgId);

        console.log('Got details of client account')

        if( organisation != null && organisation.organisation_id > 0) {
            /**
             * Make DB Connection
             */
            console.log('Got creating client DB connection')
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
                console.log('clientDBConnection Connected.........')
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

const connectOnFly = async(orgID) => {
    let newConnection = null
    try {  
        if(orgID > 0) { 
    
            const organisation = await helpers.findOrganisationbyID(orgID);
    
            if( organisation != null && organisation.organisation_id > 0) {
                /**
                 * Make DB Connection
                 */ 
                newConnection = await new Sequelize(organisation.org_db, organisation.org_usr, organisation.org_pass, {
                    host: organisation.org_host,
                    dialect: 'mysql',
                    /*pool: {
                        max: 100,
                        min: 1,
                        acquire: 1000000,
                        idle: 5000
                    }*/
                }); 
            }   
        }
    } catch (err) {
        console.log('Error in connectOnFly', err)
    }
    return newConnection
}

const clientDBConnection = {};

clientDBConnection.connect = connect; 
clientDBConnection.connectOnFly = connectOnFly; 
clientDBConnection.Sequelize = Sequelize;
clientDBConnection.Op = Op;
  
module.exports = clientDBConnection;