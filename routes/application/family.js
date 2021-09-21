const express = require("express"),

    route = express.Router(),

    authJWT = require("../../helpers/verifyJwtToken"),

    connection = require("../../config/db.config"),

    epo = require('../../helpers/epo.js'),

    xml2js = require('xml2js'),

    parser = require('fast-xml-parser'),

    xmldoc = require('xmldoc'),
    
    fs = require('fs');

const { decode } = require('html-entities');
const AWS  = require('aws-sdk');

const { exec, spawn  } = require('child_process');
//require the Model
const PatentFamilyMember = require("../../model/resources/PatentFamilyMember");
const PatentFamilyRelation = require("../../model/resources/PatentFamilyRelation");
const Documentid = require("../../model/application/DocumentIds");

const mainFolderPath = process.env.MAIN_FOLDER_PATH , extraDiskPath =   process.env.EXTRA_DISK_PATH

route.get('/family/list/:grantNumber', [authJWT.verifyToken], async (req, res) =>{
    const familyData = []
    try {
        const token = await epo.readToken('HedCET')    
        if(token !== 'undefined' && token != '') {
            let { grantNumber } = req.params
            if(grantNumber.indexOf('US') === -1) {
                grantNumber = `US${grantNumber}`
            }
            let getFamilyData = '', fileExist = false
            if (fs.existsSync(`${extraDiskPath}FAMILY/${grantNumber}.XML`)) {
                //file exists
                fileExist = true
                getFamilyData = await fs.promises.readFile(`${extraDiskPath}FAMILY/${grantNumber}.XML`, 'utf8');
            } else {
                getFamilyData = await epo.runUrl(token,'family','publication','docdb',`${grantNumber}`);
                if( !getFamilyData ) {
                    getFamilyData = await epo.runUrl(token,'family','publication','epodoc',`${grantNumber}`);
                }
            }
                    
            if( getFamilyData !== '' ) {
                const parser = new xml2js.Parser
                const xmlData = await new Promise((resolve, reject) => parser.parseString(getFamilyData, (err, result) => {
                    if (err){
                        reject(err);
                    } else {
                        resolve(result);
                    }
                }));
                
                if( xmlData.hasOwnProperty('ops:world-patent-data') ){
                    if(fileExist === false) {
                        fs.writeFileSync(`${extraDiskPath}FAMILY/${grantNumber}.XML`, xmlData);
                    }
                    console.log('IN ops:world-patent-data')
                    const worldPatentData = xmlData['ops:world-patent-data']
                    if(worldPatentData.hasOwnProperty('ops:patent-family')) {
                        console.log('IN ops:patent-family')
                        const patentFamily =  worldPatentData['ops:patent-family']
                        if( patentFamily.length > 0 && typeof patentFamily[0] !== 'undefined' ) {
                            console.log('IN patentFamily')
                            const familyMembers = patentFamily[0]['ops:family-member']
                            console.log('IN patentFamily', familyMembers.length)
                            if( familyMembers.length > 0 ) {                                
                                let familyID = 0
                                familyMembers.forEach(family => {
                                    let dbTypeData = family['publication-reference'][0]['document-id'][0]
                                    if( dbTypeData.$['document-id-type'] !== 'docdb' ) {
                                        dbTypeData = family['publication-reference'][0]['document-id'][1]
                                    }
                                    if(dbTypeData.hasOwnProperty('doc-number')) {
                                        if((familyID === 0 && dbTypeData['doc-number'] == req.params.grantNumber) || (familyID !== 0 && familyID == family.$['family-id'])) {
                                            if(familyID === 0) {
                                                familyID = family.$['family-id']
                                            }                                            
                                            familyData.push({
                                                family_id: familyID,
                                                patent_number: dbTypeData['doc-number'],
                                                publication_number: dbTypeData['doc-number'],
                                                application_number: family['application-reference'][0]['document-id'][0]['doc-number'],
                                                application_date: family['application-reference'][0]['document-id'][0]['date'],                                                
                                                publication_date: dbTypeData['date'],
                                                application_country: dbTypeData['country'],
                                                publication_country: dbTypeData['country'],
                                                publication_kind: dbTypeData['kind'],                                            
                                                application_kind: family['application-reference'][0]['document-id'][0]['kind'],
                                                classifications: null,
                                                assigments: null,
                                                images: null,
                                                abstracts: null,
                                                specification: null,
                                                claims: null,
                                                inventors: null,
                                                assignee: null,
                                                applicants: [],
                                                title: ''                             
                                            })
                                        }
                                    }
                                });
                            } else {
                                familyData.push({
                                    patent_number: req.params.grantNumber,
                                    publication_country: 'US',
                                    application_date: dbTypeData['date'],
                                    publication_kind: 'B1',
                                    classifications: null,
                                    assigments: null,
                                    images: null,
                                    abstracts: null,
                                    specification: null,
                                    claims: null,
                                    inventors: null,
                                    assignee: null,
                                    applicants: [],
                                    title: ''
                                })
                            }
                       }
                    }
                } 
            }
        }
    } catch( err ) {
        console.log('Family Data Retrival', err)
    }    
    res.status(200).json(familyData);
})

