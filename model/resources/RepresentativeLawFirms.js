const Sequelize = require("sequelize");

const connection = require("../../config/db.config");



const RepresentativeLawFirms = connection.resources.define('representative_law_firm',{
    representative_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },        
    representative_name:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    created_at:{
        type: Sequelize.DATE,
        allowNull: true,
    },
    updated_at:{
        type: Sequelize.DATE,
        allowNull: true,
    },
},
{
    underscored: true,
    timestamps: true,
    freezeTableName: true,
    tableName: 'representative_law_firm'
});




module.exports = RepresentativeLawFirms;