const Sequelize = require("sequelize");

const connection = require("../../config/db.config");


const Organisations = connection.business.define('organisation',{
    organisation_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },  
    uuid:{
        type: Sequelize.STRING.BINARY,
        allowNull: true,
    },       
    name:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    address:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    org_key:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    org_pass:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    org_host:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    org_db:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    org_usr:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    organisation_type:{
        type: Sequelize.INTEGER,
        allowNull: true,
    },
    team:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    phone_number:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    email_address:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    logo:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    linkedin_url:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    zipcode:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    city:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    state:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    country_id:{
        type: Sequelize.INTEGER,
        allowNull: true,
    },
    type:{
        type: Sequelize.INTEGER,
        allowNull: true,
    },
    subscribtion:{
        type: Sequelize.INTEGER,
        allowNull: true,
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
    timestamps: false,
    freezeTableName: true,
    tableName: 'organisation'
});

module.exports = Organisations;