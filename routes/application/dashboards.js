const express = require("express");

const route = express.Router();

const connection = require("../../config/db.config");

const Dashboards = require("../../model/application/Dashboards");


route.get("/", [authJWT.verifyToken], async(req, res, next) => {
    let {companies} = req.query
    if(typeof companies !== '') {
        companies = JSON.parse(companies)
    }
    let where = {organisation_id: req.orgId}
    if(companies.length > 0) {
        where.representative_id = companies
    }

    Dashboards.findAll({
        attributes: ['type', 'title', 'sub_heading', [connection.Sequelize.literal('SUM(number)'), 'number'], 'patent', 'application', 'rf_id'],
        group: ['type'],
        where
    })
    .then((list)=>{
        res.status(200).json(list);
    }).catch((err)=>{
        console.log(err);
        res.status(500).json({message: "Unable to retrieve assets"})
    });
});

route.post("/", [authJWT.verifyToken], async(req, res, next) => {
    try {
        let { list, type,  total, selectedCompanies, tabs, customers, assignments } = req.body, getData = { }

        if( list != '' ) {
            list = JSON.parse(list)
            if( list.length > 0 ) {
                let query = '';
                const where = { year: 1997, organisationID: req.orgId}
                
                const companies = JSON.parse(selectedCompanies)
                if(companies.length > 0) {
                    where.company_id = companies
                }

                where.layoutID = 1
                if(parseInt(total) != list.length) {
                    /**
                     * Get List
                     */

                    if(tabs && tabs != '') {
                        tabs = JSON.parse( tabs )
                        where.tabs = tabs
                    }

                    if(customers && customers != '') {
                        customers = JSON.parse( customers )
                        where.customers = customers
                    }

                    if(assignments && assignments != '') {
                        assignments = JSON.parse( assignments )
                        where.assignments = assignments
                    }

                    query = `SELECT COUNT(appno_doc_num) AS number, max(grant_doc_num) AS patent, max(appno_doc_num) AS application, '' AS rf_id  FROM ( SELECT appno_doc_num, grant_doc_num FROM db_new_application.assets AS assets `

                    query += ` WHERE date_format(assets.appno_date, '%Y') > :year AND assets.layout_id = :layoutID AND assets.organisation_id = :organisationID `

                    if(Array.isArray(companies) && companies.length > 0) {
                        query += ` AND assets.company_id IN (:company_id)`
                    }

                    if((Array.isArray(assignments) && assignments.length > 0 ) || (Array.isArray(tabs) && tabs.length > 0) || (Array.isArray(customers) && customers.length > 0)) {
                        query += ` AND assets.appno_doc_num IN ( SELECT documentid.appno_doc_num FROM db_uspto.documentid WHERE rf_id  IN ( SELECT activity_parties_transactions.rf_id  FROM db_new_application.activity_parties_transactions WHERE activity_parties_transactions.organisation_id = :organisationID  `

                        if(Array.isArray(companies) && companies.length > 0 ) {
                            query += ` AND activity_parties_transactions.company_id IN (:company_id) `
                        }

                        if(Array.isArray(assignments) && assignments.length > 0 ) {
                            query += ` AND activity_parties_transactions.rf_id IN (:assignments)`
                        }

                        if(Array.isArray(tabs) && tabs.length > 0 ) {
                            query += ` AND activity_parties_transactions.activity_id IN (:tabs)`
                        } else {
                            /**exclude employees */
                            query += ' AND activity_parties_transactions.activity_id <> 10 ' 
                        } 

                        if(Array.isArray(customers) && customers.length > 0 ) {
                            query += ` AND activity_parties_transactions.assignor_and_assignee_id IN (:customers)`
                        }

                        query += ` GROUP BY activity_parties_transactions.rf_id ) GROUP BY documentid.appno_doc_num) `
                    } else  if(Array.isArray(tabs) && tabs.length === 0) {
                        /**exclude employees */
                        query += ` AND assets.appno_doc_num IN (  SELECT documentid.appno_doc_num FROM db_uspto.documentid WHERE rf_id  IN ( SELECT activity_parties_transactions.rf_id  FROM db_new_application.activity_parties_transactions WHERE activity_parties_transactions.organisation_id = :organisationID AND activity_parties_transactions.activity_id <> 10  ` 

                        if(Array.isArray(companies) && companies.length > 0 ) {
                            query += ` AND activity_parties_transactions.company_id IN (:company_id) `
                        }

                        query += ` GROUP BY activity_parties_transactions.rf_id )  GROUP BY documentid.appno_doc_num) `
                    }
                    
                    query += ` GROUP BY appno_doc_num) AS temp `;

                    
                } else {
                    query = `SELECT COUNT(appno_doc_num) AS number, max(grant_doc_num) AS patent, max(appno_doc_num) AS application, '' AS rf_id  FROM ( SELECT appno_doc_num, grant_doc_num FROM db_new_application.assets AS assets `

                    query += ` WHERE date_format(assets.appno_date, '%Y') > :year AND assets.layout_id = :layoutID AND assets.organisation_id = :organisationID AND assets.appno_doc_num IN (:list)  GROUP BY appno_doc_num) AS temp `
                    where.list = list
                }

                getData =  await connection.applicationNew.query(query,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    logging: console.log,
                    replacements: where,
                    plain: true
                })
            }
        }
        res.status(200).json(getData);
    } catch(e) {
        console.log(e)
        res.status(500).json({message: "Unable to retrieve assets"})
    }    
});


module.exports = route;