route.get("/family/:applicationNumber", [authJWT.verifyToken], async (req, res) =>{  

    try{
        const applicationNumber = req.params.applicationNumber;

        /* const applicationNumber = '09775636'; */

        let getFamily = [];
    
        const findPatent = await Documentid.findOne({
            attributes: ['rf_id', 'grant_doc_num', 'appno_date', 'title', 'grant_date'],
            where: {appno_doc_num: applicationNumber}
        })
    
        /* if(findPatent != null && findPatent.rf_id > 0 && findPatent.grant_doc_num != null && findPatent.grant_doc_num != '') {
           
    
            const queryFamily = 'SELECT * FROM patent_family_member WHERE family_id = (SELECT family_id FROM patent_family_member WHERE patent_number = :patentNumber AND family_id > 0 LIMIT 1) OR (patent_number = :patentNumber AND family_id = 0)';
    
            getFamily = await connection.resources.query(queryFamily,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: {patentNumber: findPatent.grant_doc_num}
            });
        } */      
        let asset = findPatent != null && findPatent.grant_doc_num != null && findPatent.grant_doc_num != '' ? findPatent.grant_doc_num : applicationNumber

        asset = `US${asset}`

          
        if(asset !== null && asset !== '') {
                        
            let getFamilyData = '', fileExist = false
            if (fs.existsSync(`${extraDiskPath}FAMILY/${asset}.XML`)) {
                //file exists
                console.log('FILE EXIST')
                fileExist = true
                getFamilyData = await fs.promises.readFile(`${extraDiskPath}FAMILY/${asset}.XML`, 'utf8');
            } else {
                const token = await epo.readToken('HedCET') 
                if(token !== 'undefined' && token != '') {
                    const publication = findPatent != null && findPatent.grant_doc_num != null && findPatent.grant_doc_num != '' ? 'publication' : 'application'
                    getFamilyData = await epo.runUrl(token, 'family', publication, 'docdb', `${asset}`);
                    if( !getFamilyData  || getFamilyData.indexOf('EntityNotFound') !== -1) {
                        getFamilyData = await epo.runUrl(token, 'family', publication,' epodoc', `${asset}`);
                    }
                }
            }

            if( getFamilyData !== '' ) {
                console.log('getFamilyData', getFamilyData)
                const parser = new xml2js.Parser
                const xmlData = await new Promise((resolve, reject) => parser.parseString(getFamilyData, (err, result) => {
                    if (err){
                        reject(err);
                    } else {
                        resolve(result);
                    }
                }));
                //const xmlData = JSON.stringify(result)    
                if( xmlData.hasOwnProperty('ops:world-patent-data') ){
                    
                    if(fileExist === false) {
                        fs.writeFileSync(`${extraDiskPath}FAMILY/${asset}.XML`, getFamilyData);
                    }
                    const worldPatentData = xmlData['ops:world-patent-data']
                    if(worldPatentData.hasOwnProperty('ops:patent-family')) {
                        const patentFamily =  worldPatentData['ops:patent-family']
                        if( patentFamily.length > 0 && typeof patentFamily[0] !== 'undefined' ) {
                            const familyMembers = patentFamily[0]['ops:family-member']
                            if( familyMembers.length > 0 ) {                                
                                let familyID = 0
                                familyMembers.forEach(family => {
                                    let dbTypeData = family['publication-reference'][0]['document-id'][0]
                                    if( dbTypeData.$['document-id-type'] !== 'docdb' ) {
                                        dbTypeData = family['publication-reference'][0]['document-id'][1]
                                    }
                                    if(dbTypeData.hasOwnProperty('doc-number')) {

                                        if(findPatent == null || findPatent.grant_doc_num == null || findPatent.grant_doc_num == '') {
                                            dbTypeData = family['application-reference'][0]['document-id'][0]
                                        }

                                        if((familyID === 0 && dbTypeData['doc-number'] == asset) || (familyID !== 0 && familyID == family.$['family-id'])) {
                                            if(familyID === 0 && dbTypeData['doc-number'] == asset) {
                                                familyID = family.$['family-id']
                                            }
                                            if(familyID > 0) {
                                                getFamily.push({
                                                    family_id: familyID,
                                                    patent_number: dbTypeData['doc-number'].toString(),
                                                    publication_number: dbTypeData['doc-number'].toString(),
                                                    application_number: family['application-reference'][0]['document-id'][0]['doc-number'],
                                                    application_date: family['application-reference'][0]['document-id'][0]['date'].toString(),                                                
                                                    publication_date: dbTypeData['date'].toString(),
                                                    application_country: dbTypeData['country'].toString(),
                                                    publication_country: dbTypeData['country'].toString(),
                                                    publication_kind: dbTypeData['kind'].toString(),                                            
                                                    application_kind: family['application-reference'][0]['document-id'][0]['kind'].toString(),
                                                    classifications: null,
                                                    assigments: null,
                                                    images: null,
                                                    abstracts: null,
                                                    specification: null,
                                                    claims: null,
                                                    inventors: null,
                                                    assignee: null,
                                                    applicants: [],
                                                    title: findPatent != null ? findPatent.title : ''
                                                })
                                            }                                                
                                        }
                                    }
                                });
                            } 
                        }
                    }
                }
                if(getFamily.length == 0) {
                    getFamily.push({
                        family_id: 0,
                        patent_number: findPatent != null && findPatent.grant_doc_num != null && findPatent.grant_doc_num != '' ? findPatent.grant_doc_num : null,
                        publication_number: findPatent != null && findPatent.grant_doc_num != null && findPatent.grant_doc_num != '' ? findPatent.grant_doc_num : null,                            
                        application_number: applicationNumber,    
                        publication_date: findPatent != null && findPatent.grant_doc_num != null && findPatent.grant_doc_num != '' ? findPatent.grant_date : null,                        
                        application_date: findPatent != null ? findPatent.appno_date : '00000000',
                        publication_country: 'US',
                        application_country: 'US',
                        publication_kind: findPatent != null && findPatent.grant_doc_num != null && findPatent.grant_doc_num != '' ? 'B1' : 'A',
                        application_kind: 'A',                           
                        classifications: null,
                        assigments: null,
                        images: null,
                        abstracts: null,
                        claims: null,
                        inventors: null,
                        specification: null,
                        assignee: null,
                        applicants: [],
                        title: findPatent != null ? findPatent.title : ''
                    })
                }
            }
        }
        res.status(200).json(getFamily);
    } catch( err ) {
        console.log('ERROR IN FAMILY', err);
        res.status(500).send("Internal server error.");
    }
});

