const express = require("express");
const fetch = require('isomorphic-fetch');;
const route = express.Router();
const config = require("../../config/db.config")

const microsoftTokenMiddleware = require('../../helpers/microsoftMiddelware');

const AssetsChannel = require("../../model/client/AssetsChannel")
const Documentids = require("../../model/application/DocumentIds")
const Users = require("../../model/business/Users")
const Organisations = require("../../model/business/Organisations")


const authJWT = require("../../helpers/verifyJwtToken")
const clientDBConnection = require("../../helpers/clientDBConnection")

const   jwt = require('jsonwebtoken'),
        bcrypt = require('bcrypt'),
        moment = require("moment");

 
const {  Client  } = require("@microsoft/microsoft-graph-client");
const { error } = require("winston");
require('isomorphic-fetch');
const TEAMNAME = 'PatenTrack'
/* const getAuthenticatedClient = async(accessToken) => {  
    const client = await Client.init({ 
        authProvider: (done) => {
            done(null, accessToken);
        }
    });
    return client;
} */

function getAuthenticatedClient(accessToken) {
    return Client.init({
        authProvider: (done) => {
            done(null, accessToken); // pass the access token to the SDK
        }
    });
} 

const getTeam = async (client) => {
    const teams = await client.api('/me/joinedTeams').get();  
    console.log('getTeam', getTeam)
    const patentTrackTeam = teams.value.find(team => team.displayName === TEAMNAME);
    const teamId = patentTrackTeam ? patentTrackTeam.id : null;
    return teamId;
}

const getUserInfo = async(client) => {
    const user = await client.api('/me').get(); 
    console.log('getUserInfo', getUserInfo)
    return user
}

const refreshAccessToken = async(refreshToken) => {
    const SCOPES = "openid profile offline_access"; 
    const {microsoftConfig} = config
    const tokenUrl = `https://login.microsoftonline.com/${microsoftConfig.tenantId}/oauth2/v2.0/token` 
    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            client_id: microsoftConfig.clientID,
            client_secret: microsoftConfig.clientSecret,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            scope: SCOPES,
        }),
    });

    const data = await response.json();
    console.log(data)
    return data;
}

route.get('/me', [authJWT.verifyToken, microsoftTokenMiddleware], async(req, res, next) => {
    // Obtain user information using the acquired token
    try {
        const client = getAuthenticatedClient(req.microsoftTokens.accessToken) 
        const user = await getUserInfo(client)
        res.status(200).send({ message: "Authenticated", user });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error retrieving teams");
    } 
});


route.get('/team', [authJWT.verifyToken, microsoftTokenMiddleware], async (req, res) => { 
    try {
        const client = getAuthenticatedClient(req.microsoftTokens.accessToken);  
        const teamId = await getTeam(client);    

        if(teamId) {
            let findOrganisation = await Organisations.findOne({
                where: {microsoft_team: teamId}
            })

            if( !findOrganisation ) {
                findOrganisation  = await helpers.findOrganisationbyID(req.orgId);
                await Organisations.update({microsoft_team: teamId},{where: {organisation_id: req.orgId}})
            }
        }
        res.status(200).send({
            message: teamId ? "Team found" : "Team not found",
            teamId
        }); 
    } catch (err) { 
        if(err.code == "InvalidAuthenticationToken") {
            res.status(401).send("Refresh microsoft token");
        } else {
            res.status(500).send("Error retrieving teams");
        } 
    }
}); 

