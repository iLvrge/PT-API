const Sequelize = require("sequelize");

const connection = require("../../config/db.config");



const ShareLists = connection.applicationNew.define('share_list',{
    share_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    asset:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    type:{
        type: Sequelize.INTEGER,
        allowNull: false,
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true,
    tableName: 'share_list'
});

ShareLists.removeAttribute('id');


module.exports = ShareLists;