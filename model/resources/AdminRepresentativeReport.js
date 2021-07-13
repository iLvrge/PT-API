const Sequelize = require("sequelize");

const connection = require("../../config/db.config");


const AdminRepresentativeReports = connection.resources.define('admin_representative_reports',{
    representative_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },        
    representative_name:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    no_of_assets:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    no_of_transactions:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    no_of_parties:{
        type: Sequelize.INTEGER,
        allowNull: false,
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true,
    tableName: 'admin_representative_reports'
});




module.exports = AdminRepresentativeReports;