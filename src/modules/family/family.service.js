'use strict';

/**
 * Patent families: the worldwide relatives of an asset, and the readable
 * content of the documents themselves.
 */

const xml2js = require('xml2js');
const ApiError = require('../../utils/api-error');
const logger = require('../../utils/logger');
const { runPhpScript } = require('../../utils/php-jobs');
const epo = require('./family.epo');
const parser = require('./family.parser');
const files = require('./family.files');
const documents = require('./family.documents');
const repository = require('./family.repository');

const { APPLICATION, GRANT } = files;

const parseXml = (xml) =>
  new Promise((resolve, reject) => {
    new xml2js.Parser().parseString(xml, (err, result) => (err ? reject(err) : resolve(result)));
  });

/**
 * Strip the country prefix and kind suffix people paste around asset numbers:
 * "US09775636B2" is application 09775636.
 *
 * The legacy version cut the first two characters unconditionally, so a number
 * sent without a country prefix came back mangled. Only a real two-letter
 * prefix is removed here.
 */
const bareNumber = (value) => {
  let asset = String(value).replace(/^[A-Za-z]{2}/, '');
  const kind = /[a-z]/i.exec(asset);
  if (kind && kind.index >= 0) asset = asset.slice(0, kind.index);
  return asset;
};

/** The EPO reference for an asset, always country-prefixed. */
const epoReference = (asset) => (String(asset).startsWith('US') ? String(asset) : `US${asset}`);

/**
 * Resolve whichever number the caller used to the record we hold, and say
 * whether the asset has granted.
 */
const resolveAsset = async (assetNumber) => {
  const asset = bareNumber(assetNumber);

  const document = await repository.findDocument(asset);
  if (document && document.grant_doc_num) {
    // Prefer the grant record, which carries the file name of the bulk XML.
    const grant = await repository.grantFor(document.appno_doc_num);
    if (grant) return { record: { ...document, ...grant }, type: GRANT, asset };
    const publication = await repository.publicationFor(document.appno_doc_num);
    return { record: { ...document, ...(publication || {}) }, type: APPLICATION, asset };
  }

  if (document) {
    const publication = await repository.publicationFor(document.appno_doc_num);
    return { record: { ...document, ...(publication || {}) }, type: APPLICATION, asset };
  }

  const publication = await repository.publicationFor(asset);
  if (publication) return { record: publication, type: APPLICATION, asset };

  const grant = await repository.grantFor(asset);
  if (grant) return { record: grant, type: GRANT, asset };

  return { record: null, type: APPLICATION, asset };
};

/* ------------------------------------------------------------------ family */

/**
 * Fetch the family document for a reference, preferring the on-disk cache.
 * A cached copy without legal events is refetched, since those are the point.
 */
const familyXmlFor = async ({ reference, referenceType }) => {
  const cached = await files.readCachedFamily(reference);
  if (cached && cached.includes('ops:legal')) return { xml: cached, fromCache: true };

  const xml = await epo.familyXml({ reference, referenceType });
  return { xml, fromCache: false };
};

/** GET /family/list/:grantNumber — the family of a granted patent. */
const familyForGrant = async (grantNumber) => {
  const reference = epoReference(grantNumber);
  const { xml, fromCache } = await familyXmlFor({ reference, referenceType: 'publication' });
  if (!xml) return [];

  const parsed = await parseXml(xml);
  if (!parsed || !parsed['ops:world-patent-data']) return [];
  if (!fromCache) await files.writeCachedFamily(reference, xml);

  return parser.parseFamily(parsed, { asset: bareNumber(grantNumber) });
};

/** GET /family/:applicationNumber — the family of any asset. */
const familyForApplication = async (applicationNumber) => {
  const { record, asset } = await resolveAsset(applicationNumber);
  const hasGrant = !!(record && record.grant_doc_num);
  const number = hasGrant ? record.grant_doc_num : asset;
  const reference = epoReference(number);

  const { xml, fromCache } = await familyXmlFor({
    reference, referenceType: hasGrant ? 'publication' : 'application',
  });
  if (!xml) return [];

  const parsed = await parseXml(xml);
  if (!parsed || !parsed['ops:world-patent-data']) return [];
  if (!fromCache) await files.writeCachedFamily(reference, xml);

  // Persisting the family to our own tables is a background job; a failure
  // there must not lose the response.
  runPhpScript('assets_family_single.js', [asset]).catch((err) =>
    logger.warn('family persist job failed', { asset, error: err.message }));

  return parser.parseFamily(parsed, {
    asset: number,
    useApplicationReference: !hasGrant,
    title: record ? record.title || '' : '',
  });
};

/* ---------------------------------------------------------------- content */

/**
 * Read one kind of content out of an asset's bulk XML.
 * @param {'abstract'|'specifications'|'claims'|'figures'} contentType
 */
const contentFor = async ({ assetNumber, contentType }) => {
  const { record, type, asset } = await resolveAsset(assetNumber);
  if (!record) throw ApiError.notFound('No document for that asset');

  // The publication number names the bulk file; fall back to the asset itself.
  const docNumber = record.pgpub_doc_num || record.grant_doc_num || asset;
  const filePath = await files.findXmlFile(docNumber, type);
  if (!filePath) return contentType === 'abstract' ? '' : [];

  const fileContent = await files.readDocument(filePath, type);
  if (!fileContent) return contentType === 'abstract' ? '' : [];

  const extracted = documents.extract(fileContent, contentType, type);

  if (contentType !== 'figures' || !extracted.length) return extracted;

  // Drawings are stored per delivery batch, so each file needs its batch name
  // to build a URL.
  const batches = await repository.figureBatches(extracted);
  const batchByFile = new Map(batches.map((row) => [row.file_name, row.batch_name]));
  return extracted.map((file) => ({ file, batch: batchByFile.get(file) || null }));
};

const abstract = (assetNumber) => contentFor({ assetNumber, contentType: 'abstract' });
const claims = (assetNumber) => contentFor({ assetNumber, contentType: 'claims' });
const specifications = (assetNumber) => contentFor({ assetNumber, contentType: 'specifications' });
const images = (assetNumber) => contentFor({ assetNumber, contentType: 'figures' });

/** GET /family/single/:applicationNumber — everything about one asset. */
const single = async (assetNumber) => {
  const [family, abstractText, claimList, specificationList, figureList] = await Promise.all([
    familyForApplication(assetNumber).catch(() => []),
    abstract(assetNumber).catch(() => ''),
    claims(assetNumber).catch(() => []),
    specifications(assetNumber).catch(() => []),
    images(assetNumber).catch(() => []),
  ]);
  return {
    family,
    abstracts: abstractText,
    claims: claimList,
    specification: specificationList,
    images: figureList,
  };
};

module.exports = {
  familyForGrant,
  familyForApplication,
  abstract,
  claims,
  specifications,
  images,
  single,
  resolveAsset,
  bareNumber,
  epoReference,
  contentFor,
};
