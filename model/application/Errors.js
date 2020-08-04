const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const Documentids = require("./Documentids");

const Errors = connection.application.define('error',{
    appno_doc_num:{
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
    },
    organisation_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
    },
    type:{
        type: Sequelize.STRING,
        allowNull: true,
    }
    
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true,
    tableName: 'error'
});

Errors.hasMany(Documentids, { foreignKey: 'appno_doc_num', as: 'assets' });

module.exports = Errors;