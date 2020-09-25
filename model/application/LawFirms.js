const Sequelize = require("sequelize");

const connection = require("../../config/db.config");


const LawFirm = connection.resources.define('law_firm',{
    law_firm_id:{
        type: Sequelize.INTEGER,
        primaryKey: true,
    },  
    name:{
        type: Sequelize.STRING,
        allowNull: false,
    }, 
    instances:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    representative_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true
});

module.exports = LawFirm;