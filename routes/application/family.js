const express = require("express"),

    route = express.Router(),

    authJWT = require("../../helpers/verifyJwtToken"),

    connection = require("../../config/db.config"),

    epo = require('../../helpers/epo.js'),

    xml2js = require('xml2js'),

    parser = require('fast-xml-parser'),

    xmldoc = require('xmldoc'),
    
    fs = require('fs'),
    
    path = require('path');

const { decode } = require('html-entities');
const AWS  = require('aws-sdk');

const { exec, spawn  } = require('child_process');
//require the Model
const PatentFamilyMember = require("../../model/resources/PatentFamilyMember");
const PatentFamilyRelation = require("../../model/resources/PatentFamilyRelation");
const Documentid = require("../../model/application/DocumentIds");

const mainFolderPath = process.env.MAIN_FOLDER_PATH , extraDiskPath =   process.env.EXTRA_DISK_PATH,  extraDiskPathApplications =   process.env.EXTRA_DISK_PATH + 'applications/',  extraDiskPathPatents =   process.env.EXTRA_DISK_PATH + 'patent/'

route.get('/family/list/:grantNumber', [authJWT.verifyToken], async (req, res) =>{
    const familyData = []
    try {
        const token = await epo.readToken('HedCET')    
        if(token !== 'undefined' && token != '') {
            let { grantNumber } = req.params
            if(grantNumber.indexOf('US') === -1) {
                grantNumber = `US${grantNumber}`
            }
            console.log(`${extraDiskPath}FAMILY/${grantNumber}.XML`)
            let getFamilyData = '', fileExist = false
            if (fs.existsSync(`${extraDiskPath}FAMILY/${grantNumber}.XML`)) {
                //file exists
                fileExist = true
                getFamilyData = await fs.promises.readFile(`${extraDiskPath}FAMILY/${grantNumber}.XML`, 'utf8');
            } else {
                getFamilyData = await epo.runUrl(token,'family','publication','docdb',`${grantNumber}/legal`);
                if( !getFamilyData ) {
                    getFamilyData = await epo.runUrl(token,'family','publication','epodoc',`${grantNumber}/legal`);
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
                        fs.writeFileSync(`${extraDiskPath}FAMILY/${grantNumber}.XML`, xmlData, {encoding:'utf8',flag:'w'});
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
                                console.log('familyMembers', familyMembers)                              
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
                                            const legal = []   
                                            console.log('family', family)
                                            if(family.hasOwnProperty('ops:legal')) {
                                                console.log('IN LEGAL ARRAY')
                                                if(Array.isArray(family['ops:legal'])) {
                                                    family['ops:legal'].forEach( legalItem => { 
                                                        const code = legalItem.$['code'];
                                                        const desc = legalItem.$['desc'];
                                                        const preLine = []
                                                        if(legalItem.hasOwnProperty('ops:pre')) {
                                                            if(Array.isArray(legalItem['ops:pre'])) {
                                                                legalItem['ops:pre'].forEach( pre => {
                                                                    preLine.push(pre['_'])
                                                                })
                                                            } else {
                                                                preLine.push(legalItem['ops:pre']['_'])
                                                            }
                                                        }
                                                        const country_code = legalItem['ops:L001EP'][0]['_'];
                                                        const filling_published_doc = legalItem['ops:L002EP'][0]['_'];
                                                        const document_number = legalItem['ops:L003EP'][0]['_'];
                                                        const kind_code = legalItem['ops:L004EP'][0]['_'];
                                                        const ipr_type = legalItem['ops:L005EP'][0]['_'];
                                                        const gazette_date = legalItem['ops:L007EP'][0]['_'];
                                                        const legal_event_code = legalItem['ops:L008EP'][0]['_'];
                                                        const date_last_exchanged = legalItem['ops:L018EP'][0]['_'];
                                                        const date_first_exchanged = legalItem['ops:L019EP'][0]['_'];
                                                        const lespList = []
                                                        if(legalItem.hasOwnProperty('ops:L500EP')) {
                                                            console.log('legalItem["L500EP"]', legalItem['ops:L500EP'])
                                                            if(legalItem['ops:L500EP'].length > 0) {
                                                                legalItem['ops:L500EP'].forEach( lesp => {
                                                                    if(lesp.hasOwnProperty('ops:L501EP')) {
                                                                        lespList.push({
                                                                            desc: lesp['ops:L501EP'][0].$['desc'],
                                                                            data: lesp['ops:L501EP'][0]['_']
                                                                        })
                                                                    }
                                                                    if(lesp.hasOwnProperty('ops:L502EP')) {
                                                                        lespList.push({
                                                                            desc: lesp['ops:L502EP'][0].$['desc'],
                                                                            data: lesp['ops:L502EP'][0]['_']
                                                                        })
                                                                    }
                                                                    if(lesp.hasOwnProperty('ops:L503EP')) {
                                                                        lespList.push({
                                                                            desc: lesp['ops:L503EP'][0].$['desc'],
                                                                            data: lesp['ops:L503EP'][0]['_']
                                                                        })
                                                                    }
                                                                    if(lesp.hasOwnProperty('ops:L504EP')) {
                                                                        lespList.push({
                                                                            desc: lesp['ops:L504EP'][0].$['desc'],
                                                                            data: lesp['ops:L504EP'][0]['_']
                                                                        })
                                                                    }
                                                                    if(lesp.hasOwnProperty('ops:L505EP')) {
                                                                        lespList.push({
                                                                            desc: lesp['ops:L505EP'][0].$['desc'],
                                                                            data: lesp['ops:L505EP'][0]['_']
                                                                        })
                                                                    }
                                                                    if(lesp.hasOwnProperty('ops:L506EP')) {
                                                                        lespList.push({
                                                                            desc: lesp['ops:L506EP'][0].$['desc'],
                                                                            data: lesp['ops:L506EP'][0]['_']
                                                                        })
                                                                    }
                                                                    if(lesp.hasOwnProperty('ops:L507EP')) {
                                                                        lespList.push({
                                                                            desc: lesp['ops:L507EP'][0].$['desc'],
                                                                            data: lesp['ops:L507EP'][0]['_']
                                                                        })
                                                                    }
                                                                })
                                                            }
                                                        }
                                                        legal.push({
                                                            code,
                                                            desc,
                                                            preLine,
                                                            country_code,
                                                            filling_published_doc,
                                                            document_number,
                                                            kind_code,
                                                            ipr_type,
                                                            gazette_date,
                                                            legal_event_code,
                                                            date_last_exchanged,
                                                            date_first_exchanged,
                                                            lespList
                                                        })
                                                    })
                                                } else {
                                                    const legalItem =  family['ops:legal']
                                                    const code = legalItem.$['code'];
                                                    const desc = legalItem.$['desc'];
                                                    const preLine = []
                                                    if(legalItem.hasOwnProperty('ops:pre')) {
                                                        if(Array.isArray(legalItem['ops:pre'])) {
                                                            legalItem['ops:pre'].forEach( pre => {
                                                                preLine.push(pre['_'])
                                                            })
                                                        } else {
                                                            preLine.push(legalItem['ops:pre']['_'])
                                                        }
                                                    }
                                                    const country_code = legalItem['ops:L001EP'][0]['_'];
                                                    const filling_published_doc = legalItem['ops:L002EP'][0]['_'];
                                                    const document_number = legalItem['ops:L003EP'][0]['_'];
                                                    const kind_code = legalItem['ops:L004EP'][0]['_'];
                                                    const ipr_type = legalItem['ops:L005EP'][0]['_'];
                                                    const gazette_date = legalItem['ops:L007EP'][0]['_'];
                                                    const legal_event_code = legalItem['ops:L008EP'][0]['_'];
                                                    const date_last_exchanged = legalItem['ops:L018EP'][0]['_'];
                                                    const date_first_exchanged = legalItem['ops:L019EP'][0]['_'];
                                                    const lespList = []
                                                    if(legalItem.hasOwnProperty('ops:L500EP')) {
                                                        console.log('legalItem["L500EP"]', legalItem['ops:L500EP'])
                                                        if(legalItem['ops:L500EP'].length > 0) {
                                                            legalItem['ops:L500EP'].forEach( lesp => {
                                                                if(lesp.hasOwnProperty('ops:L501EP')) {
                                                                    lespList.push({
                                                                        desc: lesp['ops:L501EP'][0].$['desc'],
                                                                        data: lesp['ops:L501EP'][0]['_']
                                                                    })
                                                                }
                                                                if(lesp.hasOwnProperty('ops:L502EP')) {
                                                                    lespList.push({
                                                                        desc: lesp['ops:L502EP'][0].$['desc'],
                                                                        data: lesp['ops:L502EP'][0]['_']
                                                                    })
                                                                }
                                                                if(lesp.hasOwnProperty('ops:L503EP')) {
                                                                    lespList.push({
                                                                        desc: lesp['ops:L503EP'][0].$['desc'],
                                                                        data: lesp['ops:L503EP'][0]['_']
                                                                    })
                                                                }
                                                                if(lesp.hasOwnProperty('ops:L504EP')) {
                                                                    lespList.push({
                                                                        desc: lesp['ops:L504EP'][0].$['desc'],
                                                                        data: lesp['ops:L504EP'][0]['_']
                                                                    })
                                                                }
                                                                if(lesp.hasOwnProperty('ops:L505EP')) {
                                                                    lespList.push({
                                                                        desc: lesp['ops:L505EP'][0].$['desc'],
                                                                        data: lesp['ops:L505EP'][0]['_']
                                                                    })
                                                                }
                                                                if(lesp.hasOwnProperty('ops:L506EP')) {
                                                                    lespList.push({
                                                                        desc: lesp['ops:L506EP'][0].$['desc'],
                                                                        data: lesp['ops:L506EP'][0]['_']
                                                                    })
                                                                }
                                                                if(lesp.hasOwnProperty('ops:L507EP')) {
                                                                    lespList.push({
                                                                        desc: lesp['ops:L507EP'][0].$['desc'],
                                                                        data: lesp['ops:L507EP'][0]['_']
                                                                    })
                                                                }
                                                            })
                                                        }
                                                    }
                                                    legal.push({
                                                        code,
                                                        desc,
                                                        preLine,
                                                        country_code,
                                                        filling_published_doc,
                                                        document_number,
                                                        kind_code,
                                                        ipr_type,
                                                        gazette_date,
                                                        legal_event_code,
                                                        date_last_exchanged,
                                                        date_first_exchanged,
                                                        lespList
                                                    })
                                                }
                                                console.log('legal', legal)
                                            } else {
                                                console.log('NO LEGAL')
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
                                                title: '' ,
                                                legal: legal                           
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
                                    title: '',
                                    legal: []
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


const getFamilySendRequestEPO = async(grantDocNum) => { 
    const token = await epo.readToken('HedCET') 
    if(token !== 'undefined' && token != '') {
        const publication =  'publication' 
        const formatAsset = `US${grantDocNum}`
        getFamilyData = await epo.runUrl(token, 'family', publication, 'docdb', `${formatAsset}/legal`);
        
        if( !getFamilyData  || getFamilyData.indexOf('EntityNotFound') !== -1) {
            getFamilyData = await epo.runUrl(token, 'family', publication,'epodoc', `${formatAsset}/legal`);
        }
    }
    console.log('getFamilyData', getFamilyData)
}

const getFamilyDataFromXML = async(req) => {
    const applicationNumber = req.params.applicationNumber;
    const {f} = req.query;
    let getFamily = [];
    let findPatent = await Documentid.findOne({
            attributes: ['rf_id', [connection.Sequelize.fn('MAX', connection.Sequelize.col('grant_doc_num')), 'grant_doc_num'], [connection.Sequelize.fn('MAX', connection.Sequelize.col('appno_doc_num')),'appno_doc_num'], [connection.Sequelize.fn('MAX', connection.Sequelize.col('appno_date')),'appno_date'], 'title', [connection.Sequelize.fn('MAX', connection.Sequelize.col('grant_date')),'grant_date']],
            where:{appno_doc_num: applicationNumber},
            group: ['grant_doc_num', 'appno_doc_num', 'pgpub_doc_num'],
            order:[['grant_date', 'desc']]
        })

    if(findPatent == null ) {
        findPatent = await getGrantNumber(applicationNumber)
        if(findPatent == null){
            findPatent = await getPublicationNumber(applicationNumber)
        }
        /* findPatent = await Documentid.findOne({
            attributes: ['rf_id', [connection.Sequelize.fn('MAX', connection.Sequelize.col('grant_doc_num')), 'grant_doc_num'], [connection.Sequelize.fn('MAX', connection.Sequelize.col('appno_doc_num')),'appno_doc_num'], [connection.Sequelize.fn('MAX', connection.Sequelize.col('appno_date')),'appno_date'], 'title', [connection.Sequelize.fn('MAX', connection.Sequelize.col('grant_date')),'grant_date']],
            where: {grant_doc_num: applicationNumber},
            group: ['grant_doc_num', 'appno_doc_num', 'pgpub_doc_num'],
            order:[['grant_date', 'desc']]
        }) 
        if(findPatent == null ) {
            findPatent = await getGrantNumber(applicationNumber)
            if(findPatent == null){
                findPatent = await getPublicationNumber(applicationNumber)
            }
        }*/
    }
    console.log('findPatent', findPatent)
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

    const formatAsset = `US${asset}`

      console.log('formatAsset', formatAsset)
    if(formatAsset !== null && formatAsset !== '') {
                    
        let getFamilyData = '', fileExist = false, sendNewRequest = true
        if (fs.existsSync(`${extraDiskPath}FAMILY/${formatAsset}.XML`)) { 
            //file exists
            console.log('FILE EXIST', `${extraDiskPath}FAMILY/${formatAsset}.XML`)
            fileExist = true
            const checkFamilyLegalData = await fs.promises.readFile(`${extraDiskPath}FAMILY/${formatAsset}.XML`, 'utf8');  
            if( checkFamilyLegalData !== '' ) { 
                if(checkFamilyLegalData.indexOf('ops:legal') !== -1) {
                    sendNewRequest = false
                    getFamilyData = checkFamilyLegalData
                }
            } 
        }  
        
        if(sendNewRequest === true) {
            const token = await epo.readToken('HedCET') 
            if(token !== 'undefined' && token != '') {
                const publication = findPatent != null && findPatent.grant_doc_num != null && findPatent.grant_doc_num != '' ? 'publication' : 'application'
                console.log('SENDING nEW REQUEST');
                getFamilyData = await epo.runUrl(token, 'family', publication, 'docdb', `${formatAsset}/legal`);
               
                if( !getFamilyData  || getFamilyData.indexOf('EntityNotFound') !== -1) {
                    getFamilyData = await epo.runUrl(token, 'family', publication,'epodoc', `${formatAsset}/legal`);
                }
            }
        }
        console.log('getFamilyData', getFamilyData)
        if( getFamilyData !== '' ) {
            
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
                if(sendNewRequest === true) {  
                    fs.writeFileSync(`${extraDiskPath}FAMILY/${formatAsset}.XML`, getFamilyData);
                     
                    exec(`node /var/www/html/script/assets_family_single.js "${formatAsset}"`, async (error, std, stderr) => {
                        
                    });
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
                                    //console.log("dbTypeData['doc-number'] == asset", dbTypeData['doc-number'], asset)
                                    if((familyID === 0 && dbTypeData['doc-number'].toString() == asset) || (familyID !== 0 && familyID == family.$['family-id'])) {
                                        if(familyID === 0 && dbTypeData['doc-number'].toString() == asset) {
                                            familyID = family.$['family-id']
                                        }
                                    }
                                }
                            });
                            //console.log('familyID', familyID)
                            if(familyID > 0) {
                                const allApplicationNumbers = []
                                familyMembers.forEach(family => {
                                    if(familyID === family.$['family-id']) {
                                        let dbTypeData = family['publication-reference'][0]['document-id'][0]
                                        if( dbTypeData.$['document-id-type'] !== 'docdb' ) {
                                            dbTypeData = family['publication-reference'][0]['document-id'][1]
                                        }
                                        if(dbTypeData.hasOwnProperty('doc-number')) {
                                            if(findPatent == null || findPatent.grant_doc_num == null || findPatent.grant_doc_num == '') {
                                                dbTypeData = family['application-reference'][0]['document-id'][0]
                                            }
                                        }
                                        let legal = [], findLegal = false
                                        if(!allApplicationNumbers.includes(family['application-reference'][0]['document-id'][0]['date'].toString())){
                                            allApplicationNumbers.push(family['application-reference'][0]['document-id'][0]['date'].toString())
                                        } else {
                                            //console.log('APPLICATION', dbTypeData['kind'].toString().toLowerCase().indexOf('b') )
                                            if(dbTypeData['kind'].toString().toLowerCase().indexOf('b') !== -1) {
                                                
                                                const findIndex = getFamily.findIndex( r => r.application_number == family['application-reference'][0]['document-id'][0]['doc-number'].toString()) 

                                                if(findIndex !== -1) {
                                                    const getFamilyIndexData = getFamily[findIndex]; 
                                                    if(getFamilyIndexData.hasOwnProperty('legal')) {
                                                        legal = getFamilyIndexData.legal
                                                        findLegal = true
                                                    } 
                                                    getFamily.splice(findIndex, 1)
                                                }
                                            }
                                        } 
                                        
                                        //console.log('family', family)
                                        if(family.hasOwnProperty('ops:legal')) {
                                            //console.log('IN LEGAL ARRAY')
                                            legal = []
                                            if(Array.isArray(family['ops:legal'])) {
                                                family['ops:legal'].forEach( legalItem => { 
                                                    const code = legalItem.$['code'];
                                                    const desc = legalItem.$['desc'];
                                                    const preLine = []
                                                    if(legalItem.hasOwnProperty('ops:pre')) {
                                                        if(Array.isArray(legalItem['ops:pre'])) {
                                                            legalItem['ops:pre'].forEach( pre => {
                                                                preLine.push(pre['_'])
                                                            })
                                                        } else {
                                                            preLine.push(legalItem['ops:pre']['_'])
                                                        }
                                                    }
                                                    const country_code = legalItem['ops:L001EP'][0]['_'];
                                                    const filling_published_doc = legalItem['ops:L002EP'][0]['_'];
                                                    const document_number = legalItem['ops:L003EP'][0]['_'];
                                                    const kind_code = legalItem['ops:L004EP'][0]['_'];
                                                    const ipr_type = legalItem['ops:L005EP'][0]['_'];
                                                    const gazette_date = legalItem['ops:L007EP'][0]['_'];
                                                    const legal_event_code = legalItem['ops:L008EP'][0]['_'];
                                                    const date_last_exchanged = legalItem['ops:L018EP'][0]['_'];
                                                    const date_first_exchanged = legalItem['ops:L019EP'][0]['_'];
                                                    const lespList = []
                                                    if(legalItem.hasOwnProperty('ops:L500EP')) {
                                                        //console.log('legalItem["L500EP"]', legalItem['ops:L500EP'])
                                                        if(legalItem['ops:L500EP'].length > 0) {
                                                            legalItem['ops:L500EP'].forEach( lesp => {
                                                                if(lesp.hasOwnProperty('ops:L501EP')) {
                                                                    lespList.push({
                                                                        desc: lesp['ops:L501EP'][0].$['desc'],
                                                                        data: lesp['ops:L501EP'][0]['_']
                                                                    })
                                                                }
                                                                if(lesp.hasOwnProperty('ops:L502EP')) {
                                                                    lespList.push({
                                                                        desc: lesp['ops:L502EP'][0].$['desc'],
                                                                        data: lesp['ops:L502EP'][0]['_']
                                                                    })
                                                                }
                                                                if(lesp.hasOwnProperty('ops:L503EP')) {
                                                                    lespList.push({
                                                                        desc: lesp['ops:L503EP'][0].$['desc'],
                                                                        data: lesp['ops:L503EP'][0]['_']
                                                                    })
                                                                }
                                                                if(lesp.hasOwnProperty('ops:L504EP')) {
                                                                    lespList.push({
                                                                        desc: lesp['ops:L504EP'][0].$['desc'],
                                                                        data: lesp['ops:L504EP'][0]['_']
                                                                    })
                                                                }
                                                                if(lesp.hasOwnProperty('ops:L505EP')) {
                                                                    lespList.push({
                                                                        desc: lesp['ops:L505EP'][0].$['desc'],
                                                                        data: lesp['ops:L505EP'][0]['_']
                                                                    })
                                                                }
                                                                if(lesp.hasOwnProperty('ops:L506EP')) {
                                                                    lespList.push({
                                                                        desc: lesp['ops:L506EP'][0].$['desc'],
                                                                        data: lesp['ops:L506EP'][0]['_']
                                                                    })
                                                                }
                                                                if(lesp.hasOwnProperty('ops:L507EP')) {
                                                                    lespList.push({
                                                                        desc: lesp['ops:L507EP'][0].$['desc'],
                                                                        data: lesp['ops:L507EP'][0]['_']
                                                                    })
                                                                }
                                                            })
                                                        }
                                                    }
                                                    legal.push({
                                                        code,
                                                        desc,
                                                        preLine,
                                                        country_code,
                                                        filling_published_doc,
                                                        document_number,
                                                        kind_code,
                                                        ipr_type,
                                                        gazette_date,
                                                        legal_event_code,
                                                        date_last_exchanged,
                                                        date_first_exchanged,
                                                        lespList
                                                    })
                                                })
                                            } else {
                                                const legalItem =  family['ops:legal']
                                                const code = legalItem.$['code'];
                                                const desc = legalItem.$['desc'];
                                                const preLine = []
                                                if(legalItem.hasOwnProperty('ops:pre')) {
                                                    if(Array.isArray(legalItem['ops:pre'])) {
                                                        legalItem['ops:pre'].forEach( pre => {
                                                            preLine.push(pre['_'])
                                                        })
                                                    } else {
                                                        preLine.push(legalItem['ops:pre']['_'])
                                                    }
                                                }
                                                const country_code = legalItem['ops:L001EP'][0]['_'];
                                                const filling_published_doc = legalItem['ops:L002EP'][0]['_'];
                                                const document_number = legalItem['ops:L003EP'][0]['_'];
                                                const kind_code = legalItem['ops:L004EP'][0]['_'];
                                                const ipr_type = legalItem['ops:L005EP'][0]['_'];
                                                const gazette_date = legalItem['ops:L007EP'][0]['_'];
                                                const legal_event_code = legalItem['ops:L008EP'][0]['_'];
                                                const date_last_exchanged = legalItem['ops:L018EP'][0]['_'];
                                                const date_first_exchanged = legalItem['ops:L019EP'][0]['_'];
                                                const lespList = []
                                                if(legalItem.hasOwnProperty('ops:L500EP')) {
                                                    //console.log('legalItem["L500EP"]', legalItem['ops:L500EP'])
                                                    if(legalItem['ops:L500EP'].length > 0) {
                                                        legalItem['ops:L500EP'].forEach( lesp => {
                                                            if(lesp.hasOwnProperty('ops:L501EP')) {
                                                                lespList.push({
                                                                    desc: lesp['ops:L501EP'][0].$['desc'],
                                                                    data: lesp['ops:L501EP'][0]['_']
                                                                })
                                                            }
                                                            if(lesp.hasOwnProperty('ops:L502EP')) {
                                                                lespList.push({
                                                                    desc: lesp['ops:L502EP'][0].$['desc'],
                                                                    data: lesp['ops:L502EP'][0]['_']
                                                                })
                                                            }
                                                            if(lesp.hasOwnProperty('ops:L503EP')) {
                                                                lespList.push({
                                                                    desc: lesp['ops:L503EP'][0].$['desc'],
                                                                    data: lesp['ops:L503EP'][0]['_']
                                                                })
                                                            }
                                                            if(lesp.hasOwnProperty('ops:L504EP')) {
                                                                lespList.push({
                                                                    desc: lesp['ops:L504EP'][0].$['desc'],
                                                                    data: lesp['ops:L504EP'][0]['_']
                                                                })
                                                            }
                                                            if(lesp.hasOwnProperty('ops:L505EP')) {
                                                                lespList.push({
                                                                    desc: lesp['ops:L505EP'][0].$['desc'],
                                                                    data: lesp['ops:L505EP'][0]['_']
                                                                })
                                                            }
                                                            if(lesp.hasOwnProperty('ops:L506EP')) {
                                                                lespList.push({
                                                                    desc: lesp['ops:L506EP'][0].$['desc'],
                                                                    data: lesp['ops:L506EP'][0]['_']
                                                                })
                                                            }
                                                            if(lesp.hasOwnProperty('ops:L507EP')) {
                                                                lespList.push({
                                                                    desc: lesp['ops:L507EP'][0].$['desc'],
                                                                    data: lesp['ops:L507EP'][0]['_']
                                                                })
                                                            }
                                                        })
                                                    }
                                                }
                                                legal.push({
                                                    code,
                                                    desc,
                                                    preLine,
                                                    country_code,
                                                    filling_published_doc,
                                                    document_number,
                                                    kind_code,
                                                    ipr_type,
                                                    gazette_date,
                                                    legal_event_code,
                                                    date_last_exchanged,
                                                    date_first_exchanged,
                                                    lespList
                                                })
                                            }
                                            //console.log('legal', legal)
                                        } else {
                                            console.log('NO LEGAL')
                                        } 

                                        getFamily.push({
                                            family_id: familyID,
                                            patent_number: dbTypeData['doc-number'].toString(),
                                            publication_number: dbTypeData['doc-number'].toString(),
                                            application_number: family['application-reference'][0]['document-id'][0]['doc-number'].toString(),
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
                                            title: findPatent != null ? findPatent.title : '',
                                            legal
                                        })
                                    }                                        
                                }) 
                                /* if(allApplicationNumbers.length > 1) {
                                    //Find Duplicates and remove it from array and at the time of removing element check if publication number character length of one index is greater than the patent number character length then remove the publication number index from array

                                    const count = numbers => numbers.reduce((a, b) => ({ ...a, [b]: (a[b] || 0) + 1 }), {})

                                    const duplicates = dict => Object.keys(dict).filter((a) => dict[a] > 1)

                                    const getDuplicateNumber duplicates(count(allApplicationNumbers))

                                    if(getDuplicateNumber.length > 0) {
                                        getDuplicateNumber.forEach( number => {
                                            
                                        })
                                    }
                                } */                                
                            }
                        } 
                    }
                }
            }
            console.log(findPatent)
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
                    title: findPatent != null ? findPatent.title : '',
                    legal: []
                })
            }
        }
    }
    return getFamily
}

