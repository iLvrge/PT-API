const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const RepresentativeLawFirms = require('./RepresentativeLawFirms');

//const Assignments = require('./Assignments');

const LawFirms = connection.resources.define('law_firm',{
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

LawFirms.belongsTo(RepresentativeLawFirms, { foreignKey: 'representative_id', as: 'representativelawfirm' });

//LawFirms.belongsTo(Assignments, { foreignKey: 'law_firm_id', as: 'assignment' });

module.exports = LawFirms;