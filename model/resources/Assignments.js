const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

//const LawFirms = require("./LawFirms");

const RepresentativeTransactions = require("./RepresentativeTransactions");

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

//Assignments.belongsTo(LawFirms, { foreignKey: 'law_firm_id', as: 'lawfirm', otherKey: 'law_firm_id' });

Assignments.belongsTo(RepresentativeTransactions, { foreignKey: 'rf_id', as: 'representativetransaction', targetKey: 'rf_id' });

module.exports = Assignments;