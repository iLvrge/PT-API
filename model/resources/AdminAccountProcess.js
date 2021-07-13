const Sequelize = require("sequelize");

const connection = require("../../config/db.config");


const AdminAccountProcess = connection.resources.define('admin_account_process',{
    process_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    }, 
    organisation_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    button_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    status:{
        type: Sequelize.INTEGER,
        allowNull: false,
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true,
    tableName: 'admin_account_process'
});




module.exports = AdminAccountProcess;