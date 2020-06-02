const Sequelize = require('sequelize');

const Op = Sequelize.Op;

const application = new Sequelize('db_application', 'db_user_all', 'wDv%5tgn0O0kMkM', {
    host: '167.172.195.92',
    dialect: 'mysql',
    operatorsAliases: Op,
   
    pool: {
        max: 100,
        min: 1,
        acquire: 1000000,
        idle: 5000
    }
});

const resources = new Sequelize('db_uspto', 'db_user_all', 'wDv%5tgn0O0kMkM', {
    host: '167.172.195.92',
    dialect: 'mysql',
    operatorsAliases: Op,
   
    pool: {
        max: 100,
        min: 1,
        acquire: 1000000,
        idle: 5000
    }
});

const business = new Sequelize('db_business', 'db_user_all', 'wDv%5tgn0O0kMkM', {
    host: '167.172.195.92',
    dialect: 'mysql',
    operatorsAliases: Op,
   
    pool: {
        max: 100,
        min: 1,
        acquire: 1000000,
        idle: 5000
    }
});

const db = {};
 
db.Sequelize = Sequelize;

db.application = application;

db.resources = resources;

db.business = business;

module.exports = db;