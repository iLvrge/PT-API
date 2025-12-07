/**
 * Events Controller
 * Business logic for events routes - refactored from routes/application/events.js
 */

const moment = require('moment');
const connection = require("../../config/db.config");
const helpers = require("../../helpers/helper");
const SvgIconsContent = require("../../helpers/svgIcons");

// Models
const MaintainenceCode = require("../../model/maintainence/MaintainenceCode");
const MaintainenceFees = require("../../model/maintainence/MaintainenceFees");
const Documentid = require("../../model/application/DocumentIds");
const Representatives = require("../../model/client/Representatives");

const ASSETS_LIFE_SPAN_DATE_FORMAT = 'YYYY';

/**
 * GET /events/tabs/:tabID
 * Get events by tab ID
 */
const getEventsByTab = async (req, res) => {
    try {
        const tabID = req.params.tabID;
        let assetsLifeSpan = [];

        if (typeof req.connection_db !== "undefined" && req.connection_db !== null) {
            const getCompaniesList = await helpers.getCompaniesList(req.connection_db);
            const portfolioList = [];

            if (getCompaniesList.length > 0) {
                const promises = getCompaniesList.map(p => {
                    portfolioList.push(p.representative_id);
                    return p;
                });
                await Promise.all(promises);
            }

            if (portfolioList.length > 0) {
                assetsLifeSpan = await helpers.findAssetsTimeSpan(portfolioList, tabID, 0, 0, req.orgId);
            }
        }

        res.status(200).json(assetsLifeSpan);
    } catch (err) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
};

/**
 * GET /events/tabs/:tabID/companies/:companyID
 * Get events by tab ID and company ID
 */
const getEventsByTabAndCompany = async (req, res) => {
    try {
        const tabID = req.params.tabID;
        const representativeID = req.params.companyID;
        let assetsLifeSpan = [];

        if (typeof req.connection_db !== "undefined" && req.connection_db !== null) {
            const findRepresentative = await helpers.findRepresentativeByID(req.connection_db, representativeID);

            if (findRepresentative !== null && findRepresentative.representative_id > 0) {
                assetsLifeSpan = await helpers.findAssetsTimeSpan([findRepresentative.representative_id], tabID, 0, 0, req.orgId);
            }
        }

        res.status(200).json(assetsLifeSpan);
    } catch (err) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
};

/**
 * GET /events/tabs/:tabID/companies/:companyID/customers/:customerID
 * Get events by tab, company and customer
 */
const getEventsByTabCompanyCustomer = async (req, res) => {
    try {
        const tabID = req.params.tabID;
        const representativeID = req.params.companyID;
        const customerID = req.params.customerID;
        let assetsLifeSpan = [];

        if (typeof req.connection_db !== "undefined" && req.connection_db !== null) {
            const findRepresentative = await helpers.findRepresentativeByID(req.connection_db, representativeID);

            if (findRepresentative !== null && findRepresentative.representative_id > 0) {
                assetsLifeSpan = await helpers.findAssetsTimeSpan([findRepresentative.representative_id], tabID, customerID, 0, req.orgId);
            }
        }

        res.status(200).json(assetsLifeSpan);
    } catch (err) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
};

/**
 * GET /events/tabs/:tabID/companies/:representativeID/customers/:customerID/transactions/:rfID
 * Get events by tab, company, customer and transaction
 */
const getEventsByTransaction = async (req, res) => {
    try {
        const tabID = req.params.tabID;
        const representativeID = req.params.representativeID;
        const customerID = req.params.customerID;
        const rfID = req.params.rfID;
        let assetsLifeSpan = [];

        if (typeof req.connection_db !== "undefined" && req.connection_db !== null) {
            if (representativeID > 0) {
                const findRepresentative = await helpers.findRepresentativeByID(req.connection_db, representativeID);

                if (findRepresentative !== null && findRepresentative.representative_id > 0) {
                    assetsLifeSpan = await helpers.findAssetsTimeSpan([findRepresentative.representative_id], tabID, customerID, rfID, req.orgId);
                }
            } else {
                assetsLifeSpan = await helpers.findAssetsTimeSpanByTransactionById(rfID);
            }
        }

        res.status(200).json(assetsLifeSpan);
    } catch (err) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
};

/**
 * POST /events/abandoned/maintainence/assets
 * Get abandoned maintenance assets
 */
const getAbandonedMaintenanceAssets = async (req, res) => {
    try {
        let { type, companies, tabs, customers, rf_ids, applicationNumbers, filter_type, filter_date, filter_sub_type } = req.body;

        const replacements = {
            companies: '',
            organisationID: 0,
            tabs: '',
            customers: '',
            assignments: '',
            layoutID: type
        };

        replacements.layoutID = helpers.findLayout(type);

        if (companies && companies !== '') {
            replacements.companies = companies.join(',');
        }

        if (tabs && tabs !== '') {
            replacements.tabs = tabs.join(',');
        }

        if (customers && customers !== '') {
            replacements.customers = customers.join(',');
        }

        if (rf_ids && rf_ids !== '') {
            replacements.assignments = rf_ids.join(',');
        }

        connection.applicationNew.query("CALL `routine_life_span`(:layoutID, :companies, :organisationID, :tabs, :customers, :assignments);", {
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            logging: console.log,
            replacements: replacements,
        }).spread(result => {
            if (result) {
                (async () => {
                    const getAssetList = Object.values(result);
                    let assetsLifeSpan = [];

                    if (getAssetList.length > 0) {
                        const promises = getAssetList.map(async item => item);
                        await Promise.all(promises);

                        let abandonedList = [];
                        const filterPromises = getAssetList.map(async item => {
                            const where = {
                                appno_doc_num: item.application,
                                event_code: ['M1553', 'M2553', 'M3553', 'EXP.']
                            };

                            const getData = await MaintainenceFees.findAll({
                                attributes: ['appno_doc_num', [connection.Sequelize.fn('date_format', connection.Sequelize.col('event_date'), '%Y'), 'year'], 'event_code'],
                                where: where,
                                group: ['appno_doc_num', 'event_code']
                            });

                            getData.map(item => {
                                abandonedList.push({
                                    year: parseInt(item.get('year'))
                                });
                            });
                            return getData;
                        });

                        await Promise.all(filterPromises);

                        if (abandonedList.length > 0) {
                            const { max, min } = await helpers.minMax2DArray(abandonedList, 'year');
                            assetsLifeSpan = { max, min, data: abandonedList };
                        }
                    }
                    res.status(200).json(assetsLifeSpan);
                })();
            } else {
                res.status(200).json([]);
            }
        });
    } catch (err) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
};