let findXMLFile = async (pgPubDocNum, t) => {
    return new Promise( function(resolve, reject) {
        let findFile = ''
        const child = spawn('find', [`${t === 1 ? extraDiskPath : mainFolderPath}XML/`, '-name', `*${pgPubDocNum}*.XML`]);
        child.stdout.on('data', (data) => {
            console.log(`child.stdout: ${data}`)
            const files = data.toString().split('\n')  
            findFile = files[0]
        });
        child.stderr.on('data', (data) => {
            reject('')
        });
        child.on('close', (code) => {
            resolve(findFile)    
        })  
    })
}

let getFileContent = async (filePath) => {
    return new Promise ((resolve, reject) => {
        fs.readFile(filePath, async function(err,data){
            if (!err) {
                try {          
                    let xmlData = ''
                    let findIndex = data.indexOf('<us-patent-application')
                    if(findIndex !== -1) {                
                        xmlData = data.toString().substring(findIndex, data.length)
                    } else {
                        findIndex = data.indexOf('<patent-application-publication')
                        if(findIndex !== -1) {                
                            xmlData = data.toString().substring(findIndex, data.length)
                        }
                    }
                    resolve(xmlData)
                } catch (error) {
                    console.log(`Error while reading - 1 - ${error}`)
                    reject('')
                }
            } else {
                console.log(`Error while reading - ${err}`)
            }
        })
    })
}


const replaceContent = (search, replace, content) => {
    const regEx = new RegExp(search, "ig");
    return content.replace(regEx, replace);
}


