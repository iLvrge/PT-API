const Sequelize = require("sequelize");

const connection = require("../../config/db.config");


const CitingPatentWithAssignee = connection.applicationNew.define('citing_patents_with_assignee',{
    citing_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    }, 
    patent_number:{
        type: Sequelize.STRING,
        allowNull: false,
    }, 
    citing_patent_number:{
        type: Sequelize.STRING,
        allowNull: false,
    }, 
    app_date:{
        type: Sequelize.DATE,
        allowNull: true,
    }, 
    assignee_organization:{
        type: Sequelize.STRING,
        allowNull: false,
    }, 
    assignee_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true,
    tableName: 'citing_patents_with_assignee'
});

module.exports = CitingPatentWithAssignee;