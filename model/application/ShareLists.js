const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const Share = require("./Share");

const ShareLists = connection.applicationNew.define('share_list',{
    share_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    asset:{
        type: Sequelize.STRING,
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
ShareLists.belongsTo(Share, { foreignKey: 'share_id', as: 'share' });

module.exports = ShareLists;