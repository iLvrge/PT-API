const Sequelize = require("sequelize");

const connection = require("../../config/db.config");


const RepresentativeAddress = connection.resources.define('representative_address',{
    id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },        
    representative_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
    },        
    rf_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    assignor_and_assignee_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    created_at:{
        type: Sequelize.DATE,
        allowNull: true,
    },
    updated_at:{
        type: Sequelize.DATE,
        allowNull: true,
    },
},
{
    underscored: true,
    timestamps: true,
    freezeTableName: true,
    tableName: 'representative_address'
});




module.exports = RepresentativeAddress;