route.post("/team" , [authJWT.verifyToken, microsoftTokenMiddleware],  async(req, res, next) => {
    try{ 
        const client =  getAuthenticatedClient(req.microsoftTokens.accessToken) 
        let teamId = await getTeam(client);   
        if(!teamId) {
            const team = { 
                "displayName": TEAMNAME,
                "description": `This team created from PatenTrack application`,
                "visibility": "Private",  
            }; 
            const response = await client.api('/teams')
                                .post(team);
            const locationHeader = response.headers.get('location');
            const contentLocationHeader = response.headers.get('content-location');
            teamId = contentLocationHeader.match(/teams\('(.+?)'\)/)[1];
        } 
        
        if(teamId) {
            let findOrganisation = await Organisations.findOne({
                where: {microsoft_team: teamId}
            })

            if( !findOrganisation ) {
                findOrganisation  = await helpers.findOrganisationbyID(req.orgId);
                await Organisations.update({microsoft_team: teamId},{where: {organisation_id: req.orgId}})
            }
        }

        res.status(200).send({
            message: "Team created successfully",
            teamId: teamId
        });
    } catch (err) {
        console.error('Error creating team:', error);
        res.status(500).send({
            message: "Error creating team",
            error: error.message
        });
    }   
}) 

const findChannel = async(client, teamId, channelName, microsoftTokens) => {
    try {
        const channels = await client
        .api(`/teams/${teamId}/channels`)
        .filter(`membershipType eq 'private' and displayName eq '${channelName}'`)
        .get();

        const existingChannel = channels.value.find(channel => channel.displayName === channelName);

        return existingChannel
    } catch (err) {
        if (err.statusCode === 401 && err.code === 'InvalidAuthenticationToken') {
            console.log('Token expired. Attempting to refresh the token.');
      
            try {
              // Refresh the token using the refresh token
              const newTokens = await refreshAccessToken(microsoftTokens.refreshToken);
      
              // Update microsoftTokens with the new access token
              microsoftTokens.accessToken = newTokens.accessToken;
      
              // Create a new client with the new token
              const newClient = getAuthenticatedClient(newTokens.accessToken);
      
              // Retry creating the channel with the new client and updated token
              const channels = await newClient
                .api(`/teams/${teamId}/channels`)
                .filter(`membershipType eq 'private' and displayName eq '${channelName}'`)
                .get();
      
              console.log('all channels after token refresh', channels);
      
              const existingChannel = channels.value.find(channel => channel.displayName === channelName);
              return existingChannel
            } catch (refreshError) {
                console.error('Error refreshing the token:', refreshError);
                throw new Error('Failed to refresh the token.');
            }
        } else {
            throw err;
        }
    }
}
 
// Function to get the list of channels in a team
async function checkAndCreateChannel(client, teamId, postChannel, microsoftTokens) {
    try {
      console.log('checkAndCreateChannel');
      
      // Fetch channels
      const channels = await client
        .api(`/teams/${teamId}/channels`)
        .filter(`membershipType eq 'private' and displayName eq '${postChannel.displayName}'`)
        .get();
      
      console.log('all channels', channels);
  
      // Step 2: Check if the channel already exists
      const existingChannel = channels.value.find(channel => channel.displayName === postChannel.displayName);
  
      if (existingChannel) {
        console.log(`Channel '${postChannel.displayName}' already exists with ID: ${existingChannel.id}`);
        return existingChannel.id;
      } else {
        // Create a new channel if it doesn't exist
        const createdChannel = await client
          .api(`/teams/${teamId}/channels`)
          .post(postChannel);
        console.log('new Channel', createdChannel);
        console.log(`Created new channel '${postChannel.displayName}' with ID: ${createdChannel.id}`);
        return createdChannel.id;
      }
    } catch (err) {
      console.error('Error in checkAndCreateChannel:', err);
  
      // If the error is related to token expiration
      if (err.statusCode === 401 && err.code === 'InvalidAuthenticationToken') {
        console.log('Token expired. Attempting to refresh the token.');
  
        try {
          // Refresh the token using the refresh token
          const newTokens = await refreshAccessToken(microsoftTokens.refreshToken);
  
          // Update microsoftTokens with the new access token
          microsoftTokens.accessToken = newTokens.accessToken;
  
          // Create a new client with the new token
          const newClient = getAuthenticatedClient(newTokens.accessToken);
  
          // Retry creating the channel with the new client and updated token
          const channels = await newClient
            .api(`/teams/${teamId}/channels`)
            .filter(`membershipType eq 'private' and displayName eq '${postChannel.displayName}'`)
            .get();
  
          console.log('all channels after token refresh', channels);
  
          const existingChannel = channels.value.find(channel => channel.displayName === postChannel.displayName);
  
          if (existingChannel) {
            console.log(`Channel '${postChannel.displayName}' already exists with ID: ${existingChannel.id}`);
            return existingChannel.id;
          } else {
            const createdChannel = await newClient
              .api(`/teams/${teamId}/channels`)
              .post(postChannel);
            console.log('new Channel after token refresh', createdChannel);
            console.log(`Created new channel '${postChannel.displayName}' with ID: ${createdChannel.id}`);
            return createdChannel.id;
          }
        } catch (refreshError) {
          console.error('Error refreshing the token:', refreshError);
          throw new Error('Failed to refresh the token.');
        }
      } else {
        // If the error is not related to authentication, throw it
        throw err;
      }
    }
}
 
