const { WebClient, ErrorCode, LogLevel  } = require('@slack/web-api')
const config = require("../config/db.config")
/**
 * Create a new Slack helper.
 * @param {string} accessToken An authorized OAuth2 access token.
 * @constructor
 */
var SlackHelper = function() {
    console.log("I AM IN SLACK Intialization", process.env.SLACK_ADMIN_TOKEN, process.env.SLACK_ADMIN_REFRESH_TOKEN)
    //process.env.SLACK_ADMIN_TOKEN, process.env.SLACK_ADMIN_REFRESH_TOKEN
    
    this.web = new WebClient(process.env.SLACK_ADMIN_TOKEN, {
        logLevel: LogLevel.DEBUG
    });   
    
};
  
module.exports = SlackHelper;

SlackHelper.prototype.testToken = async function() {
    try {
        var self = this;

        const result = await self.web.auth.test( {token: process.env.SLACK_ADMIN_TOKEN} )  
        console.log('testToken', result)  
        if(result) {
            return true
        } else {
            return false
        }
    } catch( err ) {
        console.log('Test token err', err)
        return false
    }
}

SlackHelper.prototype.refreshToken = async function() {
    /* try {

        const { slackConfig } = config;
        console.log({
            client_id: slackConfig.clientID,
            client_secret: slackConfig.clientSecret,
            grant_type: 'refresh_token',
            refresh_token: process.env.SLACK_ADMIN_REFRESH_TOKEN
        })
        const result = await (new WebClient()).oauth.v2.access({
            client_id: slackConfig.clientID,
            client_secret: slackConfig.clientSecret,
            grant_type: 'refresh_token',
            refresh_token: process.env.SLACK_ADMIN_REFRESH_TOKEN
        });

        console.log(result)
        if(result && result.ok === true) {
            //GET TOKEN            
            this.web = new WebClient(result.access_token);           
            process.env.SLACK_ADMIN_REFRESH_TOKEN = result.refresh_token
            process.env.SLACK_ADMIN_TOKEN = result.access_token
            return true
        } else {
            return false
        }
    } catch( err ) {
        console.log("RefreshToken", err)
        return false
    } */
}


/**
 * Create a Worspace with the given name.
 * @param  {string}   title    The name of the Worspace.
 * @param  {Function} callback The callback function.
 */
SlackHelper.prototype.createWorkSpace = async function(params, callback) {
    var self = this;
    try {           
        console.log('Sending Workspace request')
        const result = await self.web.admin.teams.create( params )    
        console.log('createWorkSpace', result)
        callback(null, result)
    } catch( err ) {
        if (err.code === ErrorCode.PlatformError) {
            callback(err)
        } else {
            callback(err)
        }
    }    
}

SlackHelper.prototype.getTeamInfo = async function(params, callback) {
    var self = this;
    try {           
        console.log('Sending Workspace Info')
        const result = await self.web.team.info( params )    
        console.log('Workspace Info Response', result)
        callback(null, result)
    } catch( err ) {
        console.log('Workspace Info error', err)
        if (err.code === ErrorCode.PlatformError) {
            console.log('Workspace Info error', err.data)
            callback(err)
        } else {
            callback(err)
        }
    } 
}


SlackHelper.prototype.getTeamAdminList = async function(params, callback) {
    var self = this;
    try {           
        console.log('Sending getTeamAdminList request')
        const result = await self.web.admin.teams.admins.list( params )    
        console.log('Response getTeamAdminList', result)
        callback(null, result)
    } catch( err ) {
        if (err.code === ErrorCode.PlatformError) {
            console.log('Error getTeamAdminList', err.data)
            callback(err)
        } else {
            callback(err)
        }
    } 
}


SlackHelper.prototype.setTeamDiscoverability = async function(params, callback) {
    var self = this;
    try {           
        console.log('Sending setTeamDiscoverability request')
        const result = await self.web.admin.teams.settings.setDiscoverability( params )    
        console.log('Response setTeamDiscoverability', result)
        callback(null, result)
    } catch( err ) {
        if (err.code === ErrorCode.PlatformError) {
            console.log('Error setTeamDiscoverability', err.data)
            callback(err)
        } else {
            callback(err)
        }
    } 
}

SlackHelper.prototype.adduserAssignToTeam = async function(params, callback) {    
    try {           
        var self = this;
        console.log('Sending Assign user to workspace')
        const result = await self.web.admin.users.assign( params )    
        console.log('Assign user to workspace Info Response', result)
        callback(null, result)
    } catch( err ) {
        console.log('Assign user to workspace Info error', err)
        if (err.code === ErrorCode.PlatformError) {
            console.log('Assign user to workspace Info error', err.data)            
        }
        callback(err)
    } 
}