/**
 * POST /events/abandoned/yearly/assets
 * Get abandoned yearly assets
 */
const getAbandonedYearlyAssets = async (req, res) => {
    try {
        let { type, companies, tabs, customers, rf_ids, applicationNumbers, filter_type, filter_date, filter_sub_type } = req.body;

        const replacements = {
            companies: '',
            organisationID: 0,
            tabs: '',
            customers: '',
            assignments: '',
            layoutID: type
        };

        replacements.layoutID = helpers.findLayout(type);

        if (companies && companies !== '') {
            replacements.companies = companies.join(',');
        }

        if (tabs && tabs !== '') {
            replacements.tabs = tabs.join(',');
        }

        if (customers && customers !== '') {
            replacements.customers = customers.join(',');
        }

        if (rf_ids && rf_ids !== '') {
            replacements.assignments = rf_ids.join(',');
        }

        connection.applicationNew.query("CALL `routine_life_span`(:layoutID, :companies, :organisationID, :tabs, :customers, :assignments);", {
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            logging: console.log,
            replacements: replacements,
        }).spread(result => {
            if (result) {
                (async () => {
                    const getAssetList = Object.values(result);
                    let assetsLifeSpan = [];

                    if (getAssetList.length > 0) {
                        let where = {
                            appno_doc_num: { [connection.Op.in]: getAssetList.map(item => item.application) }
                        };
                        where.layoutID = helpers.findLayout(type);

                        const getData = await MaintainenceFees.findAll({
                            attributes: ['appno_doc_num', [connection.Sequelize.fn('date_format', connection.Sequelize.col('event_date'), '%Y'), 'year'], 'event_code'],
                            where: where,
                            group: ['appno_doc_num', 'event_code']
                        });

                        if (getData.length > 0) {
                            assetsLifeSpan = getData;
                        }
                    }
                    res.status(200).json(assetsLifeSpan);
                })();
            } else {
                res.status(200).json([]);
            }
        });
    } catch (err) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
};

/**
 * POST /events/assets
 * Get events for assets
 */
const getEventsAssets = async (req, res) => {
    try {
        let { type, companies, tabs, customers, rf_ids, applicationNumbers, filter_type, filter_date, filter_sub_type } = req.body;

        const replacements = {
            companies: '',
            organisationID: 0,
            tabs: '',
            customers: '',
            assignments: '',
            layoutID: type
        };

        if (companies && companies !== '') {
            replacements.companies = companies.join(',');
        }

        if (tabs && tabs !== '') {
            replacements.tabs = tabs.join(',');
        }

        if (customers && customers !== '') {
            replacements.customers = customers.join(',');
        }

        if (rf_ids && rf_ids !== '') {
            replacements.assignments = rf_ids.join(',');
        }

        connection.applicationNew.query("CALL `routine_life_span`(:layoutID, :companies, :organisationID, :tabs, :customers, :assignments);", {
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            logging: console.log,
            replacements: replacements,
        }).spread(result => {
            if (result) {
                (async () => {
                    const getAssetList = Object.values(result);
                    let assetsLifeSpan = [];

                    if (getAssetList.length > 0) {
                        const timelineSpan = [];
                        const applicationNumberAdded = [];
                        const dateAdded = [];

                        const promises = getAssetList.map(async item => {
                            if (!applicationNumberAdded.includes(item.application)) {
                                const startYear = moment(new Date(item.appno_date)).format(ASSETS_LIFE_SPAN_DATE_FORMAT);
                                let endYear = moment(new Date(item.appno_date)).add(20, 'years').format(ASSETS_LIFE_SPAN_DATE_FORMAT);

                                for (let i = parseInt(startYear); i <= parseInt(endYear); i++) {
                                    timelineSpan.push({ year: i, count: 1, application: item.application });
                                }

                                applicationNumberAdded.push(item.application);
                                dateAdded.push(item.appno_date);
                            }
                            return item;
                        });

                        await Promise.all(promises);
                        assetsLifeSpan = await helpers.findMaxMinLifeSpan(timelineSpan);
                    }
                    res.status(200).json(assetsLifeSpan);
                })();
            } else {
                res.status(200).json([]);
            }
        });
    } catch (err) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
};

/**
 * GET /events/tabs
 * Get events tabs
 */
const getEventsTabs = async (req, res) => {
    try {
        let { type, companies, tabs, customers, rf_ids } = req.query;

        const replacements = {
            companies: '',
            organisationID: 0,
            tabs: '',
            customers: '',
            assignments: '',
            layoutID: type
        };

        replacements.layoutID = helpers.findLayout(type);

        if (companies && companies !== '') {
            companies = JSON.parse(companies);
            replacements.companies = companies.join(',');
        }

        if (tabs && tabs !== '') {
            tabs = JSON.parse(tabs);
            replacements.tabs = tabs.join(',');
        }

        if (customers && customers !== '') {
            customers = JSON.parse(customers);
            replacements.customers = customers.join(',');
        }

        if (rf_ids && rf_ids !== '') {
            rf_ids = JSON.parse(rf_ids);
            replacements.rf_ids = rf_ids.join(',');
        }

        connection.applicationNew.query("CALL `routine_life_span`(:layoutID, :companies, :organisationID, :tabs, :customers, :assignments);", {
            type: connection.Sequelize.QueryTypes.SELECT,
            raw: true,
            logging: console.log,
            replacements: replacements,
        }).spread(result => {
            if (result) {
                (async () => {
                    const getAssetList = Object.values(result);
                    let assetsLifeSpan = [];

                    if (getAssetList.length > 0) {
                        const timelineSpan = [];
                        const applicationNumberAdded = [];
                        const dateAdded = [];

                        const promises = getAssetList.map(async item => {
                            if (!applicationNumberAdded.includes(item.application)) {
                                const startYear = moment(new Date(item.appno_date)).format(ASSETS_LIFE_SPAN_DATE_FORMAT);
                                let endYear = moment(new Date(item.appno_date)).add(20, 'years').format(ASSETS_LIFE_SPAN_DATE_FORMAT);

                                for (let i = parseInt(startYear); i <= parseInt(endYear); i++) {
                                    timelineSpan.push({ year: i, count: 1, application: item.application });
                                }

                                applicationNumberAdded.push(item.application);
                                dateAdded.push(item.appno_date);
                            }
                            return item;
                        });

                        await Promise.all(promises);
                        assetsLifeSpan = await helpers.findMaxMin(timelineSpan);
                    }
                    res.status(200).json(assetsLifeSpan);
                })();
            } else {
                res.status(200).json([]);
            }
        });
    } catch (err) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
};

