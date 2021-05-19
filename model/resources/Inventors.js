const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const Inventors = connection.resources.define('inventors',{
    assignor_and_assignee_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
    }, 
},
{
    underscored: true,
    timestamps: false,
    tableName: 'inventors',
    freezeTableName: true
});


module.exports = Inventors;