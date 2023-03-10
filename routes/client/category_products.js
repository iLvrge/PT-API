const express = require("express");

const route = express.Router();

const bcrypt = require('bcrypt');

const connection = require("../../config/db.config");

//require the Model
const Categories = require("../../model/client/Categories");
const Products = require("../../model/client/Products");

const authJWT = require("../../helpers/verifyJwtToken");
 
const clientDBConnection = require("../../helpers/clientDBConnection");

/**Add Category Product */
route.post("/", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    let message = '', statusCode = 200
    try{ 
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) { 
            const Category = req.connection_db.define('Categories', Categories.mainStructure, Categories.options);  
            const Product = req.connection_db.define('Products', Products.mainStructure, Products.options); 
            
            const { category_name, products } = req.body


            const findCategory = await Category.findOne({
                where: {name: category_name},
                attributes: ['category_id'],
            });

            let categoryID = 0
            
            if(findCategory == null) {
                const addCategory = await Category.create({
                    name: category_name
                })

                if(addCategory != null && addCategory.category_id > 0) {
                    categoryID = addCategory.category_id
                }

            } else {
                categoryID = findCategory.category_id
            }

            if(categoryID > 0) {
                const post_products =  products.split('\n'); 
                const allProducts = []
                if(post_products.length > 0) {
                    post_products.forEach( name => {
                        allProducts.push({
                            name: name.trim() ,
                            category_id: categoryID
                        })
                    })
                }

                if(allProducts.length > 0) {
                    const insertProducts = await Product.bulkCreate(allProducts, {ignoreDuplicates: true})

                    if(insertProducts) {
                        message = "Data added successfully";
                    }
                } else {
                    statusCode = 500
                    message = "Error while adding products";
                }
            }  else {
                statusCode = 500
                message = "Error while adding category";
            }
        } else {
            statusCode = 500
            message = "Invalid inputs";
        } 
        res.status(statusCode).send(message);
    } catch (e) {
        statusCode = 500
        console.log('addcategory', e)
        message = "Error while adding input data";
        res.status(statusCode).send(message);
    }
    
});


route.get("/", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) { 
            const Category = req.connection_db.define('Categories', Categories.mainStructure, Categories.options); 


            const getAllCategories = await Category.findAll({ 
                attributes: ['category_id', 'name'],
                order: [['name', 'DESC']]
            });
            res.status(200).json(getAllCategories); 
        } else {
            res.status(500).send("Error");
        }
    } catch (e) {
        res.status(500).send("Error");
    }
})

route.get("/:categoryID/products", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) { 
            const Product = req.connection_db.define('Products', Products.mainStructure, Products.options); 

            const {categoryID} = req.params

            const getAllProducts = await Product.findAll({
                where: {category_id: categoryID},
                attributes: ['product_id', 'name'],
                order: [['name', 'DESC']]
            });
            res.status(200).json(getAllProducts); 
        } else {
            res.status(500).send("Error");
        }
    } catch (e) {
        res.status(500).send("Error");
    }
})

route.delete("/:categoryID", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) { 
            const Product = req.connection_db.define('Products', Products.mainStructure, Products.options); 
            const Category = req.connection_db.define('Categories', Categories.mainStructure, Categories.options); 
            const {categoryID} = req.params

            const deleteAllProducts = await Product.destroy({
                where: {category_id: categoryID}
            });

            if(deleteAllProducts) {
                const deleteCategory = await Category.destroy({
                    where: {category_id: categoryID}
                });

                res.status(200).send("Category deleted."); 
            } else {
                res.status(200).send("Unable to delete category."); 
            } 
        } else {
            res.status(500).send("Error");
        }
    } catch (e) {
        res.status(500).send("Error");
    }
})


route.delete("/products/:productID", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) { 
            const Product = req.connection_db.define('Products', Products.mainStructure, Products.options); 

            const {productID} = req.params

            const deleteProduct = await Product.destroy({
                where: {product_id: productID}, 
            });
            if(deleteProduct) {
                res.status(200).send("Product deleted."); 
            } else {
                res.status(500).send("Unable to delete product."); 
            } 
        } else {
            res.status(500).send("Unable to delete product.");
        }
    } catch (e) {
        console.log(e)
        res.status(500).send("Unable to delete product.");
    }
})

module.exports = route;