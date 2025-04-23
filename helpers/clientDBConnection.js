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
    
    if(req.orgId && (typeof check == 'undefined' || (typeof check != 'undefined' && check == 0))) {
        
        const organisation = await helpers.findOrganisationbyID(req.orgId);
        if( organisation != null && organisation.organisation_id > 0) {
            /**
             * Make DB Connection
             */
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
                        },
                        hooks: {
                            // seems not working i'll keep it but anyway
                            afterConnect: async (connection) => {
                                connection.on('error', function(err){
                                    console.log(err.stack);
                                });
                                // console.log('Connection to database established successfully.');
                            },
                        }
                        
                    });
                }
                req.connection_db = clientDB;
            }catch( err ){
                console.log(err);
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