SlackHelper.prototype.addInvite = async function(params, callback) {    
    try {
        var self = this;
        console.log('Sending addInvite user to workspace')
        const result = await self.web.admin.users.invite( params )    
        console.log('addInvite user to workspace Info Response', result)
        callback(result)   
    } catch( err ) {
        if (err.code === ErrorCode.PlatformError) { 
            console.log('addInvite user to workspace Info error', err.data)
        }
        callback(err)
    }
}

SlackHelper.prototype.createUserGroups = async function(params, callback) {
    try {
        var self = this;
        console.log('Sending createUserGroup request')
        const result = await self.web.usergroups.create( params )   
        callback(result)    
    } catch ( err ) {
        if (err.code === ErrorCode.PlatformError) {
            console.log('createUserGroup error', err.data)
        }
        callback(err)
    }
}

SlackHelper.prototype.usergroupsList = async function(params, callback) {
    try {
        var self = this;
        console.log('Sending usergroupsList request')
        const result = await self.web.usergroups.list( params )   
        callback(result)    
    } catch ( err ) {
        if (err.code === ErrorCode.PlatformError) {
            console.log('usergroupsList error', err.data)
        }
        callback(err)
    }
}

SlackHelper.prototype.usergroupsUsersList = async function(params, callback) {
    try {
        var self = this;
        console.log('Sending usergroupsUsersList request')
        const result = await self.web.usergroups.users.list( params )   
        callback(result)    
    } catch ( err ) {
        if (err.code === ErrorCode.PlatformError) {
            console.log('usergroupsUsersList error', err.data)
        }
        callback(err)
    }
}

SlackHelper.prototype.usergroupsUsersUpdate = async function(params, callback) {
    try {
        var self = this;
        console.log('Sending usergroupsUsersUpdate request')
        const result = await self.web.usergroups.users.update( params )   
        callback(result)    
    } catch ( err ) {
        if (err.code === ErrorCode.PlatformError) {
            console.log('usergroupsUsersUpdate error', err.data)
        }
        callback(err)
    }
} 

SlackHelper.prototype.usergroupsaddTeams = async function(params, callback) {
    try {
        var self = this;
        console.log('Sending usergroupsaddTeams request')
        const result = await self.web.admin.usergroups.addTeams( params )   
        callback(result)    
    } catch ( err ) {
        if (err.code === ErrorCode.PlatformError) {
            console.log('usergroupsaddTeams error', err.data)
        }
        callback(err)
    }
}

SlackHelper.prototype.userSetAdmin = async function(params, callback) {
    try {
        var self = this;
        console.log('Sending userSetAdmin request')
        const result = await self.web.admin.users.setAdmin( params )   
        callback(result)    
    } catch ( err ) {
        if (err.code === ErrorCode.PlatformError) {
            console.log('userSetAdmin error', err.data)
        }
        callback(err)
    }
}

SlackHelper.prototype.userSetOwner = async function(params, callback) {
    try {
        var self = this;
        console.log('Sending userSetOwner request')
        const result = await self.web.admin.users.setOwner( params )   
        callback(result)    
    } catch ( err ) {
        if (err.code === ErrorCode.PlatformError) {
            console.log('userSetOwner error', err.data)
        }
        callback(err)
    }
}

SlackHelper.prototype.userSetRegular = async function(params, callback) {
    try {
        var self = this;
        console.log('Sending userSetRegular request')
        const result = await self.web.admin.users.setRegular( params )   
        callback(result)    
    } catch ( err ) {
        if (err.code === ErrorCode.PlatformError) {
            console.log('userSetRegular error', err.data)
        }
        callback(err)
    }
}

SlackHelper.prototype.adminConversationSearch = async function(params, callback) {    
    try {        
        var self = this;
        const reteivePageOfConversations = async( nextPageToken, result) => {        
            const request = {
                limit : 20,
            }
            if(params !== null) {
                request.team_ids = params.team_ids,
                request.search_channel_types = 'private_exclude,exclude_archived'
            } 
            if(nextPageToken != '') {
                request.cursor = nextPageToken
            }
            const response = await self.web.admin.conversations.search(request) 
            if(response) {
                result = result.concat(response.conversations);
    
                nextPageToken = response.response_metadata.next_cursor;
    
                if(nextPageToken && nextPageToken != '') {
                    await reteivePageOfConversations(nextPageToken, result)
                } else {
                    callback(result)
                }
            } else {
                callback(result)
            }
        }
        await reteivePageOfConversations('', []);      
    } catch( err ) {
        if (err.code === ErrorCode.PlatformError) {
            console.log("Error in Platform", err.data, err.data.response_metadata)
        }
        callback(err)
    }    
}

