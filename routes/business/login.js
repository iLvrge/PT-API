const express = require("express");

const crypto = require('crypto');

const nodemailer = require("nodemailer");

const   jwt = require('jsonwebtoken'),
        bcrypt = require('bcrypt'),
        moment = require("moment");

const route = express.Router();

const config = require("../../config/db.config");

//require the Model

const User = require("../../model/business/Users");
const Organisation = require("../../model/business/Organisations");

route.get("/authenticate/:code/:type", async(req, res, next) => {

    try{
        let query = `SELECT organisation_id FROM db_business.organisation WHERE uuid = UUID_TO_BIN(:binToUUID) AND status = 0`

        const replacements = { binToUUID : req.params.code  }
        /* if(parseInt(req.params.type) === 1 || parseInt(req.params.type) === 0) {
           
        } */  
        
        query = `SELECT organisation_id FROM db_business.organisation WHERE status = 0 AND organisation_id IN (SELECT organisation_id FROM db_new_application.share WHERE code = :binToUUID AND type = :type)`
        replacements.type = req.params.type

        
    
        const findOrg = await config.resources.query(query,{
                type: config.Sequelize.QueryTypes.SELECT,
                replacements: replacements,
                raw: true,
                plain: true,
                logging: console.log,
            }
        );
    
        let response = { auth: false, accessToken: null, message: "Bad inputs"}
    
        if( findOrg != null ) {
            const findAdminUser = await User.findOne({
                                        where: {
                                            type: 1,
                                            status: 0,
                                            organisation_id: findOrg.organisation_id
                                        }
                                    })
            
            if( findAdminUser && findAdminUser != null ) {
                const currentDate = Date.now();
    
                const expiredDate = moment(new Date(currentDate)).add(1,'days').valueOf();
    
                token = jwt.sign({ id: findAdminUser.user_id, orgId: findAdminUser.organisation_id, iat: currentDate, expired: expiredDate }, config.config.secret, {
                    expiresIn: 86400 // expires in 24 hours,
                });
        
                response = { auth: true, accessToken: token, message: "Login successfully!"}
            }                        
        }
        res.status(200).send(response);
    } catch( err ) {
        console.log('err', err)
        res.status(401).send('Bad inputs');
    }    
})


route.post("/signin", (req, res, next) => {

    User.findOne({
        include:[
            {
              model: Organisation,
              as: "organisation",
              attributes: ['subscribtion'],
            }
        ],
        where: {
            username: req.body.username,
            status:0
        }
    }).then(user => {
        if (!user) {
            return res.status(401).send("Incorrect credentials.");
        }

        const passwordIsValid = bcrypt.compareSync(req.body.password, user.password);

        if (!passwordIsValid) {
            return res.status(401).send("Incorrect credentials.");
        }

        const currentDate = Date.now();

        const expiredDate = moment(new Date(currentDate)).add(1,'days').valueOf();
        
        let token = jwt.sign({ id: user.user_id, orgId:user.organisation_id, subscription: user.organisation.subscribtion, iat: currentDate, expired: expiredDate }, config.config.secret, {
            expiresIn: 86400 // expires in 24 hours,
        });

        res.status(200).send({ auth: true, accessToken: token ,message: "Login successfully!"});
        
    }).catch(err => {
        console.log(err);
        res.status(400).send('Bad request');
    });
});

route.post("/forgot_password", (req, res) => {
    console.log("reset");
    User.findOne({
        where: {
            username: req.body.username,
            status:0
        }
     }).then(user => {
        if(user != null && user.user_id > 0) {
            const token = crypto.randomBytes(20).toString('hex');
             /*key = crypt.getRandomKey()*/
            console.log("TOKEN"+ token);
            user.update({
                authentication_code: token,
                auth_token_expire: Date.now() + 3600000
            })
            .then( u => {
                console.log(u);
                console.log("INMAIL");
                const transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth:{
                        user: 'no-reply@ilvrge.com',
                        pass: '!QAZ2wsx3edc'
                    }
                 });
                const mailOptions = {
                     from: 'no-reply@patentrack.com',
                     to: `${user.email_address}`,
                     subject: 'Link to reset password for PatenTrack.com',
                     text: `You are receiving this because you have requested to reset of the password for your account.\n\n Please click on the following link, or paste this into your browser to complete the process within one hour of receiving it. \n\n https://patentrack.com/?t=reset&e=${user.email_address}&auth=${token} \n\n If you did not request this, please ignore this email and your password will remain unchanged. \n Thanks \n Team PatenTrack`
                }
                 console.log('Sending mail');
                 transporter.sendMail(mailOptions, (err, response) => {
                    if(err) {
                        console.log("Error while sending email "+ err);
                        res.status(500).json({message:'Not able to send email to your addess.'});
                    } else {
                        res.status(200).json({message:'We have sent you an email, please check your inbox.'});
                    }
                });					
            });				
        } else {
            res.status(402).send('Invalid email request');
        }            
    }).catch(err => {
        console.log("Error: "+err);
        res.status(400).send('Bad request');
    });
});

route.get("/reset/:code/:email", (req, res) => {
    User.findOne({
        where: {authentication_code: req.params.code,email_address: req.params.email, auth_token_expire: {[config.Op.gte]: Date.now()}}
    })
    .then( user => {
        if(user == null) {
            res.status(402).send("Password reset link is invalid.");
        } else {
            res.status(200).json({
                token: req.params.code
            });
        }
    }).catch(err => {
        console.log("Error: "+err);
        res.status(400).send('Password reset link is invalid.');
    });
});

const sendSuccessPasswordEmail = (user) => {

}

route.post("/update_password_via_email", (req, res) => {
    User.findOne({
        where: {authentication_code: req.body.code, auth_token_expire: {[config.Op.gte]: Date.now()}}
    })
    .then( user => {
        if(user == null) {
            res.status(402).send("Password reset link is invalid.");
        } else {
            if(req.body.password == req.body.confirm_password) {
                user.update({
                    authentication_code: '',
                    auth_token_expire: null,
                    password: bcrypt.hashSync(req.body.password, 8), 
                })
                .then( u => {
                    console.log("Password Updated");
                    sendSuccessPasswordEmail(user);
                    res.status(200).json({message: 'Password updated.'});

                }).catch(err => {
                    console.log("Error: "+err);
                    res.status(500).json({message: 'Internal server error'});
                });
            } else {
                res.status(400).json({message: 'Password and confirm password not matched.'});
            }				
        }
    }).catch(err => {
        console.log("Error: "+err);
        res.status(400).send({message: 'Password reset link is invalid.'});
    });
});

module.exports = route;