/**
 * GET /events/tabs/:tabID/companies/:companyID/customers/:customerID/transactions/:rfID/assets/:applicationNumber
 * Get events for specific asset
 */
const getEventsForAsset = async (req, res) => {
    try {
        const tabID = req.params.tabID;
        const representativeID = req.params.companyID;
        const customerID = req.params.customerID;
        const rfID = req.params.rfID;
        const applicationNumber = req.params.applicationNumber;

        if (applicationNumber !== undefined && applicationNumber !== null) {
            if (typeof req.connection_db !== "undefined" && req.connection_db !== null) {
                const findRepresentative = await helpers.findRepresentativeByID(req.connection_db, representativeID);

                if (findRepresentative !== null && findRepresentative.representative_id > 0) {
                    const findData = await MaintainenceFees.findAll({
                        attributes: ['grant_doc_num', 'appno_doc_num', [connection.Sequelize.fn('date_format', connection.Sequelize.col('event_date'), '%Y-%m-%d'), 'eventdate'], 'event_code'],
                        where: { appno_doc_num: applicationNumber },
                        group: ['eventdate', 'event_code'],
                        include: [
                            {
                                model: MaintainenceCode,
                                as: 'maintainence_code',
                                attributes: ['event_description']
                            }
                        ]
                    });
                    res.status(200).json(findData);
                } else {
                    res.status(402).send("Invalid application number.");
                }
            } else {
                res.status(402).send("Invalid application number.");
            }
        } else {
            res.status(402).send("Invalid application number.");
        }
    } catch (err) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
};

/**
 * Helper function to find event list
 * Used by multiple routes
 */
const findEventList = async (req, res) => {
    try {
        let { applicationNumber, patentNumber } = req.params;
        const { counter } = req.query;

        if (applicationNumber !== undefined && applicationNumber !== null) {
            let where = { appno_doc_num: applicationNumber };
            let assetData;
            const event_code = ['M1551', 'M2551', 'M3551', 'M1552', 'M2552', 'M3552', 'M1553', 'M2553', 'M3553'];
            const attributes = ['grant_doc_num', 'appno_doc_num', 'grant_date', [connection.Sequelize.fn('date_format', connection.Sequelize.col('event_date'), '%Y-%m-%d'), 'eventdate'], 'event_code', 'event_icon'];
            const group = ['eventdate', 'event_code'];
            const include = [
                {
                    model: MaintainenceCode,
                    as: 'maintainence_code',
                    attributes: ['event_code', 'event_description', 'template', 'template_string', 'icon1', 'icon2', 'icon3']
                }
            ];

            let findData = await MaintainenceFees.findAll({
                attributes: attributes,
                where: where,
                group: group,
                include: include
            });

            if (findData.length === 0) {
                const queryDoc = `SELECT appno_doc_num, MAX(grant_doc_num) AS grant_doc_num, MAX(grant_date) AS grant_date FROM db_uspto.documentid WHERE appno_doc_num = :appno_doc_num OR grant_doc_num = :grant_doc_num`;
                assetData = await connection.applicationNew.query(queryDoc, {
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    plain: true,
                    logging: console.log,
                    replacements: { appno_doc_num: applicationNumber, grant_doc_num: patentNumber }
                });

                if (assetData !== null && assetData.appno_doc_num !== '') {
                    where = { appno_doc_num: assetData.appno_doc_num };
                    findData = await MaintainenceFees.findAll({
                        attributes: attributes,
                        where: where,
                        group: group,
                        include: include
                    });
                }
            }

            let other = [];
            let icons = {};
            const expiredEvents = ['EXP.'];
            let expired = false;
            let eventExpiredDate = '';

            if (findData.length > 0) {
                const promise = findData.map(event => {
                    if (expired === false) {
                        if (expiredEvents.includes(event.maintainence_code.event_code)) {
                            expired = true;
                            eventExpiredDate = event.get('eventdate');
                        }
                    }

                    let eventCodeIcons = {};
                    if (event.maintainence_code.icon1 !== null) {
                        eventCodeIcons['icon1'] = SvgIconsContent[event.maintainence_code.icon1];
                    }
                    if (event.maintainence_code.icon2 !== null) {
                        eventCodeIcons['icon2'] = SvgIconsContent[event.maintainence_code.icon2];
                    }
                    if (event.maintainence_code.icon3 !== null) {
                        eventCodeIcons['icon3'] = SvgIconsContent[event.maintainence_code.icon3];
                    }
                    icons[event.event_code] = eventCodeIcons;
                    return event;
                });
                Promise.all(promise);
            } else {
                assetData = await Documentid.findOne({
                    attributes: ['appno_doc_num', 'grant_doc_num', 'grant_date'],
                    where: { [connection.Op.or]: [{ appno_doc_num: applicationNumber }, { grant_doc_num: patentNumber }] }
                });
            }

            let date = '0000-00-00';
            if (findData.length > 0) {
                date = findData[0].grant_date;
            } else if (assetData !== null) {
                date = assetData.grant_date;
            }

            if (date !== '' && date !== '0000-00-00') {
                const grantDate = date.indexOf('-') <= 0 ? `${date.substring(0, 4)}-${date.substring(4, 6)}-${date.substring(6, 8)} 00:00:00` : date + ' 00:00:00';
                let enter = true;
                const addEventsDates = [42, 90, 138];

                const eventPromise = addEventsDates.map(item => {
                    let currentDate = new Date(grantDate);
                    const eventDate = moment(currentDate.setMonth(currentDate.getMonth() + item));

                    if (enter === true) {
                        const nextDate = new Date(eventDate);
                        const startDate = eventDate.format('YYYY-MM-DD');
                        const endDate = moment(nextDate.setMonth(nextDate.getMonth() + 6)).format('YYYY-MM-DD');

                        let followingDay = new Date(endDate + ' 00:00:00');
                        const redStartDate = moment(new Date(followingDay.setTime(followingDay.getTime() + 86400000))).format('YYYY-MM-DD');
                        const redEndDate = moment(new Date(redStartDate).setMonth(new Date(redStartDate).getMonth() + 6)).format('YYYY-MM-DD');

                        other.push({
                            grant_doc_num: findData.length > 0 ? findData[0].grant_doc_num : assetData.grant_doc_num,
                            appno_doc_num: findData.length > 0 ? findData[0].appno_doc_num : assetData.appno_doc_num,
                            start: startDate,
                            end: endDate,
                            event_code: '',
                            event_desc: '',
                            type: 'yellow'
                        });
                        other.push({
                            grant_doc_num: findData.length > 0 ? findData[0].grant_doc_num : assetData.grant_doc_num,
                            appno_doc_num: findData.length > 0 ? findData[0].appno_doc_num : assetData.appno_doc_num,
                            start: endDate,
                            end: redEndDate,
                            event_code: '',
                            event_desc: '',
                            type: 'red'
                        });
                    }
                    return item;
                });

                await Promise.all(eventPromise);
            }

            if (typeof counter !== 'undefined') {
                res.status(200).send(`${findData.length}`);
            } else {
                res.status(200).json({ main: findData, other, icons });
            }
        } else {
            res.status(402).send("Invalid application number.");
        }
    } catch (err) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
};

