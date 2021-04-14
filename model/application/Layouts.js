const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const Repository = require("./Repository");

const Layouts = connection.applicationNew.define('layouts',{
    layout_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
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

Layouts.hasMany(Repository, { foreignKey: 'layout_id', as: 'repositories' });

module.exports = Layouts;