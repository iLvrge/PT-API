const Sequelize = require("sequelize");

const Users = {
    mainStructure: {
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
            allowNull: true,
        },      
		email_address:{
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
            type: Sequelize.INTEGER
        },
        logo:{
            type: Sequelize.STRING,
            allowNull: true,
        },
        role_id:{
            type: Sequelize.INTEGER,
            allowNull: false,
        }, 
        status:{
            type: Sequelize.INTEGER,
            allowNull: true,
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
    options: {
        underscored: true,
        timestamps: true,
        freezeTableName: true,
        tableName: 'user'
    }
}

module.exports = Users;