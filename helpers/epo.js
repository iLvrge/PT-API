const axios = require('axios');
const querystring = require('querystring');
const { Buffer } = require('buffer');
const fs = require('fs/promises');
const util = require('util');
const https = require('https');

const TOKEN_FILE_PATH = '/var/www/html/trash/tmp/'

// Create axios instance with SSL verification disabled (matching your curl config)
const axiosInstance = axios.create({
    httpsAgent: new https.Agent({
        rejectUnauthorized: false
    })
});

const readToken = async(tokenName) => {   
    let token; 
    try{
        let createNewToken = true ;

        if(!!(await fs.stat(`${TOKEN_FILE_PATH}${tokenName}_node.dat`).catch(() => false))){
            let data =  await fs.readFile(`${TOKEN_FILE_PATH}${tokenName}_node.dat`, "utf8");
            if( data ) {          
                token = JSON.parse(data.toString())
                if(typeof token === 'string') {
                    token = JSON.parse(token)
                }
                if(token.hasOwnProperty('issued_at') && token.hasOwnProperty('expires_in')) {
                    const tokenTime = parseInt(token.issued_at.toString().substring(0,token.issued_at.length - 3)) + parseInt(token.expires_in) - 120
                    const currentDate = new Date()
                    if( tokenTime > currentDate.getTime() ) {
                        createNewToken = false
                        token = ''
                    }
                } else {
                    token = ''
                }
            }
        }
        
        if( createNewToken === true ) {
            token = await createToken(tokenName)
        } 
        return token        
    } catch (err) {
        token = await createToken(tokenName)
        return token
    }
}

const createToken = async(tokenName) => {
    const bufferKeySecret = Buffer.from(`${process.env.EPO_KEY}:${process.env.EPO_SECRET}`).toString('base64')
    const tokenURL = 'https://ops.epo.org/3.2/auth/accesstoken'
    
    const headers = {
        'Authorization': `Basic ${bufferKeySecret}`,
        'Content-Type': 'application/x-www-form-urlencoded'
    }
    
    return axiosRequest(true, headers, 'POST', tokenURL, { grant_type: 'client_credentials' })
}

const axiosRequest = async (grant, headers, method, url, postFields) => {
    const tokenName = 'HedCET'
    
    try {
        const config = {
            method: method,
            url: url,
            headers: headers
        };

        if (method === 'POST' && postFields) {
            config.data = querystring.stringify(postFields);
        }

        const response = await axiosInstance(config);
        
        if (grant === true) {
            await fs.writeFile(`${TOKEN_FILE_PATH}${tokenName}_node.dat`, JSON.stringify(response.data))
        }
        
        return response.data;
        
    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        }
        throw error;
    }
}

const runUrl = async(token, A, B, C, D) => {
    if(typeof token === 'string') {
        token = JSON.parse(token)
    }
    
    const headers = {
        'Accept': 'application/xml',
        'Authorization': `Bearer ${token.access_token}`,
        'Connection': 'Keep-Alive',
        'Host': 'ops.epo.org',
        'X-Target-URI': 'https://ops.epo.org'
    }
    
    console.log('requestHeader', headers)
    const request_url = util.format("https://ops.epo.org/3.2/rest-services/%s/%s/%s/%s", A, B, C, D);
    console.log('runUrl', request_url)
    
    return axiosRequest(false, headers, 'GET', request_url, {})
}

const singleUrl = async(token, A, contentType) => {
    if(typeof token === 'string') {
        token = JSON.parse(token)
    }
    
    const headers = {
        'Authorization': `Bearer ${token.access_token}`,
        'Connection': 'Keep-Alive',
        'Host': 'ops.epo.org',
        'X-Target-URI': 'https://ops.epo.org'
    }
    
    if(typeof contentType !== 'undefined') {
        headers['Accept'] = contentType;
    } else {
        headers['Accept'] = 'application/xml';
    }
    
    console.log('requestHeader', headers)
    const request_url = util.format("https://ops.epo.org/3.2/rest-services/%s", A);
    console.log('runUrl', request_url)
    
    return axiosRequest(false, headers, 'GET', request_url, {})
}

const EPOHelper = {}
EPOHelper.readToken = readToken
EPOHelper.runUrl = runUrl
EPOHelper.singleUrl = singleUrl
module.exports = EPOHelper;