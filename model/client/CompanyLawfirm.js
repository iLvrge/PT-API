const Sequelize = require("sequelize");

const Representatives = require("./Representatives");


const CompanyLawfirm = {
    mainStructure: {
        company_lawfirm_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },		
        representative_id:{
            type: Sequelize.INTEGER,
			allowNull: false,
        },
        lawfirm_id:{
            type: Sequelize.INTEGER,
			allowNull: false,
        }
    },
    options: {
        underscored: true,
        timestamps: false,
        freezeTableName: true,
        tableName: 'company_lawfirm'
    }
}

module.exports = CompanyLawfirm;