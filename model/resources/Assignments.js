const Sequelize = require("sequelize");

const connection = require("../../config/db.config");


const Assignments = connection.resources.define('assignment',{
    rf_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
    },  
    file_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
    },
    cname: {
        type: Sequelize.STRING,
        primaryKey: true,
    },
    caddress_1: {
        type: Sequelize.STRING,
        primaryKey: true,
    },
    caddress_2: {
        type: Sequelize.STRING,
        primaryKey: true,
    },
    caddress_3: {
        type: Sequelize.STRING,
        primaryKey: true,
    },
    caddress_4: {
        type: Sequelize.STRING,
        primaryKey: true,
    }, 
    reel_no:{
        type: Sequelize.INTEGER,
        allowNull: false,
    }, 
    frame_no:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    convey_text:{
        type: Sequelize.STRING,
        allowNull: false,
    }, 
    record_dt:{
        type: Sequelize.DATE,
        allowNull: false,
    }, 
    last_update_dt:{
        type: Sequelize.DATE,
        allowNull: false,
    }, 
    page_count:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    purge_in:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    law_firm_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true
});

module.exports = Assignments;