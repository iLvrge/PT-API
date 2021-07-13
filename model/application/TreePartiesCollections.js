const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const Documentids = require("./DocumentIds");

const TreePartiesCollections = connection.application.define('tree_parties_collection',{
    rf_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
    },   
    assignor_and_assignee_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    assets_count:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    tab_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    exec_dt: {
        type: Sequelize.DATE,
        allowNull: true,
    },
    representative_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
    },     
    organisation_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
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