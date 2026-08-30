'use strict';

jest.mock('../../src/modules/users/users.repository');
jest.mock('../../src/db/tenant-connections');
jest.mock('../../src/modules/family/family.repository');
jest.mock('../../src/modules/family/family.epo');
jest.mock('../../src/modules/family/family.files');
jest.mock('../../src/utils/php-jobs');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const usersRepo = require('../../src/modules/users/users.repository');
const repo = require('../../src/modules/family/family.repository');
const epo = require('../../src/modules/family/family.epo');
const files = require('../../src/modules/family/family.files');
const phpJobs = require('../../src/utils/php-jobs');
const { startTestServer } = require('../helpers/server');
const { env } = require('../../src/config/env');

const app = startTestServer();
const token = jwt.sign({ id: 5, orgId: 118 }, env.auth.secret);
const auth = (req) => req.set('Authorization', `Bearer ${token}`);

const FAMILY_XML = `<?xml version="1.0"?>
<ops:world-patent-data xmlns:ops="http://ops.epo.org">
  <ops:patent-family>
    <ops:family-member family-id="44">
      <publication-reference>
        <document-id document-id-type="docdb">
          <country>US</country><doc-number>9446259</doc-number><kind>B2</kind><date>20160920</date>
        </document-id>
      </publication-reference>
      <application-reference>
        <document-id>
          <country>US</country><doc-number>13456789</doc-number><kind>A</kind><date>20130101</date>
        </document-id>
      </application-reference>
      <ops:legal code="PG25" desc="LAPSED">
        <ops:L001EP>US</ops:L001EP><ops:L002EP>B1</ops:L002EP><ops:L003EP>9446259</ops:L003EP>
        <ops:L004EP>B2</ops:L004EP><ops:L005EP>PATENT</ops:L005EP><ops:L007EP>20200101</ops:L007EP>
        <ops:L008EP>PG25</ops:L008EP><ops:L018EP>20200201</ops:L018EP><ops:L019EP>20200102</ops:L019EP>
      </ops:legal>
    </ops:family-member>
  </ops:patent-family>
</ops:world-patent-data>`;

beforeEach(() => {
  jest.clearAllMocks();
  usersRepo.findActiveById.mockResolvedValue({ user_id: 5, organisation_id: 118, type: 0 });
  files.readCachedFamily.mockResolvedValue(null);
  files.writeCachedFamily.mockResolvedValue(undefined);
  phpJobs.runPhpScript.mockResolvedValue(undefined);
});

describe('GET /family/list/:grantNumber', () => {
  it('401s without a token', async () => {
    await request(app).get('/family/list/9446259').expect(401);
  });

  it('returns the family with its legal events', async () => {
    epo.familyXml.mockResolvedValue(FAMILY_XML);
    const res = await auth(request(app).get('/family/list/9446259')).expect(200);

    expect(epo.familyXml).toHaveBeenCalledWith({ reference: 'US9446259', referenceType: 'publication' });
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ family_id: '44', patent_number: '9446259' });
    expect(res.body[0].legal[0].code).toBe('PG25');
  });

  it('caches what it fetched', async () => {
    epo.familyXml.mockResolvedValue(FAMILY_XML);
    await auth(request(app).get('/family/list/9446259')).expect(200);
    expect(files.writeCachedFamily).toHaveBeenCalledWith('US9446259', FAMILY_XML);
  });

  it('serves a cached document without calling the EPO', async () => {
    files.readCachedFamily.mockResolvedValue(FAMILY_XML);
    await auth(request(app).get('/family/list/9446259')).expect(200);
    expect(epo.familyXml).not.toHaveBeenCalled();
    expect(files.writeCachedFamily).not.toHaveBeenCalled();
  });

  it('refetches a cached document that has no legal events', async () => {
    files.readCachedFamily.mockResolvedValue('<ops:world-patent-data></ops:world-patent-data>');
    epo.familyXml.mockResolvedValue(FAMILY_XML);
    await auth(request(app).get('/family/list/9446259')).expect(200);
    expect(epo.familyXml).toHaveBeenCalled();
  });

  it('returns an empty list when the EPO has no record', async () => {
    epo.familyXml.mockResolvedValue('');
    const res = await auth(request(app).get('/family/list/9446259')).expect(200);
    expect(res.body).toEqual([]);
  });

  it('returns just the count when asked', async () => {
    epo.familyXml.mockResolvedValue(FAMILY_XML);
    const res = await auth(request(app).get('/family/list/9446259?counter=1')).expect(200);
    expect(res.text).toBe('1');
  });

  it('400s on a number with punctuation in it', async () => {
    await auth(request(app).get('/family/list/94,462.59')).expect(400);
  });
});

