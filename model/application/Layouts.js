const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const Templates = require("./Templates");

const Layouts = connection.applicationNew.define('layouts',{
    layout_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true
    },      
    layout_name:{
        type: Sequelize.STRING,
        allowNull: false,
    },
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true,
    tableName: 'layouts'
});

Layouts.hasMany(Templates, { foreignKey: 'layout_id', as: 'templates' });

module.exports = Layouts;