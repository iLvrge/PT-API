const Sequelize = require('sequelize');

const Op = Sequelize.Op;

const application = new Sequelize('db_application', 'db_user_all', 'wDv%5tgn0O0kMkM', {
    host: '167.172.195.92',
    dialect: 'mysql',
    operatorsAliases: Op,
   
    /*pool: {
        max: 100,
        min: 1,
        acquire: 1000000,
        idle: 5000
    }*/
});

const resources = new Sequelize('db_uspto', 'db_user_all', 'wDv%5tgn0O0kMkM', {
    host: '167.172.195.92',
    dialect: 'mysql',
    operatorsAliases: Op,
   
    /*pool: {
        max: 100,
        min: 1,
        acquire: 1000000,
        idle: 5000
    }*/
});

const business = new Sequelize('db_business', 'db_user_all', 'wDv%5tgn0O0kMkM', {
    host: '167.172.195.92',
    dialect: 'mysql',
    operatorsAliases: Op,
   
    /*pool: {
        max: 100,
        min: 1,
        acquire: 1000000,
        idle: 5000
    }*/
});

const config = {
  'secret': process.env.SECRET || 'p@nt3nt8@60',
  'pusher_appId': '938985',
  'pusher_key': '3252bb191d77e92ddb3c',
  'pusher_secret': '2a3dd823cd1abcd45c71',
  'pusher_cluster': 'us3',
  'pusher_encrypted': true,
  'pusher_channel': 'patentrack-channel',
  'pusher_event': 'patentrack-event',
}
const db = {};
 
db.Sequelize = Sequelize;

db.Op = Op;

db.application = application;

db.resources = resources;

db.business = business;

db.config = config;

module.exports = db;