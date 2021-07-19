const express = require("express"),

    route = express.Router(),

    authJWT = require("../../helpers/verifyJwtToken"),

    connection = require("../../config/db.config"),

    epo = require('../../helpers/epo.js'),

    xml2js = require('xml2js');


//require the Model
const PatentFamilyMember = require("../../model/resources/PatentFamilyMember");
const PatentFamilyRelation = require("../../model/resources/PatentFamilyRelation");
const Documentid = require("../../model/application/DocumentIds");

route.get('/family/list/:grantNumber', [authJWT.verifyToken], async (req, res) =>{
    const familyData = []
    try {
        const token = await epo.readToken('HedCET')    
        if(token !== 'undefined' && token != '') {
            let getFamilyData = await epo.runUrl(token,'family','publication','docdb',`US${req.params.grantNumber}`);
            if( !getFamilyData ) {
                getFamilyData = await epo.runUrl(token,'family','publication','epodoc',`US${req.params.grantNumber}`);
            }        
            if( getFamilyData ) {
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
    
        if(findPatent != null && findPatent.rf_id > 0 && findPatent.grant_doc_num != null && findPatent.grant_doc_num != '') {
            /**
            * Custom SubQuery
            */
    
            const queryFamily = 'SELECT * FROM patent_family_member WHERE family_id = (SELECT family_id FROM patent_family_member WHERE patent_number = :patentNumber AND family_id > 0 LIMIT 1) OR (patent_number = :patentNumber AND family_id = 0)';
    
            getFamily = await connection.resources.query(queryFamily,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: {patentNumber: findPatent.grant_doc_num}
            });
        }      
        if( getFamily.length === 0 ) {
            const token = await epo.readToken('HedCET')    
            if(token !== 'undefined' && token != '') {
                const asset = findPatent != null && findPatent.grant_doc_num != null && findPatent.grant_doc_num != '' ? findPatent.grant_doc_num : applicationNumber
                const publication = findPatent != null && findPatent.grant_doc_num != null && findPatent.grant_doc_num != '' ? 'publication' : 'application'
                let getFamilyData = await epo.runUrl(token,'family', publication,'docdb',`US${asset}`);
                if( getFamilyData.indexOf('EntityNotFound') !== -1) {
                    getFamilyData = await epo.runUrl(token,'family', publication,'epodoc',`US${asset}`);
                }        
                if( getFamilyData ) {
                    console.log('getFamilyData', getFamilyData)
                    getFamily = []
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
                            assignee: null,
                            applicants: [],
                            title: findPatent != null ? findPatent.title : ''
                        })
                    }
                }
            }
        }  
        res.status(200).json(getFamily);
    } catch( err ) {
        console.log('ERROR IN FAMILY', err);
        res.status(500).send("Internal server error.");
    }
});

