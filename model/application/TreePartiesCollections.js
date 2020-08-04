const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const TreeParties = require("./TreeParties");

const Documentids = require("./Documentids");

const TreePartiesCollections = connection.application.define('tree_parties_collection',{
    rf_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
    },        
    assignor_and_assignee_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
    },
    tab_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    }
},
{
    underscored: true,
    primaryKey: false,
    timestamps: false,
    freezeTableName: true,
    tableName: 'tree_parties_collection'
});

TreePartiesCollections.hasMany(Documentids, { foreignKey: 'rf_id', as: 'assets' });
module.exports = TreePartiesCollections;