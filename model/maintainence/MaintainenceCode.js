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
    },        
    template:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },    
    template_string:{
        type: Sequelize.STRING,
        allowNull: false,
    },    
    icon1:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },        
    icon2:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },        
    icon3:{
        type: Sequelize.INTEGER,
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