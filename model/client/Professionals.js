const Sequelize = require("sequelize");

const Professionals = {
    mainStructure: {
        professional_id: {
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
		email_address:{
            type: Sequelize.INTEGER,
            allowNull: true,
        },
		telephone:{
            type: Sequelize.STRING,
            allowNull: true,
        },
        telephone1:{
            type: Sequelize.INTEGER
        },
        linkedin_url:{
            type: Sequelize.INTEGER
        },
        profile_logo:{
            type: Sequelize.STRING,
            allowNull: true,
        },
        firm_id:{
            type: Sequelize.STRING,
            allowNull: true,
        },
        type:{
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
        tableName: 'professional'
    }
}

module.exports = Professionals;