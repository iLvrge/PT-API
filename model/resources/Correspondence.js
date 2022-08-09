const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const LawFirms = require("./LawFirms");

const List2 = require("./List2"); 


const Correspondence = connection.resources.define('correspondent',{
    rf_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
    },  
    cname: {
        type: Sequelize.STRING,
        allowNull: true,
    },
    caddress_1: {
        type: Sequelize.STRING,
        allowNull: true,
    },
    caddress_2: {
        type: Sequelize.STRING,
        allowNull: true,
    },
    caddress_5: {
        type: Sequelize.STRING,
        allowNull: true,
    },
    caddress_6: {
        type: Sequelize.STRING,
        allowNull: true,
    },
    caddress_3: {
        type: Sequelize.STRING,
        allowNull: true,
    },
    caddress_4: {
        type: Sequelize.STRING,
        allowNull: true,
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

Correspondence.belongsTo(LawFirms, { foreignKey: 'law_firm_id', as: 'lawfirm', otherKey: 'law_firm_id' });

Correspondence.belongsTo(List2, { foreignKey: 'rf_id', as: 'representativetransaction', targetKey: 'rf_id' });

module.exports = Correspondence;