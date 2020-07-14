const Sequelize = require("sequelize");

const connection = require("../../config/db.config");


const Timelines = connection.application.define('timeline',{
    rf_id: {
        type: Sequelize.INTEGER,
        allowNull: false
    },  
    reel_no: {
        type: Sequelize.INTEGER,
        allowNull: false
    },
    frame_no: {
        type: Sequelize.INTEGER,
        allowNull: false
    },  
    record_dt:{
        type: Sequelize.DATE,
        allowNull: true,
    },    
    representative_id: {
        type: Sequelize.INTEGER,
        allowNull: false
    }, 
    type:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    original_name:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    assignor_and_assignee_id: {
        type: Sequelize.INTEGER,
        allowNull: false
    }, 
    exec_dt:{
        type: Sequelize.DATE,
        allowNull: true,
    },
    convey_ty:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    employer_assign: {
        type: Sequelize.INTEGER,
        allowNull: false
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true,
    tableName: 'representative'
});




module.exports = Timelines;