route.post('/channel/:teamID', [authJWT.verifyToken, microsoftTokenMiddleware],  async(req, res, next) => {
    console.log("create channel")
    try {
        const {name, description} = req.body
        const client  =  getAuthenticatedClient(req.microsoftTokens.accessToken) 
        const channel = {
            displayName: name,
            description: description,
            membershipType: 'private'
        };
        console.log("Channel desc", channel)
        const channelId = await checkAndCreateChannel(client, req.params.teamID, channel, req.microsoftTokens); 
        res.status(200).json({ channelId }); 
    } catch (err) {
        console.error('Error in route handler:', err);
        res.status(500).json({ error: 'An error occurred while checking or creating the channel.' });
    }
}) 

route.get('/channel/:teamID/:name', [authJWT.verifyToken, microsoftTokenMiddleware],  async(req, res, next) => { 
    try { 
        const client  =  getAuthenticatedClient(req.microsoftTokens.accessToken) 
        const displayName = req.params.name; 
        const existingChannel = await findChannel(client, req.params.teamID, displayName, req.microsoftTokens); 
        let channelId = existingChannel?.id ?? null
        res.status(200).json({ channelId }); 
    } catch (err) {
        console.error('Error in route handler:', err);
        res.status(500).json({ error: 'An error occurred while checking or creating the channel.' });
    }
}) 

const getChannelFilesFolder = async (client, teamId, channelId, maxRetries = 5, delay = 5000) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Attempt to get the channel's files folder
        const folder = await client.api(`/teams/${teamId}/channels/${channelId}/filesFolder`).get();
        console.log("Channel's files folder is ready:", folder);
        return folder; // Return the folder if ready
      } catch (error) {
        if (error.message.includes("Folder location for this channel is not ready yet")) {
          console.warn(`Attempt ${attempt} - Folder not ready. Retrying in ${delay / 1000} seconds...`);
          
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, delay)); // Wait before retrying
          } else {
            throw new Error("Max retries reached. Folder is still not ready.");
          }
        } else {
          throw error; // Throw if it's an unexpected error
        }
      }
    }
  };

route.get('/:teamId/channels/:channelId/filesFolder', [authJWT.verifyToken, microsoftTokenMiddleware], async(req, res) => {
    try {
        const {teamId, channelId} = req.params
        
        const client  =  getAuthenticatedClient(req.microsoftTokens.accessToken) 
        const folder = await getChannelFilesFolder(client, teamId, channelId); 
        res.status(200).json({ folder });  
    } catch (err) {
        console.log('channel files folder', err)
        res.status(500).json({ error: 'An error occurred while retreiving channel files folder.' });
    }
})

