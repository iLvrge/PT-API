'use strict';

const parser = require('../../src/modules/family/family.parser');
const documents = require('../../src/modules/family/family.documents');
const { bareNumber, epoReference } = require('../../src/modules/family/family.service');

/** A family member as xml2js produces it from an OPS response. */
const member = ({ familyId = '44', pub = '9446259', app = '13456789', appDate = '20130101',
  kind = 'B2', country = 'US', legal } = {}) => {
  const node = {
    $: { 'family-id': familyId },
    'publication-reference': [{
      'document-id': [{
        $: { 'document-id-type': 'docdb' },
        country: [country], 'doc-number': [pub], kind: [kind], date: ['20160920'],
      }],
    }],
    'application-reference': [{
      'document-id': [{
        country: [country], 'doc-number': [app], kind: ['A'], date: [appDate],
      }],
    }],
  };
  if (legal) node['ops:legal'] = legal;
  return node;
};

const opsDocument = (members) => ({
  'ops:world-patent-data': { 'ops:patent-family': [{ 'ops:family-member': members }] },
});

const legalItem = (overrides = {}) => ({
  $: { code: 'PG25', desc: 'LAPSED' },
  'ops:L001EP': [{ _: 'US' }],
  'ops:L002EP': [{ _: 'B1' }],
  'ops:L003EP': [{ _: '9446259' }],
  'ops:L004EP': [{ _: 'B2' }],
  'ops:L005EP': [{ _: 'PATENT' }],
  'ops:L007EP': [{ _: '20200101' }],
  'ops:L008EP': [{ _: 'PG25' }],
  'ops:L018EP': [{ _: '20200201' }],
  'ops:L019EP': [{ _: '20200102' }],
  ...overrides,
});

describe('family.parser.parseFamily', () => {
  it('returns nothing when the document holds no family', () => {
    expect(parser.parseFamily({}, { asset: '9446259' })).toEqual([]);
    expect(parser.parseFamily(opsDocument([]), { asset: '9446259' })).toEqual([]);
  });

  it('returns nothing when the asset is not in the document', () => {
    expect(parser.parseFamily(opsDocument([member()]), { asset: '0000000' })).toEqual([]);
  });

  it('collects the members sharing the asset family', () => {
    const rows = parser.parseFamily(
      opsDocument([
        member({ pub: '9446259', app: '13456789', appDate: '20130101' }),
        member({ pub: 'EP12345', app: 'EP99', appDate: '20130202', country: 'EP' }),
        // A different family must not be collected.
        member({ familyId: '99', pub: 'JP1', app: 'JP2', appDate: '20140101', country: 'JP' }),
      ]),
      { asset: '9446259' }
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      family_id: '44', patent_number: '9446259', application_number: '13456789',
      publication_country: 'US', publication_kind: 'B2',
    });
    expect(rows[1].publication_country).toBe('EP');
  });

  it('carries the title we hold onto every member', () => {
    const rows = parser.parseFamily(opsDocument([member()]), { asset: '9446259', title: 'A Widget' });
    expect(rows[0].title).toBe('A Widget');
  });

  it('prefers the docdb publication reference over any other', () => {
    const node = member();
    node['publication-reference'][0]['document-id'] = [
      { $: { 'document-id-type': 'epodoc' }, country: ['US'], 'doc-number': ['WRONG'], kind: ['A'], date: ['x'] },
      { $: { 'document-id-type': 'docdb' }, country: ['US'], 'doc-number': ['9446259'], kind: ['B2'], date: ['20160920'] },
    ];
    const rows = parser.parseFamily(opsDocument([node]), { asset: '9446259' });
    expect(rows[0].patent_number).toBe('9446259');
  });

  it('matches on the application reference for an asset that never granted', () => {
    const rows = parser.parseFamily(
      opsDocument([member({ app: '13456789' })]),
      { asset: '13456789', useApplicationReference: true }
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].application_number).toBe('13456789');
  });

  it('lets a granted publication supersede the earlier one for the same application', () => {
    const rows = parser.parseFamily(
      opsDocument([
        member({ pub: '20140001', app: '13456789', appDate: '20130101', kind: 'A1' }),
        member({ pub: '9446259', app: '13456789', appDate: '20130101', kind: 'B2' }),
      ]),
      { asset: '20140001' }
    );
    // One row for the application, and it is the granted publication.
    expect(rows).toHaveLength(1);
    expect(rows[0].publication_kind).toBe('B2');
  });

  it('inherits the earlier entry\'s legal events when the grant carries none', () => {
    const rows = parser.parseFamily(
      opsDocument([
        member({ pub: '20140001', app: '13456789', kind: 'A1', legal: [legalItem()] }),
        member({ pub: '9446259', app: '13456789', kind: 'B2' }),
      ]),
      { asset: '20140001' }
    );
    expect(rows[0].legal).toHaveLength(1);
    expect(rows[0].legal[0].code).toBe('PG25');
  });

  describe('legal events', () => {
    it('maps every numbered EPO field to its name', () => {
      const rows = parser.parseFamily(
        opsDocument([member({ legal: [legalItem()] })]),
        { asset: '9446259' }
      );
      expect(rows[0].legal[0]).toMatchObject({
        code: 'PG25',
        desc: 'LAPSED',
        country_code: 'US',
        document_number: '9446259',
        ipr_type: 'PATENT',
        legal_event_code: 'PG25',
        date_first_exchanged: '20200102',
      });
    });

    it('accepts a single event as well as a list', () => {
      const single = parser.parseFamily(
        opsDocument([member({ legal: legalItem() })]), { asset: '9446259' }
      );
      expect(single[0].legal).toHaveLength(1);
    });

    it('collects the free-text sub-fields', () => {
      const rows = parser.parseFamily(
        opsDocument([member({ legal: [legalItem({
          'ops:L500EP': [{
            'ops:L501EP': [{ $: { desc: 'Country' }, _: 'DE' }],
            'ops:L503EP': [{ $: { desc: 'Ref' }, _: 'R081' }],
          }],
        })] })]),
        { asset: '9446259' }
      );
      expect(rows[0].legal[0].lespList).toEqual([
        { desc: 'Country', data: 'DE' },
        { desc: 'Ref', data: 'R081' },
      ]);
    });

    it('collects the pre-formatted lines', () => {
      const rows = parser.parseFamily(
        opsDocument([member({ legal: [legalItem({ 'ops:pre': [{ _: 'line one' }, { _: 'line two' }] })] })]),
        { asset: '9446259' }
      );
      expect(rows[0].legal[0].preLine).toEqual(['line one', 'line two']);
    });

    it('is empty when a member has no legal history', () => {
      const rows = parser.parseFamily(opsDocument([member()]), { asset: '9446259' });
      expect(rows[0].legal).toEqual([]);
    });
  });
});

