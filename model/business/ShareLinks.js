const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const ShareLinks = connection.business.define('shareLinks',{
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
    subject:{
        type: Sequelize.STRING,
        allowNull: false,
    },	
    subject_type:{
        type: Sequelize.INTEGER,
        allowNull: false,
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
    tableName: 'share_link'
});

module.exports = ShareLinks;