const uploadFileToChannel = async(client, teamId, channelId, fileContent, fileName, mimeType) => {
    console.log("I am in uploadFileToChannel");

    /* let driveItem = await client.api('/me/drive/root')
	.get();
    console.log('driveItem', driveItem)

    let groups = await client.api('/groups')
	.get();

    console.log('groups', groups) */

    /* const site = await client.api(`/sites/root`).get();
    console.log('site', site)
    const siteId = site.id; */
    

    // Fetch the SharePoint site ID for the team
    /* const siteTeam = await client.api(`/teams/${teamId}/group/sites/root`).get();
    console.log('site', siteTeam)
    const siteId = siteTeam.id; */

    // Fetch the folder where to upload
    const folderResponse = await getChannelFilesFolder(client, teamId, channelId);
    console.log('folderResponse', folderResponse);

    const folderId = folderResponse.id;

    // Construct the upload URL using siteId
    // const uploadFileUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${folderId}:/${fileName}:/content`;

    const uploadFileUrl = `https://graph.microsoft.com/v1.0/drives/${folderResponse.parentReference.driveId}/items/${folderId}:/${fileName}:/content`;

    // Upload the file
    const uploadResponse = await client
        .api(uploadFileUrl)
        .put(fileContent, { headers: { 'Content-Type': mimeType } });

    console.log('File uploaded successfully:', uploadResponse);
    return uploadResponse;
}

const sendMessageToChannel = async(client, teamId, channelId, messageContent, remote_file, edit, reply, user, req) => {
    try {
        const message = {
            body: {
                contentType: 'html',
                content: messageContent,
            },
        };
        console.log('sendMessageChannel', client, teamId, channelId, messageContent, remote_file, edit, reply, user)
        if(remote_file != '' && remote_file != null && remote_file != undefined) {
            let remoteFiles = JSON.parse(remote_file)
            if(remoteFiles.length > 0) {
                let attachments = [];
                files.map( (file, index)  => {
                    message.body.content += ` <attachment id="${index}"></attachment>` 
                    attachments.push({
                        id: index,
                        contentType: file.mimeType,
                        content: {
                            title: file.name,
                            subtitle: 'Click to view the document',
                            buttons: [
                            {
                                title: file.name,
                                value: file.webViewLink,
                            }]
                        }
                    })
                })
                message.attachments = attachments
            }
        } 

        if(user != null && user != '') {
            const getUser = await getUsersInTeam(client, teamId)
            const findUser = getUser.findIndex(item => item.userId = user)
            console.log('findUser', findUser)
            if(findUser != -1) {
                const mention = [{
                    id: 0,  
                    mentionText: getUser[findUser].displayName, 
                    mentioned: {
                        user: {
                            id: user,
                            name:getUser[findUser].displayName  
                        }
                    }
                }]
                message.mentions = mention
            } 
        }

        if(req.files != null && req.files != undefined && req.files.file != undefined) { 
            const mimeType = req.files.file.mimetype
            const fileName = req.files.file.name.replace(/\s+/g, '-')
            const fileContent = req.files.file.data
            if(mimeType != null && mimeType != '' && mimeType.toLowerCase().indexOf('.exe') < 0){
                const fileUploaded = await uploadFileToChannel(client, teamId, channelId, fileContent, fileName, mimeType)

                if(fileUploaded) {
                    message.body.content += ` <attachment id="${fileUploaded.id}"></attachment>` 

                    message.attachments = [
                        {
                            id: fileUploaded.id,
                            contentType: 'reference',
                            contentUrl: fileUploaded.webUrl
                        }
                    ]
                }
            } 
        }
        let sendMessageURl = `/teams/${teamId}/channels/${channelId}/messages`

        if((edit != null && edit === true) && reply != null && reply != '') {
            sendMessageURl = `/teams/${teamId}/channels/${channelId}/messages/${reply}/replies` 
        } 
        console.log('message---', message)
        const response = await client
            .api(`/teams/${teamId}/channels/${channelId}/messages`)
            .post(message); 
        return response;
    } catch (err) {
      console.error('Error sending message to channel:', err);
      throw err;
    }
}

async function getMessagesFromChannel(client, teamId, channelId) {
    try {
        const response = await client
            .api(`/teams/${teamId}/channels/${channelId}/messages`)
            .get();
         
        return response.value;  
    } catch (err) {
      console.error('Error retrieving messages from channel:', err);
      throw err;  
    }
}

