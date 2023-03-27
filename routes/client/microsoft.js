const express = require("express");


const http = require('http');
const https = require('https');
const Stream = require('stream').Transform;
const { WebClient } = require('@slack/web-api')
const route = express.Router();
const config = require("../../config/db.config")



const AssetsChannel = require("../../model/client/AssetsChannel")
const Documentids = require("../../model/application/DocumentIds")
const Users = require("../../model/business/Users")
const Organisations = require("../../model/business/Organisations")


const authJWT = require("../../helpers/verifyJwtToken")
const clientDBConnection = require("../../helpers/clientDBConnection")

const   jwt = require('jsonwebtoken'),
        bcrypt = require('bcrypt'),
        moment = require("moment");

require('isomorphic-fetch');
const {  Client  } = require("@microsoft/microsoft-graph-client");

const getAuthenticatedClient = async(accessToken) => {  
    const client = await Client.init({ 
        authProvider: (done) => {
            done(null, accessToken);
        }
    });
    return client;
}
 

route.post("/team" , async(req, res, next) => {
    try{
        const client = await getAuthenticatedClient('EwBwA8l6BAAUAOyDv0l6PcCVu89kmzvqZmkWABkAARcmdbfiDYwXyNpt89itns5F2eQFyIRKGTihi5ZhhcmVYHdFxddmGAO73Lk8eH9ZLknvPTjr3vlU9Q7GdiMYIcQloJ2B6+cZa1N2gbTAVM5W7dJiLbEYwvgj6ZhHblCkPsU+9Kuvm+RyWgBq5p/vcwpYkJcmjE9vjZXOh/+U3tniR4vmlewtLL9TxUssm+vy0InYov6cf7ux1O5acrLbBfYypnNx8Fy1mK7M8/V7pns/k4jioUoAy87BiNoejPiiERw+VoSBpujNTu8fufikNRTBfwGPiGa52FY89u/YtBd7pUBBNrEuLrFw9ERxvtal8ap5rNgYXvTASIhxN63cv2wDZgAACExQfrE21hPTQAL4trKuB6VeIYreULzQjUAhFjy2Rkhigi+2sL8hUIsY/NMTBrURCWu3UzMdd+5pxbm9g44EScJop3600QUS/KgtfN/OrxJ2Yl7LJvJ5i08FurIz9ZAwu158XXYKrdbeXPe3L/ewoKrXagJtm8+hrXfdgzTcXk318dx3dfSX+t+h8t5jLjbXPqk9l3s34lo6DEJ85rhwU15K5Q+uRD0/ImVyOq9OU5plGamKbu8RQBh/JPARKBsAw6UsarDFyiER4sy8axRS4O358t6Drbju8Q1LNEcrfX4L5YFq8Z4xIa2zhUGXx8MGRH54DtS+XSkz1paSDLwd6G7A+A2CpX+bv4xQFRReOX3CH5mflkByIilLD2IyRDIgSDd83hKgRPpo7MtemtBRtZHhLFlwdugh/XolXYcGwFJfj74cz+AAOstWr66DBpaBsX6Umt/CQd7lcVyO4onO7x2N/xSMeSPmbQYjscO0DjdJq+ONI3BWdfQGw6EL+WNHKmi/FSVIdndiFFSQGHIJD3IMb/XgEEZMVQbXBSHDJsegOBFEDvejYeCOu5d0zDD0k1dvxvchOcFeHQjonKIvP8nkHySUNwc2BE3yJ1Jbutmayb0l0JX6RrDVNTlHjv/BsTe3Y874/+ZdHgK0TSN5Ah0YPowcZvSkfwMUnN+TvbkDVr2u2vKLl+EyfFLWQHrdn2Vhxmr2StqTYbyu+Izbc46V/tSDHaKBirPJ1Ve3/bk8HH4IXd2Z73tW2B7S+tsAMuuuV91URBdv3X97Ag==')
        console.log(client)
        const team = {
            'template@odata.bind': 'https://graph.microsoft.com/v1.0/teamsTemplates(\'standard\')',
            displayName: 'Test Team',
            description: 'Test team description.'
        };
        
        const response  = await client.api('/teams')
                            .post(team);
        console.log('response', response)
    } catch (err) {
        console.log(err)
    }
    
   /*  const team = {
        'template@odata.bind': 'https://graph.microsoft.com/v1.0/teamsTemplates(\'standard\')',
        displayName: 'Test Team',
        description: 'Test team description.'
    };
    
    const response  = await client.api('/teams')
                        .post(team);
    console.log('response', response) */
})

module.exports = route;