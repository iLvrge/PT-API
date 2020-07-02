const Sequelize = require("sequelize");

const connection = require("../../config/db.config");


const Updates = connection.application.define('update',{
    update_id: {
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
    weekly_transactions:{
        type: Sequelize.INTEGER,
        allowNull: true,
    },
    weekly_applications:{
        type: Sequelize.INTEGER,
        allowNull: true,
    },
    monthly_transactions:{
        type: Sequelize.INTEGER,
        allowNull: true,
    },
    montly_applications:{
        type: Sequelize.INTEGER,
        allowNull: true,
    },
    quaterly_transactions:{
        type: Sequelize.INTEGER,
        allowNull: true,
    },
    quaterly_applications:{
        type: Sequelize.INTEGER,
        allowNull: true,
    },
    update_transaction_list:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    update_liupdate_application_listst:{
        type: Sequelize.STRING,
        allowNull: false,
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true,
    tableName: 'update'
});

module.exports = Updates;