/**
 * GET /events/:applicationNumber
 * Get events by application number
 */
const getEventsByApplicationNumber = async (req, res) => {
    return findEventList(req, res);
};

/**
 * GET /events/:applicationNumber/:patentNumber
 * Get events by application number and patent number
 */
const getEventsByApplicationAndPatent = async (req, res) => {
    return findEventList(req, res);
};

/**
 * GET /events/assets/transactions/:rfID
 * Get events for asset transactions
 */
const getEventsAssetTransactions = async (req, res) => {
    try {
        const { rfID } = req.params;
        let assetsLifeSpan = [];

        if (typeof req.connection_db !== "undefined" && req.connection_db !== null) {
            assetsLifeSpan = await helpers.findAssetsTimeSpan(null, 0, 0, rfID, req.orgId);
        }

        res.status(200).json(assetsLifeSpan);
    } catch (err) {
        console.log(err);
        res.status(500).send("Internal server error.");
    }
};

// Export controller functions
module.exports = {
    getEventsByTab,
    getEventsByTabAndCompany,
    getEventsByTabCompanyCustomer,
    getEventsByTransaction,
    getAbandonedMaintenanceAssets,
    getAbandonedYearlyAssets,
    getEventsAssets,
    getEventsTabs,
    getEventsForAsset,
    findEventList,
    getEventsByApplicationNumber,
    getEventsByApplicationAndPatent,
    getEventsAssetTransactions,

    /**
     * GET /events/all/assets/:category_type
     * Get all assets by category type (to_record, surcharge, abandoned)
     */
    getAllAssetsByCategoryType: async (req, res) => {
        try {
            let { companies, customers } = req.query;
            let findData = [];
            let other = [];
            let icons = {};

            const { category_type } = req.params;

            if (companies !== '') {
                companies = JSON.parse(companies);
            }

            if (typeof customers !== 'undefined' && customers !== '') {
                customers = JSON.parse(customers);
            }

            if (companies.length > 0) {
                const replacements = { organisationID: 0, companies };
                if (req.orgType === 2) {
                    replacements.mode = 1;
                }

                if (category_type === 'to_record') {
                    replacements.type = 22;
                    let queryToRecord = `SELECT application, patent, '' AS eventdate, '13' AS event_code, '' AS event_icon, IF(patent <> '' , FORMAT(patent, 0), CONCAT(SUBSTRING(application, 1, 2), '/', FORMAT(SUBSTRING(application, 3), 0))) AS template_string FROM dashboard_items WHERE organisation_id = :organisationID AND representative_id IN (:companies) ${req.orgType === 2 ? ' AND mode IN (:mode) ' : ''} AND type = :type `;

                    if (Array.isArray(customers) && customers.length > 0) {
                        replacements.customers = customers;
                        queryToRecord += ` AND `;

                        if (customers.length === 2) {
                            queryToRecord += ` ( `;
                        }

                        queryToRecord += ` application IN (
                            SELECT documentid.appno_doc_num FROM db_uspto.documentid 
                            WHERE rf_id IN ( 
                                SELECT activity_parties_transactions.rf_id FROM db_new_application.activity_parties_transactions 
                                WHERE activity_parties_transactions.organisation_id = :organisationID 
                                AND activity_parties_transactions.company_id IN (:companies)  
                                AND activity_parties_transactions.assignor_and_assignee_id IN (:customers) 
                                GROUP BY activity_parties_transactions.rf_id
                            ) 
                            GROUP BY documentid.appno_doc_num
                        ) `;

                        if (customers.length === 2) {
                            const allCustomers = replacements.customers;
                            replacements.customers = allCustomers[0];
                            replacements.inventor = allCustomers[1];
                            queryToRecord += ` OR application IN ( SELECT appno_doc_num COLLATE utf8mb4_0900_ai_ci FROM (
                                Select appno_doc_num, assignor_and_assignee_id from db_patent_application_bibliographic.inventor
                                where appno_doc_num COLLATE utf8mb4_0900_ai_ci IN (
                                    select application FROM db_new_application.dashboard_items 
                                    WHERE organisation_id = :organisationID AND type = :type  
                                    AND representative_id IN (:companies) ${req.orgType === 2 ? ' AND mode IN (:mode) ' : ''} 
                                )
                                UNION 
                                Select appno_doc_num, assignor_and_assignee_id from db_patent_grant_bibliographic.inventor_new
                                where appno_doc_num COLLATE utf8mb4_0900_ai_ci IN (
                                    select application FROM db_new_application.dashboard_items 
                                    WHERE organisation_id = :organisationID AND type = :type  
                                    AND representative_id IN (:companies) ${req.orgType === 2 ? ' AND mode IN (:mode) ' : ''} 
                                )) AS tempInventor
                                where assignor_and_assignee_id IN (:inventor))) `;
                        }
                    }

                    queryToRecord += ` GROUP BY application`;
                    findData = await connection.applicationNew.query(queryToRecord, {
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        logging: console.log,
                        replacements
                    });

                    if (findData !== null && findData.length > 0) {
                        const assets = [];
                        const promise = findData.map(item => {
                            assets.push(`${item.application}`);
                        });
                        await Promise.all(promise);

                        const query = `SELECT appno_doc_num, date_format(appno_date, '%Y-%m-%d') AS eventdate FROM db_patent_grant_bibliographic.application_publication
                            WHERE appno_doc_num IN (:applications)
                            GROUP BY appno_doc_num UNION SELECT appno_doc_num, date_format(appno_date, '%Y-%m-%d') AS eventdate FROM db_patent_application_bibliographic.application_grant
                            WHERE appno_doc_num IN (:applications)
                            GROUP BY appno_doc_num`;

                        const list = await connection.applicationNew.query(query, {
                            type: connection.Sequelize.QueryTypes.SELECT,
                            raw: true,
                            logging: console.log,
                            replacements: { applications: assets },
                        });

                        if (findData.length > 0 && list.length) {
                            const updatePromise = findData.map((item, index) => {
                                const findIndex = list.findIndex(row => row.appno_doc_num === item.application);
                                if (findIndex !== -1) {
                                    findData[index].eventdate = list[findIndex].eventdate;
                                }
                            });
                            await Promise.all(updatePromise);

                            let eventCodeIcons = {
                                icon1: SvgIconsContent['13'],
                                icon2: SvgIconsContent['13'],
                                icon3: SvgIconsContent['13']
                            };
                            icons['13'] = eventCodeIcons;
                        }
                    }
                } else if (category_type === 'surcharge') {
                    replacements.type = 23;
                    let queryLateMaintainence = `SELECT application FROM dashboard_items WHERE organisation_id = :organisationID AND representative_id IN (:companies) AND type = :type ${req.orgType === 2 ? ' AND mode IN (:mode) ' : ''} `;

                    if (Array.isArray(customers) && customers.length > 0) {
                        replacements.customers = customers;
                        queryLateMaintainence += ` AND `;

                        if (customers.length === 2) {
                            queryLateMaintainence += ` ( `;
                        }

                        queryLateMaintainence += ` application IN (
                            SELECT documentid.appno_doc_num FROM db_uspto.documentid 
                            WHERE rf_id IN ( 
                                SELECT activity_parties_transactions.rf_id FROM db_new_application.activity_parties_transactions 
                                WHERE activity_parties_transactions.organisation_id = :organisationID 
                                AND activity_parties_transactions.company_id IN (:companies)  
                                AND activity_parties_transactions.assignor_and_assignee_id IN (:customers) 
                                GROUP BY activity_parties_transactions.rf_id
                            ) 
                            GROUP BY documentid.appno_doc_num
                        ) `;

                        if (customers.length === 2) {
                            const allCustomers = replacements.customers;
                            replacements.customers = allCustomers[0];
                            replacements.inventor = allCustomers[1];
                            queryLateMaintainence += ` OR application IN ( SELECT appno_doc_num COLLATE utf8mb4_0900_ai_ci FROM (
                                Select appno_doc_num, assignor_and_assignee_id from db_patent_application_bibliographic.inventor
                                where appno_doc_num COLLATE utf8mb4_0900_ai_ci IN (
                                    select application FROM db_new_application.dashboard_items 
                                    WHERE organisation_id = :organisationID AND type = :type  
                                    AND representative_id IN (:companies) ${req.orgType === 2 ? ' AND mode IN (:mode) ' : ''} 
                                )
                                UNION 
                                Select appno_doc_num, assignor_and_assignee_id from db_patent_grant_bibliographic.inventor_new
                                where appno_doc_num COLLATE utf8mb4_0900_ai_ci IN (
                                    select application FROM db_new_application.dashboard_items 
                                    WHERE organisation_id = :organisationID AND type = :type  
                                    AND representative_id IN (:companies) ${req.orgType === 2 ? ' AND mode IN (:mode) ' : ''} 
                                )) AS tempInventor
                                where assignor_and_assignee_id IN (:inventor))) `;
                        }
                    }

                    queryLateMaintainence += ` GROUP BY application`;
                    const list = await connection.applicationNew.query(queryLateMaintainence, {
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        logging: console.log,
                        replacements
                    });

                    if (list !== null && list.length > 0) {
                        const assets = [];
                        const promise = list.map(item => {
                            assets.push(`${item.application}`);
                        });
                        await Promise.all(promise);

                        const event_code = ['F176', 'M1554', 'M1555', 'M1556', 'M1557', 'M1558', 'M176', 'M177', 'M178', 'M181', 'M182', 'M186', 'M187', 'M188', 'M2554', 'M2555', 'M2556', 'M2558', 'M277', 'M281', 'M282', 'M286', 'M3554', 'M3555', 'M3556', 'M3557', 'M3558'];
                        const attributes = ['grant_doc_num', 'appno_doc_num', 'grant_date', [connection.Sequelize.fn('date_format', connection.Sequelize.col('event_date'), '%Y-%m-%d'), 'eventdate'], 'event_code', 'event_icon'];
                        const include = [
                            {
                                model: MaintainenceCode,
                                as: 'maintainence_code',
                                attributes: ['event_code', 'event_description', 'template', 'template_string', 'icon1', 'icon2', 'icon3']
                            }
                        ];
                        let where = { appno_doc_num: assets, event_code };

                        findData = await MaintainenceFees.findAll({
                            attributes: attributes,
                            where: where,
                            include: include,
                            group: ['appno_doc_num', 'eventdate']
                        });

                        if (findData.length > 0) {
                            const iconPromise = findData.map(event => {
                                let eventCodeIcons = {};
                                if (event.maintainence_code.icon1 !== null) {
                                    eventCodeIcons['icon1'] = SvgIconsContent[event.maintainence_code.icon1];
                                }
                                if (event.maintainence_code.icon2 !== null) {
                                    eventCodeIcons['icon2'] = SvgIconsContent[event.maintainence_code.icon2];
                                }
                                if (event.maintainence_code.icon3 !== null) {
                                    eventCodeIcons['icon3'] = SvgIconsContent[event.maintainence_code.icon3];
                                }
                                icons[event.event_code] = eventCodeIcons;
                                return event;
                            });
                            Promise.all(iconPromise);
                        }
                    }
                } else if (category_type === 'abandoned') {
                    replacements.type = 36;
                    let queryAbandonedStatus = `SELECT application FROM dashboard_items WHERE organisation_id = :organisationID AND representative_id IN (:companies) AND type = :type ${req.orgType === 2 ? ' AND mode IN (:mode) ' : ''} `;

                    if (Array.isArray(customers) && customers.length > 0) {
                        replacements.customers = customers;
                        queryAbandonedStatus += ` AND `;

                        if (customers.length === 2) {
                            queryAbandonedStatus += ` ( `;
                        }

                        queryAbandonedStatus += ` application IN (
                            SELECT documentid.appno_doc_num FROM db_uspto.documentid 
                            WHERE rf_id IN ( 
                                SELECT activity_parties_transactions.rf_id FROM db_new_application.activity_parties_transactions 
                                WHERE activity_parties_transactions.organisation_id = :organisationID 
                                AND activity_parties_transactions.company_id IN (:companies)  
                                AND activity_parties_transactions.assignor_and_assignee_id IN (:customers) 
                                GROUP BY activity_parties_transactions.rf_id
                            ) 
                            GROUP BY documentid.appno_doc_num
                        ) `;

                        if (customers.length === 2) {
                            const allCustomers = replacements.customers;
                            replacements.customers = allCustomers[0];
                            replacements.inventor = allCustomers[1];
                            queryAbandonedStatus += ` OR application IN ( SELECT appno_doc_num COLLATE utf8mb4_0900_ai_ci FROM (
                                Select appno_doc_num, assignor_and_assignee_id from db_patent_application_bibliographic.inventor
                                where appno_doc_num COLLATE utf8mb4_0900_ai_ci IN (
                                    select application FROM db_new_application.dashboard_items 
                                    WHERE organisation_id = :organisationID AND type = :type  
                                    AND representative_id IN (:companies) ${req.orgType === 2 ? ' AND mode IN (:mode) ' : ''} 
                                )
                                UNION 
                                Select appno_doc_num, assignor_and_assignee_id from db_patent_grant_bibliographic.inventor_new
                                where appno_doc_num COLLATE utf8mb4_0900_ai_ci IN (
                                    select application FROM db_new_application.dashboard_items 
                                    WHERE organisation_id = :organisationID AND type = :type  
                                    AND representative_id IN (:companies) ${req.orgType === 2 ? ' AND mode IN (:mode) ' : ''} 
                                )) AS tempInventor
                                where assignor_and_assignee_id IN (:inventor))) `;
                        }
                    }

                    queryAbandonedStatus += ` GROUP BY application`;
                    const list = await connection.applicationNew.query(queryAbandonedStatus, {
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        logging: console.log,
                        replacements
                    });

                    if (list !== null && list.length > 0) {
                        const assets = [];
                        const promise = list.map(item => {
                            assets.push(`${item.application}`);
                        });
                        await Promise.all(promise);

                        const queryCode = `SELECT temp.*, doc.grant_doc_num, doc.grant_date, maintainence_code.*, CASE WHEN doc.grant_doc_num != '' THEN doc.grant_doc_num ELSE temp.appno_doc_num END AS template_string FROM (SELECT appno_doc_num, status, MAX(status_date) AS eventdate, MAX(status_date) AS eventExpiredDate , 'EXP.' AS event_code FROM db_uspto.application_status WHERE 
                            appno_doc_num IN (:assets) 
                            AND status IN ('Patent Expired Due to NonPayment of Maintenance Fees Under 37 CFR 1.362', 'Provisional Application Expired', 'Final Rejection Mailed', 'Expressly Abandoned  --  During Publication Process', 'Expressly Abandoned  --  During Examination', "Abandoned  --  After Examiner's Answer or Board of Appeals Decision", 'Abandoned  --  Failure to Pay Issue Fee', 'Abandoned  --  File-Wrapper-Continuation Parent Application', 'Abandoned  --  Failure to Respond to an Office Action', 'Abandoned  --  Incomplete (Filing Date Under Rule 53 (b) - PreExam)', 'Abandoned  --  Incomplete Application (Pre-examination)', 'Abandonment for Failure to Correct Drawings/Oath/NonPub Request') GROUP BY appno_doc_num) 
                            AS temp 
                            INNER JOIN db_uspto.documentid as doc ON doc.appno_doc_num = temp.appno_doc_num
                            LEFT OUTER JOIN db_patent_maintainence_fee.event_maintainence_code AS maintainence_code ON maintainence_code.event_code = temp.event_code 
                            GROUP BY appno_doc_num`;

                        try {
                            findData = await connection.resources.query(queryCode, {
                                type: connection.Sequelize.QueryTypes.SELECT,
                                raw: true,
                                logging: console.log,
                                replacements: { assets: assets }
                            });
                        } catch (err) {
                            console.log(err);
                        }

                        if (findData.length > 0) {
                            findData.forEach(event => {
                                const eventCodeIcons = {};
                                eventCodeIcons['icon1'] = SvgIconsContent[event.maintainence_code?.icon1 ?? event.icon1] || null;
                                eventCodeIcons['icon2'] = SvgIconsContent[event.maintainence_code?.icon2 ?? event.icon2] || null;
                                eventCodeIcons['icon3'] = SvgIconsContent[event.maintainence_code?.icon3 ?? event.icon3] || null;
                                icons[event.event_code] = eventCodeIcons;
                            });
                        }
                    }
                }
            }

            res.status(200).json({ main: findData, other, icons });
        } catch (err) {
            console.log(err);
            res.status(500).send("Internal server error.");
        }
    },

    /**
     * GET /events/all/assets/to_record/detail/:application
     * Get to_record detail for specific application
     */
    getToRecordDetail: async (req, res) => {
        let { application } = req.params;

        try {
            const agentQuery = `SELECT name FROM db_patent_application_bibliographic.lawfirm WHERE appno_doc_num = :application`;
            const agent = await connection.applicationNew.query(agentQuery, {
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: { application },
            });

            const applicantQuery = `SELECT original_name FROM db_patent_application_bibliographic.applicant WHERE appno_doc_num = :application UNION SELECT original_name FROM db_patent_grant_bibliographic.applicant WHERE appno_doc_num = :application`;
            const applicant = await connection.applicationNew.query(applicantQuery, {
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: { application },
            });

            const assigneeQuery = `SELECT original_name FROM db_patent_application_bibliographic.assignee WHERE appno_doc_num = :application UNION SELECT original_name FROM db_patent_grant_bibliographic.assignee WHERE appno_doc_num = :application`;
            const assignee = await connection.applicationNew.query(assigneeQuery, {
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: { application },
            });

            const inventorQuery = `SELECT name FROM db_patent_application_bibliographic.inventor WHERE appno_doc_num = :application UNION SELECT name FROM db_patent_grant_bibliographic.inventor WHERE appno_doc_num = :application`;
            const inventor = await connection.applicationNew.query(inventorQuery, {
                type: connection.Sequelize.QueryTypes.SELECT,
                raw: true,
                logging: console.log,
                replacements: { application },
            });

            res.status(200).json({ agent, applicant, assignee, inventor });
        } catch (err) {
            console.log(err);
            res.status(500).send("Internal server error.");
        }
    },

    /**
     * GET /events/assets/status/:applicationNumber
     * Get asset status by application number
     */
    getAssetsStatus: async (req, res) => {
        try {
            let { applicationNumber } = req.params;
            const { counter } = req.query;
            let getList = [];
            let deleteFromCounter = 0;

            if (applicationNumber !== undefined && applicationNumber !== null) {
                let queryDates = `SELECT ap.appno_date AS filling_date, ap.pgpub_date FROM db_patent_grant_bibliographic.application_publication AS ap WHERE ap.appno_doc_num = :applicationNumber`;

                let getDatesData = await connection.application.query(queryDates, {
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    plain: true,
                    logging: console.log,
                    replacements: { applicationNumber },
                });

                let queryGrantDate = `SELECT ag.appno_date AS filling_date, ag.grant_doc_num, ag.grant_date FROM db_patent_application_bibliographic.application_grant AS ag WHERE ag.appno_doc_num = :applicationNumber`;

                let getGrantDatesData = await connection.application.query(queryGrantDate, {
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    plain: true,
                    logging: console.log,
                    replacements: { applicationNumber },
                });

                let docDates = null;
                if (getGrantDatesData === null) {
                    queryDates = `SELECT MAX(appno_date) AS filling_date, MAX(pgpub_date) AS pgpub_date, MAX(grant_date) AS grant_date FROM db_uspto.documentid WHERE appno_doc_num = :applicationNumber`;
                    docDates = await connection.application.query(queryDates, {
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        plain: true,
                        logging: console.log,
                        replacements: { applicationNumber },
                    });
                }

                let dates = { filling_date: '', pgpub_date: '', grant_date: '' };
                if (getDatesData !== null) {
                    dates.filling_date = getDatesData.filling_date;
                    dates.pgpub_date = getDatesData.pgpub_date;
                } else {
                    if (docDates !== null && docDates.filling_date !== '' && docDates.filling_date !== null) {
                        dates.filling_date = docDates.filling_date;
                        dates.pgpub_date = docDates.pgpub_date;
                    } else if (getGrantDatesData !== null) {
                        dates.filling_date = getGrantDatesData.filling_date;
                    }
                }

                if (getGrantDatesData !== null) {
                    dates.grant_date = getGrantDatesData.grant_date;
                } else if (docDates !== null) {
                    dates.grant_date = docDates.grant_date;
                }

                const queryStatus = `SELECT id, status, status_date FROM db_uspto.application_status WHERE appno_doc_num = :applicationNumber AND status <> :status`;
                const getStatusData = await connection.application.query(queryStatus, {
                    type: connection.Sequelize.QueryTypes.SELECT,
                    raw: true,
                    logging: console.log,
                    replacements: { applicationNumber, status: 'Patented Case' },
                });

                if (getDatesData !== null || getGrantDatesData !== null || docDates !== null) {
                    if (dates.filling_date !== '' && dates.grant_date !== null && dates.grant_date !== '' && dates.grant_date !== '0000-00-00' && dates.filling_date !== null) {
                        deleteFromCounter++;
                        getList.push({
                            id: 'A',
                            start_date: dates.filling_date,
                            end_date: moment(new Date(dates.grant_date)).subtract(1, 'day').format('YYYY-MM-DD'),
                            eventdate: dates.filling_date,
                            type: 'background',
                            className: 'greenLight',
                            status: ''
                        });
                        getList.push({
                            id: 1,
                            start_date: dates.filling_date,
                            eventdate: dates.filling_date,
                            type: 1,
                            className: 'greenBorder',
                            status: 'Filed:'
                        });
                    } else if (dates.filling_date !== '' && dates.pgpub_date !== '' && dates.filling_date !== null && dates.pgpub_date !== null) {
                        let enddate = moment(new Date()).format('YYYY-MM-DD');
                        if (getStatusData.length > 0) {
                            let status = getStatusData[0].status;
                            if (status.toLowerCase().indexOf('abandoned') !== -1 || status.toLowerCase().indexOf('expired') !== -1) {
                                enddate = getStatusData[0].status_date;
                            }
                        }
                        deleteFromCounter++;
                        getList.push({
                            id: 'A',
                            start_date: dates.filling_date,
                            end_date: enddate,
                            eventdate: dates.filling_date,
                            type: 'background',
                            className: 'greenLight',
                            status: ''
                        });
                        getList.push({
                            id: 1,
                            start_date: dates.filling_date,
                            eventdate: dates.filling_date,
                            type: 1,
                            className: 'greenBorder',
                            status: 'Filed:'
                        });
                    }

                    if (dates.pgpub_date !== '' && dates.pgpub_date !== null && dates.pgpub_date !== '0000-00-00') {
                        getList.push({
                            id: 2,
                            start_date: dates.pgpub_date,
                            eventdate: dates.pgpub_date,
                            type: 1,
                            className: 'greenBorder',
                            status: 'Published:'
                        });
                    }

                    const queryExtensionDate = `SELECT extension FROM db_patent_application_bibliographic.grant_extension WHERE appno_doc_num = :applicationNumber`;
                    const getExtensionData = await connection.application.query(queryExtensionDate, {
                        type: connection.Sequelize.QueryTypes.SELECT,
                        raw: true,
                        plain: true,
                        logging: console.log,
                        replacements: { applicationNumber },
                    });

                    let grantDesign = false;
                    let grantDate = '';
                    if (getGrantDatesData !== null && getGrantDatesData.grant_doc_num.indexOf('D') !== -1) {
                        grantDesign = true;
                    }

                    let expiryYear = 20;
                    if (dates.filling_date !== '' && dates.grant_date !== null && dates.grant_date !== '' && dates.grant_date !== '0000-00-00' && dates.filling_date !== null) {
                        if (grantDesign === true) {
                            if (dates.grant_date < '2015-05-13') {
                                expiryYear = 14;
                            } else {
                                expiryYear = 15;
                            }
                        }

                        grantDate = moment(new Date(grantDesign === true ? dates.grant_date : dates.filling_date)).add(expiryYear, 'years').format('YYYY-MM-DD');
                        if (getExtensionData !== null && getExtensionData.extension > 0) {
                            grantDate = moment(new Date(grantDate)).add(getExtensionData.extension, 'days').format('YYYY-MM-DD');
                        }

                        deleteFromCounter++;
                        getList.push({
                            id: 'B',
                            start_date: dates.grant_date,
                            end_date: grantDate,
                            eventdate: dates.grant_date,
                            type: 'background',
                            className: 'green',
                            status: ''
                        });
                        getList.push({
                            id: 3,
                            start_date: dates.grant_date,
                            eventdate: dates.grant_date,
                            type: 1,
                            className: 'greenBorder',
                            status: 'Granted:'
                        });
                    }

                    if (getExtensionData !== null && getExtensionData.extension > 0 && dates.filling_date !== '' && dates.filling_date !== null && grantDesign === false) {
                        const endDate = moment(new Date(dates.filling_date)).add(expiryYear, 'years').format('YYYY-MM-DD');
                        const extenstionStartDate = moment(new Date(endDate)).add(1, 'days').format('YYYY-MM-DD');
                        const extensiontEndDate = moment(new Date(extenstionStartDate)).add(getExtensionData.extension, 'days').format('YYYY-MM-DD');

                        deleteFromCounter++;
                        getList.push({
                            id: 4,
                            start_date: extensiontEndDate,
                            eventdate: extensiontEndDate,
                            type: 1,
                            className: 'greenBorder',
                            status: `Term Adjustment: <br/>+${getExtensionData.extension} days`,
                            anotherStatus: `Expected Expiration:`,
                        });
                    } else {
                        if (dates.grant_date !== null && dates.grant_date !== '' && dates.grant_date !== '0000-00-00' && grantDesign === false) {
                            const endDate = moment(new Date(dates.filling_date)).add(expiryYear, 'years').format('YYYY-MM-DD');
                            deleteFromCounter++;
                            getList.push({
                                id: 4,
                                start_date: endDate,
                                eventdate: endDate,
                                type: 1,
                                className: 'greenBorder',
                                status: `Term Adjustment: <br/>0 days`,
                                anotherStatus: `Expected Expiration:`,
                            });
                        } else if (grantDesign === true) {
                            const endDate = moment(new Date(grantDate)).add(expiryYear, 'days').format('YYYY-MM-DD');
                            deleteFromCounter++;
                            getList.push({
                                id: 4,
                                start_date: endDate,
                                eventdate: endDate,
                                type: 1,
                                className: 'greenBorder',
                                status: `Expected Expiration: <br/>`,
                            });
                        }
                    }
                }

                if (getStatusData.length > 0) {
                    const statusPromise = getStatusData.map((item, index) => {
                        getList.push({
                            id: parseInt(`${item.id}${index}`),
                            start_date: item.status_date,
                            eventdate: item.status_date,
                            status: item.status,
                            type: 0
                        });
                    });
                    await Promise.all(statusPromise);
                }
            }

            if (typeof counter !== 'undefined') {
                res.status(200).send(`${getList.length - deleteFromCounter}`);
            } else {
                res.status(200).json({ main: getList, icons: { 0: SvgIconsContent[9], 1: SvgIconsContent[25] } });
            }
        } catch (err) {
            console.log(err);
            res.status(500).send("Internal server error.");
        }
    }
};
