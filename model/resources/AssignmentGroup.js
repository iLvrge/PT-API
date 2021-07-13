const Sequelize = require("sequelize");

const connection = require("../../config/db.config");


const AssignmentGroup = connection.resources.define('assignment_group',{
    id:{
        type: Sequelize.INTEGER,
        primaryKey: true,
    },  
    text:{
        type: Sequelize.STRING,
        allowNull: false,
    }, 
    reel_frame:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    counter:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    convey_ty:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    updated_convey_ty:{
        type: Sequelize.STRING,
        allowNull: false,
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true
});

module.exports = AssignmentGroup;