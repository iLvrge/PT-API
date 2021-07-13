const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const UserActivitySelection = connection.business.define('user_activity_selection',{
    user_activity_selection_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    user_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    organisation_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    activity_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true,
    tableName: 'user_activity_selection'
});
 
module.exports = UserActivitySelection;