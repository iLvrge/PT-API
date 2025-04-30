const Sequelize = require('sequelize');

const Op = Sequelize.Op;

const helpers = require("./helper");
const { getOrgConnection } = require('./dbConnectionCache');
 
const connect = async (req, res, next) => {
    const { check } = req.body;

    if (req.orgId && (typeof check === 'undefined' || check === 0)) {
        try {
            const sequelize = await getOrgConnection(req.orgId);

            if (!sequelize) {
                req.connection_db = null;
                return next(); // not an error necessarily — org might not exist
            }

            // Set connected at timestamp for cleanup later
            sequelize.connectedAt = Date.now();

            req.connection_db = sequelize;
        } catch (err) {
            console.error('Error connecting to org DB:', err);
            req.connection_db = null;
        }
    } else {
        req.connection_db = null;
    }

    next();
};

const connectOnFly = async (orgID) => {
    try {
        const sequelize = await getOrgConnection(orgID);

        if (!sequelize) {
            console.log(`No connection created for orgID: ${orgID}`);
            return null;
        }

        return sequelize;
    } catch (err) {
        console.error(`Error in connectOnFly for orgID ${orgID}:`, err);
        return null;
    }
};

const clientDBConnection = {};

clientDBConnection.connect = connect; 
clientDBConnection.connectOnFly = connectOnFly; 
clientDBConnection.Sequelize = Sequelize;
clientDBConnection.Op = Op; 
  
module.exports = clientDBConnection;