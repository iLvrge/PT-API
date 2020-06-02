const express = require("express");

const   jwt = require('jsonwebtoken'),
        bcrypt = require('bcrypt');

const route = express.Router();

//require the Model

const User = require("../../model/business/Users");


route.get("/signin", (req, res, next) => {

    User.findOne({
        where: {
            username: req.body.username,
            status:0
        }
    }).then(user => {
        if (!user) {
            return res.status(401).send("Invalid Username and/or Password!");
        }

        const passwordIsValid = bcrypt.compareSync(req.body.password, user.password);

        if (!passwordIsValid) {
            return res.status(401).send("Invalid Username and/or Password!");
        }
        
        let token = jwt.sign({ id: user.id,orgId:user.organisation_id }, config.secret, {
            expiresIn: 86400 // expires in 24 hours
        });

        res.status(200).send({ auth: true, accessToken: token ,message: "Login successfully!"});
        
    }).catch(err => {
        res.status(400).send('Bad request');
    });
});

module.exports = route;