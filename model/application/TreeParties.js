const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const TreePartiesCollections = require("./TreePartiesCollections");

const TreeParties = connection.application.define('tree_parties',{
    assignor_and_assignee_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
    },
    name:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    representative_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
    },
    representative_name:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    organisation_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
    },
    tab_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true,
    tableName: 'tree_parties'
});

TreeParties.hasMany(TreePartiesCollections, { foreignKey: 'assignor_and_assignee_id', as: 'collections' });

module.exports = TreeParties;