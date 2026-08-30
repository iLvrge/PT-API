'use strict';

/**
 * Pulling readable content out of USPTO bulk XML.
 *
 * Four document generations are in play: the modern `us-patent-application` and
 * `us-patent-grant` schemas, and the older `patent-application-publication` and
 * `PATDOC` ones. Each names the same content differently, so every extractor
 * handles both shapes for its document type.
 *
 * Pure apart from the figure-batch lookup, which the service supplies.
 */

// fast-xml-parser 3.x exposes a `parse` function rather than the v4 class.
const { parse: parseXml } = require('fast-xml-parser');
const xmldoc = require('xmldoc');
const { decode } = require('html-entities');

const APPLICATION = 1;
const GRANT = 2;

/** Square-bracket entities break the strict parser used for claims. */
const stripBracketEntities = (content) =>
  content.replace(/&lsqb;/gi, '').replace(/&rsqb;/gi, '');

/** An abstract is either one paragraph or several; both arrive as `p` nodes. */
const paragraphText = (node, key) => {
  if (typeof node !== 'object' || node === null) return String(node || '');
  const value = node[key];
  if (value === undefined) return '';
  if (Array.isArray(value)) {
    return value.map((p) => decode(String(p['#text'] ?? p), { level: 'xml' })).join(' ');
  }
  return decode(String(value['#text'] ?? value), { level: 'xml' });
};

const abstractOf = (xml, type) => {
  if (type === APPLICATION) {
    if (xml['patent-application-publication']) {
      return paragraphText(xml['patent-application-publication']['subdoc-abstract'], 'paragraph');
    }
    if (xml['us-patent-application'] && xml['us-patent-application'].abstract) {
      return paragraphText(xml['us-patent-application'].abstract, 'p');
    }
    return '';
  }
  if (xml.PATDOC) {
    return paragraphText(xml.PATDOC['SDOAB'] || xml.PATDOC['subdoc-abstract'], 'paragraph');
  }
  if (xml['us-patent-grant'] && xml['us-patent-grant'].abstract) {
    return paragraphText(xml['us-patent-grant'].abstract, 'p');
  }
  return '';
};

/**
 * The description and claims are returned as markup rather than text, because
 * the client renders them. Claim tags are rewritten to plain divs and spans so
 * the markup is safe to drop into a page.
 */
const CLAIM_REWRITES = [
  [/<claim-text/gi, ' <div '],
  [/<\/claim-text>/gi, '</div>'],
  [/<claim-ref/gi, ' <span '],
  [/<\/claim-ref>/gi, '</span>'],
  [/<claims/gi, '<div '],
  [/<\/claims>/gi, '</div>'],
  [/<claim/gi, '<div class="claim"><div'],
  [/<\/claim>/gi, '</div></div>'],
];

const childrenNamed = (fileContent, names) => {
  const out = [];
  const document = new xmldoc.XmlDocument(stripBracketEntities(fileContent));
  document.eachChild((child) => {
    if (names.includes(child.name)) out.push(child.toString({ compressed: true }));
  });
  return out;
};

const specificationsOf = (fileContent) =>
  childrenNamed(fileContent, ['description', 'subdoc-description']).map((text) => ({ text }));

const claimsOf = (fileContent) =>
  childrenNamed(fileContent, ['claims', 'subdoc-claims']).map((markup) => ({
    text: CLAIM_REWRITES.reduce((value, [find, replace]) => value.replace(find, replace), markup),
  }));

/** The drawing files a document references, as .png rather than the source .TIF. */
const figureFilesOf = (xml, type) => {
  const collect = (drawings, imageKey) => {
    if (!drawings) return [];
    const figures = Array.isArray(drawings.figure) ? drawings.figure : [drawings.figure];
    return figures
      .filter(Boolean)
      .map((item) => item[imageKey] && item[imageKey]['@_file'])
      .filter(Boolean)
      .map((file) => String(file).replace(/\.TIF$/i, '.png'));
  };

  if (type === APPLICATION) {
    if (xml['patent-application-publication']) {
      return collect(xml['patent-application-publication']['subdoc-drawings'], 'image');
    }
    return collect(xml['us-patent-application'] && xml['us-patent-application'].drawings, 'img');
  }
  if (xml.PATDOC) return collect(xml.PATDOC['SDODR'], 'image');
  return collect(xml['us-patent-grant'] && xml['us-patent-grant'].drawings, 'img');
};

/**
 * @param {string} fileContent the trimmed XML
 * @param {'abstract'|'specifications'|'claims'|'figures'} contentType
 * @param {1|2} type application or grant
 */
const extract = (fileContent, contentType, type) => {
  if (contentType === 'specifications') return specificationsOf(fileContent);
  if (contentType === 'claims') return claimsOf(fileContent);

  const xml = parseXml(fileContent, { ignoreAttributes: false });
  if (contentType === 'abstract') return abstractOf(xml, type);
  if (contentType === 'figures') return figureFilesOf(xml, type);
  return '';
};

module.exports = {
  extract, abstractOf, specificationsOf, claimsOf, figureFilesOf,
  stripBracketEntities, APPLICATION, GRANT,
};