describe('GET /family/:applicationNumber', () => {
  it('asks the EPO for the grant when the asset has one', async () => {
    repo.findDocument.mockResolvedValue({
      appno_doc_num: '13456789', grant_doc_num: '9446259', title: 'A Widget',
    });
    repo.grantFor.mockResolvedValue({ grant_doc_num: '9446259', file_name: 'x.xml' });
    epo.familyXml.mockResolvedValue(FAMILY_XML);

    const res = await auth(request(app).get('/family/US9446259')).expect(200);
    expect(epo.familyXml).toHaveBeenCalledWith({
      reference: 'US9446259', referenceType: 'publication',
    });
    expect(res.body[0].title).toBe('A Widget');
  });

  it('asks for the application when nothing has granted', async () => {
    repo.findDocument.mockResolvedValue(null);
    repo.publicationFor.mockResolvedValue({ appno_doc_num: '13456789', pgpub_doc_num: '20140001' });
    epo.familyXml.mockResolvedValue(FAMILY_XML);

    await auth(request(app).get('/family/US13456789')).expect(200);
    expect(epo.familyXml).toHaveBeenCalledWith({
      reference: 'US13456789', referenceType: 'application',
    });
  });

  it('still answers when the background persist job fails', async () => {
    repo.findDocument.mockResolvedValue({ appno_doc_num: '13456789', grant_doc_num: '9446259' });
    repo.grantFor.mockResolvedValue({ grant_doc_num: '9446259' });
    epo.familyXml.mockResolvedValue(FAMILY_XML);
    phpJobs.runPhpScript.mockRejectedValue(new Error('script missing'));

    const res = await auth(request(app).get('/family/US9446259')).expect(200);
    expect(res.body).toHaveLength(1);
  });

  it('does not swallow the literal /family paths', async () => {
    repo.findDocument.mockResolvedValue(null);
    repo.publicationFor.mockResolvedValue(null);
    repo.grantFor.mockResolvedValue(null);

    await auth(request(app).get('/family/abstract/9446259')).expect(404);
    expect(epo.familyXml).not.toHaveBeenCalled();
  });
});

describe('document content', () => {
  beforeEach(() => {
    repo.findDocument.mockResolvedValue({
      appno_doc_num: '13456789', grant_doc_num: '', pgpub_doc_num: '20140001',
    });
    repo.publicationFor.mockResolvedValue({
      appno_doc_num: '13456789', pgpub_doc_num: '20140001', file_name: 'x.xml',
    });
  });

  it('404s when we hold no record of the asset', async () => {
    repo.findDocument.mockResolvedValue(null);
    repo.publicationFor.mockResolvedValue(null);
    repo.grantFor.mockResolvedValue(null);
    await auth(request(app).get('/family/abstract/9446259')).expect(404);
  });

  it('returns an empty abstract when the bulk XML is not on disk', async () => {
    files.findXmlFile.mockResolvedValue(null);
    const res = await auth(request(app).get('/family/abstract/9446259')).expect(200);
    expect(res.body).toEqual({ abstract: '' });
  });

  it('reads the abstract out of the bulk XML', async () => {
    files.findXmlFile.mockResolvedValue('/disk/XML/x.xml');
    files.readDocument.mockResolvedValue(
      '<us-patent-application><abstract><p>A widget.</p></abstract></us-patent-application>'
    );
    const res = await auth(request(app).get('/family/abstract/9446259')).expect(200);
    expect(res.body.abstract).toBe('A widget.');
  });

  it('attaches the delivery batch to each drawing', async () => {
    files.findXmlFile.mockResolvedValue('/disk/XML/x.xml');
    files.readDocument.mockResolvedValue(
      '<us-patent-application><drawings><figure><img file="D00001.TIF"/></figure></drawings></us-patent-application>'
    );
    repo.figureBatches.mockResolvedValue([{ file_name: 'D00001.png', batch_name: 'batch-7' }]);

    const res = await auth(request(app).get('/family/images/9446259')).expect(200);
    expect(res.body).toEqual([{ file: 'D00001.png', batch: 'batch-7' }]);
  });

  it('returns claims as renderable markup', async () => {
    files.findXmlFile.mockResolvedValue('/disk/XML/x.xml');
    files.readDocument.mockResolvedValue(
      '<us-patent-application><claims><claim><claim-text>1. A widget.</claim-text></claim></claims></us-patent-application>'
    );
    const res = await auth(request(app).get('/family/claims/9446259')).expect(200);
    expect(res.body[0].text).toContain('class="claim"');
  });
});

describe('GET /family/single/:applicationNumber', () => {
  it('gathers every part, and degrades each one on its own', async () => {
    repo.findDocument.mockResolvedValue({
      appno_doc_num: '13456789', grant_doc_num: '9446259', title: 'A Widget',
    });
    repo.grantFor.mockResolvedValue({ grant_doc_num: '9446259' });
    epo.familyXml.mockResolvedValue(FAMILY_XML);
    // No bulk XML on disk: the content parts come back empty, the family does not.
    files.findXmlFile.mockResolvedValue(null);

    const res = await auth(request(app).get('/family/single/9446259')).expect(200);
    expect(res.body.family).toHaveLength(1);
    expect(res.body.abstracts).toBe('');
    expect(res.body.claims).toEqual([]);
    expect(res.body.images).toEqual([]);
  });
});

describe('the routes that were dropped', () => {
  it('does not expose the unauthenticated thumbnail shell-out', async () => {
    await request(app).get('/family/single/file/?link=x').expect(401);
  });

  it('does not expose the EPO fetch that never replied', async () => {
    // /family/epo/grant/:n is gone; /family/:applicationNumber rejects "epo".
    repo.findDocument.mockResolvedValue(null);
    repo.publicationFor.mockResolvedValue(null);
    repo.grantFor.mockResolvedValue(null);
    await auth(request(app).get('/family/epo/grant/9446259')).expect(404);
  });
});