describe('family.service number handling', () => {
  it('strips a country prefix and a kind suffix', () => {
    expect(bareNumber('US09775636B2')).toBe('09775636');
    expect(bareNumber('US9446259')).toBe('9446259');
  });

  it('leaves a bare number alone', () => {
    // The legacy version cut the first two characters unconditionally, so a
    // number sent without a country prefix came back mangled.
    expect(bareNumber('13456789')).toBe('13456789');
  });

  it('always country-prefixes an EPO reference, without doubling it', () => {
    expect(epoReference('9446259')).toBe('US9446259');
    expect(epoReference('US9446259')).toBe('US9446259');
  });
});

describe('family.documents.extract', () => {
  const application = `<us-patent-application>
      <abstract><p>First half.</p><p>Second half.</p></abstract>
      <claims><claim><claim-text>1. A widget.</claim-text></claim></claims>
      <description>The description.</description>
      <drawings><figure><img file="D00001.TIF"/></figure><figure><img file="D00002.TIF"/></figure></drawings>
    </us-patent-application>`;

  const olderApplication = `<patent-application-publication>
      <subdoc-abstract><paragraph>Older style abstract.</paragraph></subdoc-abstract>
      <subdoc-claims><claim>1. A widget.</claim></subdoc-claims>
      <subdoc-description>Older description.</subdoc-description>
    </patent-application-publication>`;

  it('joins a multi-paragraph abstract', () => {
    expect(documents.extract(application, 'abstract', 1)).toBe('First half. Second half.');
  });

  it('reads the older publication schema too', () => {
    expect(documents.extract(olderApplication, 'abstract', 1)).toBe('Older style abstract.');
    expect(documents.extract(olderApplication, 'specifications', 1)[0].text)
      .toContain('Older description.');
  });

  it('rewrites claim tags into renderable markup', () => {
    const [claims] = documents.extract(application, 'claims', 1);
    expect(claims.text).toContain('class="claim"');
    expect(claims.text).not.toContain('<claim-text');
  });

  it('lists drawings as png rather than the source tif', () => {
    expect(documents.extract(application, 'figures', 1)).toEqual(['D00001.png', 'D00002.png']);
  });

  it('returns nothing for a document with no drawings', () => {
    expect(documents.extract(olderApplication, 'figures', 1)).toEqual([]);
  });

  it('strips the bracket entities that break the strict parser', () => {
    expect(documents.stripBracketEntities('a &lsqb;0001&rsqb; b')).toBe('a 0001 b');
  });
});
