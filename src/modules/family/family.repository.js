'use strict';

const { connections } = require('../../db');
const q = require('../../db/query');

/**
 * The best record we hold for an asset, whichever number the caller used.
 * grant_date descending so the most recent grant wins.
 */
const findDocument = (assetNumber) =>
  q.selectOne(
    connections.application,
    `SELECT rf_id, MAX(grant_doc_num) AS grant_doc_num, MAX(appno_doc_num) AS appno_doc_num,
            MAX(appno_date) AS appno_date, title, MAX(grant_date) AS grant_date,
            MAX(pgpub_doc_num) AS pgpub_doc_num
       FROM documentid
      WHERE appno_doc_num = :assetNumber OR grant_doc_num = :assetNumber
      GROUP BY grant_doc_num, appno_doc_num, pgpub_doc_num
      ORDER BY grant_date DESC LIMIT 1`,
    { assetNumber }
  );

/** The published application record, when the asset has not granted. */
const publicationFor = (applicationNumber) =>
  q.selectOne(
    connections.resources,
    `SELECT pgpub_doc_num, appno_doc_num, file_name, appno_date, pgpub_date, '' AS title
       FROM db_patent_grant_bibliographic.application_publication
      WHERE appno_doc_num = :applicationNumber LIMIT 1`,
    { applicationNumber }
  );

/** The grant record, when the asset has granted. */
const grantFor = (applicationNumber) =>
  q.selectOne(
    connections.resources,
    `SELECT grant_doc_num, grant_doc_num AS pgpub_doc_num, appno_doc_num, file_name,
            appno_date, grant_date, '' AS title
       FROM db_patent_application_bibliographic.application_grant
      WHERE appno_doc_num = :applicationNumber LIMIT 1`,
    { applicationNumber }
  );

/** Which bulk batch each drawing file was delivered in. */
const figureBatches = (fileNames) =>
  q.selectAll(
    connections.resources,
    `SELECT file_name, batch_name FROM db_uspto.figure_batches WHERE file_name IN (:fileNames)`,
    { fileNames }
  );

module.exports = { findDocument, publicationFor, grantFor, figureBatches };
