 
const Sequelize = require("sequelize");
const connection = require("../../config/db.config");


const LogUpdateCompanyAddress = connection.applicationNew.define('log_update_company_address',{
    id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    message:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    company_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    start_time:{
        type: Sequelize.DATE,
        defaultValue: Sequelize.DATE
    },
    end_time:{
        type: Sequelize.DATE,
        defaultValue: Sequelize.DATE,
        allowNull: true
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: false
});


// connection.applicationNew.sync()
//     .then(() => {
//         console.log('LogUpdate table has been created.');
//     })
//     .catch(error => {
//         console.error('Unable to create table : ', error);
//     });

module.exports = LogUpdateCompanyAddress;