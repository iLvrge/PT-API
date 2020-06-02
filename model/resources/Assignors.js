const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const Representatives = require("./Representatives");

const Assignors = connection.resources.define('assignor',{
    rf_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },  
    or_name:{
        type: Sequelize.STRING,
        allowNull: false,
    }, 
    exec_dt:{
        type: Sequelize.DATE,
        allowNull: false,
    },
    ack_dt:{
        type: Sequelize.DATE,
        allowNull: false,
    },
    representative_id:{
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
            model: Representatives,
            key: 'representative_id',
        }
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true
});

module.exports = Assignors;