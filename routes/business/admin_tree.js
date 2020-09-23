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
async function addChild(child, td, company, index) {
    if(child.length == 0 || child[child.length - 1].level == td.length) {
        /*
        * Only working in DOM
        *child.push({name: td[td.length - 1].querySelectorAll('span.unselected, span.selected')[0].innerText, child:[], level: td.length});
        */
        child.push({name: td[td.length - 1].querySelectorAll('span')[0].querySelectorAll('span')[0].innerHTML, child:[], level: td.length});
    } else {
        child = addChild(child[child.length - 1].child, td, company, index);
    }
    return child;
}

route.post("/corporate_tree", [authJWT.verifyToken, authJWT.isAdmin], async(req, res, next) => {
    try{
        console.log(req.files);
        var parentChild = {};
        if(req.files != null && req.files.file != null && req.files.file != undefined) {
            let mimeType = req.files.file.mimetype;
            console.log(mimeType);
            if(mimeType.toLowerCase().indexOf('html') >= 0){

                let fileObject = req.files.file;
                const filePathWithName = '/var/www/html/beta/resources/shared/data/'+fileObject.name;

                await fileObject.mv(filePathWithName, async function(err) {
                    if (err){
                        return res.status(500).send("ERROR: "+err);	
                    } else {
                        JSDOM.fromFile(filePathWithName).then(dom => {
                            const document = dom.window.document;
                            const treeView = document.querySelector("#TreeView1");
                            
                            if(treeView != null) {   
                                const allCompanies = treeView.querySelectorAll('table');   
                                if(allCompanies.length > 0) {
                                    allCompanies.forEach(async company => {
                                        var td = company.querySelectorAll('td');                                        
                                        if(td.length == 3){
                                            console.log(td[td.length - 1].querySelectorAll('span').length);
                                            console.log(td[td.length - 1].querySelectorAll('span')[0].querySelectorAll('span')[0].innerHTML);
                                            /*
                                            * Only working in DOM
                                            *parentChild.push({name: td[td.length - 1].querySelector('span.unselected, span.selected')[0].innerText, child:[], level: td.length});*/
                                            parentChild = {name: td[td.length - 1].querySelectorAll('span')[0].querySelectorAll('span')[0].innerHTML, child:[], level: td.length};
                                        } else {
                                            await addChild(parentChild[0].child, td, company);        
                                        }
                                    });
                                } 
                                res.status(200).json(parentChild);
                            }
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