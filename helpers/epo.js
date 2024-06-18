const { Curl } = require('node-libcurl');
const querystring = require('querystring');
const { Buffer } = require('buffer');
const fs = require('fs/promises');
const util = require('util');

const TOKEN_FILE_PATH = '/var/www/html/trash/tmp/'

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
    const tokenURL = 'https://ops.epo.org/3.2/auth/accesstoken',
        tokenHeader = [`Authorization: Basic ${bufferKeySecret}`, 'Content-Type: application/x-www-form-urlencoded']    
    
    return curlRequest(true, tokenHeader, 'POST', tokenURL, { grant_type: 'client_credentials' })
    
}

const curlRequest = (grant, header, type, url, postFields) => {
    const tokenName = 'HedCET'
    const curl = new Curl();
    const close = curl.close.bind(curl)
    curl.setOpt(Curl.option.URL, url)    
    curl.setOpt(Curl.option.SSL_VERIFYHOST, false)
    curl.setOpt(Curl.option.SSL_VERIFYPEER, false)
    curl.setOpt(Curl.option.VERBOSE, true)
    curl.setOpt(Curl.option.HTTPHEADER, header)

    if(type == 'POST') {
        curl.setOpt(Curl.option.POST, true)
        curl.setOpt(Curl.option.POSTFIELDS, querystring.stringify(postFields))
    }
    curl.on('error', (error, errorCode) => {
        console.error('Error: ', error)
        console.error('Code: ', errorCode)
        close();
    })
    curl.perform();
    return new Promise(function (resolve, reject) {
        curl.on('end', async (statusCode, data, headers) => {   
            if(grant === true) {
                await fs.writeFile(`${TOKEN_FILE_PATH}${tokenName}_node.dat`, JSON.stringify(data))               
            }
            close();
            resolve(data);
        });
    })
}

const runUrl = async(token,A,B,C,D) => {
    if(typeof token === 'string') {
        token = JSON.parse(token)
    }
    const requestHeader = ['Accept: application/xml', `Authorization: Bearer ${token.access_token}`, 'Connection: Keep-Alive', 'Host: ops.epo.org', 'X-Target-URI: https://ops.epo.org']
    console.log('requestHeader', requestHeader)
    const request_url = util.format("https://ops.epo.org/3.2/rest-services/%s/%s/%s/%s", A, B, C, D);
    console.log('runUrl', request_url)
    return curlRequest(false, requestHeader, 'GET', request_url, {})
}

const singleUrl = async(token,A, contentType) => {
    if(typeof token === 'string') {
        token = JSON.parse(token)
    }
    const requestHeader = [`Authorization: Bearer ${token.access_token}`, 'Connection: Keep-Alive', 'Host: ops.epo.org', 'X-Target-URI: https://ops.epo.org']
    if(typeof contentType === 'undefined') {
        requestHeader.push("application/xml")
    }
    console.log('requestHeader', requestHeader)
    const request_url = util.format("https://ops.epo.org/3.2/rest-services/%s", A);
    console.log('runUrl', request_url)
    return curlRequest(false, requestHeader, 'GET', request_url, {})
}

const EPOHelper = {}
EPOHelper.readToken = readToken
EPOHelper.runUrl = runUrl
EPOHelper.singleUrl = singleUrl
module.exports = EPOHelper;