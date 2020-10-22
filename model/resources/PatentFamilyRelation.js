const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const PatentFamilyRelation = connection.resources.define('patent_family_relation',{
    id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },  
    patent_number:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    family_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },  
    filling_date:{
        type: Sequelize.DATEONLY,
        allowNull: false,
    },  
    type:{
        type: Sequelize.STRING,
        allowNull: false,
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true
});

module.exports = PatentFamilyRelation;