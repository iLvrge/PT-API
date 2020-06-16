const express = require("express");

const route = express.Router();

const authJWT = require("../../helpers/verifyJwtToken");

//require the Model

const User = require("../../model/business/Users");

const Role = require("../../model/business/Roles");

const Organisation = require("../../model/business/Organisations");


route.get("/profile", [authJWT.verifyToken], (req, res, next) => {

    User.findOne({
        where: {user_id: req.userId, status:0},
        attributes: [['user_id','id'],'first_name', 'last_name', 'email_address', 'logo', 'job_title'],
        include: [
            {
                model: Role,
                as: 'role',
                attributes: ['name']
            },
            {
                model: Organisation,
                as: 'organisation',
                attributes: ['name', 'logo', 'organisation_id']
            },
        ]
    }).then(user => {
        res.status(200).json({
            "user": user
        });
    }).catch(err => {
        res.status(500).json({
            "message": "Invalid token",
            "error": err
        });
    })
});

module.exports = route;