const getContentFromXML = async (fileContent, contentType) => {
    let content = '';
    //const parser = new xml2js.Parser
    const xmlData = parser.parse( fileContent, {ignoreAttributes: false});
    
    if(contentType === 'abstract') {
        if( xmlData.hasOwnProperty('patent-application-publication') ){
            const usBibliographic = xmlData['patent-application-publication']
            let content = usBibliographic['subdoc-abstract']
            if(typeof content === 'object'){
                if(typeof content['paragraph'] !== 'undefined') {
                    content = content['paragraph']['#text']
                }
            }
        } else if( xmlData.hasOwnProperty('us-patent-application') ){ 
            const usBibliographic = xmlData['us-patent-application']
            if( usBibliographic.hasOwnProperty('abstract') ){ 
                content = usBibliographic.abstract    
                if(typeof content === 'object'){
                    if(Array.isArray(content['p'])) {
                        let paragraph = []
                        content['p'].forEach( p => {
                            paragraph.push( decode(p['#text'], {level: 'xml'}))
                        })
                        content = paragraph.join(' ')
                    } else  if(typeof content['p'] !== 'undefined') {
                        content = content['p']['#text']
                    }
                }
            }
        }
    } else if(contentType === 'specifications') {
        content = []
        fileContent = replaceContent('&lsqb;', '', fileContent)
        fileContent = replaceContent('&rsqb;', '', fileContent)
        const document = new xmldoc.XmlDocument(fileContent);
        document.eachChild((child, index, a) => {
            if(child.name === 'description' || child.name === 'subdoc-description') {
                content.push({ text: child.toString({compressed:true}) })
            }
        })
        /* if( xmlData.hasOwnProperty('patent-application-publication') ){
            const usBibliographic = xmlData['patent-application-publication']
            let description = usBibliographic['subdoc-description']['summary-of-invention']['section']
            if(Array.isArray(description)) {
                description.forEach( item => {
                    if(typeof item === 'object') {
                        if(Array.isArray(item['paragraph'])) {
                            item['paragraph'].forEach( p => {
                                content.push({
                                    text: decode(p['#text'], {level: 'xml'})
                                })
                            })
                        } else if(typeof item['paragraph'] === 'object') {
                            content.push({
                                text: decode(item['paragraph']['#text'], {level: 'xml'})
                            })
                        }                                        
                    }
                })
            }
            description = xmlData['patent-application-publication']['subdoc-description']['detailed-description']['section']
                            
            if(Array.isArray(description)) {
                description.forEach( item => {
                    if(typeof item === 'object') {
                        if(Array.isArray(item['paragraph'])) {
                            item['paragraph'].forEach( p => {
                                content.push({
                                    text: decode(p['#text'], {level: 'xml'})
                                })
                            })
                        } else if(typeof item['paragraph'] === 'object') {
                            content.push({
                                text: decode(item['paragraph']['#text'], {level: 'xml'})
                            })
                        } 
                    }
                })
            }
        } else if( xmlData.hasOwnProperty('us-patent-application') ){ 
            const usBibliographic = xmlData['us-patent-application']
            const descriptionSection = usBibliographic.description
            if(descriptionSection.hasOwnProperty('summary-of-invention')){
                content.push({
                    text: decode(descriptionSection['summary-of-invention'], {level: 'xml'})
                })
            }
            description = description.p
            
            if(Array.isArray(description)) {
                description.forEach( item => {
                    if(typeof item === 'object') {
                        content.push({
                            text: decode(item['#text'], {level: 'xml'})
                        })
                    }
                })
            }
        } */
    } else if(contentType === 'claims') {
        content = []
        fileContent = replaceContent('&lsqb;', '', fileContent)
        fileContent = replaceContent('&rsqb;', '', fileContent)         
        const document = new xmldoc.XmlDocument(fileContent);
        document.eachChild((child, index, a) => {
            if(child.name === 'claims' || child.name === 'subdoc-claims') {
                let claims = child.toString({compressed:true})

                claims = replaceContent('<claim-text', ' <span', claims)
                claims = replaceContent('</claim-text>', '</span>', claims)

                claims = replaceContent('<claim-ref', ' <span', claims)
                claims = replaceContent('</claim-ref>', '</span>', claims)

                claims = replaceContent('<claim', '<p', claims)
                claims = replaceContent('</claim>', '</p>', claims)
               
                content.push({ text: claims })
            }
        })
        /* if( xmlData.hasOwnProperty('patent-application-publication') ){
            const usBibliographic = xmlData['patent-application-publication']
            let usClaims = usBibliographic['subdoc-claims'].claim
            if(Array.isArray(usClaims)) {
                if(usClaims.length > 0) {
                    const promiseClaims = usClaims.map( async claim => {
                        let text = '';
                        const recursiveClaim = async (element, t) => {
                            if(typeof element === 'object') {
                                text += `<div class="claim-text ${t} ${element.hasOwnProperty('claim-ref') ? t == "" ? 'patent-text-1' : t+'-1' : ''}">${element.hasOwnProperty('b') ? element['b'] : ''}${element['#text']}</div>`
                                if(typeof element.hasOwnProperty('claim-text')) {
                                    if(Array.isArray(element['claim-text'])) {
                                        element['claim-text'].forEach(async claimText => {
                                            text += await recursiveClaim(claimText, 'patent-text')
                                        })
                                    } else if(typeof element['claim-text'] === 'string'){
                                        text += `<div class="claim-text ${t} ${element.hasOwnProperty('claim-ref') ? t == "" ? 'patent-text-1' : t+'-1' : ''}">${element['claim-text']}</div>`
                                    }
                                }
                            } else if(typeof element === 'string') {
                                text += `<div class="claim-text ${t} ${element.hasOwnProperty('claim-ref') ? t == "" ? 'patent-text-1' : t+'-1' : ''}">${element}</div>`
                            }
                            return text
                        }
                        
                        text = await recursiveClaim(claim['claim-text'], '')
                       
                        content.push({
                            text: decode(text, {level: 'xml'})
                        })
                    })
                    await Promise.all(promiseClaims)
                }
            }
        } else if( xmlData.hasOwnProperty('us-patent-application') ) { 
            console.log('Second')
            const usBibliographic = xmlData['us-patent-application']
            let usClaims = usBibliographic.claims.claim
            //console.log(JSON.stringify(usBibliographic.claims))
            if(Array.isArray(usClaims)) {
                if(usClaims.length > 0) {
                    const promiseClaims = usClaims.map( async claim => {
                        let text = '';
                        const recursiveClaim = async (element, t) => {
                            if(typeof element === 'object') {
                                text += `<div class="claim-text ${t} ${element.hasOwnProperty('claim-ref') ? t == "" ? 'patent-text-1' : t+'-1' : ''}">${element.hasOwnProperty('b') ? element['b'] : ''}${element['#text']}</div>`
                                if(typeof element.hasOwnProperty('claim-text')) {
                                    if(Array.isArray(element['claim-text'])) {
                                        element['claim-text'].forEach(async claimText => {
                                            text += await recursiveClaim(claimText, 'patent-text')
                                        })
                                    } else if(typeof element['claim-text'] === 'string'){
                                        text += `<div class="claim-text ${t} ${element.hasOwnProperty('claim-ref') ? t == "" ? 'patent-text-1' : t+'-1' : ''}">${element['claim-text']}</div>`
                                    }
                                }
                            } else if(typeof element === 'string') {
                                text += `<div class="claim-text ${t} ${element.hasOwnProperty('claim-ref') ? t == "" ? 'patent-text-1' : t+'-1' : ''}">${element}</div>`
                            }
                            return text
                        }
                        
                        text = await recursiveClaim(claim['claim-text'], '')
                       
                        content.push({
                            text: decode(text, {level: 'xml'})
                        })
                    })
                    await Promise.all(promiseClaims)
                }
            } else {
                console.log(JSON.stringify(usClaims))
            }
        } */
    } else if(contentType === 'figures') {
        content = []
        const bucketConfig = connection.bucketConfig;  
        if( xmlData.hasOwnProperty('patent-application-publication') ){
            const usBibliographic = xmlData['patent-application-publication']
            const figure = typeof usBibliographic['subdoc-drawings'] !== 'undefined' ? usBibliographic['subdoc-drawings'].figure : []
            if(Array.isArray(figure)) {
                if(figure.length > 0) {
                    figure.forEach( item => {
                        const target = item['image']['@_file'].toString().replace('.TIF', '.png')
                        content.push(`https://s3-${bucketConfig.region}.amazonaws.com/${bucketConfig.bucketName}/${bucketConfig.figuresDir}/${target}`)
                    })
                }
            }
        } else if( xmlData.hasOwnProperty('us-patent-application') ) { 
            const usBibliographic = xmlData['us-patent-application']
            let figure = typeof usBibliographic.drawings !== 'undefined' ? usBibliographic.drawings.figure : []
            if(Array.isArray(figure)) {
                if(figure.length > 0) {
                    figure.forEach( item => {
                        const target = item['img']['@_file'].toString().replace('.TIF', '.png')
                        content.push(`https://s3-${bucketConfig.region}.amazonaws.com/${bucketConfig.bucketName}/${bucketConfig.figuresDir}/${target}`)
                    })
                }
            }
        }
    }
    return content;

}

