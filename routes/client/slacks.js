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

const updateMessage = async(token, params) => {
    let result = {}
    try{
        const web = new WebClient(token);
        result = await web.chat.update( params )
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
        result = await web.users.list ({
            limit: 100,
        })
    } catch( err ) {
        console.log("getUsersList", err)
    }
    return result
}

const uploadFileToChannel = async(token, params) => {
    const mimeType = params.file.mimetype
    let result = {}
    if(mimeType != null && mimeType != '' && mimeType.toLowerCase().indexOf('.exe') < 0){
        const web = new WebClient(token);
        result = await web.files.upload({
            // channels can be a list of one to many strings
            channels: params.channel,
            file: params.file.data,
            filename: params.file.name.replace(/\s+/g, '-')
        });
    }
    return result
}

const inviteUserToChannel = async(token, params)=> {
    let result = {}
    try{
        const web = new WebClient(token);
            
        // channel name without space and no special characters
        result = await web.conversations.invite( params )
        console.log(result)
    } catch( err ) {
        console.log("inviteUserToChannel", err)
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
        res.status(401).send(`Error: ${e.data.error}`);
    }
})
/**
 * Create Channel
 */
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
            let {channel_id, text, asset, reply, user, edit } = req.body

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
                            AssetChannel.create({
                                channel_id: channel_id,
                                asset: asset
                            })
                        }
                    } 
                } else {
                    channel_id = findChannel.channel_id
                }                
            }

            if(channel_id != "") {
                console.log(text);
                const messageParams = {
                    channel: channel_id,
                    text: text
                }


                if((edit != null && edit === true) || reply != null) {
                    messageParams.ts = reply
                } 

                if((edit != null && edit === true) && reply != null) {
                    result = await updateMessage(token, messageParams)
                } else {
                    result = await sendMessage(token, messageParams)
                }
                
    
                if(result != null && Object.keys(result).length > 0) {
                    if(result.ok === true) {
                        
                        
                        if(req.files != null && req.files != undefined && req.files.file != undefined) {
                            const fileUploaded = uploadFileToChannel(token, {
                                channel: channel_id,
                                file: req.files.file
                            })
                            console.log("fileUploaded", fileUploaded)
                        }

                        if(user != null && user != '') {
                            const inviteUser = inviteUserToChannel(token, {
                                channel: channel_id,
                                users: user
                            })
                            console.log("inviteUser", inviteUser)
                        } 

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
        res.status(401).send(`Error: ${e.data.error}`);
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
        res.status(401).send(`Error: ${e.data.error}`);
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
            res.status(200).json(result);
        }
    } catch (e) {
        console.log(e)
        res.status(401).send(`Error: ${e.data.error}`);
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
        
        const usersResult = await getUsersList( token )
        console.log(usersResult)
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
        res.status(401).send(`Error: ${e.data.error}`);
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
        res.status(401).send(`Error: ${e.data.error}`);
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