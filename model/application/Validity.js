const Sequelize = require("sequelize");

const connection = require("../../config/db.config");


const Validity = connection.application.define('validity',{
    validity_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },        
    organisation_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    validity_type:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    validity_count:{
        type: Sequelize.INTEGER,
        allowNull: false,
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true,
    tableName: 'validity'
});

module.exports = Validity;