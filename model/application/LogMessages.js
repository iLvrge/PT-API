const Sequelize = require("sequelize");

const connection = require("../../config/db.config");


const LogMessages = connection.applicationNew.define('log_messages',{
    id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    message:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    organisation_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    start_time:{
        type: Sequelize.DATE,
        defaultValue: Sequelize.DATE
    },
    end_time:{
        type: Sequelize.DATE,
        defaultValue: Sequelize.DATE
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: false
});

module.exports = LogMessages;