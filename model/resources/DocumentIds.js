const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const Documentids = connection.resources.define('documentid',{
    rf_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },        
    title:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    lang:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    appno_doc_num:{
        type: Sequelize.STRING,
        allowNull: false,
        primaryKey: true,
    },
    appno_date:{
        type: Sequelize.DATE,
        allowNull: false,
    },
    appno_country:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    pgpub_doc_num:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    pgpub_date:{
        type: Sequelize.DATE,
        allowNull: false,
    },
    pgpub_country:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    grant_doc_num:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    grant_date:{
        type: Sequelize.DATE,
        allowNull: true,
    },
    grant_country:{
        type: Sequelize.STRING,
        allowNull: false,
    }
},
{
    underscored: true,
    timestamps: false,
    tableName: 'documentid',
    freezeTableName: true
});


module.exports = Documentids;