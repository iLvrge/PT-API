const Sequelize = require('sequelize');
const moment = require('moment');
const Op = Sequelize.Op;

// MySQL is reached through a tunnel that does not sit on 3306, so the port has
// to be passed explicitly. DB_USER is preferred over USER: USER is also the
// POSIX login-name variable, and an inherited shell value would otherwise
// authenticate as the wrong account.
const DB_PORT = Number.parseInt(process.env.DB_PORT, 10) || 3306;
const DB_USER = process.env.DB_USER || process.env.USER;

const application = new Sequelize(process.env.DATABASE_APPLICATION, DB_USER, process.env.PASSWORD, {
    host: process.env.HOST,
    port: DB_PORT,
    dialect: 'mysql',
    // Removed operatorsAliases
});

const applicationNew = new Sequelize(process.env.DATABASE_APPLICATION_NEW, DB_USER, process.env.PASSWORD, {
    host: process.env.HOST,
    port: DB_PORT,
    dialect: 'mysql',
    // Removed operatorsAliases
});

applicationNew.dialect.supports.schemas = true;

const resources = new Sequelize(process.env.DATABASE_RAW, DB_USER, process.env.PASSWORD, {
    host: process.env.HOST,
    port: DB_PORT,
    dialect: 'mysql',
    // Removed operatorsAliases
});

const business = new Sequelize(process.env.DATABASE_BUSINESS, DB_USER, process.env.PASSWORD, {
    host: process.env.HOST,
    port: DB_PORT,
    dialect: 'mysql',
    // Removed operatorsAliases
});

const maintainence = new Sequelize(process.env.DATABASE_MAINTAINENCE, DB_USER, process.env.PASSWORD, {
    host: process.env.HOST,
    port: DB_PORT,
    dialect: 'mysql',
    // Removed operatorsAliases
});

const biblioGrant = new Sequelize(process.env.DATABASE_GRANT_BIBLIO, DB_USER, process.env.PASSWORD, {
    host: process.env.HOST,
    port: DB_PORT,
    dialect: 'mysql',
    // Removed operatorsAliases
});

const biblioApplication = new Sequelize(process.env.DATABASE_APPLICATION_BIBLIO, DB_USER, process.env.PASSWORD, {
    host: process.env.HOST,
    port: DB_PORT,
    dialect: 'mysql',
    // Removed operatorsAliases
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

const microsoftConfig = {
    clientID: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_SECRET_KEY, 
    tenantId: process.env.MICROSOFT_TENANT_ID,
}

const DEFAULT_LIMIT = 100;
const DEFAULT_YEAR = moment(new Date()).subtract(24, 'year').format('YYYY');

const db = { Sequelize, Op, application, applicationNew, resources, business, maintainence, biblioGrant, biblioApplication, config, bucketConfig, slackConfig, microsoftConfig, DEFAULT_LIMIT, DEFAULT_YEAR };

module.exports = db;
