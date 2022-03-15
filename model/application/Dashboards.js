const Sequelize = require("sequelize");

const connection = require("../../config/db.config");


const Dashboards = connection.applicationNew.define('dashboard_items',{
    id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },    
    organisation_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    representative_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    }, 
    type:{
        type: Sequelize.INTEGER,
        allowNull: false,
    }, 
    title:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    sub_heading:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    number:{
        type: Sequelize.INTEGER,
        allowNull: false,
    }, 
    patent:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    application:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    rf_id: {
        type: Sequelize.INTEGER,
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true
});

module.exports = Dashboards;