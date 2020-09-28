const Sequelize = require("sequelize");

const connection = require("../../config/db.config");



const RepresentativeLawyers = connection.resources.define('representative_lawyer',{
    representative_lawyer_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },        
    representative_name:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    created_at:{
        type: Sequelize.DATE,
        allowNull: true,
    },
    updated_at:{
        type: Sequelize.DATE,
        allowNull: true,
    },
},
{
    underscored: true,
    timestamps: true,
    freezeTableName: true,
    tableName: 'representative_lawyer'
});




module.exports = RepresentativeLawyers;