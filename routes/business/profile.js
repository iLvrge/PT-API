const express = require("express");

const route = express.Router();

const authJWT = require("../../helpers/verifyJwtToken");

//require the Model

const User = require("../../model/business/Users");

const Role = require("../../model/business/Roles");

const Organisation = require("../../model/business/Organisations");

const UserCompanySelection = require("../../model/business/UserCompanySelection");

// login user profile information
/**
 * Middleware to check authentication code 
 * After authenticate it add userID and organisationID to the req parameter
 */
route.get("/profile", [authJWT.verifyToken], (req, res, next) => {
    // no need for the async, use promise
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
                attributes: ['name', 'subscribtion', 'logo', 'organisation_id', 'organisation_type']
            }/* ,
            {
                model: UserCompanySelection,
                as: 'usercompanyselection',
                attributes: ['representative_id']
            } */
        ]
    }).then(user => {
        let userData = user.toJSON()
        
        const type =    userData.organisation.organisation_type == 2 ? 
                                'Bank'
                            :
                                userData.organisation.organisation_type == 3 ?
                                    'Law Firm'
                                : 
                                    userData.organisation.organisation_type == 4 ?
                                        'University'
                                    :
                                        userData.organisation.organisation_type == 5 ?
                                            'Goverment'
                                        :
                                            'Company'

        userData.organisation.organisation_type = type  
        res.status(200).json({
            "user": userData
        });
    }).catch(err => {
        res.status(401).json({
            "message": "Invalid token",
            "error": err
        });
    })
});

module.exports = route;