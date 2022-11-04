const Sequelize = require("sequelize");

const connection = require("../../config/db.config");
const Organisations = require("../business/Organisations");
const Representatives = require("../resources/Representatives");



const ClientAddCompany = connection.applicationNew.define('client_add_company',{
    company_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    }, 
    name:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    organisation_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    representative_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
    },
    account_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
    },
    status:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    request_date: {
        type: Sequelize.DATE,
        allowNull: false,
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true,
    tableName: 'client_add_company',
});

ClientAddCompany.belongsTo(Representatives, { foreignKey: 'representative_id', as: 'representative' });
ClientAddCompany.belongsTo(Organisations, { foreignKey: 'organisation_id', as: 'organisation' });

module.exports = ClientAddCompany;