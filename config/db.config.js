const Sequelize = require('sequelize');

const moment = require('moment');

const Op = Sequelize.Op;

const application = new Sequelize(`${DATABASE_APPLICATION}`, `${USER}`, `${PASSWORD}`, {
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

const applicationNew = new Sequelize(`${DATABASE_APPLICATION_NEW}`, `${USER}`, `${PASSWORD}`, {
  host: '167.172.195.92',
  dialect: 'mysql',
  operatorsAliases: Op, 
});

applicationNew.dialect.supports.schemas = true; 

const resources = new Sequelize(`${DATABASE_RAW}`, `${USER}`, `${PASSWORD}`, {
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

const business = new Sequelize(`${DATABASE_BUSINESS}`, `${USER}`, `${PASSWORD}`, {
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

const maintainence = new Sequelize(`${DATABASE_MAINTAINENCE}`, `${USER}`, `${PASSWORD}`, {
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

const biblioGrant = new Sequelize(`${DATABASE_GRANT_BIBLIO}`, `${USER}`, `${PASSWORD}`, {
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

const biblioApplication = new Sequelize(`${DATABASE_APPLICATION_BIBLIO}`, `${USER}`, `${PASSWORD}`, {
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
  'secret': `${SECRET}` || 'p@nt3nt8@60',
  'pusher_appId': '938985',
  'pusher_key': '3252bb191d77e92ddb3c',
  'pusher_secret': '2a3dd823cd1abcd45c71',
  'pusher_cluster': 'us3',
  'pusher_encrypted': true,
  'pusher_channel': 'patentrack-channel',
  'pusher_event': 'patentrack-event',
}

const bucketConfig = {
  bucketName: `${BUCKET_NAME}`,
  dirName: `${BUCKET_PHOTO_DIR}`, /* optional */
  region: `${BUCKET_REGION}`,
  accessKeyId: `${BUCKET_ACCESS_KEY}`,
  secretAccessKey: `${BUCKET_SECRET_KEY}`,
  s3Url: `${BUCKET_URL}`, /* optional */
  documentDir: `${BUCKET_DOCUMENT_DIR}`,
  figuresDir: `${BUCKET_FIGURES_DIR}`,
}

const slackConfig = {
  clientID: `${SLACK_CLIENT_ID}`,
  clientSecret: `${SLACK_CLIENT_SECRET}`,
  botToken: `${SLACK_BOT_TOKEN}`
}

const DEFAULT_LIMIT = 100 

const DEFAULT_YEAR = moment(new Date()).subtract(24, 'year').format('YYYY')

const db = { Sequelize, Op, application, applicationNew, resources, business, maintainence, biblioGrant, biblioApplication, config, bucketConfig, slackConfig, DEFAULT_LIMIT, DEFAULT_YEAR };
 
module.exports = db;  