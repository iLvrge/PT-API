const express = require("express");

const route = express.Router();

const connection = require("../../config/db.config");

const Dashboards = require("../../model/application/Dashboards");

const Share = require("../../model/application/Share");

const Representatives = require("../../model/client/Representatives");

const clientDBConnection = require("../../helpers/clientDBConnection");


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

const getOwnedAssets = async( req ) => {
    try {
        let {selectedCompanies} = req.body, getList = [];
        if(selectedCompanies != '' && typeof selectedCompanies != 'undefined' && selectedCompanies != null) {
            selectedCompanies = JSON.parse(selectedCompanies)
        }
        const query = `SELECT appno_doc_num FROM owned_assets WHERE organisation_id = :organisationID AND company_id IN (:selectedCompanies)`

        const list =  await connection.applicationNew.query(query,{
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            logging: console.log,
            replacements: {
                organisationID: req.orgId,
                selectedCompanies,
            }
        })

        if(list !== null && list.length > 0) {
            list.forEach( row => {
                getList.push(`${row.appno_doc_num}`)
            })
        }
        return getList
    } catch (err) {
    }
}

route.post('/parties/assignor', [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try {
        let {selectedCompanies} = req.body, getList = [];
        if(selectedCompanies != '' && typeof selectedCompanies != 'undefined' && selectedCompanies != null) {
            selectedCompanies = JSON.parse(selectedCompanies)
        }
        /**
         * Find company name
         */
        const Representative = req.connection_db.define('Representatives', Representatives.mainStructure, Representatives.options);
        const getRepresentativeName = await Representative.findOne({
            attributes: ['representative_name'],
            where: {
                representative_id: selectedCompanies
            }
        });
        if( getRepresentativeName != null) {
            //const list = await getOwnedAssets(req)
            /*if(list.length > 0) {*/
                /* const query = `SELECT name, "${getRepresentativeName.representative_name}" as assignor, SUM(app_count) as number FROM
                (SELECT  aaa.assignor_and_assignee_id, aaa.representative_id, 
                (CASE  WHEN r.representative_name <> "" THEN r.representative_name ELSE aaa.name END) AS name,
                 COUNT(DISTINCT appno_doc_num) AS app_count FROM db_uspto.assignee AS ass
                INNER JOIN db_uspto.assignor_and_assignee AS aaa ON aaa.assignor_and_assignee_id = ass.assignor_and_assignee_id
                LEFT JOIN db_uspto.representative As r ON r.representative_id = aaa.representative_id
                INNER JOIN db_uspto.documentid AS doc ON doc.rf_id = ass.rf_id
                INNER JOIN db_uspto.representative_assignment_conveyance AS rac ON rac.rf_id = ass.rf_id
                INNER JOIN db_uspto.conveyance AS con ON con.convey_name = rac.convey_ty AND con.is_ota = 1 
                WHERE ass.rf_id IN (
                SELECT aor.rf_id
                 FROM db_new_application.activity_parties_transactions AS apt
                INNER JOIN db_uspto.documentid AS doc ON doc.rf_id = apt.rf_id
                INNER JOIN db_uspto.assignor AS aor ON aor.assignor_and_assignee_id = apt.recorded_assignor_and_assignee_id
                WHERE doc.appno_doc_num IN (:list)
                AND date_format(doc.appno_date, '%Y') > :year 
                AND apt.organisation_id = :organisationID 
                AND apt.company_id IN (:selectedCompanies)
                GROUP BY aor.rf_id)
                GROUP BY aaa.assignor_and_assignee_id)AS temp GROUP BY name ORDER BY number DESC, name ASC ;`  */

                const query = `SELECT name, assignor, SUM(app_count) as number FROM
                (SELECT  aaa.assignor_and_assignee_id, "${getRepresentativeName.representative_name}" as assignor, aaa.representative_id, 
                (CASE  WHEN r.representative_name <> "" THEN r.representative_name ELSE aaa.name END) AS name,
                 COUNT(DISTINCT appno_doc_num) AS app_count FROM db_uspto.assignee AS ass
                INNER JOIN db_uspto.assignor_and_assignee AS aaa ON aaa.assignor_and_assignee_id = ass.assignor_and_assignee_id
                LEFT JOIN db_uspto.representative As r ON r.representative_id = aaa.representative_id
                INNER JOIN db_uspto.documentid AS doc ON doc.rf_id = ass.rf_id
                INNER JOIN db_uspto.representative_assignment_conveyance AS rac ON rac.rf_id = ass.rf_id
                INNER JOIN db_uspto.conveyance AS con ON con.convey_name = rac.convey_ty AND con.is_ota = 1
                INNER JOIN (
                SELECT aor.rf_id
                 FROM db_new_application.activity_parties_transactions AS apt
                INNER JOIN db_uspto.documentid AS doc ON doc.rf_id = apt.rf_id
                INNER JOIN db_uspto.assignor AS aor ON aor.assignor_and_assignee_id = apt.recorded_assignor_and_assignee_id
                WHERE  date_format(doc.appno_date, '%Y') > :year 
                AND apt.organisation_id = :organisationID  
                AND apt.company_id IN (:selectedCompanies)
                GROUP BY aor.rf_id) AS tempOR ON tempOR.rf_id = ass.rf_id
                GROUP BY aaa.assignor_and_assignee_id)AS temp GROUP BY name HAVING name <> assignor ORDER BY number DESC, name ASC`
    
                getList =  await connection.applicationNew.query(query,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    logging: console.log,
                    replacements: {
                        organisationID: req.orgId,
                        selectedCompanies,
                        year: 1997
                    }
                })
            /*} */           
        }        
        res.status(200).json(getList);
    } catch (err) {
        console.log(err);
        res.status(500).json({message: "Unable to retrieve data"})
    }
})

