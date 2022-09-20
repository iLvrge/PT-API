const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const Representatives = require("./Representatives");


const PtabNames = connection.resources.define('ptab_parties',{
    id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name:{
        type: Sequelize.STRING,
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
    freezeTableName: true,
    tableName: 'ptab_parties'
});

PtabNames.belongsTo(Representatives, { foreignKey: 'representative_id', as: 'representative', targetKey: 'representative_id' });

module.exports = PtabNames;