route.get('/family/epo/grant/:grantDocNumber', async (req, res) => {
    //getFamilySendRequestEPO
    try {
        const {grantDocNumber} = req.params;  
        if(grantDocNumber != '') {
            getFamilySendRequestEPO(grantDocNumber);
        }
    } catch ( err ) {
        console.log('ERROR IN FAMILY', err);
        res.status(500).send("Internal server error.");
    }
}); 

route.get("/family/:applicationNumber", [authJWT.verifyToken], async (req, res) =>{  

    try{
        
        const {counter} = req.query;   
        /* const applicationNumber = '09775636'; */
        const getFamily = await getFamilyDataFromXML(req)
        
        if(typeof counter !== 'undefined') {
            res.status(200).send(`${getFamily.length}`);
        } else {
            res.status(200).json(getFamily);
        } 
    } catch( err ) {
        console.log('ERROR IN FAMILY', err);
        res.status(500).send("Internal server error.");
    }
});

let findXMLFile = async (pgPubDocNum, t) => {
    return new Promise( function(resolve, reject) {
        console.log('findXMLFile', pgPubDocNum, t)
        let findFile = ''
        const child = spawn('find', [`${t === 1 ? extraDiskPathApplications : t === 2 ? extraDiskPathPatents : mainFolderPath}XML/`, '-name', `*${pgPubDocNum}*.XML`]);
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

let getFileContent = async (filePath, type) => {
    return new Promise ((resolve, reject) => {
        fs.readFile(filePath, async function(err,data){
            if (!err) {
                try {          
                    let xmlData = ''
                    if(type === 1) {
                        let findIndex = data.indexOf('<us-patent-application')
                        if(findIndex !== -1) {                
                            xmlData = data.toString().substring(findIndex, data.length)
                        } else {
                            findIndex = data.indexOf('<patent-application-publication')
                            if(findIndex !== -1) {                
                                xmlData = data.toString().substring(findIndex, data.length)
                            }
                        }
                    } else if (type ==2) {
                        let findIndex = data.indexOf('<us-patent-grant')
                        if(findIndex !== -1) {                
                            xmlData = data.toString().substring(findIndex, data.length)
                        } else {
                            findIndex = data.indexOf('<PATDOC')
                            if(findIndex !== -1) {                
                                xmlData = data.toString().substring(findIndex, data.length)
                                /**
                                * Remove <B500> This node has lots of childeren open without closing 
                                 */
                                const findIndexOpen500 = xmlData.toString().indexOf('<B500>')
                                const findIndexClosing500 = xmlData.toString().indexOf('</B500>')    
                                xmlData = xmlData.substring(0, findIndexOpen500) + xmlData.substring(findIndexClosing500 + 7, xmlData.length)                                
                            }
                        }
                    }                    
                    resolve(xmlData)
                } catch (error) {
                    console.log(`Error while reading - 1 - ${error}`)
                    reject('')
                }
            } else {
                console.log(`Error while reading - ${err}`)
                reject('')
            }
        })
    })
}


const replaceContent = (search, replace, content) => {
    const regEx = new RegExp(search, "ig");
    return content.replace(regEx, replace);
}


const getContentFromXML = async (fileContent, contentType, type) => {
    let content = '';
    //const parser = new xml2js.Parser
    const xmlData = parser.parse( fileContent, {ignoreAttributes: false});
    if(type === 1) {
        if(contentType === 'abstract') {
            if( xmlData.hasOwnProperty('patent-application-publication') ){
                const usBibliographic = xmlData['patent-application-publication']
                content = usBibliographic['subdoc-abstract']
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
        } else if(contentType === 'claims') {
            content = []
            fileContent = replaceContent('&lsqb;', '', fileContent)
            fileContent = replaceContent('&rsqb;', '', fileContent)         
            const document = new xmldoc.XmlDocument(fileContent);
            document.eachChild((child, index, a) => {
                if(child.name === 'claims' || child.name === 'subdoc-claims') {
                    let claims = child.toString({compressed:true})
    
                    claims = replaceContent('<claim-text', ' <div ', claims)
                    claims = replaceContent('</claim-text>', '</div>', claims)
    
                    claims = replaceContent('<claim-ref', ' <span ', claims)
                    claims = replaceContent('</claim-ref>', '</span>', claims)
    
                    claims = replaceContent('<claims', '<div ', claims)
                    claims = replaceContent('</claims>', '</div>', claims)
    
                    claims = replaceContent('<claim', '<div class="claim"><div', claims)
                    claims = replaceContent('</claim>', '</div></div>', claims)
                   
                    content.push({ text: claims })
                }
            })
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
                } else {
                    const target = figure['img']['@_file'].toString().replace('.TIF', '.png')
                    content.push(`https://s3-${bucketConfig.region}.amazonaws.com/${bucketConfig.bucketName}/${bucketConfig.figuresDir}/${target}`)
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
                } else {
                    const target = figure['img']['@_file'].toString().replace('.TIF', '.png')
                    content.push(`https://s3-${bucketConfig.region}.amazonaws.com/${bucketConfig.bucketName}/${bucketConfig.figuresDir}/${target}`)
                }
            }
        }
    } else if(type === 2) {
        if(contentType === 'abstract') {
            if( xmlData.hasOwnProperty('PATDOC') ){           
                const usBibliographic = xmlData['PATDOC']
                content = usBibliographic['SDOAB']
                if(typeof content === 'object'){
                    if(typeof content['BTEXT']['PARA'] !== 'undefined') {                    
                        content = content['BTEXT']['PARA']['PTEXT']['PDAT']
                    }
                }
            } else if( xmlData.hasOwnProperty('us-patent-grant') ){ 
                const usBibliographic = xmlData['us-patent-grant']
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
            if( xmlData.hasOwnProperty('PATDOC') ){     
                const findIndexOpenSDODE = fileContent.toString().indexOf('<SDODE>')
                const findIndexClosingSDODE = fileContent.toString().indexOf('</SDODE>')
    
                fileContent = fileContent.substring(findIndexOpenSDODE, findIndexClosingSDODE + 8)
    
                fileContent = replaceContent('<SDODE', ' <div ', fileContent)
                fileContent = replaceContent('</SDODE>', '</div>', fileContent)
    
                content.push({ text: fileContent})
            } else  {
                const document = new xmldoc.XmlDocument(fileContent);
                document.eachChild((child, index, a) => {
                    if(child.name === 'description' || child.name === 'SDODE') {
                        content.push({ text: child.toString({compressed:true}) })
                    }
                })
            }
            
        } else if(contentType === 'claims') {
            content = []
            fileContent = replaceContent('&lsqb;', '', fileContent)
            fileContent = replaceContent('&rsqb;', '', fileContent)     
            if( xmlData.hasOwnProperty('PATDOC') ){  
                const findIndexOpenSDOCL = fileContent.toString().indexOf('<SDOCL>')
                const findIndexClosingSDOCL = fileContent.toString().indexOf('</SDOCL>')
    
                let claims = fileContent.substring(findIndexOpenSDOCL, findIndexClosingSDOCL + 8)
    
                claims = replaceContent('<SDOCL', ' <div ', claims)
                claims = replaceContent('</SDOCL>', '</div>', claims)

                claims = replaceContent('<PARA', ' <div ', claims)
                claims = replaceContent('</PARA>', '</div>', claims)

                claims = replaceContent('<CLREF', ' <span ', claims)
                claims = replaceContent('</CLREF>', '</span>', claims)

                claims = replaceContent('<CLMSTEP', '<div ', claims)
                claims = replaceContent('</CLMSTEP>', '</div>', claims)

                claims = replaceContent('<CLM', '<div class="claim"><div ', claims)
                claims = replaceContent('</CLM>', '</div></div>', claims)

                claims = replaceContent('<CL', '<div id="claims"', claims)
                claims = replaceContent('</CL>', '</div>', claims)  

                content.push({ text: claims })
            } else {
                const document = new xmldoc.XmlDocument(fileContent);
                document.eachChild((child, index, a) => {
                    if(child.name === 'claims' || child.name === 'SDOCL') {
                        let claims = child.toString({compressed:true})
    
                        claims = replaceContent('<claim-text', ' <div ', claims)
                        claims = replaceContent('</claim-text>', '</div>', claims)
    
                        claims = replaceContent('<claim-ref', ' <span', claims)
                        claims = replaceContent('</claim-ref>', '</span>', claims)
    
                        claims = replaceContent('<claims', '<div ', claims)
                        claims = replaceContent('</claims>', '</div>', claims)
    
                        claims = replaceContent('<claim', '<div class="claim"><div ', claims)
                        claims = replaceContent('</claim>', '</div></div>', claims)

                        content.push({ text: claims })
                    }
                })
            }         
        } else if(contentType === 'figures') {
            content = []
            const bucketConfig = connection.bucketConfig;  
            if( xmlData.hasOwnProperty('PATDOC') ){
                const usBibliographic = xmlData['PATDOC']            
                const figure = typeof usBibliographic['SDODR'] !== 'undefined' ? usBibliographic['SDODR']['EMI'] : []            
                if(Array.isArray(figure)) {
                    if(figure.length > 0) {
                        figure.forEach( item => {
                            const target = item['@_FILE'].toString().replace('.TIF', '.png')
                            content.push(`https://s3-${bucketConfig.region}.amazonaws.com/${bucketConfig.bucketName}/${bucketConfig.figuresDir}/${target}`)
                        })
                    }
                } else {
                    const target = figure['@_FILE'].toString().replace('.TIF', '.png')
                    content.push(`https://s3-${bucketConfig.region}.amazonaws.com/${bucketConfig.bucketName}/${bucketConfig.figuresDir}/${target}`)
                }
            } else if( xmlData.hasOwnProperty('us-patent-grant') ) { 
                const usBibliographic = xmlData['us-patent-grant']
                let figure = typeof usBibliographic.drawings !== 'undefined' ? usBibliographic.drawings.figure : []
                if(Array.isArray(figure)) {
                    if(figure.length > 0) {
                        figure.forEach( item => {
                            const target = item['img']['@_file'].toString().replace('.TIF', '.png')
                            content.push(`https://s3-${bucketConfig.region}.amazonaws.com/${bucketConfig.bucketName}/${bucketConfig.figuresDir}/${target}`)
                        })
                    }
                } else {
                    const target = figure['img']['@_file'].toString().replace('.TIF', '.png')
                    content.push(`https://s3-${bucketConfig.region}.amazonaws.com/${bucketConfig.bucketName}/${bucketConfig.figuresDir}/${target}`)
                }
            }
        }
    }
    
    return content;

}

const getPublicationNumber = async(applicationNumber) => {
    const query = `SELECT pgpub_doc_num, appno_doc_num, file_name, appno_date, pgpub_date, '' AS title FROM db_patent_grant_bibliographic.application_publication WHERE appno_doc_num = :applicationNumber`
    const getPublicationData = await connection.resources.query(query,{
        type: connection.Sequelize.QueryTypes.SELECT,
        raw: true,
        logging: console.log,
        replacements: {applicationNumber},
        plain: true
    })
    console.log('getPublicationData', getPublicationData)
    return getPublicationData
}

const getGrantNumber = async(applicationNumber) => {
    const query = `SELECT grant_doc_num, grant_doc_num AS pgpub_doc_num, appno_doc_num, file_name, appno_date, grant_date, '' AS title FROM db_patent_application_bibliographic.application_grant WHERE appno_doc_num = :applicationNumber`
    const getPublicationData = await connection.resources.query(query,{
        type: connection.Sequelize.QueryTypes.SELECT,
        raw: true,
        logging: console.log,
        replacements: {applicationNumber},
        plain: true
    })
    console.log('getGrantNumber', applicationNumber, getPublicationData)
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
        let findPatent = await Documentid.findOne({
                attributes: ['grant_doc_num', 'appno_doc_num', 'pgpub_doc_num'],
                where: {
                        [connection.Op.or]: [
                        {appno_doc_num: asset},
                        {grant_doc_num: asset}
                ]},
                group: ['grant_doc_num', 'appno_doc_num', 'pgpub_doc_num']
            })

        let abstractData = '', query = '', replacements = {applicationNumber}, type = 1, pgPubDocNum = ''
            
        if(findPatent == null) {
            findPatent = await getPublicationNumber(asset)
            if(findPatent === null) {
                findPatent = await getGrantNumber(asset)
                if(findPatent !== null) {
                    type = 2
                }
            }
        } else {
            if(findPatent.grant_doc_num !== null && findPatent.grant_doc_num !== '') {                
                const applicationNumber = findPatent.appno_doc_num
                findPatent = await getGrantNumber(applicationNumber)
                if(findPatent !== null) {
                    type = 2
                } else {
                    findPatent = await getPublicationNumber(applicationNumber)
                }
            } else {
                findPatent = await getPublicationNumber(findPatent.appno_doc_num)
            }
        }
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
        if( findPatent != null && fileName == '') {
            fileName = findPatent.file_name
        }

        if( findPatent != null ) {
            if(findPatent.grant_doc_num !== undefined && findPatent.grant_doc_num !== '' && findPatent.grant_doc_num !== null ) {
                pgPubDocNum = `US${findPatent.grant_doc_num}`
                type = 2
            } else if(findPatent.pgpub_doc_num !== '' ) {
                pgPubDocNum = `US${findPatent.pgpub_doc_num}`
            }            
        } else if( req.query.publication_number !== '') {
            pgPubDocNum = req.query.publication_number 
        }
        
        /*pgPubDocNum = '20200053026'*/
        if( pgPubDocNum !== '' ) {
            let filePath = ''
            if(fileName !== '') {
                filePath = `${type === 1 ? extraDiskPathApplications : extraDiskPathPatents}XML/${fileName}`
            } else {
                filePath = await findXMLFile(pgPubDocNum, type)
            }
            console.log(`FILE PATH: ${filePath}`)
            if( filePath !== '') {
                
                const getXMLData = await getFileContent(filePath, type)
                
                if( getXMLData !== '' ) {
                    console.log('FINDABSTRACT')
                    abstractData = await getContentFromXML(getXMLData, 'abstract', type)
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
        const {counter} = req.query;   
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
            if(asset.substr(0,1) === 0) {
                asset = asset.substr(1, asset.length)
            }
            let findPatent = await Documentid.findOne({
                attributes: ['grant_doc_num', 'appno_doc_num', 'pgpub_doc_num'],
                where: {
                        [connection.Op.or]: [
                        {appno_doc_num: asset},
                        {grant_doc_num: asset}
                ]},
                group: ['grant_doc_num', 'appno_doc_num', 'pgpub_doc_num']
            })
            let query = '', replacements = {applicationNumber: asset}, pgPubDocNum = '', type = 1

            if(findPatent == null) {
                findPatent = await getPublicationNumber(asset)
                if(findPatent === null) {
                    findPatent = await getGrantNumber(asset)
                    if(findPatent !== null) {
                        type = 2
                    }
                }
            } else {
                if(findPatent.grant_doc_num !== null && findPatent.grant_doc_num !== '') {
                    const applicationNumber = findPatent.appno_doc_num
                    findPatent = await getGrantNumber(applicationNumber)
                    if(findPatent !== null) {
                        type = 2
                    } else {
                        findPatent = await getPublicationNumber(applicationNumber)
                    }
                } else {
                    findPatent = await getPublicationNumber(findPatent.appno_doc_num)
                }
            }
            if(findPatent === null) {
                findPatent = await Documentid.findOne({
                    attributes: ['rf_id', 'grant_doc_num', 'appno_doc_num', 'pgpub_doc_num', 'pgpub_date'],
                    where: {appno_doc_num: asset}
                })
            } 
            
            if(findPatent === null) {
                findPatent = await Documentid.findOne({
                    attributes: ['rf_id', 'appno_doc_num', 'grant_doc_num', 'pgpub_doc_num', 'pgpub_date'],
                    where: {grant_doc_num: asset}
                })

                if(findPatent !== null) {
                    if(findPatent.grant_doc_num !== null && findPatent.grant_doc_num !== '') {
                        const applicationNumber = findPatent.appno_doc_num
                        findPatent = await getGrantNumber(applicationNumber)
                        if(findPatent !== null) {
                            type = 2
                        } else {
                            findPatent = await getPublicationNumber(applicationNumber)
                        }
                    } else {
                        findPatent = await getPublicationNumber(findPatent.appno_doc_num)
                    }
                }
            }
            
            if( findPatent != null && fileName == '') {
                fileName = findPatent.file_name
            }

            if(fileName == '' || fileName == undefined || fileName == null) {
                if( findPatent != null ) {
                    if(findPatent.grant_doc_num !== undefined && findPatent.grant_doc_num !== '' && findPatent.grant_doc_num !== null ) {
                        fileName = `US${findPatent.grant_doc_num}.xml`
                    } else if(findPatent.pgpub_doc_num !== '' ) {
                        fileName = `US${findPatent.pgpub_doc_num}.xml`
                    }     
                }
            }

            if( findPatent != null ) {
                if(findPatent.grant_doc_num !== undefined && findPatent.grant_doc_num !== '' && findPatent.grant_doc_num !== null ) {
                    pgPubDocNum = `US${findPatent.grant_doc_num}`
                    type = 2
                } else if(findPatent.pgpub_doc_num !== '' ) {
                    pgPubDocNum = `US${findPatent.pgpub_doc_num}`
                }            
            } else if( req.query.publication_number !== '') {
                pgPubDocNum = req.query.publication_number 
            }
            //pgPubDocNum = '20200053026'
            if( pgPubDocNum !== '' && fileName != undefined) {
                let filePath = ''
                if(fileName !== '') {
                    filePath = `${type === 1 ? extraDiskPathApplications : extraDiskPathPatents}XML/${fileName}`
                } else {
                    filePath = await findXMLFile(pgPubDocNum, type)
                }

                if( filePath !== '') {
                    
                    const getXMLData = await getFileContent(filePath, type)
                    if( getXMLData !== '' ) {
                        claimsData = await getContentFromXML(getXMLData, 'claims', type)
                    }
                }
            } 
        }
        if(typeof counter !== 'undefined') {
            console.log('claimsData.length', claimsData.length)
            if(claimsData.length === 1) {
                const claimsHTML = claimsData[0].text;
                let regex = /(id="CLM-)\w+/gmi;                
                let m;
                let getAllMatches = []
                while ((m = regex.exec(claimsHTML)) !== null) {
                    // This is necessary to avoid infinite loops with zero-width matches
                    if (m.index === regex.lastIndex) {
                        regex.lastIndex++;
                    }
                    
                    // The result can be accessed through the `m`-variable.
                    m.forEach((match, groupIndex) => {
                        console.log(`Found match, group ${groupIndex}: ${match}`);
                        if(groupIndex === 0) {
                            getAllMatches.push(match)
                        }
                    });
                }
                console.log('getAllMatches', getAllMatches.length, getAllMatches)
                if(getAllMatches.length > 0) {
                    let lastMatch = getAllMatches[getAllMatches.length - 1];
                    const numberPattern = /\d+/g;
                    const findClaimNumber = lastMatch.match( numberPattern ).join('')  
                    console.log('lastMatch',lastMatch, findClaimNumber)
                    res.status(200).send(`${parseInt(findClaimNumber)}`);  
                } else {
                    res.status(200).send(`${claimsData.length}`);
                }
            } else {
                res.status(200).send(`${claimsData.length}`);
            }            
        } else {
            res.status(200).json(claimsData);
        }        
    } catch( err ) {
        console.log('ERROR IN Claims', err);
        res.status(200).json([]);
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
        let findPatent = await Documentid.findOne({
                attributes: ['grant_doc_num', 'appno_doc_num', 'pgpub_doc_num'],
                where: {
                        [connection.Op.or]: [
                        {appno_doc_num: asset},
                        {grant_doc_num: asset}
                ]},
                group: ['grant_doc_num', 'appno_doc_num', 'pgpub_doc_num']
            })
        let query = '', replacements = {applicationNumber: asset}, pgPubDocNum = '', type = 1

        if(findPatent == null) {
            findPatent = await getPublicationNumber(asset)
            if(findPatent === null) {
                findPatent = await getGrantNumber(asset)
                if(findPatent !== null) {
                    type = 2
                }
            }
        } else {
            if(findPatent.grant_doc_num !== null && findPatent.grant_doc_num !== '') {
                const applicationNumber = findPatent.appno_doc_num
                findPatent = await getGrantNumber(applicationNumber)
                if(findPatent !== null) {
                    type = 2
                } else {
                    findPatent = await getPublicationNumber(applicationNumber)
                }
            } else {
                findPatent = await getPublicationNumber(findPatent.appno_doc_num)
            }
        }
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
        if( findPatent != null && fileName == '') {
            fileName = findPatent.file_name
        }

        if( findPatent != null ) {
            if(findPatent.grant_doc_num !== undefined && findPatent.grant_doc_num !== '' && findPatent.grant_doc_num !== null ) {
                pgPubDocNum = `US${findPatent.grant_doc_num}`
                type = 2
            } else if(findPatent.pgpub_doc_num !== '' ) {
                pgPubDocNum = `US${findPatent.pgpub_doc_num}`
            }            
        } else if( req.query.publication_number !== '') {
            pgPubDocNum = req.query.publication_number 
        }
        //pgPubDocNum = '20200053026'
        if( pgPubDocNum !== '' ) {
            let filePath = ''
            if(fileName !== '') {
                filePath = `${type === 1 ? extraDiskPathApplications : extraDiskPathPatents}XML/${fileName}`
            } else {
                filePath = await findXMLFile(pgPubDocNum, type)
            }

            if( filePath !== '') {
                
                const getXMLData = await getFileContent(filePath, type)
                
                if( getXMLData !== '' ) {
                    specificationsData = await getContentFromXML(getXMLData, 'specifications', type)
                }
            }
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
        const {counter} = req.query;   
        let asset = applicationNumber.toString().substr(2, applicationNumber.length), fileName = ''
        const indexing = /[a-z]/i.exec(asset)
        if(indexing != null && indexing.index >= 0) {
            asset = asset.substr(0,indexing.index)
        }
        let findPatent = await Documentid.findOne({
                attributes: ['grant_doc_num', 'appno_doc_num', 'pgpub_doc_num'],
                where: {
                        [connection.Op.or]: [
                        {appno_doc_num: asset},
                        {grant_doc_num: asset}
                ]},
                group: ['grant_doc_num', 'appno_doc_num', 'pgpub_doc_num']
            })
        let imagesList = [], query = '', replacements = {applicationNumber: asset}, pgPubDocNum = '', type = 1

        if(findPatent === null) {
            findPatent = await getPublicationNumber(asset)
            if(findPatent === null) {
                findPatent = await getGrantNumber(asset)
                if(findPatent !== null) {
                    type = 2
                }
            }
        } else {
            if(findPatent.grant_doc_num !== null && findPatent.grant_doc_num !== '') {               
                const applicationNumber = findPatent.appno_doc_num
                findPatent = await getGrantNumber(applicationNumber)
                if(findPatent !== null) {
                    type = 2
                } else {
                    findPatent = await getPublicationNumber(applicationNumber)
                }
            } else {
                findPatent = await getPublicationNumber(findPatent.appno_doc_num)
            }
        }
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
        if( findPatent != null && fileName == '') {
            fileName = findPatent.file_name
        }

        if( findPatent !== null ) {
            if(findPatent.grant_doc_num !== undefined && findPatent.grant_doc_num !== '' && findPatent.grant_doc_num !== null ) {
                pgPubDocNum = `US${findPatent.grant_doc_num}`
                type = 2
            } else if(findPatent.pgpub_doc_num !== '' ) {
                pgPubDocNum = `US${findPatent.pgpub_doc_num}`
            }            
        } else if( req.query.publication_number !== '') {
            pgPubDocNum = req.query.publication_number 
        }
        //pgPubDocNum = '20200053026'
        if( pgPubDocNum !== '' ) {
            let filePath = ''
            console.log(type, extraDiskPathApplications, extraDiskPathPatents)
            if(fileName !== '') {
                filePath = `${type == 1 ? extraDiskPathApplications : extraDiskPathPatents}XML/${fileName}`
            } else {
                filePath = await findXMLFile(pgPubDocNum, type)
            }
            console.log('filePath', filePath)
            if( filePath !== '') {
                
                const getXMLData = await getFileContent(filePath, type)
                
                if( getXMLData !== '' ) {
                    imagesList = await getContentFromXML(getXMLData, 'figures', type)
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
        if(typeof counter !== 'undefined') {
            res.status(200).send(`${imagesList.length}`);
        } else {
            res.status(200).json(imagesList);
        }  
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

        const {f} = req.query;

        /* const applicationNumber = '09775636'; */

        let getFamily = [];
    
        /* const findPatent = await Documentid.findOne({
            attributes: ['rf_id', 'grant_doc_num'],
            where: {appno_doc_num: applicationNumber}
        })
    
        if(findPatent != null && findPatent.rf_id > 0 && findPatent.grant_doc_num != null && findPatent.grant_doc_num != '') {
            
            const queryFamily = 'SELECT * FROM patent_family_member WHERE family_id = (SELECT family_id FROM patent_family_member WHERE patent_number = :patentNumber LIMIT 1) AND application_number = :applicationNumber';
    
            getFamily = await connection.resources.query(queryFamily,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: { patentNumber: findPatent.grant_doc_num, applicationNumber},
                plain: true
            }); 
        }
        if(getFamily == null || getFamily.length === 0) {
            getFamily = await getFamilyDataFromXML(req)
        } */
        getFamily = await getFamilyDataFromXML(req)
        res.status(200).json(getFamily);
    } catch( err ) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
});

module.exports = route;