route.post('/parties', [authJWT.verifyToken, clientDBConnection.connect], async(req, res, next) => {
    try{
        let {selectedCompanies} = req.body, getList = [];
        /**
         * Activity acquisition, mergerIn, employees
         */
        if(selectedCompanies != '' && typeof selectedCompanies != 'undefined' && selectedCompanies != null) {
            selectedCompanies = JSON.parse(selectedCompanies)
        }
        /**
         * Find company name
         */
        const Representative = req.connection_db.define('Representatives', Representatives.mainStructure, Representatives.options);
        const getRepresentativeName = await Representative.findOne({
            attributes: ['representative_name'],
            where: {
                representative_id: selectedCompanies
            }
        }); 

        if( getRepresentativeName != null) {
            const query = `SELECT name, assignee, SUM(app_count) as number FROM (SELECT aaa.assignor_and_assignee_id, aaa.representative_id, (CASE  WHEN apt.activity_id = 10 THEN "Employees" WHEN r.representative_name <> "" THEN r.representative_name ELSE aaa.name END) AS name, COUNT(DISTINCT appno_doc_num) AS app_count, "${getRepresentativeName.representative_name}" as assignee  FROM db_new_application.activity_parties_transactions AS apt
            INNER JOIN db_new_application.assets AS ass ON ass.rf_id = apt.rf_id
            INNER JOIN db_uspto.assignor_and_assignee AS aaa ON aaa.assignor_and_assignee_id = apt.assignor_and_assignee_id
            LEFT JOIN db_uspto.representative As r ON r.representative_id = aaa.representative_id
            WHERE apt.organisation_id = :organisationID and apt.company_id IN (:selectedCompanies) AND ass.layout_id = :layoutID
            AND activity_id IN (:acitivityID) AND date_format(ass.appno_date, '%Y') > :year /*AND appno_doc_num IN (SELECT appno_doc_num FROM owned_assets WHERE organisation_id = :organisationID AND company_id IN (:selectedCompanies))*/
            GROUP BY aaa.assignor_and_assignee_id) AS temp GROUP BY name HAVING assignee <> name ORDER BY number DESC, name ASC ` 

            getList =  await connection.applicationNew.query(query,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: {
                    organisationID: req.orgId,
                    selectedCompanies,
                    layoutID: 15,
                    acitivityID: [1, 6, 10],
                    year: 1997
                }
            })
        }
        
        res.status(200).json(getList);

    } catch (err) {
        console.log(err);
        res.status(500).json({message: "Unable to retrieve data"})
    }
})