route.get("/family/abstract/:applicationNumber", [authJWT.verifyToken], async (req, res) =>{  
    try{
        const applicationNumber = req.params.applicationNumber;
        
        const findPatent = await Documentid.findOne({
            attributes: ['rf_id', 'grant_doc_num'],
            where: {appno_doc_num: applicationNumber}
        })
        let abstractData = '', query = '', replacements = {applicationNumber}
        if(findPatent != null && findPatent.rf_id > 0 && findPatent.grant_doc_num != null && findPatent.grant_doc_num != '') {
            query = 'SELECT abstracts FROM patent_family_member WHERE application_number = :applicationNumber OR patent_number = :patentNumber LIMIT 1'
            replacements.patentNumber = findPatent.grant_doc_num
        } else {
            query = 'SELECT abstracts FROM patent_family_member WHERE application_number = :applicationNumber LIMIT 1'
        }
        abstractData = await connection.resources.query(query,{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            logging: console.log,
            replacements: replacements,
            plain: true
        });        
        if(abstractData == null || (abstractData.hasOwnProperty('abstracts') && (abstractData.abstracts == null ||  abstractData.abstracts.toString().trim() == ''))) {
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
        }
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
            let asset = applicationNumber.toString().substr(2, applicationNumber.length)
            const indexing = /[a-z]/i.exec(asset)
            if(indexing != null && indexing.index >= 0) {
                asset = asset.substr(0,indexing.index)
            }
            const findPatent = await Documentid.findOne({
                attributes: ['rf_id', 'grant_doc_num'],
                where: {appno_doc_num: asset}
            })
            let query = '', replacements = {applicationNumber: asset}
            if(findPatent != null && findPatent.rf_id > 0 && findPatent.grant_doc_num != null && findPatent.grant_doc_num != '') {
                query = 'SELECT claims FROM patent_family_member WHERE application_number = :applicationNumber OR patent_number = :patentNumber LIMIT 1'
                replacements.patentNumber = findPatent.grant_doc_num
            } else {
                query = 'SELECT claims FROM patent_family_member WHERE application_number = :applicationNumber LIMIT 1'
            }
            claimsData = await connection.resources.query(query,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: replacements,
                plain: true
            });
            
            if(claimsData == null || (claimsData.hasOwnProperty('claims') && (claimsData.claims == null ||  claimsData.claims.toString().trim() == '' || claimsData.claims != '{}' || claimsData.claims !='[]'))) {
                query = 'SELECT text AS claims FROM db_patent_grant_bibliographic.application_claims WHERE appno_doc_num = :applicationNumber '
                claimsData = await connection.resources.query(query,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    logging: console.log,
                    replacements: replacements,
                });
            }
        }
        res.status(200).json(claimsData);
    } catch( err ) {
        console.log('ERROR IN Claims', err);
        res.status(500).send("Internal server error.");
    }
})

route.get("/family/images/:applicationNumber", [authJWT.verifyToken], async (req, res) =>{
    try{
        const applicationNumber = req.params.applicationNumber;
        const asset = applicationNumber.toString().substr(2, applicationNumber.length)
        const findPatent = await Documentid.findOne({
            attributes: ['rf_id', 'grant_doc_num'],
            where: {appno_doc_num: asset}
        })
        let imagesList = '', query = '', replacements = {applicationNumber: asset}
        if(findPatent != null && findPatent.rf_id > 0 && findPatent.grant_doc_num != null && findPatent.grant_doc_num != '') {
            query = 'SELECT images FROM patent_family_member WHERE application_number = :applicationNumber OR patent_number = :patentNumber LIMIT 1'
            replacements.patentNumber = findPatent.grant_doc_num
        } else {
            query = 'SELECT images FROM patent_family_member WHERE application_number = :applicationNumber LIMIT 1'
        }
        imagesData = await connection.resources.query(query,{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            logging: console.log,
            replacements: replacements,
            plain: true
        });

        if(imagesData == null || (typeof imagesData == 'object' && imagesData.hasOwnProperty('images') && (imagesData.images == '' || imagesData.images == null || imagesData.images == '[]'))){
            /* const token = await epo.readToken('HedCET')    
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
                //abstract = await epo.singleUrl(token, `published-data/publication/epodoc/US${asset}/biblio`);
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
                                const inquiryResult = fullTextDocuments[0]['ops:inquiry-result']
                                if(inquiryResult.length > 0 && inquiryResult[0].hasOwnProperty('ops:document-instance')){
                                    const documentInstance = inquiryResult[0]['ops:document-instance']
                                    const mapDoc = documentInstance.map( document => {
                                        if( document.$['desc'] == "Drawing" || document.$['desc'] == "FirstPageClipping" ) {
                                            const pages = document.$['number-of-pages'], link = document.$['link']
                                            for( let i = 1; i <= pages; i++) {
                                                let imageData = await epo.singleUrl(token, `${link}.pdf?Range=${i}`);
                                                if( imageData != null && imageData.hasOwnProperty('data') && imageData.data != '' ) {
                                                    const fileName = `${applicationNumber}_${link.split("/").pop()}_${document.$['desc']}_${i}.pdf`
                                                }
                                            }   
                                        }
                                    })
                                }
                            }
                        }
                    }
                }
            } */
        } else {
            imagesList = JSON.parse(imagesData.images)
        }
    } catch (err) {

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