SlackHelper.prototype.getAllChannels = async function(params, callback) {
    var self = this;
    try{
        const reteivePageOfChannels = async( nextPageToken, result) => {
        
            const request = {
                limit : 1000,
            }
            if(params !== null) {
                request.team_id = params.team_id
            } 
            if(nextPageToken != '') {
                request.cursor = nextPageToken
            }
            console.log(request)
            const response = await self.web.conversations.list(request) 
    
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
    } catch( err ) {
        if (err.code === ErrorCode.PlatformError) {
            console.log("Error in Platform", err.data, err.data.response_metadata)
        }
    }    
}

SlackHelper.prototype.getAllTeams = async function(params, callback) {    
    try{
        var self = this;
        const reteivePageOfTeams = async( nextPageToken, result) => {
        
            const request = {
                limit : 100,
            }
            if(nextPageToken != '') {
                request.cursor = nextPageToken
            }
            const response = await self.web.admin.teams.list(request) 
            console.log(response)
            if(response) {
                result = result.concat(response.teams);
    
                nextPageToken = response.response_metadata.next_cursor;
    
                if(nextPageToken && nextPageToken != '') {
                    await reteivePageOfTeams(nextPageToken, result)
                } else {
                    callback(result)
                }
            } else {
                callback(result)
            }
        }
        await reteivePageOfTeams('', []);       
    } catch( err ) {
        if (err.code === ErrorCode.PlatformError) {
            console.log("Error in Platform", err.data, err.data.response_metadata)
        }
    }    
}

SlackHelper.prototype.getTeamUserList = async function(params, callback) {    
    try {
        var self = this;
        const reteivePageOfUsers = async( nextPageToken, result) => {
        
            const request = {
                limit : 100,
            }
            if(params !== null) {
                request.team_id = params.team_id
            }
            if(nextPageToken != '') {
                request.cursor = nextPageToken
            }
            console.log(request)
            const response = await self.web.admin.users.list(request) 
            console.log(response)
            if(response) {
                result = result.concat(response.users);
    
                nextPageToken = response.response_metadata.next_cursor;
    
                if(nextPageToken && nextPageToken != '') {
                    await reteivePageOfUsers(nextPageToken, result)
                } else {
                    callback(result)
                }
            } else {
                callback(result)
            }
        }
        await reteivePageOfUsers('', []);       
    } catch( err ) {
        if (err.code === ErrorCode.PlatformError) {
            console.log("Error in Platform", err.data, err.data.response_metadata)
        }
    }    
}

SlackHelper.prototype.findWorkSpace = async function(list, workspaceName, organisation) {
    const findTeam = list.filter( row => {
        if(row.name === workspaceName) {
            let teamURL = row.team_url.toString().replace('https://', '')
            teamURL = teamURL.replace('.slack.com/', '')
            if(teamURL !== '' && teamURL.substring(0, organisation.team.length).toLowerCase() === organisation.team.toString().toLowerCase()) {
                return row
            }
        }
    })
    return findTeam
} 

SlackHelper.prototype.updateMembersToUserGroup = async function(type, team_id, groupName) {
    try {
        var self = this;
        self.usergroupsList({
            team_id
        }, function(response){
            if(response.ok === true) {
                if(response.usergroups.length > 0) {
                    const groupList = response.usergroups
                    const findIndex = groupList.findIndex( group => group.name == groupName)
                    if(findIndex !== -1) {
                        self.getTeamUserList({team_id}, (userList) => {                             
                            if(userList.length > 0) {                                        
                                const userIDs = []
                                userList.forEach( user => userIDs.push(user.id))
                                console.log('updateMembersToUserGroup3-3', userIDs)
                                self.usergroupsUsersUpdate({
                                    usergroup: groupList[findIndex].id,
                                    users: userIDs.join(','),
                                    team_id
                                }, function( usergroupUsersResult ) {
                                    console.log('updateMembersToUserGroup4', usergroupUsersResult)
                                })
                            } else {
                                console.log('updateMembersToUserGroup6 no users found')
                            }
                        })
                    } else {
                        console.log('updateMembersToUserGroup5 group name not found')
                    }
                } else {
                    console.log('updateMembersToUserGroup7 group name not found')
                } 
            } else {
                console.log('updateMembersToUserGroup8 grouplist response error')
            } 
        })
    } catch( err ) {
        console.log('updateMembersToUserGroup', err)
    }
}