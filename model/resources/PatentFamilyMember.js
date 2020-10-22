const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const PatentFamilyMember = connection.resources.define('patent_family_member',{
    id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },  
    family_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },  
    publication_number:{
        type: Sequelize.STRING,
        allowNull: false,
    },  
    patent_number:{
        type: Sequelize.STRING,
        allowNull: false,
    },  
    pub_doc_number:{
        type: Sequelize.STRING,
        allowNull: false,
    },  
    publication_date:{
        type: Sequelize.DATEONLY,
        allowNull: false,
    },  
    priority_date:{
        type: Sequelize.DATEONLY,
        allowNull: false,
    },  
    publication_country:{
        type: Sequelize.STRING,
        allowNull: false,
    },  
    publication_kind:{
        type: Sequelize.STRING,
        allowNull: false,
    },  
    application_number:{
        type: Sequelize.STRING,
        allowNull: false,
    },  
    application_date:{
        type: Sequelize.DATEONLY,
        allowNull: false,
    },  
    application_country:{
        type: Sequelize.STRING,
        allowNull: false,
    },  
    application_kind:{
        type: Sequelize.STRING,
        allowNull: false,
    },  
    application_original:{
        type: Sequelize.STRING,
        allowNull: false,
    },  
    title:{
        type: Sequelize.STRING,
        allowNull: false,
    },  
    applicants:{
        type: Sequelize.STRING,
        allowNull: false,
    },  
    assignee:{
        type: Sequelize.STRING,
        allowNull: false,
    },  
    inventors:{
        type: Sequelize.STRING,
        allowNull: false,
    },  
    claims:{
        type: Sequelize.STRING,
        allowNull: false,
    },  
    abstracts:{
        type: Sequelize.STRING,
        allowNull: false,
    },  
    images:{
        type: Sequelize.STRING,
        allowNull: false,
    },  
    assigments:{
        type: Sequelize.STRING,
        allowNull: false,
    },  
    classifications:{
        type: Sequelize.STRING,
        allowNull: false,
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true
});

module.exports = PatentFamilyMember;