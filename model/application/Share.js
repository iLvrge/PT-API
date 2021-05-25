const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const ShareLists = require("./ShareLists");

const Share = connection.applicationNew.define('share',{
    share_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    code:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    organisation_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    user_id:{
        type: Sequelize.INTEGER
    },   
    created_at:{
        type: Sequelize.DATE,
        defaultValue: Sequelize.DATE
    },
    updated_at:{
        type: Sequelize.DATE,
        defaultValue: Sequelize.DATE
    }
},
{
    underscored: true,
    timestamps: true,
    freezeTableName: true,
    tableName: 'share'
});

Share.hasMany( ShareLists, { foreignKey: 'share_id'});


module.exports = Share;