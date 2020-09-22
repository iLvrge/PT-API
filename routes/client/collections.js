const express = require("express");
const exec = require("child_process").exec;


const route = express.Router();
//require the Model

const Representatives = require("../../model/client/Representatives");

const ApplicationRepresentative = require("../../model/application/Representatives");

const Collections = require("../../model/client/Collections");

const CollectionCompanies = require("../../model/client/CollectionCompanies");


const helpers = require("../../helpers/helper");

const authJWT = require("../../helpers/verifyJwtToken");

const connection = require("../../config/db.config");

const clientDBConnection = require("../../helpers/clientDBConnection");

/**Get all collections */
route.get("/collections", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {

            const Collection = req.connection_db.define('Collections', Collections.mainStructure, Collections.options);

            const CollectionCompany = req.connection_db.define('CollectionCompanies', CollectionCompanies.mainStructure, CollectionCompanies.options);

            Collection.hasMany(CollectionCompany, { foreignKey: 'collection_id', as: 'collection_companies' });

            CollectionCompany.belongsTo(Collection, { foreignKey: 'collection_id', as: 'collections' });


            const getCollectionList = await helpers.getCollectionList(Collection, CollectionCompany);

            res.status(200).json(getCollectionList);
        } else {
            res.status(401).send("Unable to retrieve collections");
        }
    } catch (err) {
        console.log(err);
        res.status(500).json({message: "Unable to retrieve collections"})
    }
});


/**Post collection */
route.post("/collections", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const collectionName = req.body.name;

            const Collection = req.connection_db.define('Collections', Collections.mainStructure, Collections.options);

            const CollectionCompany = req.connection_db.define('CollectionCompanies', CollectionCompanies.mainStructure, CollectionCompanies.options);


            if(collectionName != '' && collectionName.length > 0) {
                const findCollectionByName = await Collection.findOne({
                    where:{name: collectionName}
                });

                let collectionID = 0;

                if(findCollectionByName == null) {
                    const addCollection = await Collection.create({
                        name: collectionName
                    });

                    if( addCollection && addCollection.collection_id > 0 ) {
                        collectionID = addCollection.collection_id;
                    }
                }

                if(collectionID > 0) {
                    const companiesList = req.body.companies;

                    if( companiesList.length > 0) {

                    }
                }
            }
            
        } else {
            res.status(401).send("Unable to retrieve collections");
        }
    } catch (err) {
        console.log(err);
        res.status(500).json({message: "Unable to retrieve collections"})
    }
});

/**Update collection */
route.put("/collections/:collection_id", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            
            const Collection = req.connection_db.define('Collections', Collections.mainStructure, Collections.options);

            const CollectionCompany = req.connection_db.define('CollectionCompanies', CollectionCompanies.mainStructure, CollectionCompanies.options);

            const getCollection = await Collection.findOne({
                where:{collection_id: collectionID}
            });

            if(getCollection != null && getCollection.collection_id > 0) {
                const updateCollectionName = await getCollection.update({
                    name: req.body.name
                });

                if(updateCollectionName) {
                    const companiesList = req.body.companies;

                    if( companiesList.length > 0) {

                    }
                }
            } else {
                res.status(403).send("No collection exist.");
            }
        } else {
            res.status(401).send("Unable to retrieve collections");
        }
    } catch (err) {
        console.log(err);
        res.status(500).json({message: "Unable to retrieve collections"})
    }
});

/**Delete collection */
route.delete("/collections/:collection_id", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {

            const collectionID = req.params.collection_id;

            const Collection = req.connection_db.define('Collections', Collections.mainStructure, Collections.options);

            const CollectionCompany = req.connection_db.define('CollectionCompanies', CollectionCompanies.mainStructure, CollectionCompanies.options);
            
            const getCollection = await Collection.findOne({
                where:{collection_id: collectionID}
            });

            if(getCollection != null && getCollection.collection_id > 0) {

                const deleteCollectionCompanies = await CollectionCompany.destroy({
                    where:{collection_id: collectionID}
                });

                if( deleteCollectionCompanies ) {
                    const destroyCollection = await Collection.destroy({
                        where:{collection_id: collectionID}
                    });
    
                    if(destroyCollection) {
                        res.status(200).send("Collection deleted.");
                    } else {
                        res.status(500).send("Error while deleting collection.");
                    }
                } else {
                    res.status(500).send("Error while deleting collection.");
                }
            } else {
                res.status(403).send("No collection exist.");
            }
        } else {
            res.status(401).send("Unable to retrieve collections");
        }
    } catch (err) {
        console.log(err);
        res.status(500).json({message: "Unable to retrieve collections"})
    }
});