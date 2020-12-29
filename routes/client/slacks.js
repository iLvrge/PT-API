const express = require("express");
const { WebClient } = require('@slack/web-api');
const route = express.Router();
const config = require("../../config/db.config");


const AssetsChannel = require("../../model/client/AssetsChannel");

const authJWT = require("../../helpers/verifyJwtToken");
const clientDBConnection = require("../../helpers/clientDBConnection");

const createChannelID = async(token, params) => {

    let result = {}
    try{
        const web = new WebClient(token);

        result = await web.conversations.create( params )
    } catch( err ) {
        console.log("createChannelID", err)
    }
    return result
}

const sendMessage = async(token, params) => {
    let result = {}
    try{
        const web = new WebClient(token);
        result = await web.chat.postMessage( params )
    } catch( err ) {
        console.log("sendMessage", err)
    }
    return result
}

const getUsersList = async( token ) => {
    let result = {}
    try{
        const web = new WebClient(token);
            
        // channel name without space and no special characters
        const result = await web.users.list ({
            limit: 100,
        })
    } catch( err ) {
        console.log("getUsersList", err)
    }
    return result
}


route.get("/conversations/auth/:code", async(req, res, next) => {
    try{
        const  code  = req.params.code;

        const { slackConfig } = config;

        const grantAccess = {access_token: '', id: '', team: ''} ;
        console.log(req.params);
        console.log({
            client_id: slackConfig.clientID,
            client_secret: slackConfig.clientSecret,
            code
        })
        // Create a client instance just to make this single call, and use it for the exchange
        const result = await (new WebClient()).oauth.v2.access({
            client_id: slackConfig.clientID,
            client_secret: slackConfig.clientSecret,
            code
        });
        console.log(result)
        if(result && result.ok === true) {
            //GET TOKEN
            grantAccess.access_token  = result.authed_user.access_token
            grantAccess.id  = result.authed_user.id
            grantAccess.team  = result.team.id
        }
        res.status(200).json(grantAccess);
    } catch (e) {
        console.log(e)
        res.status(500).send("Error");
    }
})

route.post("/conversations/create/:token" , async(req, res, next) => {
    try{
        const { token } = req.params;
        const web = new WebClient(token);
        console.log({
            name: req.body.name,
            is_private: true
        })
        // channel name without space and no special characters
        const result = await web.conversations.create({
            name: req.body.name,
            is_private: true
        })
        console.log(result);

        if(result && result.ok === true) {
            const { channel } = result
            res.status(200).json(channel);
        }
    } catch (e) {
        console.log(e)
        res.status(500).send("Error");
    }
})

route.post("/conversations/message/:token", [authJWT.verifyToken, clientDBConnection.connect] , async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const AssetChannel = req.connection_db.define('AssetsChannel', AssetsChannel.mainStructure, AssetsChannel.options);

            const { token } = req.params;
            let {channel_id, text, asset } = req.body

            // channel name without space and no special characters
            let result = {}

            if(channel_id == '' || channel_id == undefined) {

                const findChannel = await AssetChannel.findOne({
                    attributes: ['channel_id'],
                    where: {asset: asset}
                })

                if( findChannel == null ) {
                    const channelResult = await createChannelID(token, {name: asset, is_private: true})
    
                    if(channelResult != null ) {
                        if(channelResult && channelResult.ok === true) {
                            const { channel } = channelResult
                            channel_id = channel.id
                        }
                    } else {
                        res.status(500).send("Error while sending message");
                    }
                } else {
                    channel_id = findChannel.channel_id
                }                
            }

            if(channel_id != "") {
                result = await sendMessage(token, {
                    channel: channel_id,
                    text: text
                })
    
                if(result != null && Object.keys(result).length > 0) {
                    if(result.ok === true) {
                        res.status(200).json({status: 'Message sent', channel: result.channel});
                    }
                } else {
                    res.status(500).send("Error while sending message");
                }
            } else {
                console.log("Error while creating or retreive channel_id")
                res.status(500).send("Error while sending message");
            }            
        } else {
            res.status(500).send("Invalid params");
        }
    } catch (e) {
        console.log(e)
        res.status(500).send("Error");
    }
})

