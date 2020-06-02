const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const Roles = require("./Roles");

const Organisations = require("./Organisations");

const Users = connection.business.define('user',{
    user_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },        
    first_name:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    last_name:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    username:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    email_address:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    password:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    linkedin_url:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    job_title:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    telephone:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    telephone1:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    logo:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    role_id:{
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
            model: Roles,
            key: 'role_id',
        }
    },
    type:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    organisation_id:{
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
            model: Organisations,
            key: 'organisation_id',
        }
    },
    authentication_code:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    auth_token_expire:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    status:{
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
    tableName: 'user'
});

Users.belongsTo(Roles, { foreignKey: 'role_id', as: 'role' });
Users.belongsTo(Organisations, { foreignKey: 'organisation_id', as: 'organisation' });

module.exports = Users;