route.post("/", [authJWT.verifyToken], async(req, res, next) => {
    try{
        let {selectedCompanies, customers, type, data_format} = req.body, getData = {}
        const where = { year: 1997, organisationID: req.orgId, type: parseInt(type)}, typeList = [38, 39, 40, 41]
        let query = '';
        const companies = JSON.parse(selectedCompanies)
        if(companies.length > 0) {
            where.company_id = companies
        }
        if(typeof format_type != 'undefined' && format_type.toLowerCase() == 'bank') {
            const parties = JSON.parse(customers)
            if(parties.length > 0) {
                where.assignor_id = parties
            }
            switch(parseInt(type)) {
                case 1: 
                case 18:
                case 23:
                    /**
                     * Encumbrances
                     * Broken Chain 
                     * Maintainence
                     */
                    query = `SELECT COUNT(application) AS number, application, patent, rf_id, total FROM (SELECT application, patent, rf_id, total FROM dashboard_items 
                        WHERE type = :type AND organisation_id = :organisationID  ${parties.length > 0 ? ' AND assignor_id IN (:assignor_id) ' : ''} ${companies.length > 0 ? ' AND representative_id IN (:company_id) ' : ''}  GROUP BY application) AS temp`
                    break;
                case 17: 
                case 24:
                case 25:
                    /**
                     * Incorrect Names
                     * Incorrect Recording
                     * Late Recording
                     */
                    query = `SELECT COUNT(rf_id) AS number, '' AS application, '' AS patent, rf_id, total FROM (SELECT rf_id, total FROM dashboard_items 
                        WHERE type = :type AND organisation_id = :organisationID ${companies.length > 0 ? ' AND representative_id IN (:company_id) ' : ''} ${parties.length > 0 ? ' AND assignor_id IN (:assignor_id) ' : ''} GROUP BY rf_id) AS temp`
                    break;
            }
        } else {
            const qType = parseInt(type);
            let ownedAssets = []
            if(qType == 30 || qType == 38){
                ownedAssets = await getOwnedAssets(req)
                if(ownedAssets.length > 0) {
                    where.list = ownedAssets
                }
            }
            switch(parseInt(qType)) {
                case 1:
                case 18:
                case 23:
                    /**
                     * Encumbrances
                     * Broken Chain 
                     * Maintainence
                     */
                    where.layoutID = qType == 1 ? 1 : 15;
                    if(parseInt(data_format) === 1) {
                        query = `SELECT year, sum(number) over (order by year) as number, application, patent, rf_id FROM (
                            SELECT year, COUNT(year) AS number, application, patent, '' AS rf_id FROM( SELECT assets.appno_doc_num AS application, assets.grant_doc_num AS patent, date_format(assets.appno_date, '%Y') AS year FROM db_new_application.dashboard_items AS dt
                        INNER JOIN db_new_application.assets AS assets ON assets.appno_doc_num = dt.application
                        WHERE dt.organisation_id = :organisationID 
                        AND assets.organisation_id = :organisationID 
                        AND assets.layout_id = :layoutID AND assets.company_id IN (:company_id)  AND dt.type = :type
                        AND dt.representative_id IN (:company_id)
                        GROUP BY assets.appno_doc_num) AS temp GROUP BY year) AS temp1`;
                    } else {
                        query = `SELECT COUNT(application) AS number, application, patent, rf_id, total FROM (SELECT application, patent, rf_id, total FROM dashboard_items 
                            WHERE type = :type AND organisation_id = :organisationID ${companies.length > 0 ? ' AND representative_id IN (:company_id) ' : ''} GROUP BY application) AS temp`
                    }                    
                    break;                    
                case 17:
                case 24:
                case 25:
                    /**
                     * Incorrect Names
                     * Incorrect Recording
                     * Late Recording
                     */
                     where.layoutID = 15;
                     if(parseInt(data_format) === 1) {
                        query = `SELECT year, sum(number) over (order by year) as number, application, patent, rf_id FROM (
                            SELECT year, COUNT(year) AS number, '' AS application, '' AS patent, rf_id FROM( 
                            SELECT dt.rf_id, date_format(apt.exec_dt, '%Y') AS year FROM db_new_application.dashboard_items AS dt
                            INNER JOIN db_new_application.activity_parties_transactions AS apt ON apt.rf_id = dt.rf_id
                            WHERE dt.organisation_id = :organisationID
                            AND apt.organisation_id = :organisationID
                            AND apt.company_id IN (:company_id)
                            AND dt.representative_id IN (:company_id)
                            AND dt.type = :type
                            GROUP BY dt.rf_id) AS temp GROUP BY year) AS temp1`;
                    } else {
                        query = `SELECT COUNT(rf_id) AS number, '' AS application, '' AS patent, rf_id, total FROM (SELECT rf_id, total FROM dashboard_items 
                            WHERE type = :type AND organisation_id = :organisationID ${companies.length > 0 ? ' AND representative_id IN (:company_id) ' : ''} GROUP BY rf_id) AS temp`
                        break;
                    }
                case 30:
                    if(ownedAssets.length > 0) {
                        query = `SELECT COUNT(*) as number, '' AS application, grant_doc_num AS patent, '' AS rf_id, 0 AS total FROM (SELECT grant_doc_num FROM db_uspto.documentid WHERE appno_doc_num IN (:list) AND grant_doc_num <> '' GROUP BY grant_doc_num ORDER BY grant_date DESC) AS temp`
                    }
                    break;
                case 31:
                case 32:
                case 34:
                case 36:
                    query = `SELECT COUNT(id) AS number, application, '' AS patent, rf_id, total FROM dashboard_items WHERE type = :type AND organisation_id = :organisationID ${companies.length > 0 ? ' AND representative_id IN (:company_id) ' : ''}`
                    break;                
                case 37:
                    query = `SELECT SUM(total) AS number, application, '' AS patent, rf_id, 0 AS total FROM dashboard_items WHERE type = :type AND organisation_id = :organisationID ${companies.length > 0 ? ' AND representative_id IN (:company_id) ' : ''}`
                    break;
                case 38:
                    if(ownedAssets.length > 0) {
                        query = `SELECT application_country AS name, COUNT(application_country) AS number, grant_doc_num AS patent, '' AS application, '' AS rf_id, 0 AS total FROM (
                                SELECT grant_doc_num, application_number, application_country FROM db_uspto.assets_family AS af WHERE grant_doc_num IN (
                                    SELECT grant_doc_num FROM db_uspto.documentid AS di WHERE appno_doc_num IN (:list)                                     
                                    GROUP BY grant_doc_num
                                ) AND application_country NOT IN ('WO', 'US') GROUP BY application_number) AS temp GROUP BY application_country ORDER BY number DESC, name ASC LIMIT 5`
                    }
                    break; 
                case 39:
                case 41:
                    /**
                     * Lendor or inventor
                     */
                    query = `SELECT inventorName AS name, COUNT(application) AS number, application, '' As patent, '' AS rf_id, 0 AS total FROM (SELECT aaa.assignor_and_assignee_id, IF(aaa.representative_id <> '', r.representative_name, aaa.name) AS inventorName, application FROM dashboard_items AS di INNER JOIN db_uspto.assignor_and_assignee AS aaa ON aaa.assignor_and_assignee_id = di.assignor_id LEFT JOIN db_uspto.representative AS r ON r.representative_id = aaa.representative_id WHERE di.type = :type AND di.organisation_id = :organisationID ${companies.length > 0 ? ' AND di.representative_id IN (:company_id) ' : ''} ) AS temp GROUP BY inventorName ORDER BY number DESC, name ASC LIMIT 5`
                    break;
                case 40:
                    query = `SELECT lawfirm AS name, COUNT(application) AS number, application, '' As patent, '' AS rf_id, 0 AS total FROM dashboard_items WHERE type = :type AND organisation_id = :organisationID ${companies.length > 0 ? ' AND representative_id IN (:company_id) ' : ''} GROUP BY lawfirm ORDER BY number DESC, name ASC LIMIT 5`
                    break;
            }
        }

        if(query != '') {
            getData =  await connection.applicationNew.query(query,{
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: where,
                plain: parseInt(data_format) === 1 || typeList.includes(where.type) ? false : true
            })
        }
        res.status(200).json(getData);
    } catch (err) {
        console.log(err)
        res.status(500).json({message: "Unable to retrieve data."})
    }
})

