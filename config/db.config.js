const Sequelize = require('sequelize');

const moment = require('moment');

const Op = Sequelize.Op;

const application = new Sequelize(process.env.DATABASE_APPLICATION, process.env.USER, process.env.PASSWORD, {
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

const applicationNew = new Sequelize(process.env.DATABASE_APPLICATION_NEW, process.env.USER, process.env.PASSWORD, {
  host: '167.172.195.92',
  dialect: 'mysql',
  operatorsAliases: Op, 
});

applicationNew.dialect.supports.schemas = true; 

const resources = new Sequelize(process.env.DATABASE_RAW, process.env.USER, process.env.PASSWORD, {
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

const business = new Sequelize(process.env.DATABASE_BUSINESS, process.env.USER, process.env.PASSWORD, {
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

const maintainence = new Sequelize(process.env.DATABASE_MAINTAINENCE, process.env.USER, process.env.PASSWORD, {
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

const biblioGrant = new Sequelize(process.env.DATABASE_GRANT_BIBLIO, process.env.USER, process.env.PASSWORD, {
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

const biblioApplication = new Sequelize(process.env.DATABASE_APPLICATION_BIBLIO, process.env.USER, process.env.PASSWORD, {
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
  documentDir: process.env.BUCKET_DOCUMENT_DIR,
  figuresDir: process.env.BUCKET_FIGURES_DIR,
}

const slackConfig = {
  clientID: process.env.SLACK_CLIENT_ID,
  clientSecret: process.env.SLACK_CLIENT_SECRET,
  botToken: process.env.SLACK_BOT_TOKEN
}

const DEFAULT_LIMIT = 100 

const DEFAULT_YEAR = moment(new Date()).subtract(24, 'year').format('YYYY')

const db = { Sequelize, Op, application, applicationNew, resources, business, maintainence, biblioGrant, biblioApplication, config, bucketConfig, slackConfig, DEFAULT_LIMIT, DEFAULT_YEAR };
 
module.exports = db;  