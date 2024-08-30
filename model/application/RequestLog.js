 
const Sequelize = require("sequelize");
const connection = require("../../config/db.config");


const RequestLog = connection.applicationNew.define('RequestLog', {
    method: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    url: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    body: {
        type: Sequelize.JSON,
        allowNull: true,
    },
    headers: {
        type: Sequelize.JSON,
        allowNull: true,
    },
    status: {
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    responseBody: {
        type: Sequelize.JSON,
        allowNull: true,
    },
    duration: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    timestamp: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
    },
});


// connection.applicationNew.sync()
//     .then(() => {
//         console.log('RequestLog table has been created.');
//     })
//     .catch(error => {
//         console.error('Unable to create table : ', error);
//     });

module.exports = RequestLog;