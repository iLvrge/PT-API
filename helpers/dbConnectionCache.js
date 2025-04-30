// dbConnectionCache.js
const Sequelize = require('sequelize');
const Op = Sequelize.Op;

const connectionCache = {};

/**
 * Get or create a Sequelize connection for an orgID
 */
const getOrgConnection = async (orgID) => {
    if (!orgID || orgID <= 0) return null;

    const now = Date.now();

    // Update timestamp if already exists
    if (connectionCache[orgID]) {
        connectionCache[orgID].lastUsed = now;
        return connectionCache[orgID];
    }

    try {
        const organisation = await helpers.findOrganisationbyID(orgID);
        if (!organisation || organisation.organisation_id <= 0) {
            return null;
        }

        const sequelize = new Sequelize(
            organisation.org_db,
            organisation.org_usr,
            organisation.org_pass,
            {
                host: organisation.org_host,
                dialect: 'mysql',
                operatorsAliases: Op,
                pool: {
                    max: 5,   // Reduced from 100 to prevent overloading DB
                    min: 0,
                    acquire: 30000,
                    idle: 10000,
                },
                logging: false
            }
        );

        // Test connection
        await sequelize.authenticate();

        // Add metadata
        sequelize.lastUsed = now;

        // Store in cache
        connectionCache[orgID] = sequelize;

        return sequelize;
    } catch (err) {
        console.error(`Failed to connect to org ${orgID}:`, err.message);
        return null;
    }
};

/**
 * Optional: Clean up stale connections after some TTL
 */
const cleanupConnections = (ttl = 5 * 60 * 1000) => {
    const now = Date.now();
    Object.keys(connectionCache).forEach(async (orgID) => {
        const sequelize = connectionCache[orgID];

        if (sequelize?.lastUsed && now - sequelize.lastUsed > ttl) {
            try {
                await sequelize.close(); // Closes all pooled connections
                delete connectionCache[orgID];
                console.log(`[Cleanup] Closed idle connection for orgID: ${orgID}`);
            } catch (err) {
                console.error(`[Cleanup] Failed to close connection for orgID: ${orgID}`, err);
            }
        }
    });
};

module.exports = { getOrgConnection, cleanupConnections };