const express = require("express");
const exec = require("child_process").exec;


const route = express.Router();
//require the Model

const ApplicationRepresentative = require("../../model/application/Representatives");

const Collections = require("../../model/client/Collections");

const CollectionCompanies = require("../../model/client/CollectionCompanies");

const AssignorAndAssignee = require('../../model/resources/AssignorAndAssignee');


const helpers = require("../../helpers/helper");

const authJWT = require("../../helpers/verifyJwtToken");

const clientDBConnection = require("../../helpers/clientDBConnection");

/**Get all collections */
route.get("/collections", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {

            const Collection = req.connection_db.define('Collections', Collections.mainStructure, Collections.options);

            const CollectionCompany = req.connection_db.define('CollectionCompanies', CollectionCompanies.mainStructure, CollectionCompanies.options);

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
            
            const collectionName = req.body.collection_name;

            const Collection = req.connection_db.define('Collections', Collections.mainStructure, Collections.options);

            const CollectionCompany = req.connection_db.define('CollectionCompanies', CollectionCompanies.mainStructure, CollectionCompanies.options);

            let collectionID = 0;
            console.log(collectionName);
            if(collectionName != '' && collectionName.toString().length > 0) {
                const findCollectionByName = await Collection.findOne({
                    where:{name: collectionName}
                });

                if(findCollectionByName == null) {
                    const addCollection = await Collection.create({
                        name: collectionName,
                        user_id: req.userId
                    });

                    if( addCollection && addCollection.collection_id > 0 ) {
                        collectionID = addCollection.collection_id;                        
                    }
                } else {
                    collectionID = findCollectionByName.collection_id;
                }

                if(collectionID > 0) {
                    const companiesList = JSON.parse(req.body.companies);

                    if( companiesList.length > 0) {
                        const getCompanyList = await AssignorAndAssignee.findAll({
                            where:{assignor_and_assignee_id: companiesList},
                            include:[
                                {
                                    model: ApplicationRepresentative,
                                    as: 'representative',
                                    attributes:['representative_name'],
                                    required:false,          
                                }
                            ]
                        })

                        if(getCompanyList.length > 0) {
                            const list = [];
                            const promises = getCompanyList.map( c => {

                                let name = c.representative != null && c.representative_id > 0 ? c.representative.representative_name  : c.name ;

                                list.push({collection_id: collectionID, name: name, instances: c.instances});

                                return c;
                            });

                            await Promise.all(promises);

                            if(list.length > 0) {
                                await CollectionCompany.bulkCreate(list);
                            }
                        }
                    }
                }
            }
            if(collectionID > 0) {               
                const getCollection = await helpers.getCollectionByID(Collection, CollectionCompany, collectionID);

                res.status(200).json(getCollection);
            } else {
                res.status(500).json({message: "Internal server error"});
            }
            
        } else {
            res.status(500).json({message: "Internal server error"});
        }
    } catch (err) {
        console.log(err);
        res.status(500).json({message: "Unable to create collection"});
    }
});

/**Update collection */
route.put("/collections/:collection_id", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {

            const collectionID = req.params.collection_id;

            if(collectionID > 0) {

                const Collection = req.connection_db.define('Collections', Collections.mainStructure, Collections.options);

                const CollectionCompany = req.connection_db.define('CollectionCompanies', CollectionCompanies.mainStructure, CollectionCompanies.options);

                const getCollection = await Collection.findByPk(collectionID);

                if(getCollection != null && getCollection.collection_id > 0) {
                    
                    
                    await Collection.update({
                        name: req.body.collection_name
                    }, {where: {collection_id: collectionID}});

                    const companiesList = JSON.parse(req.body.companies);

                    if( companiesList.length > 0) {
                        const deleteCollections = CollectionCompany.destroy({
                            where: {collection_id: collectionID}
                        })

                        if(deleteCollections) {
                            const getCompanyList = await AssignorAndAssignee.findAll({
                                where:{assignor_and_assignee_id: companiesList},
                                include:[
                                    {
                                        model: ApplicationRepresentative,
                                        as: 'representative',
                                        attributes:['representative_name'],
                                        required:false,          
                                    }
                                ]
                            });

                            const list = [];
                            const promises = getCompanyList.map( c => {

                                let name = c.representative != null && c.representative_id > 0 ? c.representative.representative_name  : c.name ;

                                list.push({collection_id: collectionID, name: name, instances: c.instances});

                                return c;
                            });

                            await Promise.all(promises);

                            if(list.length > 0) {
                                await CollectionCompany.bulkCreate(list);
                            }
                        }
                    }

                    const getCollection = await helpers.getCollectionByID(Collection, CollectionCompany, collectionID);

                    res.status(200).json(getCollection);

                } else {
                    res.status(403).send("No collection exist.");
                }
            }else {
                res.status(404).send("Invalid collection ID.");
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

module.exports = route;