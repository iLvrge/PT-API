const express = require("express"),

    request = require('request'),

    route = express.Router(),

    authJWT = require("../../helpers/verifyJwtToken"),

    OrganisationApplication = require("../../model/application/OrganisationApplication");
    
const { v4: uuidv4  } = require('uuid');

route.get("/ptab/:asset", [authJWT.verifyToken], async (req, res) => { 
    try {
        const {asset} = req.params

        if(typeof asset !== 'undefined' && asset !== '' && asset !== null) {
            const url = `https://developer.uspto.gov/ptab-api/proceedings?applicationNumberText=${asset}`

            request(url, (error, response, body) => {
                if (!error && response.statusCode == 200) {
                    const responseBody = JSON.parse(body)
                    const ptabEvents = []
                    if(responseBody.results.length > 0) {
                        responseBody.results.forEach( item => {
                            ptabEvents.push({
                                id: uuidv4(),
                                start: item.proceedingFilingDate + ' 00:00:00',
                                end: item.decisionDate + ' 00:00:00',
                                name: item.respondentPartyName,
                                status: item.proceedingStatusCategory
                            })
                        })
                    }
                    res.status(200).json(ptabEvents)
                } else {
                    console.log('ERROR => /ptab/', error)
                    res.status(200).json({})
                }
            })
        } else {
            console.log('ERROR => /ptab/', error)
            res.status(401).send('Asset number is empty')
        }
    } catch (e) {
        console.log('ERROR => /ptab/', error)
        res.status(500).send('Error while rendering asset details')
    }    
});


route.get("/citation/:asset", [authJWT.verifyToken], async (req, res) => { 
    try {
        const {asset} = req.params

        if(typeof asset !== 'undefined' && asset !== '' && asset !== null) {
            const queryString = ``
            const url = `https://api.patentsview.org/patents/query?q={"cited_patent_number":"${asset}"}&f=["patent_number","patent_date","patent_num_combined_citations","patent_title","assignee_organization"]`

            request(url, async(error, response, body) => {
                if (!error && response.statusCode == 200) {
                    const responseBody = JSON.parse(body)
                    const citationEvents = []
                    if(responseBody !== null && responseBody.total_patent_count > 0) {
                        const allAssignee = []
                        responseBody.patents.forEach(item => {
                            let assignee = "";
                            if(item.assignees.length > 0) {
                                assignee = item.assignees[item.assignees.length - 1].assignee_organization
                            }
                            if(assignee !== '') {
                                allAssignee.push(assignee)
                            }
                            citationEvents.push({
                                id: uuidv4(),
                                start: item.patent_date + ' 00:00:00',
                                end: item.patent_date + ' 00:00:00',
                                title: item.patent_title,
                                number: item.patent_number,
                                combined: item.patent_num_combined_citations,
                                logo: '',
                                assignee,
                                all_assignee: item.assignees.join('@@')
                            })                            
                        })
                        if(allAssignee.length > 0) {
                            const getCompanyLogos = await OrganisationApplication.findAll({
                                where: {organisation_name: allAssignee},
                                group: ['organisation_name']
                            })
                            if(getCompanyLogos.length > 0) {
                                getCompanyLogos.forEach( company => {
                                    const findIndex = citationEvents.findIndex( item => item.assignee.toString().toLocaleLowerCase() == company.organisation_name.toString().toLocaleLowerCase())

                                    if( findIndex !== -1) {
                                        citationEvents[findIndex].logo = company.original_logo !== '' ? company.original_logo : company.logo_optimize
                                    }
                                })
                            }
                        }
                    }
                    res.status(200).json(citationEvents)
                } else {
                    console.log('ERROR => /citation/', error)
                    res.status(200).json({})
                }
            })
        }  else {
            console.log('ERROR => /citation/', error)
            res.status(401).send('Asset number is empty')
        }   
    } catch (e) {
        console.log('ERROR => /citation/', error)
        res.status(500).send('Error while rendering asset details')
    } 
});

module.exports = route;