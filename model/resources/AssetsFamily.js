const Sequelize = require("sequelize");

const connection = require("../../config/db.config");


const AssetsFamily = connection.resources.define('assets_family',{
          
    grant_doc_num:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    app_doc_num:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    family_id:{
        type: Sequelize.STRING,
        allowNull: true,
    },
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true,
    tableName: 'assets_family'
});




module.exports = AssetsFamily;