const Sequelize = require("sequelize");

const Documents = {
    mainStructure: {
        document_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },  
		user_id:{
            type: Sequelize.INTEGER,
			allowNull: false,
        },
		title:{
            type: Sequelize.INTEGER,
			allowNull: false,
        },
        subject:{
            type: Sequelize.STRING,
			allowNull: false,
        },
        comment:{
            type: Sequelize.STRING,
            allowNull: true,
        },
		type:{
            type: Sequelize.INTEGER,
			allowNull: true,
        },
        subject_type:{
            type: Sequelize.INTEGER,
			allowNull: true,
        },
		document_id:{
            type: Sequelize.INTEGER,
			allowNull: true,
        },
		complete:{
            type: Sequelize.INTEGER,
            allowNull: true,
        },
		share_url:{
            type: Sequelize.STRING,
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
        tableName: 'document'
    }
}



module.exports = Activities;