route.post("/temp", [authJWT.verifyToken], async(req, res, next) => {
    try {
        let { list, type, format_type,  total, selectedCompanies, tabs, customers, assignments } = req.body, getData = { }

        if( list != '' ) {
            list = []
            let query = '';
            total = 0;
            const where = { year: 1997, organisationID: req.orgId}
            
            const companies = JSON.parse(selectedCompanies)
            if(companies.length > 0) {
                where.company_id = companies
            }

            

            where.layoutID = type
            if(typeof format_type != 'undefined' && format_type.toLowerCase() == 'bank') {
                const parties = JSON.parse(customers)
                if(parties.length > 0) {
                    where.assignor_id = parties
                }



                let queryAssets = `SELECT ${parseInt(type) == 24 || parseInt(type) == 25 ? 'appno_doc_num' : 'COUNT(*) AS total'}  FROM db_new_application.assets_with_bank WHERE company_id IN (:company_id) AND organisation_id = :organisationID`
                        
                if(parties.length > 0) {
                    queryAssets += ` AND assignor_id IN (:assignor_id)`
                }
                if(parseInt(type) == 24 || parseInt(type) == 25) {
                    queryAssets += ` GROUP BY appno_doc_num`
                }
                
                const assetsBankList = await connection.applicationNew.query(queryAssets,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    logging: console.log,
                    replacements: where,
                    plain: parseInt(type) == 24 || parseInt(type) == 25 ? false : true
                })

                const assets = []
                
                if(assetsBankList !== null) {
                    if((parseInt(type) == 24 || parseInt(type) == 25)) {
                        if( assetsBankList.length > 0 ) {
                            assetsBankList.forEach( ass => {
                                assets.push(ass.appno_doc_num)
                            })
                        }                        
                        total = assetsBankList.length
                    } else {
                        total = assetsBankList.total
                    }                   
                }
                
                switch(parseInt(type)) {
                    case 1:
                        /**
                         * Broken
                         */
                        query +=    `SELECT COUNT(appno_doc_num) AS number, appno_doc_num AS application, grant_doc_num AS patent, '' AS rf_id, ${total} AS total FROM (
                            SELECT appno_doc_num, grant_doc_num FROM db_new_application.assets_bank_broken 
                            WHERE company_id IN (:company_id) AND organisation_id = :organisationID ${parties.length > 0 ? ' AND assignor_id IN (:assignor_id) ' : ''} GROUP BY appno_doc_num) AS temp`; 
                        break;
                    case 17: 
                        /**
                         * Incorrect Names
                         */
                        query +=    `SELECT COUNT(appno_doc_num) AS number, '' AS application, '' AS patent, rf_id, ${total} AS total FROM (
                            SELECT appno_doc_num, grant_doc_num, rf_id FROM db_new_application.lost_assets 
                            WHERE company_id IN (:company_id) AND organisation_id = :organisationID  ${parties.length > 0 ? ' AND assignor_id IN (:assignor_id) ' : ''} GROUP BY appno_doc_num) AS temp`; 
                        break;
                    case 18:
                        /**
                         * Encumbrances
                         */
                        where.convey_ty = "namechg";
                        query += `SELECT SUM(count_transactions) AS number, appno_doc_num AS application, grant_doc_num AS patent, '' AS rf_id, ${total} AS total FROM (SELECT COUNT(rac.rf_id) AS count_transactions, rac.rf_id As transaction, d.appno_doc_num, d.grant_doc_num FROM db_uspto.documentid AS d 
                        INNER JOIN db_uspto.representative_assignment_conveyance AS rac ON rac.rf_id = d.rf_id AND rac.convey_ty NOT IN (:convey_ty)
                        INNER JOIN db_uspto.assignee AS ass ON ass.rf_id = rac.rf_id 
                        INNER JOIN db_uspto.assignor AS aor ON aor.rf_id = rac.rf_id
                        INNER JOIN LATERAL (
                            SELECT appno_doc_num, assignor_id, exec_dt, rf_id FROM db_new_application.assets_with_bank
                            WHERE company_id IN (:company_id) AND organisation_id = :organisationID  ${parties.length > 0 ? ' AND assignor_id IN (:assignor_id) ' : ''} 
                            GROUP BY assignor_id, rf_id
                        ) AS max_date ON max_date.appno_doc_num = d.appno_doc_num AND aor.exec_dt > max_date.exec_dt AND max_date.rf_id <> rac.rf_id AND aor.assignor_and_assignee_id = max_date.assignor_id
                        GROUP BY rac.rf_id) AS temp`;
                        break;
                    case 20:
                        /**
                         * Invalid Collaterals
                         */
                        where.year = 2000
                        query += `SELECT IF(max(expired_assets) <> '', max(expired_assets), '') AS application, '' AS patent, SUM(IF(expired_assets <> '', 1, 0)) AS number, '' AS rf_id, ${total} AS total FROM (
                            SELECT d.appno_doc_num, d.grant_doc_num, (
                                SELECT tawbe.appno_doc_num
                                FROM db_new_application.assets_with_bank_expired AS tawbe
                                WHERE tawbe.appno_doc_num = d.appno_doc_num AND tawbe.expire_date < tawb.exec_dt
                            ) AS expired_assets
                            FROM db_new_application.assets_with_bank AS tawb
                            INNER JOIN db_uspto.documentid AS d ON d.rf_id = tawb.rf_id
                            WHERE tawb.company_id IN (:company_id) AND tawb.organisation_id = :organisationID   ${parties.length > 0 ? ' AND tawb.assignor_id IN (:assignor_id) ' : ''}    AND date_format(d.appno_date, '%Y') >= :year
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
                        /**
                         * Late Maintainence
                         */
                        query += `SELECT appno_doc_num AS application, grant_doc_num AS patent, '' AS rf_id, COUNT(event_code) AS number, ${total} AS total FROM (SELECT tawb.appno_doc_num, emf.grant_doc_num,  event_code                                
                            FROM db_new_application.assets_with_bank as tawb
                            INNER JOIN db_patent_maintainence_fee.event_maintainence_fees AS emf ON emf.appno_doc_num = tawb.appno_doc_num
                            WHERE company_id IN (:company_id) 
                            AND organisation_id = :organisationID ${parties.length > 0 ? ' AND assignor_id IN (:assignor_id) ' : ''}
                            AND emf.event_code IN ('F176', 'M1554', 'M1555', 'M1556', 'M1557', 'M1558', 'M176', 'M177', 'M178', 'M181', 'M182', 'M186', 'M187', 'M188', 'M2554', 'M2555', 'M2556', 'M2558', 'M277', 'M281', 'M282', 'M286', 'M3554', 'M3555', 'M3556', 'M3557', 'M3558')) AS temp`           
                        break;
                    case 24:
                        /**
                         * Incorrect Recordings
                         */
                        if(total > 0) {
                            where.convey_ty = 'correct'
                            where.assets = assets
                            query += `SELECT '' AS application, ''  AS patent, MAX(rf_id) AS rf_id, SUM(total_transactions) AS number,(SELECT COUNT(transactions) FROM ( 
                                SELECT  rf_id AS transactions FROM db_uspto.documentid
                                   WHERE appno_doc_num IN (:assets)
                                   GROUP BY rf_id                                
                               ) as temp1) AS total FROM (SELECT rac.rf_id, COUNT(rac.rf_id) AS total_transactions 
                                    FROM db_new_application.assets_with_bank as tawb
                                    INNER JOIN (
                                        SELECT appno_doc_num, rf_id FROM db_uspto.documentid
                                        WHERE appno_doc_num IN (:assets)   
                                        GROUP BY appno_doc_num, rf_id                                         
                                    ) AS doc ON doc.appno_doc_num = tawb.appno_doc_num
                                    INNER JOIN db_uspto.representative_assignment_conveyance AS rac ON rac.rf_id = doc.rf_id
                                    WHERE company_id IN (:company_id) 
                                    AND organisation_id = :organisationID ${parties.length > 0 ? ' AND assignor_id IN (:assignor_id) ' : ''}
                                    AND rac.convey_ty = :convey_ty
                                    GROUP BY tawb.appno_doc_num) AS temp`;         
                        }
                                          
                        break;
                    case 25:
                        /**
                         * Late Recordings
                         */
                        if(total > 0) {
                            where.assets = assets
                            where.days = 90
                            query += `SELECT '' AS application, ''  AS patent, MAX(rf_id) AS rf_id, COUNT(rf_id) AS number, (SELECT COUNT(transactions) FROM ( 
                                SELECT  rf_id AS transactions FROM db_uspto.documentid
                                   WHERE appno_doc_num IN (:assets)
                                   GROUP BY rf_id                                
                               ) as temp1) AS total FROM (SELECT temp_exec_dt.rf_id, DATEDIFF(ass.record_dt, temp_exec_dt.exec_dt) AS noOfDays   
                                    FROM db_new_application.assets_with_bank as tawb
                                    INNER JOIN (
                                        SELECT appno_doc_num, rf_id FROM db_uspto.documentid
                                        WHERE appno_doc_num IN (:assets)
                                        GROUP BY appno_doc_num, rf_id
                                    ) AS doc ON doc.appno_doc_num = tawb.appno_doc_num
                                    INNER JOIN db_uspto.assignment AS ass ON ass.rf_id = doc.rf_id
                                    INNER JOIN LATERAL (
                                        SELECT aor.rf_id, aor.exec_dt FROM db_uspto.assignor AS aor
                                        INNER JOIN (
                                            SELECT appno_doc_num, rf_id FROM db_uspto.documentid
                                            WHERE appno_doc_num IN (:assets)
                                            GROUP BY appno_doc_num, rf_id
                                        ) AS doc1 ON doc1.rf_id = aor.rf_id
                                        INNER JOIN db_new_application.assets_with_bank AS tawb1 ON tawb1.appno_doc_num = doc1.appno_doc_num
                                        WHERE company_id IN (:company_id) 
                                        AND organisation_id = :organisationID ${parties.length > 0 ? ' AND assignor_id IN (:assignor_id) ' : ''}
                                        GROUP BY aor.rf_id
                                    ) AS temp_exec_dt ON  temp_exec_dt.rf_id = ass.rf_id
                                    WHERE company_id IN (:company_id) 
                                    AND organisation_id = :organisationID  
                                    GROUP BY temp_exec_dt.rf_id
                                    HAVING noOfDays > :days ) AS temp`;
                        }
                        break;
                    case 26:
                        /**
                         * Deflated Collaterals
                         */
                        break;
                    case 27:
                        break;
                }
            } else {
                /**
                 * Get List
                 */
                if(parseInt(type) != 1){
                    where.layoutID = 15
                }
                let queryAssets = `SELECT appno_doc_num FROM db_new_application.assets AS assets WHERE date_format(assets.appno_date, '%Y') > :year AND assets.layout_id = :layoutID AND assets.organisation_id = :organisationID `
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

                if(Array.isArray(companies) && companies.length > 0) {
                    queryAssets += ` AND assets.company_id IN (:company_id)`
                }

                if((Array.isArray(assignments) && assignments.length > 0 ) || (Array.isArray(tabs) && tabs.length > 0) || (Array.isArray(customers) && customers.length > 0)) {
                    queryAssets += ` AND assets.appno_doc_num IN ( SELECT documentid.appno_doc_num FROM db_uspto.documentid WHERE rf_id  IN ( SELECT activity_parties_transactions.rf_id  FROM db_new_application.activity_parties_transactions WHERE activity_parties_transactions.organisation_id = :organisationID  `

                    if(Array.isArray(companies) && companies.length > 0 ) {
                        queryAssets += ` AND activity_parties_transactions.company_id IN (:company_id) `
                    }

                    if(Array.isArray(assignments) && assignments.length > 0 ) {
                        queryAssets += ` AND activity_parties_transactions.rf_id IN (:assignments)`
                    }

                    if(Array.isArray(tabs) && tabs.length > 0 ) {
                        queryAssets += ` AND activity_parties_transactions.activity_id IN (:tabs)`
                    } 

                    if(Array.isArray(customers) && customers.length > 0 ) {
                        queryAssets += ` AND activity_parties_transactions.assignor_and_assignee_id IN (:customers)`
                    }

                    queryAssets += ` GROUP BY activity_parties_transactions.rf_id ) GROUP BY documentid.appno_doc_num) `
                } else  if(Array.isArray(tabs) && tabs.length === 0) {
                    /**exclude employees */
                    queryAssets += ` AND assets.appno_doc_num IN (  SELECT documentid.appno_doc_num FROM db_uspto.documentid WHERE rf_id  IN ( SELECT activity_parties_transactions.rf_id  FROM db_new_application.activity_parties_transactions WHERE activity_parties_transactions.organisation_id = :organisationID   ` 

                    if(Array.isArray(companies) && companies.length > 0 ) {
                        queryAssets += ` AND activity_parties_transactions.company_id IN (:company_id) `
                    }

                    queryAssets += ` GROUP BY activity_parties_transactions.rf_id )  GROUP BY documentid.appno_doc_num) `
                }
                
                const assetsList = await connection.applicationNew.query(queryAssets,{
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    logging: console.log,
                    replacements: where,
                    plain: false
                })
                if(assetsList !== null && assetsList.length > 0) { 
                    list = []                          
                    assetsList.forEach( ass => {
                        list.push(ass.appno_doc_num)
                    })
                }   
                total = assetsList.length;
                where.list = list
                if(list.length > 0) {
                    switch(parseInt(type)) {
                        case 1:
                            query = `SELECT COUNT(appno_doc_num) AS number, max(grant_doc_num) AS patent, max(appno_doc_num) AS application, '' AS rf_id, ${total} AS total  FROM ( SELECT appno_doc_num, grant_doc_num FROM db_new_application.assets AS assets  WHERE date_format(assets.appno_date, '%Y') > :year AND assets.layout_id = :layoutID AND assets.organisation_id = :organisationID  AND assets.appno_doc_num IN (:list) GROUP BY appno_doc_num ) AS temp `;
                            break;
                        case 17:
                            /**
                             * Incorrect Names
                             */
                            query = `SELECT COUNT(appno) AS number, '' AS application, '' AS patent, rf_id, ${total} AS total FROM (SELECT recorded_assignor_and_assignee_id, appno, appnoDt, grantNo, grantDt, rf_id, name, representative_name FROM (
                                SELECT apt.recorded_assignor_and_assignee_id, MAX(appno_doc_num) AS appno, MAX(appno_date) AS appnoDt, MAX(grant_doc_num) AS grantNo, MAX(grant_date) AS grantDt,  rac.rf_id, aaa.name AS name,
                                                    (SELECT representative_name FROM db_uspto.representative WHERE representative_id = aaa.representative_id) AS representative_name  FROM db_new_application.activity_parties_transactions AS apt
                                INNER JOIN db_uspto.documentid AS doc ON doc.rf_id = apt.rf_id
                                INNER JOIN db_uspto.representative_assignment_conveyance AS rac ON rac.rf_id = apt.rf_id 
                                INNER JOIN db_uspto.conveyance AS con ON con.convey_name = rac.convey_ty AND con.is_ota = 1 
                                INNER JOIN db_uspto.assignor_and_assignee AS aaa ON aaa.assignor_and_assignee_id = apt.recorded_assignor_and_assignee_id
                                WHERE apt.company_id = (:company_id) AND apt.organisation_id = :organisationID AND appno_doc_num IN (:list)
                                GROUP BY apt.recorded_assignor_and_assignee_id, appno_doc_num, rac.rf_id
                                ) AS temp
                                WHERE representative_name <> '' AND LOWER(name) <> LOWER(representative_name)) temp1`                            
                            break;
                        case 18:
                            /**
                             * Encumbrances
                             */
                            where.convey_ty = "namechg";
                            query = `SELECT SUM(count_transactions) AS number, appno_doc_num AS application, grant_doc_num AS patent, '' AS rf_id, ${total} AS total FROM (SELECT COUNT(rac.rf_id) AS count_transactions, rac.rf_id As transaction, d.appno_doc_num, d.grant_doc_num FROM db_uspto.documentid AS d 
                            INNER JOIN db_uspto.representative_assignment_conveyance AS rac ON rac.rf_id = d.rf_id AND rac.convey_ty NOT IN (:convey_ty)
                            INNER JOIN db_uspto.assignee AS ass ON ass.rf_id = rac.rf_id 
                            INNER JOIN db_uspto.assignor AS aor ON aor.rf_id = rac.rf_id
                            INNER JOIN LATERAL (
                                SELECT assets.appno_doc_num, apt.assignor_and_assignee_id AS assignor_id, apt.exec_dt, apt.rf_id FROM db_new_application.assets AS assets
                                INNER JOIN db_new_application.activity_parties_transactions AS apt ON apt.rf_id = assets.rf_id
                                WHERE assets.company_id IN (:company_id) AND assets.organisation_id = :organisationID
                                AND assets.appno_doc_num IN (:list)
                                GROUP BY assignor_id, rf_id
                            ) AS max_date ON max_date.appno_doc_num = d.appno_doc_num AND aor.exec_dt > max_date.exec_dt AND max_date.rf_id <> rac.rf_id AND aor.assignor_and_assignee_id = max_date.assignor_id
                            GROUP BY rac.rf_id) AS temp`;
                            break;
                        case 23:
                            /**
                             * Late Maintainence
                             */
                            query = `SELECT appno_doc_num AS application, grant_doc_num AS patent, '' AS rf_id, COUNT(event_code) AS number, ${total} AS total FROM (SELECT tawb.appno_doc_num, emf.grant_doc_num,  event_code                                
                                FROM db_new_application.assets as tawb
                                INNER JOIN db_patent_maintainence_fee.event_maintainence_fees AS emf ON emf.appno_doc_num = tawb.appno_doc_num
                                WHERE company_id IN (:company_id) 
                                AND organisation_id = :organisationID 
                                AND tawb.appno_doc_num IN (:list)
                                AND emf.event_code IN ('F176', 'M1554', 'M1555', 'M1556', 'M1557', 'M1558', 'M176', 'M177', 'M178', 'M181', 'M182', 'M186', 'M187', 'M188', 'M2554', 'M2555', 'M2556', 'M2558', 'M277', 'M281', 'M282', 'M286', 'M3554', 'M3555', 'M3556', 'M3557', 'M3558')) AS temp`           
                            break;
                        case 24:
                            /**
                             * Incorrect Recordings
                             */
                            where.convey_ty = 'correct'
                            query = `SELECT '' AS application, ''  AS patent, MAX(rf_id) AS rf_id, SUM(total_transactions) AS number, (SELECT COUNT(transactions) FROM ( 
                                SELECT  rf_id AS transactions FROM db_uspto.documentid
                                   WHERE appno_doc_num IN (:list)
                                   GROUP BY rf_id                                
                               ) as temp1) AS total FROM (SELECT rac.rf_id, COUNT(rac.rf_id) AS total_transactions 
                                    FROM db_new_application.assets as tawb
                                    INNER JOIN (
                                        SELECT appno_doc_num, rf_id FROM db_uspto.documentid
                                        WHERE appno_doc_num IN (:list)   
                                        GROUP BY appno_doc_num, rf_id                                         
                                    ) AS doc ON doc.appno_doc_num = tawb.appno_doc_num
                                    INNER JOIN db_uspto.representative_assignment_conveyance AS rac ON rac.rf_id = doc.rf_id
                                    WHERE company_id IN (:company_id) 
                                    AND organisation_id = :organisationID 
                                    AND rac.convey_ty = :convey_ty
                                    GROUP BY tawb.appno_doc_num) AS temp`;
                            break;
                        case 25:
                            /**
                             * Late Recordings
                             */
                            where.days = 90
                            query = `SELECT '' AS application, ''  AS patent, MAX(rf_id) AS rf_id, COUNT(rf_id) AS number, (SELECT COUNT(transactions) FROM ( 
                                SELECT  rf_id AS transactions FROM db_uspto.documentid
                                   WHERE appno_doc_num IN (:list)
                                   GROUP BY rf_id                                
                               ) as temp1) AS total FROM (SELECT temp_exec_dt.rf_id, DATEDIFF(ass.record_dt, temp_exec_dt.exec_dt) AS noOfDays   
                                    FROM db_new_application.assets as tawb
                                    INNER JOIN (
                                        SELECT appno_doc_num, rf_id FROM db_uspto.documentid
                                        WHERE appno_doc_num IN (:list)
                                        GROUP BY appno_doc_num, rf_id
                                    ) AS doc ON doc.appno_doc_num = tawb.appno_doc_num
                                    INNER JOIN db_uspto.assignment AS ass ON ass.rf_id = doc.rf_id
                                    INNER JOIN LATERAL (
                                        SELECT aor.rf_id, aor.exec_dt FROM db_uspto.assignor AS aor
                                        INNER JOIN (
                                            SELECT appno_doc_num, rf_id FROM db_uspto.documentid
                                            WHERE appno_doc_num IN (:list)
                                            GROUP BY appno_doc_num, rf_id
                                        ) AS doc1 ON doc1.rf_id = aor.rf_id
                                        INNER JOIN db_new_application.assets AS tawb1 ON tawb1.appno_doc_num = doc1.appno_doc_num
                                        WHERE company_id IN (:company_id) 
                                        AND organisation_id = :organisationID 
                                        GROUP BY aor.rf_id
                                    ) AS temp_exec_dt ON  temp_exec_dt.rf_id = ass.rf_id
                                    WHERE company_id IN (:company_id) 
                                    AND organisation_id = :organisationID  
                                    GROUP BY temp_exec_dt.rf_id
                                    HAVING noOfDays > :days ) AS temp`;   
                            break;
                    }
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
        res.status(200).json(getData);
    } catch(e) {
        console.log(e)
        res.status(500).json({message: "Unable to retrieve assets"})
    }    
});

route.post("/share", [authJWT.verifyToken], async(req, res, next) => {
    try {
        let { selectedCompanies, tabs, customers } = req.body
        if(selectedCompanies.length > 0) {
            let code = await helpers.getNewCode();
            if(code != undefined) {
                const params = {
                    organisation_id: req.orgId,
                    user_id: req.userId,
                    type: 9,
                    transactions: JSON.stringify({selectedCompanies, tabs, customers}),
                    code
                }
                const insertRecord = await Share.create(params);
                if(insertRecord != null && insertRecord.share_id > 0) {  
                    res.status(200).send(`https://dashboard.patentrack.com/${params.code}`); 
                }
            } else {
                res.status(500).send("Unable to create share url.");
            }
        } else {
            res.status(500).send("Unable to create share url.");
        }
    } catch (e) {
        console.log(e)
        res.status(500).json({message: "Unable to retrieve assets"})
    }
})
module.exports = route;