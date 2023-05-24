const Sequelize = require("sequelize");

const connection = require("../../config/db.config"); 

const ShareLinkDetails = connection.applicationNew.define('share_link_details',{
    share_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    ip_address:{
        type: Sequelize.STRING,
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
    tableName: 'share_link_details'
});

ShareLinkDetails.removeAttribute('id');


module.exports = ShareLinkDetails;