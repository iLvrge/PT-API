const express = require("express");
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

        

const addBotUser = async(token, channelID) => {
    let result = {}
    try {
        const users = await getUsersList(token);
        if(users && users?.ok && users?.ok === true) {
            const { members } = users;
            if(members.length > 0) {
                const findIndex = members.findIndex( user => user.is_bot === true && user.name == 'patentrack')
                if(findIndex !== -1) {
                    console.log('members', members,  findIndex)
                    result = await inviteUserToChannel(token, {
                        channel: channelID,
                        users: members[findIndex].id
                    })
                }
            }
        }
    } catch( err ) {
        console.log("ERROR addBotUser", err)
    }
    return result
}

const createChannelID = async(token, params) => {

    let result = {}
    try{
        const web = new WebClient(token);

        result = await web.conversations.create( params )

        if(result !== null && result?.ok && result.ok == true) {
            //add bot
            addBotUser(token, result.channel.id)
        }
    } catch( err ) {
        console.log("createChannelID", err)
    }
    return result
}

const createChannelTopic = async(token, channel, asset) => {

    let result = {}
    try {       
        let findAssetData = await Documentids.findOne({
            attributes: ['title'],
            where:{ grant_doc_num: asset}
        })

        if(findAssetData == null || findAssetData == '') {
            findAssetData = await Documentids.findOne({
                attributes: ['title'],
                where:{ appno_doc_num: asset}
            })
        }
        if(findAssetData != null && findAssetData != '') {
            const web = new WebClient(token)
            result = await web.conversations.setTopic( {channel, topic: findAssetData.title } )
        }        
    } catch( err ) {
        console.log("channelSetTopic", err)
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
        console.log("updateMessage", err)
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

const getUsersInfo = async( token, userId ) => {
    let result = {}
    try{
        const web = new WebClient(token);
            
        // channel name without space and no special characters
        result = await web.users.info ({
            user: userId
        })
    } catch( err ) {
        console.log("getUsersInfo", err)
    }
    return result
}

const uploadFileToChannel = async(token, params) => {
    const web = new WebClient(token);
    const result = await web.files.upload(params);
    return result
}

const shareFile = async(token, channelID, fileID) => {
    console.log("shareFile", token, channelID, fileID)
    let result = {}
    try {
        const web = new WebClient(token);
        result = await web.files.remote.share({
            channels: channelID,
            file: fileID
        })
    } catch(err) {
        console.log(err)
    }   
    return result
}

const shareRemoteFile = async(token, auth, files, otherItem) => {
    const { slackConfig } = config;
    let addedBotUser = false
    files.map( async file => {
        try{
            const webBot = new WebClient(auth); //bot token
            const result = await webBot.files.remote.add({
                external_id: file.id,
                external_url: file.webViewLink,
                title: file.name,
                filetype: file.mimeType,
                preview_image: file.iconLink
            });
            console.log("result", result)
            if(result != null && result?.ok && result.ok == true) {           
                const fileID = result.file.id 
                let sharedFile = {}
                if(addedBotUser === false) {
                    const botUser = await addBotUser(token, otherItem.channel)
                    console.log("botUser", botUser)
                    if(botUser && botUser?.ok && botUser.ok === true) {
                        sharedFile = await shareFile(auth, otherItem.channel, fileID)
                        addedBotUser = true
                    }
                } else {
                    sharedFile = await shareFile(auth, otherItem.channel, fileID)
                }                
                console.log("shared", sharedFile)
            }
        } catch (err) {
            console.log("ERROR SHARE", err);
        }        
    })
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

route.get('/auth/:code', async(req, res, next) => {
    try{
        const  code  = req.params.code;
        const { redirect_uri } = req.query;
        const { slackConfig } = config;

        const token = {auth: false, accessToken: '', message: '' , accessSlackToken : {access_token: '', id: '', team: ''} };
        console.log(req.params);
        console.log({
            client_id: slackConfig.clientID,
            client_secret: slackConfig.clientSecret,
            code,
            redirect_uri
        })
        // Create a client instance just to make this single call, and use it for the exchange
        const result = await (new WebClient()).oauth.v2.access({
            client_id: slackConfig.clientID,
            client_secret: slackConfig.clientSecret,
            code,
            redirect_uri
        });
        console.log(result)
        if(result && result.ok === true) {
            //GET TOKEN
            token.accessSlackToken.access_token  = result.authed_user.access_token
            token.accessSlackToken.id  = result.authed_user.id
            token.accessSlackToken.team  = result.team.id
            token.accessSlackToken.bot_token  = result.access_token
            token.accessSlackToken.bot_user_id  = result.bot_user_id

        }
        
        if(token.accessSlackToken.team != '') {
            const findOrganisation = await Organisations.findOne({
                where: {team: token.accessSlackToken.team}
            })

            if( findOrganisation != null ) {
                const user = await Users.findOne({
                    where: { organisation_id: findOrganisation.organisation_id, type: '0', status:0 }
                })

                if( user != null ) {
                    const currentDate = Date.now();

                    const expiredDate = moment(new Date(currentDate)).add(1,'days').valueOf();
                    token.auth = true
                    token.message = 'Login successfully!'
                    token.accessToken = await jwt.sign({ id: user.user_id, orgId:user.organisation_id, iat: currentDate, expired: expiredDate }, config.config.secret, {
                        expiresIn: 86400 // expires in 24 hours,
                    });
                }
            }
        }        
        res.status(200).json(token);
    } catch (e) {
        console.log(e)
        res.status(401).send(`Error: ${e.data.error}`);
    }
})

route.get("/conversations/auth/:code", async(req, res, next) => {
    try{
        const  { code }  = req.params;
        const { redirect_uri } = req.query;

        const { slackConfig } = config;

        const grantAccess = {access_token: '', id: '', team: ''} ;
        console.log(req.params);
        console.log({
            client_id: slackConfig.clientID,
            client_secret: slackConfig.clientSecret,
            code,
            redirect_uri
        })
        // Create a client instance just to make this single call, and use it for the exchange
        const result = await (new WebClient()).oauth.v2.access({
            client_id: slackConfig.clientID,
            client_secret: slackConfig.clientSecret,
            code,
            redirect_uri
        });
        console.log(result)
        if(result && result.ok === true) {
            //GET TOKEN
            grantAccess.access_token  = result.authed_user.access_token
            grantAccess.id  = result.authed_user.id
            grantAccess.team  = result.team.id
            grantAccess.bot_token  = result.access_token
            grantAccess.bot_user_id  = result.bot_user_id
        }
        res.status(200).json(grantAccess);
    } catch (e) {
        console.log(e)
        res.status(401).send(`Error: ${e.data.error}`);
    }
})

/**
 * Users infor
 */

route.get("/user/info/:token/:userId" , async(req, res, next) => {
    try{
        const { token, userId } = req.params;

        const result = await getUsersInfo( token, userId )
        if(result && result.ok === true) {
           const { user } = result;
           res.status(200).json(user);
        }   else {
            res.status(200).json([]);
        }
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

/**
 * Update team ID with main User
 */

route.put('/team', [authJWT.verifyToken], async(req, res, next) =>{
    try {
        const { team } = req.body;
        //check teamID and auth user should Admin user
        if( team != '' ) {
            const user = await Users.findOne({
                where: { user_id: req.userId, type: '0' }
            })

            if( user != null ) {
                const orgData =  await Organisations.findOne({
                    where: {organisation_id: req.orgId}
                })
    
                if(orgData != null && orgData.team != team) {
                    await Organisations.update({team: team},{where: {organisation_id: req.orgId}})
                    console.log('Team updated...')
                }
                res.status(200).send('');
            } else {
                res.status(200).send('Invalid data.');
            }            
        } else {
            res.status(200).send('Invalid team.');
        }
       
    } catch (e) {
        console.log(e)
        res.status(500).send('Error creating team.');
    }
}) 


/**
 * Send Slack message
 */

route.post("/conversations/message/:token", [authJWT.verifyToken, clientDBConnection.connect] , async(req, res, next) => {
    try{
        if(typeof req.connection_db != "undefined" && req.connection_db != null ) {
            const AssetChannel = req.connection_db.define('AssetsChannel', AssetsChannel.mainStructure, AssetsChannel.options);

            const { token } = req.params;
            let {channel_id, text, remote_file, asset, transaction, company, asset_format, reply, user, edit, auth, auth_id } = req.body

            // channel name without space and no special characters
            let result = {}

            if(channel_id == '' || channel_id == undefined) {

                /* const findChannel = await AssetChannel.findOne({
                    attributes: ['channel_id'],
                    where: {asset: asset}
                })

                if( findChannel == null ) {
                    const channelResult = await createChannelID(token, {name: asset_format.toString().toLowerCase(), is_private: false}) //create public channel
    
                    if(channelResult != null ) {
                        if(channelResult && channelResult.ok === true) {
                            const { channel } = channelResult
                            channel_id = channel.id

                            // setTopic
                            createChannelTopic(token, channel_id, asset)
                            AssetChannel.create({
                                channel_id: channel_id,
                                asset: asset
                            })
                        }
                    } 
                } else {
                    channel_id = findChannel.channel_id
                } */
                
                const channelResult = await createChannelID(token, {name: asset_format.toString().toLowerCase(), is_private: false}) //create public channel
    
                if(channelResult != null ) {
                    if(channelResult && channelResult.ok === true) {
                        //Invite BOT USER
                        
                        const botUser = await inviteUserToChannel(token, {
                            channel: channel_id,
                            users: auth_id
                        })
                        console.log("botUser", botUser)

                        const { channel } = channelResult
                        channel_id = channel.id

                        // setTopic
                        createChannelTopic(token, channel_id, asset)

                    }
                }
            }
            if(channel_id != "") {
                text = text.replace(/&lt;p&gt;/g, '')
                text = text.replace(/&lt;\/p&gt;/g, '')
                text = text.replace(/&lt;br&gt;/g, "\n")
                text = text.replace(/&lt;slackusermention&gt;/g, '')
                text = text.replace(/&lt;\/slackusermention&gt;/g, '')

                text = text.replace(/&lt;patentracklinebreak&gt;/g, "\n")
                text = text.replace(/&lt;\/patentracklinebreak&gt;/g, '')

                text = text.replace(/&amp;nbsp;/g, ' ')
                
                let messageParams = {
                    channel: channel_id,
                    text: text
                }      
                if(req.files != null && req.files != undefined && req.files.file != undefined) {                    
                    const mimeType = req.files.file.mimetype
                    if(mimeType != null && mimeType != '' && mimeType.toLowerCase().indexOf('.exe') < 0){
                        messageParams.channels = channel_id
                        messageParams.file = req.files.file.data
                        messageParams.filename = req.files.file.name.replace(/\s+/g, '-')
                        messageParams.initial_comment = text
    
                        if((edit != null && edit === true) || reply != null) {
                            messageParams.thread_ts = reply
                        } 
    
                        result = await uploadFileToChannel(token, messageParams)
                    } else {
                        res.status(500).send("Cannot upload exe file");
                    }                    
                }  else {
                    console.log("In sending plain message")
                    if((edit != null && edit === true) && reply != null && reply != '') {
                        messageParams.ts = reply
                    } 
                    if(user != null && user != '') {
                        const inviteUser = await inviteUserToChannel(token, {
                            channel: channel_id,
                            users: user
                        })
                        console.log("inviteUser", inviteUser)
                    }
                    if((edit != null && edit === true) && reply != null && reply != '') {
                        result = await updateMessage(token, messageParams)
                    } else {
                        console.log("New thread", messageParams)
                        if(text != '') {
                            result = await sendMessage(token, messageParams)
                        }
                    }
                }
                if(remote_file != '' && remote_file != null && remote_file != undefined) {
                    let remoteFiles = JSON.parse(remote_file)
                    if(remoteFiles.length > 0) {
                        await shareRemoteFile(token, auth, remoteFiles, messageParams)
                    }
                } 
                console.log(result)
                if(result != null && Object.keys(result).length > 0) {
                    console.log(" IN OK")
                                       
                    if(result.ok === true) { 
                        res.status(200).json({status: 'Message sent', channel: result?.channel ? result?.channel : channel_id});
                    } else {
                        res.status(200).json({status: 'Message not sent', error: result.error });
                    }
                } else {
                    console.log("Error ERRORORORRRORORO")
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
        console.log("MAINNNNNN", e)
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


route.get("/channels/:token", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        const { token } = req.params;
        
        const showChannels = (channels) => {
            res.status( 200 ).json( channels )
        }

        await retrieveAllChannels(token, showChannels)              
    } catch( e ) {
        console.log( e )
        res.status( 200 ).json([])
    }
})

const retrieveAllChannels = async(token, callback) => {
    const web = new WebClient(token);
    const reteivePageOfChannels = async(nextPageToken, result) => {
        const request = {
            limit : 1000,
        }
        if(nextPageToken != '') {
            request.cursor = nextPageToken
        }

        const response = await web.conversations.list(request) 

        if(response) {
            result = result.concat(response.channels);

            nextPageToken = response.response_metadata.next_cursor;

            if(nextPageToken && nextPageToken != '') {
                await reteivePageOfChannels(nextPageToken, result)
            } else {
                callback(result)
            }
        } else {
            callback(result)
        }
    }
    await reteivePageOfChannels('', []);
}

/* route.get("/channels", [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        const AssetChannel = req.connection_db.define('AssetsChannel', AssetsChannel.mainStructure, AssetsChannel.options);
        const list = await AssetChannel.findAll({
            attributes: ['asset']
        })
        res.status( 200 ).json( list )
    } catch( e ) {
        console.log( e )
        res.status( 200 ).json([])
    }
}) */


route.get("/channel/:channelID/files/:token" , async(req, res, next) => {
    try{
        const { token, channelID } = req.params;
        const web = new WebClient(token);
        
        // channel name without space and no special characters
        const result = await web.files.list({
            channel: channelID
        })
        //console.log(result);

        if(result && result.ok === true) {
            const { files } = result;
            res.status(200).json(files);
        }
    } catch (e) {
        console.log(e)
        res.status(401).send(`Error: ${e.data.error}`);
    }
})



module.exports = route;