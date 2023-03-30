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
        const client = await getAuthenticatedClient("eyJ0eXAiOiJKV1QiLCJub25jZSI6IkJLMXdGcUhnZFAxQy1aR3RDUFNBWXdtWDlxd2VrX0lxSnJnbmROa2EwdlkiLCJhbGciOiJSUzI1NiIsIng1dCI6Ii1LSTNROW5OUjdiUm9meG1lWm9YcWJIWkdldyIsImtpZCI6Ii1LSTNROW5OUjdiUm9meG1lWm9YcWJIWkdldyJ9.eyJhdWQiOiJodHRwczovL2dyYXBoLm1pY3Jvc29mdC5jb20iLCJpc3MiOiJodHRwczovL3N0cy53aW5kb3dzLm5ldC9iMmMxOGY0NC01MDVlLTQ3YzQtYjIzNC0wMWZjMWU2NWQ0MTcvIiwiaWF0IjoxNjgwMTYwMTcxLCJuYmYiOjE2ODAxNjAxNzEsImV4cCI6MTY4MDE2NDA5OSwiYWNjdCI6MCwiYWNyIjoiMSIsImFpbyI6IkFWUUFxLzhUQUFBQXFDM2YwZmNMWEhKbnBmUVNNdDJNbVBGWi9weTkyR0daK3RJRUllUnp6ZlQzQTR2SnBYUDZQM0VWRkRwTFhvWGZOcDV6RVlEYzdPb0hPaHR6UGEzMkNKTkxBSWNsR3Q5RlhjcTE4ZW9qRXRFPSIsImFtciI6WyJwd2QiLCJtZmEiXSwiYXBwX2Rpc3BsYXluYW1lIjoiUGF0ZW5UcmFjayIsImFwcGlkIjoiYTA2MzVlMzQtNTA4OS00NTk4LWE3NmItZGEyZTQ3YWZiYzFjIiwiYXBwaWRhY3IiOiIwIiwiZmFtaWx5X25hbWUiOiJLYXBvb3IiLCJnaXZlbl9uYW1lIjoiVml2ZWsiLCJpZHR5cCI6InVzZXIiLCJpcGFkZHIiOiIxMjIuMTczLjQ2LjI0NyIsIm5hbWUiOiJWaXZlayBLYXBvb3IiLCJvaWQiOiI4NmZhZjZkOS02YzAxLTQ0YWMtOGMxYy0xOGJhMTQyZTU2ZjciLCJwbGF0ZiI6IjUiLCJwdWlkIjoiMTAwMzIwMDI4Q0EyMDM5NSIsInJoIjoiMC5BWHdBUklfQnNsNVF4RWV5TkFIOEhtWFVGd01BQUFBQUFBQUF3QUFBQUFBQUFBQzdBUHMuIiwic2NwIjoiRGlyZWN0b3J5LlJlYWRXcml0ZS5BbGwgR3JvdXAuUmVhZFdyaXRlLkFsbCBUZWFtLkNyZWF0ZSBUZWFtLlJlYWRCYXNpYy5BbGwgVXNlci5SZWFkIHByb2ZpbGUgb3BlbmlkIGVtYWlsIENoYW5uZWwuQ3JlYXRlIENoYW5uZWwuUmVhZEJhc2ljLkFsbCBUZWFtTWVtYmVyLlJlYWRXcml0ZS5BbGwiLCJzdWIiOiJfcmF3Tng1OHV1dFNWV0g4RWlXeFZMbklJYS1kN2FKdXNjNUJ2S244T0s4IiwidGVuYW50X3JlZ2lvbl9zY29wZSI6Ik5BIiwidGlkIjoiYjJjMThmNDQtNTA1ZS00N2M0LWIyMzQtMDFmYzFlNjVkNDE3IiwidW5pcXVlX25hbWUiOiJWaXZlay5rQFBhdGVuVHJhY2sub25taWNyb3NvZnQuY29tIiwidXBuIjoiVml2ZWsua0BQYXRlblRyYWNrLm9ubWljcm9zb2Z0LmNvbSIsInV0aSI6ImxvT29Iam43c2tPdGFtQkpGZ28wQUEiLCJ2ZXIiOiIxLjAiLCJ3aWRzIjpbIjY5MDkxMjQ2LTIwZTgtNGE1Ni1hYTRkLTA2NjA3NWIyYTdhOCIsIjcyOTgyN2UzLTljMTQtNDlmNy1iYjFiLTk2MDhmMTU2YmJiOCIsIjI5MjMyY2RmLTkzMjMtNDJmZC1hZGUyLTFkMDk3YWYzZTRkZSIsIjYyZTkwMzk0LTY5ZjUtNDIzNy05MTkwLTAxMjE3NzE0NWUxMCIsImYyOGExZjUwLWY2ZTctNDU3MS04MThiLTZhMTJmMmFmNmI2YyIsImYwMjNmZDgxLWE2MzctNGI1Ni05NWZkLTc5MWFjMDIyNjAzMyIsImZlOTMwYmU3LTVlNjItNDdkYi05MWFmLTk4YzNhNDlhMzhiMSIsImYyZWY5OTJjLTNhZmItNDZiOS1iN2NmLWExMjZlZTc0YzQ1MSIsImI3OWZiZjRkLTNlZjktNDY4OS04MTQzLTc2YjE5NGU4NTUwOSJdLCJ4bXNfc3QiOnsic3ViIjoiY0tsTHNOdGV5M1hPeUdwTkFzdDZ1YkJtYUJ5S3Z4NWRuYTlFel8xOTltNCJ9LCJ4bXNfdGNkdCI6MTY4MDAzNDM2MH0.bZOhOVvD0B1EtoiFknZqAwCZgkQIX92MBzJLB-53Sy2dctSB9uJRBnSzXklN2FXXR_Z0FD0n8V8BwwphkW-fMI1w8KN-7C6WMep-Ye3C7jIDEaJS4RS2qyqJW3mFRThWrWWm11Zz3z7etLu5LSpm8yuGZu0gnfVFFbWLjIstVe3cBkRy512QFLqm0E5_2e_q4GNe1KD121HBZQgpOfDliNak8jajwn0uSp0qAbdHqxowydAP4VVZ9MBl54wZsM2b0tJ8M3OxsIlChnImRevbTyV0O6lwZM0LIyzu0tUCr7j0HE7855ua9KxwASmw4qvZOjCU0Ccmh99peEBSa5PflQ")
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