const getPublicationNumber = async(applicationNumber) => {
    const query = `SELECT pgpub_doc_num, appno_doc_num, file_name FROM db_patent_grant_bibliographic.application_publication WHERE appno_doc_num = :applicationNumber`
    const getPublicationData = await connection.resources.query(query,{
        type: connection.Sequelize.QueryTypes.SELECT,
        raw: true,
        logging: console.log,
        replacements: {applicationNumber},
        plain: true
    })
    return getPublicationData
}

route.get("/family/abstract/:applicationNumber", [authJWT.verifyToken], async (req, res) =>{  
    try{
         const applicationNumber = req.params.applicationNumber;  
        let asset = applicationNumber.toString().substr(2, applicationNumber.length), fileName = ''
        const indexing = /[a-z]/i.exec(asset)
        if(indexing != null && indexing.index >= 0) {
            asset = asset.substr(0,indexing.index)
        }
        let findPatent = await getPublicationNumber(asset)
        if(findPatent === null) {
            findPatent = await Documentid.findOne({
                attributes: ['rf_id', 'grant_doc_num', 'pgpub_doc_num', 'pgpub_date'],
                where: {appno_doc_num: asset}
            })
        } else {
            fileName = findPatent.file_name
        }
        if(findPatent === null) {
            findPatent = await Documentid.findOne({
                attributes: ['rf_id', 'grant_doc_num', 'pgpub_doc_num', 'pgpub_date'],
                where: {grant_doc_num: asset}
            })
        }
        let abstractData = '', query = '', replacements = {applicationNumber}, type = 1, pgPubDocNum = ''

        if( findPatent != null && findPatent.pgpub_doc_num !== '' ) {
            pgPubDocNum = `US${findPatent.pgpub_doc_num}`
        } else if( req.query.publication_number !== '') {
            pgPubDocNum = req.query.publication_number 
        }
        /*pgPubDocNum = '20200053026'*/
        if( pgPubDocNum !== '' ) {
            let filePath = ''
            if(fileName !== '') {
                filePath = `${type === 1 ? extraDiskPath : mainFolderPath}XML/${fileName}`
            } else {
                filePath = await findXMLFile(pgPubDocNum, type)
            }
            console.log(`FILE PATH: ${filePath}`)
            if( filePath !== '') {
                
                const getXMLData = await getFileContent(filePath)
                
                if( getXMLData !== '' ) {
                    console.log('FINDABSTRACT')
                    abstractData = await getContentFromXML(getXMLData, 'abstract')
                }
            }
        } 
        /* if(abstractData == '' || abstractData == null || (abstractData.hasOwnProperty('abstracts') && (abstractData.abstracts == null ||  abstractData.abstracts.toString().trim() == ''))) {
            const token = await epo.readToken('HedCET')    
            if(token !== 'undefined' && token != '') {
                const asset = applicationNumber
                let publication = 'publication';
                let abstract = await epo.singleUrl(token, `published-data/${publication}/docdb/${asset}/abstract`);
                if( abstract.indexOf('EntityNotFound') !== -1) {
                    abstract = await epo.singleUrl(token, `published-data/${publication}/epodoc/${asset}/abstract`);
                    if( abstract.indexOf('EntityNotFound') !== -1) {
                        publication = 'application';
                        abstract = await epo.singleUrl(token, `published-data/${publication}/docdb/${asset}/abstract`);
                        if( abstract.indexOf('EntityNotFound') !== -1) {
                            abstract = await epo.singleUrl(token, `published-data/${publication}/epodoc/${asset}/abstract`);
                        }
                    }
                } 
                
                //abstract = await epo.singleUrl(token, `published-data/publication/epodoc/US${asset}/biblio`);
                if( abstract ) {
                    const parser = new xml2js.Parser
                    const xmlData = await new Promise((resolve, reject) => parser.parseString(abstract, (err, result) => {
                        if (err){
                            reject(err);
                        } else {
                            resolve(result);
                        }
                    }));

                    if( xmlData.hasOwnProperty('ops:world-patent-data') ){
                        const worldPatentData = xmlData['ops:world-patent-data']
                        if(worldPatentData.hasOwnProperty('exchange-documents')) {
                            const exchangeDocuments = worldPatentData['exchange-documents']
                            if( exchangeDocuments.length > 0 && exchangeDocuments[0].hasOwnProperty('exchange-document')) {
                                const exchangeDocument = exchangeDocuments[0]['exchange-document']
                                if(exchangeDocument.length > 0 && exchangeDocument[0].hasOwnProperty('abstract')){
                                    const abstract = exchangeDocument[0]['abstract']
                                    if(abstract.length > 0) {
                                        if(abstract[0].hasOwnProperty('p')){
                                            const abstractParagraph = abstract[0]['p']
                                            if(typeof abstractParagraph[0] !== 'undefined') {
                                                abstractData = { abstracts: abstractParagraph[0] }
                                            } else {
                                                abstractData = { abstracts: abstractParagraph }
                                            }
                                        } else {
                                            abstractData = { abstracts: abstract[0] }
                                        }
                                    }
                                }
                            }
                        }  
                    }                    
                }
            }
        } */   
        res.status(200).json(abstractData);
    } catch( err ) {
        console.log('ERROR IN Abstract', err);
        res.status(500).send("Internal server error.");
    }
})

