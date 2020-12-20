const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const MaintainenceCode = require("./MaintainenceCode");

const EventMaintainenceFees = connection.maintainence.define('event_maintainence_fees',{
    grant_doc_num: {
        type: Sequelize.INTEGER,
        allowNull: true,
    },        
    appno_doc_num:{
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
    },
    entity_status:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    filling_date:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    grant_date:{
        type: Sequelize.DATE,
        allowNull: false,
    },
    event_date: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    event_code: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    event_icon: {
        type: Sequelize.INTEGER,
        allowNull: false,
    }
},
{
    underscored: true,
    timestamps: false,
    tableName: 'event_maintainence_fees',
    freezeTableName: true
});

EventMaintainenceFees.belongsTo(MaintainenceCode, { foreignKey: 'event_code', as: 'maintainence_code', otherKey: 'event_code' });

module.exports = EventMaintainenceFees;