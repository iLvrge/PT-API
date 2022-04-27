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
        let { list, type, format_type,  total, selectedCompanies, tabs, customers, assignments } = req.body, getData = { }

        if( list != '' ) {
            list = JSON.parse(list)
            if( list.length > 0 ) {
                let query = '';
                const where = { year: 1997, organisationID: req.orgId}
                
                const companies = JSON.parse(selectedCompanies)
                if(companies.length > 0) {
                    where.company_id = companies
                }

                where.layoutID = type
                if(format_type.toLowerCase() == 'bank') {
                    switch(parseInt(type)) {
                        case 17: 
                            query +=    `SELECT SUM(count_assets) AS number, MAX(appl) AS application, (SELECT MAX(grant_doc_num) FROM db_uspto.documentid WHERE appno_doc_num = MAX(appl)) AS patent, '' AS rf_id FROM ( 
                                            SELECT COUNT(appno_doc_num) AS count_assets, appno_doc_num AS appl FROM db_new_application.lost_assets 
                                            WHERE company_id IN (:company_id) AND organisation_id = :organisationID GROUP BY appno_doc_num
                                        ) AS temp`; 
                            break;
                        case 18:
                            where.convey_ty = "namechg";
                            query += `SELECT SUM(count_transactions) AS number, appno_doc_num AS application, grant_doc_num AS patent, '' AS rf_id FROM (SELECT COUNT(rac.rf_id) AS count_transactions, rac.rf_id As transaction, d.appno_doc_num, d.grant_doc_num FROM db_uspto.documentid AS d 
                            INNER JOIN db_uspto.representative_assignment_conveyance AS rac ON rac.rf_id = d.rf_id AND rac.convey_ty NOT IN (:convey_ty)
                            INNER JOIN db_uspto.assignee AS ass ON ass.rf_id = rac.rf_id 
                            INNER JOIN db_uspto.assignor AS aor ON aor.rf_id = rac.rf_id
                            INNER JOIN LATERAL (
                                SELECT appno_doc_num, assignor_id, exec_dt, rf_id FROM db_new_application.assets_with_bank
                                WHERE company_id IN (:company_id) AND organisation_id = :organisationID
                                GROUP BY assignor_id, rf_id
                            ) AS max_date ON max_date.appno_doc_num = d.appno_doc_num AND aor.exec_dt > max_date.exec_dt AND max_date.rf_id <> rac.rf_id AND aor.assignor_and_assignee_id = max_date.assignor_id
                            GROUP BY rac.rf_id) AS temp`;
                            break;
                        case 20:
                            where.year = 2000
                            query += `SELECT IF(max(expired_assets) <> '', max(expired_assets), '') AS application, '' AS patent, ((SUM(IF(expired_assets <> '', 1, 0)) / COUNT(DISTINCT appno_doc_num))*100) AS number, '' AS rf_id FROM (
                                SELECT d.appno_doc_num, d.grant_doc_num, (
                                   SELECT tawbe.appno_doc_num
                                   FROM db_new_application.assets_with_bank_expired AS tawbe
                                   WHERE tawbe.appno_doc_num = d.appno_doc_num AND tawbe.expire_date < tawb.exec_dt
                               ) AS expired_assets
                               FROM db_new_application.assets_with_bank AS tawb
                               INNER JOIN db_uspto.documentid AS d ON d.rf_id = tawb.rf_id
                               WHERE tawb.company_id IN (:company_id) AND tawb.organisation_id = :organisationID AND date_format(d.appno_date, '%Y') >= :year
                               GROUP BY d.appno_doc_num
                            ) AS temp`;
                            break;
                        case 21:

                            break;
                        case 22:
                            /* where.year = 2000
                            where.current_date = ''
                            query += `SELECT SUM(total_assets) AS number, rf_id, '' AS appno_doc_num, '' AS grant_doc_num FROM (SELECT tawb.rf_id, COUNT(DISTINCT d.appno_doc_num) AS total_assets, 
                                    (
                                        SELECT COUNT(DISTINCT d1.appno_doc_num)
                                        FROM db_uspto.documentid AS d1
                                        LEFT JOIN db_new_application.assets_with_bank_expired As tawbe ON tawbe.appno_doc_num = d1.appno_doc_num
                                        WHERE d1.rf_id = tawb.rf_id AND tawbe.expire_date > tawb.exec_dt AND tawbe.expire_date < CURDATE()
                                    ) AS expired_assets
                                FROM db_new_application.assets_with_bank AS tawb
                                INNER JOIN db_uspto.documentid AS d ON d.rf_id = tawb.rf_id
                                WHERE tawb.company_id IN (:company_id) AND tawb.organisation_id = :organisationID AND date_format(d.appno_date, '%Y') >= :year
                                GROUP BY tawb.rf_id) AS temp`; */
                            break;
                        case 23:
                            query += `SELECT appno_doc_num AS application, grant_doc_num AS patent, '' AS rf_id, COUNT(event_code) AS number FROM (SELECT tawb.appno_doc_num, emf.grant_doc_num,  event_code                                
                                FROM db_new_application.assets_with_bank as tawb
                                INNER JOIN db_patent_maintainence_fee.event_maintainence_fees AS emf ON emf.appno_doc_num = tawb.appno_doc_num
                                WHERE company_id IN (:company_id) 
                                AND organisation_id = :organisationID 
                                AND emf.event_code IN ('F176', 'M1554', 'M1555', 'M1556', 'M1557', 'M1558', 'M176', 'M177', 'M178', 'M181', 'M182', 'M186', 'M187', 'M188', 'M2554', 'M2555', 'M2556', 'M2558', 'M277', 'M281', 'M282', 'M286', 'M3554', 'M3555', 'M3556', 'M3557', 'M3558')) AS temp`           
                            break;
                        case 24:
                            where.convey_ty = 'correct'
                            query += `SELECT '' AS application, ''  AS patent, MAX(rf_id) AS rf_id, SUM(total_transactions) AS number FROM (SELECT rac.rf_id, COUNT(rac.rf_id) AS total_transactions 
                                    FROM db_new_application.assets_with_bank as tawb
                                    INNER JOIN db_uspto.documentid AS doc ON doc.appno_doc_num = tawb.appno_doc_num
                                    INNER JOIN db_uspto.representative_assignment_conveyance AS rac ON rac.rf_id = doc.rf_id
                                    WHERE company_id IN (:company_id) 
                                    AND organisation_id = :organisationID 
                                    AND rac.convey_ty = :convey_ty
                                    GROUP BY tawb.appno_doc_num) AS temp`;
                            break;
                        case 25:
                            where.days = 90
                            query += `SELECT '' AS application, ''  AS patent, MAX(rf_id) AS rf_id, COUNT(rf_id) AS number FROM (SELECT temp_exec_dt.rf_id, DATEDIFF(ass.record_dt, temp_exec_dt.exec_dt) AS noOfDays   
                                    FROM db_new_application.assets_with_bank as tawb
                                    INNER JOIN db_uspto.documentid AS doc ON doc.appno_doc_num = tawb.appno_doc_num
                                    INNER JOIN db_uspto.assignment AS ass ON ass.rf_id = doc.rf_id
                                    INNER JOIN LATERAL (
                                        SELECT aor.rf_id, aor.exec_dt FROM db_uspto.assignor AS aor
                                        INNER JOIN db_uspto.documentid AS doc1 ON doc1.rf_id = aor.rf_id
                                        INNER JOIN db_new_application.assets_with_bank AS tawb1 ON tawb1.appno_doc_num = doc1.appno_doc_num
                                        WHERE company_id IN (:company_id) 
                                        AND organisation_id = :organisationID 
                                        GROUP BY aor.rf_id
                                    ) AS temp_exec_dt ON  temp_exec_dt.rf_id = ass.rf_id
                                    WHERE company_id IN (:company_id) 
                                    AND organisation_id = :organisationID  
                                    HAVING noOfDays > :days ) AS temp`;
                            break;
                        case 26:

                            break;
                        case 27:
                            break;
                    }
                } else {
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
                }

                if(query != '') {
                    getData =  await connection.applicationNew.query(query,{
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        logging: console.log,
                        replacements: where,
                        plain: true
                    })
                }                
            }
        }
        res.status(200).json(getData);
    } catch(e) {
        console.log(e)
        res.status(500).json({message: "Unable to retrieve assets"})
    }    
});


module.exports = route;