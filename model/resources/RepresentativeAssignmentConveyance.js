const Sequelize = require("sequelize");

const connection = require("../../config/db.config");


const RepresentativeAssignmentConveyance = connection.resources.define('representative_assignment_conveyance',{
    rf_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },  
    convey_ty:{
        type: Sequelize.STRING,
        allowNull: false,
    }, 
    employer_assign:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    flag:{
        type: Sequelize.INTEGER,
        allowNull: false,
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true
});

module.exports = RepresentativeAssignmentConveyance;