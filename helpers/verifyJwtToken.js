const jwt = require('jsonwebtoken');

const connection = require("../config/db.config");

const secret = process.env.SECRET || 'p@nt3nt8@60';

//require the Model

const User = require("../model/business/Users");

let verifyToken = (req, res, next) => {
    console.log("Verifying token...");

    let token = req.headers['x-access-token'];

    if (!token){
      return res.status(401).send('Invalid token');
    }
   
    jwt.verify(token, secret, (err, decoded) => {
      if (err){
		    console.log(err);
        return res.status(401).send('Authorization error');
      }
      req.userId = decoded.id;
      req.orgId = decoded.orgId;
      next();
    });
}


isAdmin = (req, res, next) => {
    console.log("Checking is Admin");
    console.log("USER:"+req.userId);
    User.findOne({
      where:{user_id: req.userId,type:'9'}
    }).then(user => {
      if(!user){
        res.status(401).send("You are not authorized user to access this page.");
        return;
      } else {
        next();
      }
    })
  }
  
  const authJwt = {};
  
  authJwt.verifyToken = verifyToken;
  authJwt.isAdmin = isAdmin;
  
  
  module.exports = authJwt;