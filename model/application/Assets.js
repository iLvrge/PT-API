const Sequelize = require("sequelize");

const connection = require("../../config/db.config");


const Assets = connection.applicationNew.define('assets',{
    rf_id: {
        type: Sequelize.INTEGER,
    }, 
    appno_doc_num:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    grant_doc_num:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    appno_date:{
        type: Sequelize.DATE,
        allowNull: true,
    },
    grant_date:{
        type: Sequelize.DATE,
        allowNull: true,
    },  
    layout_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    company_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },     
    organisation_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true
});

module.exports = Assets;