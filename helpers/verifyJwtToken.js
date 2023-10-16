const jwt = require('jsonwebtoken');

const connection = require("../config/db.config");

const secret = process.env.SECRET || 'p@nt3nt8@60';

//require the Model

const User = require("../model/business/Users");

let verifyToken = (req, res, next) => {    

    let token = req.headers['x-auth-token'];

    console.log("Verifying token...", token);

    if (!token){
      return res.status(401).send('Invalid token');
    }
   
    jwt.verify(token, secret, (err, decoded) => {
      if (err){
		    console.log(err);
        return res.status(401).send('Authorization error');
      }
      console.log(decoded);

      User.findOne({
        where:{user_id: decoded.id, organisation_id: decoded.orgId, status: 0}
      }).then(user => {
        if(!user){
          res.status(401).send("You are not authorized user to access this page.");
          return;
        } else {
          req.userId = decoded.id;
          req.orgId = decoded.orgId;
          req.orgType = decoded.org_type;
          next();
        }
      })      
    });
}

let addToken = (req, res, next) => {
  req.userId = 9;
  req.orgId = 11;
  next();
};

let isAdmin = (req, res, next) => {
    console.log("Checking is Admin");
    console.log("USER:"+req.userId);
    User.findOne({
      where:{user_id: req.userId,type:'9', status: 0}
    }).then(user => {
      if(!user){
        res.status(401).send("You are not authorized user to access this page.");
        return;
      } else {
        next();
      }
    })
  }

let addClientID = (req, res, next) => {
  req.orgId = req.params.id;
  next();
};
  
  const authJwt = {};
  
  authJwt.verifyToken = verifyToken;
  authJwt.isAdmin = isAdmin;
  authJwt.addToken = addToken;
  authJwt.addClientID = addClientID;
  
  module.exports = authJwt;