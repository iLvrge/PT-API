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


const signUpVerify = {};

signUpVerify.checkDuplicateUsername = checkDuplicateUsername;


module.exports = signUpVerify;