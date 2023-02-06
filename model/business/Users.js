const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const Organisations = require("./Organisations");

const Roles = require("./Roles");

const UserCompanySelection = require("./UserCompanySelection");


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
    job_title:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    username:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    email_address:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    password:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    organisation_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
            model: Organisations,
            key: 'organisation_id',
        }
    },
    logo:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    role_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    type:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    status:{
        type: Sequelize.INTEGER,
        allowNull: true,
    },
    authentication_code:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    auth_token_expire:{
        type: Sequelize.DATE,
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
    timestamps: true,
    freezeTableName: true,
    tableName: 'user'
});



Users.belongsTo(Organisations, { foreignKey: 'organisation_id', as: 'organisation' });

Users.belongsTo(Roles, { foreignKey: 'role_id', as: 'role' });

Users.hasMany(UserCompanySelection, { foreignKey: 'user_id', as: 'usercompanyselection'})

module.exports = Users;