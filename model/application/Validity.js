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
    representative_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    application:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    patent:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    encumbered:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    current_patent_year:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    previous_patent_year:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    current_application_year:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    previous_application_year:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    difference_patent:{
        type: Sequelize.DECIMAL,
        allowNull: false,
    },
    difference_application:{
        type: Sequelize.DECIMAL,
        allowNull: false,
    },
    list:{
        type: Sequelize.STRING,
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