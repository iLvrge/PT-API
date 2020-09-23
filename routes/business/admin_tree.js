const express = require("express"),

    bcrypt = require('bcrypt'),

    fs = require('fs'),

    http = require('http'),

    https = require('https'),

    Stream = require('stream').Transform,

    route = express.Router(),

    jsdom = require("jsdom"),

    connection = require("../../config/db.config"),

    authJWT = require("../../helpers/verifyJwtToken");

const { JSDOM } = jsdom;

/**
 * Tree HTML file upload
 * 
 */

route.post("/corporate_tree", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        console.log(req.files);
        if(req.files != null && req.files.file != null && req.files.file != undefined) {
            let mimeType = req.files.file.mimetype;
            console.log(mimeType);
            if(mimeType.toLowerCase().indexOf('html') >= 0){

                let fileObject = req.files.file;
                const filePathWithName = '/var/www/html/beta/resources/shared/data/'+fileObject.name;

                await fileObject.mv(filePathWithName, function(err) {
                    if (err){
                        return res.status(500).send("ERROR: "+err);	
                    } else {
                        JSDOM.fromFile(filePathWithName, options).then(dom => {
                            console.log(dom.serialize());
                        });
                    }
                })
            } else {
                return res.status(400).send("Invalid file format.");	
            }
        } else {
            console.log("No file found!");
        }
    }catch(e) {
        console.log(e);
        res.status(402).send("Error while uploading file.");
    }
});


module.exports = route;