const Sequelize = require("sequelize");

const Comments = {
    mainStructure: {
        comment_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },  
		activity_id:{
            type: Sequelize.INTEGER,
			allowNull: false,
        },
		user_id:{
            type: Sequelize.INTEGER,
			allowNull: true,
        },        
        comment:{
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
        tableName: 'comment'
    }
}

module.exports = Comments;