route.get("/conversations/message/:token/:channelID/:messageID" , async(req, res, next) => {
    try{
        const { token, channelID, messageID } = req.params;
        const web = new WebClient(token);
        
        // channel name without space and no special characters
        const result = await web.conversations.history ({
            channel: channelID,
            latest: messageID,
            inclusive: true,
            limit: 1
        })
        //console.log(result);

        if(result && result.ok === true) {
            const { messages } = result;
            res.status(200).json(messages);
        }
    } catch (e) {
        console.log(e)
        res.status(500).send("Error");
    }
})

route.put("/conversations/message/:token/:channelID/:messageID" , async(req, res, next) => {
    try{
        const { token, channelID, messageID } = req.params;
        const web = new WebClient(token);
        
        // channel name without space and no special characters
        const result = await web.chat.update({
            channel: channelID,
            text: 'There is another message edit',
            ts: messageID,
            attachments: JSON.stringify([
                {
                    "fallback": "Plain-text summary of the attachment.",
                    "color": "#2eb886",
                    "pretext": "Optional text that appears above the attachment block",
                    "author_name": "Bobby Tables",
                    "author_link": "http://flickr.com/bobby/",
                    "author_icon": "http://flickr.com/icons/bobby.jpg",
                    "title": "Slack API Documentation",
                    "title_link": "https://api.slack.com/",
                    "text": "Optional text that appears within the attachment",
                    "fields": [
                        {
                            "title": "Priority",
                            "value": "High",
                            "short": false
                        }
                    ],
                    "image_url": "http://my-website.com/path/to/image.jpg",
                    "thumb_url": "http://example.com/path/to/thumb.png",
                    "footer": "Slack API",
                    "footer_icon": "https://platform.slack-edge.com/img/default_application_icon.png",
                    "ts": 123456789
                }
            ])
        })
        console.log(result);

        if(result && result.ok === true) {
            res.status(200).json(result);
        }
    } catch (e) {
        console.log(e)
        res.status(500).send("Error");
    }
})

route.delete("/conversations/message/:token/:channelID/:messageID" , async(req, res, next) => {
    try{
        const { token, channelID, messageID } = req.params;
        const web = new WebClient(token);
        
        // channel name without space and no special characters
        const result = await web.chat.delete({
            channel: channelID,
            ts: messageID,
        })

        if(result && result.ok === true) {
            console.log(result);
           
        }
    } catch (e) {
        console.log(e)
        res.status(500).send("Error");
    }
})

route.get("/conversations/history/:token/:channelID" , async(req, res, next) => {
    try{
        const { token, channelID } = req.params;
        const web = new WebClient(token);
        
        // channel name without space and no special characters
        const result = await web.conversations.history ({
            channel: channelID,
        })
        //console.log(result);
        
        const usersResult = await getUsersList( token )

        if(result && result.ok === true) {
           const { messages } = result;
           if(usersResult.ok === true) {
                res.status(200).json({messages, users: usersResult.members });
            } else {
                res.status(200).json({messages, users: [] });
            }
        }   
    } catch (e) {
        console.log(e)
        res.status(500).send("Error");
    }
})

route.get("/conversations/users/:token" , async(req, res, next) => {
    try{
        const { token } = req.params;

        const result = await getUsersList( token )
        if(result && result.ok === true) {
           const { members } = result;
           res.status(200).json(members);
        }   else {
            res.status(200).json([]);
        }
    } catch (e) {
        console.log(e)
        res.status(500).send("Error");
    }
})



route.get("/asset/:asset", [authJWT.verifyToken, clientDBConnection.connect] , async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const AssetChannel = req.connection_db.define('AssetsChannel', AssetsChannel.mainStructure, AssetsChannel.options);

            const { asset } = req.params;

            if(asset != '') {
                const findChannel = await AssetChannel.findOne({
                    attributes: ['channel_id'],
                    where: {asset: asset}
                })
                res.status( 200 ).json( findChannel )
            } else {
                res.status( 200 ).json( {} )
            }
        } else {
            res.status( 200 ).json( {} )
        }
    } catch( e ) {
        console.log( e )
        res.status( 200 ).json( {} )
    }
})

module.exports = route;