route.get("/family/claims/:applicationNumber", [authJWT.verifyToken], async (req, res) =>{
    try{
        let claimsData = []
        const applicationNumber = req.params.applicationNumber;        
        if(applicationNumber.toString().toLowerCase().indexOf('us') == -1) {
            const europeanCountryCode = ['EP','WO','AT','CA','CH','GB','FR','ES'];
            const countryCode = applicationNumber.toString().substr(0,2).toUpperCase()
            if(europeanCountryCode.includes(countryCode)) {
                const token = await epo.readToken('HedCET')   
                if(token !== 'undefined' && token != '') {
                    const asset = applicationNumber
                    let publication = 'publication';
                    let claims = await epo.singleUrl(token, `published-data/${publication}/docdb/${asset}/claims`);
                    if( claims.indexOf('EntityNotFound') !== -1) {
                        claims = await epo.singleUrl(token, `published-data/${publication}/epodoc/${asset}/claims`);
                        if( claims.indexOf('EntityNotFound') !== -1) {
                            publication = 'application';
                            claims = await epo.singleUrl(token, `published-data/${publication}/docdb/${asset}/claims`);
                            if( claims.indexOf('EntityNotFound') !== -1) {
                                claims = await epo.singleUrl(token, `published-data/${publication}/epodoc/${asset}/claims`);
                            }
                        }
                    } 
                    
                    if( claims ) {
                        const parser = new xml2js.Parser
                        const xmlData = await new Promise((resolve, reject) => parser.parseString(claims, (err, result) => {
                            if (err){
                                reject(err);
                            } else {
                                resolve(result);
                            }
                        }));
    
                        if( xmlData.hasOwnProperty('ops:world-patent-data') ){
                            const worldPatentData = xmlData['ops:world-patent-data']
                            if(worldPatentData.hasOwnProperty('ftxt:fulltext-documents')) {
                                const fullTextDocuments = worldPatentData['ftxt:fulltext-documents']
                                if( fullTextDocuments.length > 0 && fullTextDocuments[0].hasOwnProperty('ftxt:fulltext-document')) {
                                    const fullTextDocument = fullTextDocuments[0]['ftxt:fulltext-document']
                                    if(fullTextDocument.length > 0 && fullTextDocument[0].hasOwnProperty('claims')){
                                        const claims = fullTextDocument[0]['claims']
                                        claims.forEach( row => {
                                            if(row.$["lang"] == 'EN') {
                                                if(row.claim.length > 0 && row.claim[0]["claim-text"].length > 0) {
                                                    row.claim[0]["claim-text"].forEach( claim => {
                                                        claimsData.push({
                                                            claims: claim
                                                        })
                                                    })
                                                }
                                            }
                                        })
                                        if(claimsData.length == 0) {
                                            claims.forEach( row => {
                                                if(row.claim.length > 0 && row.claim[0]["claim-text"].length > 0) {
                                                    row.claim[0]["claim-text"].forEach( claim => {
                                                        claimsData.push({
                                                            claims: claim
                                                        })
                                                    })
                                                }
                                            })
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } else if(applicationNumber.toString().toLowerCase().indexOf('us') !== -1) {
            let asset = applicationNumber.toString().substr(2, applicationNumber.length), fileName = ''
            const indexing = /[a-z]/i.exec(asset)
            if(indexing != null && indexing.index >= 0) {
                asset = asset.substr(0,indexing.index)
            }
            let findPatent = await getPublicationNumber(asset)
            if(findPatent === null) {
                findPatent = await Documentid.findOne({
                    attributes: ['rf_id', 'grant_doc_num', 'pgpub_doc_num', 'pgpub_date'],
                    where: {appno_doc_num: asset}
                })
            } else {
                fileName = findPatent.file_name
            }
            if(findPatent === null) {
                findPatent = await Documentid.findOne({
                    attributes: ['rf_id', 'grant_doc_num', 'pgpub_doc_num', 'pgpub_date'],
                    where: {grant_doc_num: asset}
                })
            }
            let query = '', replacements = {applicationNumber: asset}, pgPubDocNum = '', type = 1

            if( findPatent != null && findPatent.pgpub_doc_num !== '' ) {
                pgPubDocNum = `US${findPatent.pgpub_doc_num}`
            } else if( req.query.publication_number !== '') {
                pgPubDocNum = req.query.publication_number 
            }
            //pgPubDocNum = '20200053026'
            if( pgPubDocNum !== '' ) {
                let filePath = ''
                if(fileName !== '') {
                    filePath = `${type === 1 ? extraDiskPath : mainFolderPath}XML/${fileName}`
                } else {
                    filePath = await findXMLFile(pgPubDocNum, type)
                }

                if( filePath !== '') {
                    
                    const getXMLData = await getFileContent(filePath)
                    if( getXMLData !== '' ) {
                        console.log('FIND XMl Content')
                        claimsData = await getContentFromXML(getXMLData, 'claims')
                    }
                }
            } 
        }
        res.status(200).json(claimsData);
    } catch( err ) {
        console.log('ERROR IN Claims', err);
        res.status(500).send("Internal server error.");
    }
})


route.get("/family/specifications/:applicationNumber", [authJWT.verifyToken], async (req, res) =>{
    try{
        let specificationsData = []
        const applicationNumber = req.params.applicationNumber;  
        let asset = applicationNumber.toString().substr(2, applicationNumber.length), fileName = ''
        const indexing = /[a-z]/i.exec(asset)
        if(indexing != null && indexing.index >= 0) {
            asset = asset.substr(0,indexing.index)
        }
        let findPatent = await getPublicationNumber(asset)
        if(findPatent === null) {
            findPatent = await Documentid.findOne({
                attributes: ['rf_id', 'grant_doc_num', 'pgpub_doc_num', 'pgpub_date'],
                where: {appno_doc_num: asset}
            })
        } else {
            fileName = findPatent.file_name
        }
        if(findPatent === null) {
            findPatent = await Documentid.findOne({
                attributes: ['rf_id', 'grant_doc_num', 'pgpub_doc_num', 'pgpub_date'],
                where: {grant_doc_num: asset}
            })
        }
        let query = '', replacements = {applicationNumber: asset}, pgPubDocNum = '', type = 1

        if( findPatent != null && findPatent.pgpub_doc_num !== '' ) {
            pgPubDocNum = `US${findPatent.pgpub_doc_num}`
        } else if( req.query.publication_number !== '') {
            pgPubDocNum = req.query.publication_number 
        }
        //pgPubDocNum = '20200053026'
        if( pgPubDocNum !== '' ) {
            let filePath = ''
            if(fileName !== '') {
                filePath = `${type === 1 ? extraDiskPath : mainFolderPath}XML/${fileName}`
            } else {
                filePath = await findXMLFile(pgPubDocNum, type)
            }

            if( filePath !== '') {
                
                const getXMLData = await getFileContent(filePath)
                
                if( getXMLData !== '' ) {
                    specificationsData = await getContentFromXML(getXMLData, 'specifications')
                }
            }
        }       
        if(specificationsData.length == 0) {
            // find from epo XML

        } 
        res.status(200).json(specificationsData);
    } catch( err ) {
        console.log('ERROR IN Claims', err);
        res.status(500).send("Internal server error.");
    }
})

route.get("/family/images/:applicationNumber", [authJWT.verifyToken], async (req, res) =>{
    try{
        const applicationNumber = req.params.applicationNumber;
        let asset = applicationNumber.toString().substr(2, applicationNumber.length), fileName = ''
        const indexing = /[a-z]/i.exec(asset)
        if(indexing != null && indexing.index >= 0) {
            asset = asset.substr(0,indexing.index)
        }
        let findPatent = await getPublicationNumber(asset)
        if(findPatent === null) {
            findPatent = await Documentid.findOne({
                attributes: ['rf_id', 'grant_doc_num', 'pgpub_doc_num', 'pgpub_date'],
                where: {appno_doc_num: asset}
            })
        } else {
            fileName = findPatent.file_name
        }
        
        if(findPatent === null) {
            findPatent = await Documentid.findOne({
                attributes: ['rf_id', 'grant_doc_num', 'pgpub_doc_num', 'pgpub_date'],
                where: {grant_doc_num: asset}
            })
        }
        let imagesList = [], query = '', replacements = {applicationNumber: asset}, pgPubDocNum = '', type = 1

        if( findPatent != null && findPatent.pgpub_doc_num !== '' ) {
            pgPubDocNum = `US${findPatent.pgpub_doc_num}`
        } else if( req.query.publication_number !== '') {
            pgPubDocNum = req.query.publication_number 
        }
        //pgPubDocNum = '20200053026'
        if( pgPubDocNum !== '' ) {
            let filePath = ''
            if(fileName !== '') {
                filePath = `${type === 1 ? extraDiskPath : mainFolderPath}XML/${fileName}`
            } else {
                filePath = await findXMLFile(pgPubDocNum, type)
            }

            if( filePath !== '') {
                
                const getXMLData = await getFileContent(filePath)
                
                if( getXMLData !== '' ) {
                    imagesList = await getContentFromXML(getXMLData, 'figures')
                }
            }
        }

        if(imagesList.length == 0){
            const token = await epo.readToken('HedCET')    
            if(token !== 'undefined' && token != '') {
                const asset = applicationNumber
                let publication = 'publication';
                let image = await epo.singleUrl(token, `published-data/${publication}/docdb/${asset}/images`);
                if( image.indexOf('EntityNotFound') !== -1) {
                    image = await epo.singleUrl(token, `published-data/${publication}/epodoc/${asset}/images`);
                    if( image.indexOf('EntityNotFound') !== -1) {
                        publication = 'application';
                        image = await epo.singleUrl(token, `published-data/${publication}/docdb/${asset}/images`);
                        if( image.indexOf('EntityNotFound') !== -1) {
                            image = await epo.singleUrl(token, `published-data/${publication}/epodoc/${asset}/images`);
                        }
                    }
                }
                
                if( image ) {
                    const parser = new xml2js.Parser
                    const xmlData = await new Promise((resolve, reject) => parser.parseString(image, (err, result) => {
                        if (err){
                            reject(err);
                        } else {
                            resolve(result);
                        }
                    }));

                    if( xmlData.hasOwnProperty('ops:world-patent-data') ){
                        const worldPatentData = xmlData['ops:world-patent-data']
                        if(worldPatentData.hasOwnProperty('ops:document-inquiry')) {
                            const documentInquiry = worldPatentData['ops:document-inquiry']
                            if( documentInquiry.length > 0 && documentInquiry[0].hasOwnProperty('ops:inquiry-result')) {
                                const inquiryResult = documentInquiry[0]['ops:inquiry-result']
                                if(inquiryResult.length > 0 && inquiryResult[0].hasOwnProperty('ops:document-instance')){
                                    const documentInstance = inquiryResult[0]['ops:document-instance']

                                    const mapData = await documentInstance.map( async document => {

                                        if( document.$['desc'] == "Drawing" || document.$['desc'] == "FirstPageClipping" ) {
                                            const pages = document.$['number-of-pages'], link = document.$['link']
                                            for( let i = 1; i <= pages; i++) {
                                                imagesList.push(`https://betapp.patentrack.com/family/single/file?link=${link}.tif?Range=${i}`)                                               
                                            }   
                                        }
                                        return document
                                    })
                                    await Promise.all(mapData)
                                }
                            }
                        }
                    } 
                }
            } 
        }
        res.status(200).json(imagesList);
    } catch (err) {
        console.log('ERROR retreiving images', err)
        res.status(500).send("Internal server error.");
    }
})

route.get("/family/single/file/", async (req, res) =>{
    try{
        let {link} = req.query
        console.log('link', link)
        if(link  !== '') {
            const range = link.split('?')[1].split('=')
            const token = await epo.readToken('HedCET')    
            if(token !== 'undefined' && token != '') {                
                exec(`php -f /var/www/html/trash/get_epo_thumbnail.php "${link}"`, async (error, std, stderr) => {
                    console.log(error);
                    console.log(stderr);
                    console.log(std);
                    if(!error) {
                        const tif2png = spawn('tiff2png', ['-force', '-destdir', `/var/www/html/trash/`, std]);
                        tif2png.stdout.on('data', (data) => {
                            console.log(`Convert DONE - ${data}`)
                        });
                        tif2png.stderr.on('data', (data) => {
                            console.log(`Convert Error - ${data} - ${file}`)
                        });
                        tif2png.on('close', (code) => {
                            const outputFile = std.replace('tif', 'png')
                            const file = fs.readFileSync(outputFile)
                            const stat = fs.statSync(outputFile)
                            res.setHeader('Content-Length', stat.size);
                            res.setHeader('Content-disposition', `inline; filename="${range}.png"`);
                            res.setHeader('Content-type', 'image/png');
                            res.send(file);
                        })
                    } else {
                        res.status(200).send('');
                    }                    
                });
            } else{
                res.status(200).send('');
            }
        } else {
            res.status(200).send('');
        }
    } catch (err) {
        res.status(200).send('');
    }
})




route.get("/family/single/:applicationNumber", [authJWT.verifyToken], async (req, res) =>{  

    try{
        const applicationNumber = req.params.applicationNumber;

        /* const applicationNumber = '09775636'; */

        let getFamily = [];
    
        const findPatent = await Documentid.findOne({
            attributes: ['rf_id', 'grant_doc_num'],
            where: {appno_doc_num: applicationNumber}
        })
    
        if(findPatent != null && findPatent.rf_id > 0 && findPatent.grant_doc_num != null && findPatent.grant_doc_num != '') {
            /**
            * Custom SubQuery
            */
    
            const queryFamily = 'SELECT * FROM patent_family_member WHERE family_id = (SELECT family_id FROM patent_family_member WHERE patent_number = :patentNumber LIMIT 1) AND application_number = :applicationNumber';
    
            getFamily = await connection.resources.query(queryFamily,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: { patentNumber: findPatent.grant_doc_num, applicationNumber},
                plain: true
            });
        }
        res.status(200).json(getFamily);
    } catch( err ) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
});

module.exports = route;