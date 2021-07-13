const connection = require("../config/db.config");

//require the Model

const User = require("../model/business/Users");


let checkDuplicateUsername = function(req, res, next){
    console.log("VerifySignup",req.body.email_address);
    User.findOne({
        where:{
            username: req.body.email_address
        }
    }).then( user => {        
        if(user){
            console.log("USER");
            res
                .status(400)
                .send("Username already exist!");
            return;
        }

        next();
    });
}

let checkDuplicateAdminUsername = function(req, res, next){
    User.findOne({
        where:{
            username: req.body.username
        }
    }).then( user => {        
        if(user){
            console.log("USER");
            res
                .status(400)
                .send("Username already exist!");
            return;
        }

        next();
    });
}


const signUpVerify = {};

signUpVerify.checkDuplicateUsername = checkDuplicateUsername;
signUpVerify.checkDuplicateAdminUsername = checkDuplicateAdminUsername;


module.exports = signUpVerify;