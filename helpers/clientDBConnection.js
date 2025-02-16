const Sequelize = require('sequelize');

const Op = Sequelize.Op;

const helpers = require("./helper");

let clientDB; // Store the client DB connection

const process = require('process');

process.on('exit', (code) => {
    if(clientDB) {
        console.log(`Closing client DB connection`);
        clientDB.close();
    }
});

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
                if (!clientDB) {
                    clientDB = new Sequelize(organisation.org_db, organisation.org_usr, organisation.org_pass, {
                        host: organisation.org_host,
                        dialect: 'mysql',
                        operatorsAliases: Op,
                        pool: {
                            max: 100,
                            min: 1,
                            acquire: 30000, // 30 seconds
                            idle: 10000 // 10 seconds
                        }
                    });
                }
                req.connection_db = clientDB;
                console.log('clientDBConnection Connected.........')
            }catch( err ){
                console.log(err);
                console.log("Unable to connect with client DB....");
                req.connection_db = null;
                clientDB = null; // Reset connection on error
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
                if (!clientDB) {
                    clientDB = new Sequelize(organisation.org_db, organisation.org_usr, organisation.org_pass, {
                        host: organisation.org_host,
                        dialect: 'mysql',
                        pool: {
                            max: 100,
                            min: 1,
                            acquire: 30000, // 30 seconds
                            idle: 10000 // 10 seconds
                        }
                    });
                }
                newConnection = clientDB;
            }   
        }
    } catch (err) {
        console.log('Error in connectOnFly', err)
        newConnection = null;
    }
    return newConnection
}

const clientDBConnection = {};

clientDBConnection.connect = connect; 
clientDBConnection.connectOnFly = connectOnFly; 
clientDBConnection.Sequelize = Sequelize;
clientDBConnection.Op = Op;
clientDBConnection.clientDB = clientDB;
  
module.exports = clientDBConnection;