route.post('/:teamId/channels/:channelId/messages', [authJWT.verifyToken, microsoftTokenMiddleware],  async(req, res, next) => { 
    try { 
        const { teamId, channelId } = req.params 
        let { text, remote_file, reply, user, edit } = req.body 

        text = text.replace(/&lt;p&gt;/g, '')
        text = text.replace(/&lt;\/p&gt;/g, '')
        text = text.replace(/&lt;br&gt;/g, "\n")
        text = text.replace(/&lt;slackusermention&gt;/g, '')
        text = text.replace(/&lt;\/slackusermention&gt;/g, '')

        text = text.replace(/&lt;patentracklinebreak&gt;/g, "\n")
        text = text.replace(/&lt;\/patentracklinebreak&gt;/g, '')

        text = text.replace(/&amp;nbsp;/g, ' ')
        const client  =  getAuthenticatedClient(req.microsoftTokens.accessToken) 
        await sendMessageToChannel(client, teamId, channelId, text, remote_file, edit, reply, user, req)
        res.status(200).json({status: 'Message sent', teamId, channel: channelId});  
    } catch (err) {
        console.error('Error in route handler:', err);
        res.status(500).json({ error: 'An error occurred sending message.' });
    }
});

route.get('/:teamId/channels/:channelId/messages', [authJWT.verifyToken,  microsoftTokenMiddleware],  async(req, res, next) => {
    console.log("send message")
    try { 
        const { teamId, channelId } = req.params  
        const client = getAuthenticatedClient(req.microsoftTokens.accessToken) 
        const messages = await getMessagesFromChannel(client, teamId, channelId)
        const members = await getUsersInTeam(client, teamId)
        res.status(200).json({messages, users: members });
    } catch (err) {
        if(err.code == "InvalidAuthenticationToken") {
            res.status(401).send("Refresh microsoft token");
        } else {
            res.status(500).json('An error occurred while retreiving message.');
        } 
    }
});

const getAllChannels = async(client, teamId) => {
    let channels = [];
    let response = await client.api(`/teams/${teamId}/channels`)
	.filter('membershipType eq \'private\'')
	.get();
    channels = response.value;
    while (response['@odata.nextLink']) {
        response = await client.api(response['@odata.nextLink']).get();
        channels = channels.concat(response.value);
    }

    return channels;
}

route.get('/:teamId/channels', [authJWT.verifyToken,  microsoftTokenMiddleware],  async(req, res, next) => {
    console.log("get channels")
    try { 
        const { teamId } = req.params  
        const client = getAuthenticatedClient(req.microsoftTokens.accessToken) 
        const channels = await getAllChannels(client, teamId) 
        res.status(200).json(channels);
    } catch (err) {
        if(err.code == "InvalidAuthenticationToken") {
            res.status(401).send("Refresh microsoft token");
        } else {
            res.status(500).send("An error occurred while reteieving channels");
        } 
    }
});

route.get('/:teamId/users', [authJWT.verifyToken,  microsoftTokenMiddleware],  async(req, res, next) => {
    console.log("get users")
    try { 
        const { teamId } = req.params  
        const client = getAuthenticatedClient(req.microsoftTokens.accessToken)  
        const members = await getUsersInTeam(client, teamId)
        res.status(200).json(members);
    } catch (err) {
        if(err.code == "InvalidAuthenticationToken") {
            res.status(401).send("Refresh microsoft token");
        } else {
            res.status(500).json('An error occurred while retreiving team members.');
        }
    }
});

const getUsersInTeam = async(client, teamId) => {
    try {
        const response = await client
            .api(`/teams/${teamId}/members`)
            .get();
  
        console.log('Users retrieved successfully:', response.value);
        return response.value;  
    } catch (err) {
      console.error('Error retrieving users from team:', err);
      throw err;  
    }
}


module.exports = route;