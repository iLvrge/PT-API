const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const LawFirms = require('./LawFirms');

const RepresentativeLawyers = require('./RepresentativeLawyers');

const Lawyers = connection.resources.define('lawyer',{
    lawyer_id:{
        type: Sequelize.INTEGER,
        primaryKey: true,
    },
    law_firm_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },  
    name:{
        type: Sequelize.STRING,
        allowNull: false,
    }, 
    instances:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    representative_lawyer_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true
});

Lawyers.belongsTo(RepresentativeLawyers, { foreignKey: 'representative_lawyer_id', as: 'representativelawyers' });

Lawyers.belongsTo(LawFirms, { foreignKey: 'law_firm_id', as: 'lawfirms' });

module.exports = Lawyers;