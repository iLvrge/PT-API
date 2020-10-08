const Sequelize = require("sequelize");

const connection = require("../../config/db.config");


const EventMaintainenceCode = connection.maintainence.define('event_maintainence_code',{
    event_code: {
        type: Sequelize.STRING,
        allowNull: false,
        primaryKey: true,
    },        
    event_description:{
        type: Sequelize.STRING,
        allowNull: false,
    }
},
{
    underscored: true,
    timestamps: false,
    tableName: 'event_maintainence_code',
    freezeTableName: true
});




module.exports = EventMaintainenceCode;