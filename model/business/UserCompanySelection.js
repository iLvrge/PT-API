const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const UserCompanySelection = connection.business.define('user_company_selection',{
    user_company_selection_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    user_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    organisation_id:{
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
    freezeTableName: true,
    tableName: 'user_company_selection'
});
 
module.exports = UserCompanySelection;