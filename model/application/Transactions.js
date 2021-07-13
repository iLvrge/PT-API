const Sequelize = require("sequelize");

const connection = require("../../config/db.config");


const Transactions = connection.application.define('transaction',{
    transaction_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },        
    organisation_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    representative_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    buy:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    buy_patent:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    diff_buy_patent:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    sale:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    sale_patent:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    diff_sale_patent:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    security:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    security_patent:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    diff_security_patent:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    release:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    release_patent:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    diff_release_patent:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    license_in:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    license_in_patent:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    diff_license_in_patent:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    license_out:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    license_out_patent:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    diff_license_out_patent:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    transaction_list:{
        type: Sequelize.STRING,
        allowNull: false,
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true,
    tableName: 'transaction'
});

module.exports = Transactions;