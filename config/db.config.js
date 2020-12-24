const Sequelize = require('sequelize');

const Op = Sequelize.Op;

const application = new Sequelize('db_application', 'db_user_all', 'wDv%5tgn0O0kMkM', {
    host: '167.172.195.92',
    dialect: 'mysql',
    operatorsAliases: Op,
   /*
    pool: {
      max: 1000,
      min: 0,
      acquire: 1000000,
      idle: 10000
    }*/
});

const resources = new Sequelize('db_uspto', 'db_user_all', 'wDv%5tgn0O0kMkM', {
    host: '167.172.195.92',
    dialect: 'mysql',
    operatorsAliases: Op,
   /*
    pool: {
      max: 1000,
      min: 0,
      acquire: 1000000,
      idle: 10000
    }*/
});

const business = new Sequelize('db_business', 'db_user_all', 'wDv%5tgn0O0kMkM', {
    host: '167.172.195.92',
    dialect: 'mysql',
    operatorsAliases: Op,
   /*
    pool: {
      max: 1000,
      min: 0,
      acquire: 1000000,
      idle: 10000
    }*/
});

const maintainence = new Sequelize('db_patent_maintainence_fee', 'db_user_all', 'wDv%5tgn0O0kMkM', {
  host: '167.172.195.92',
  dialect: 'mysql',
  operatorsAliases: Op,
 /*
  pool: {
    max: 1000,
    min: 0,
    acquire: 1000000,
    idle: 10000
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

const bucketConfig = {
  bucketName: process.env.BUCKET_NAME,
  dirName: process.env.BUCKET_PHOTO_DIR, /* optional */
  region: process.env.BUCKET_REGION,
  accessKeyId: process.env.BUCKET_ACCESS_KEY,
  secretAccessKey: process.env.BUCKET_SECRET_KEY,
  s3Url: process.env.BUCKET_URL, /* optional */
  documentDir: process.env.BUCKET_DOCUMENT_DIR
}

const slackConfig = {
  clientID: process.env.SLACK_CLIENT_ID,
  clientSecret: process.env.SLACK_CLIENT_SECRET,
}

const DEFAULT_LIMIT = 100 

const db = { Sequelize, Op, application, resources, business, maintainence, config, bucketConfig, slackConfig, DEFAULT_LIMIT };
 
module.exports = db;