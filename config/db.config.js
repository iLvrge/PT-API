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
/*productsDb.dialect.supports.schemas = true; // add this line
{
      tableName: "product",
      timestamps: false,
      schema: "products" // add this line
    }
    include: [
    {
      model: ProductsDb.models.product,
      on: {
        // this is where magic happens
        order_id: Sequelize.literal("`order`.`id` = `products`.`products`.`order_id`") 
      }
    }
  ]
 */
const db = {};
 
db.Sequelize = Sequelize;

db.Op = Op;

db.application = application;

db.resources = resources;

db.business = business;

module.exports = db;