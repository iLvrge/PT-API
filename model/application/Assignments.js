const Sequelize = require("sequelize");

const connection = require("../../config/db.config");


const Assignments = connection.application.define('assignments',{
    rf_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },        
    file_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    cname:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    caddress_1:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    caddress_2:{
        type: Sequelize.DATE,
        allowNull: false,
    },
    caddress_3:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    caddress_4:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    reel_no:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    frame_no:{
        type: Sequelize.INTEGER,
        allowNull: true,
    },
    convey_text:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    record_dt:{
        type: Sequelize.DATE,
        allowNull: true,
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
    tableName: 'assignment',
    freezeTableName: true
});

module.exports = Assignments;