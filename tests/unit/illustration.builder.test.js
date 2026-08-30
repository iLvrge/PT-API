'use strict';

const builder = require('../../src/modules/illustration/illustration.builder');

const assignment = (overrides = {}) => ({
  reel_no: '45231',
  frame_no: '0812',
  convey_ty: 'assignment',
  convey_text: 'ASSIGNMENT OF ASSIGNORS INTEREST',
  employer_assign: 0,
  status: 1,
  record_dt: '2020-03-10',
  page_count: 4,
  cname: 'Some Firm LLP',
  caddress_1: '1 Main St',
  caddress_2: '',
  ...overrides,
});

const details = (overrides = {}) => ({
  assignment: assignment(overrides.assignment),
  assignor: overrides.assignor || [
    { id: 10, or_name: 'RAW OR', normalize_name: 'Acme Inc', original_name: 'ACME INC.',
      representative_original_name: 'ACME INC.', exec_dt: '2020-03-01' },
  ],
  assignee: overrides.assignee || [
    { id: 20, ee_name: 'RAW EE', normalize_name: 'Beta Corp', original_name: 'BETA CORP.',
      representative_original_name: 'BETA CORP.', rf_id: 500,
      ee_address_1: '2 Side St', ee_address_2: '', ee_city: 'NYC', ee_state: 'NY',
      ee_country: 'US', ee_postcode: '10001' },
  ],
  properties: overrides.properties || [
    { title: 'A Widget', appno_doc_num: '111', appno_date: '2018-01-01',
      grant_doc_num: '999', grant_date: '2019-01-01', pgpub_doc_num: '888', pgpub_date: '2018-06-01' },
  ],
});

describe('illustration.builder.build', () => {
  it('returns an empty diagram when there is no assignment', () => {
    const payload = builder.build({ assignor: [], assignee: [], properties: [] }, 500);
    expect(payload.box).toEqual([]);
    expect(payload.connection).toEqual([]);
    expect(payload.popup).toEqual([]);
    expect(payload.general.original_number).toBe(500);
    // The legend is static configuration and ships either way.
    expect(payload.legend).toHaveLength(8);
  });

  it('draws one box per assignor and per distinct assignee', () => {
    const payload = builder.build(details(), 500);
    expect(payload.box).toHaveLength(2);
    expect(payload.box[0]).toMatchObject({ id: '100', name: 'Acme Inc', flag: 1, type: 'Ownership' });
    expect(payload.box[1]).toMatchObject({ id: 20, name: 'Beta Corp', flag: 0, type: 'Ownership' });
  });

  it('falls back to the recorded name when there is no normalised one', () => {
    const payload = builder.build(
      details({
        assignor: [{ id: 10, or_name: 'RAW OR', normalize_name: '', original_name: 'X', exec_dt: '2020-03-01' }],
        assignee: [{ id: 20, ee_name: 'RAW EE', normalize_name: null, original_name: 'Y', rf_id: 1 }],
      }),
      500
    );
    expect(payload.box[0].name).toBe('RAW OR');
    expect(payload.box[1].name).toBe('RAW EE');
  });

  it('gives two recordings of the same company a single box', () => {
    const payload = builder.build(
      details({
        assignee: [
          { id: 20, normalize_name: 'Beta Corp', ee_name: 'B', original_name: 'B', rf_id: 1 },
          { id: 21, normalize_name: 'Beta Corp', ee_name: 'B', original_name: 'B', rf_id: 1 },
        ],
      }),
      500
    );
    const assigneeBoxes = payload.box.filter((b) => b.flag === 0);
    expect(assigneeBoxes).toHaveLength(1);
    // Both connectors point at the surviving box.
    expect(payload.connection.every((c) => c.end_id === 20)).toBe(true);
  });

  it('places the assignor a day before, and the connector nine days before', () => {
    const payload = builder.build(details(), 500);
    expect(payload.box[0].execution_date).toBe('2020-02-29');
    expect(payload.box[1].execution_date).toBe('2020-03-01');
    expect(payload.fakeDate.toISOString().slice(0, 10)).toBe('2020-02-21');
  });

  it('draws an employer assignment as an inventor box in segment 0', () => {
    const payload = builder.build(details({ assignment: { employer_assign: 1 } }), 500);
    expect(payload.box[0]).toMatchObject({ type: 'Inventor', segment: '0' });
    // The assignee still sits in segment 1.
    expect(payload.box[1].segment).toBe('1');
  });

  describe('conveyance rendering', () => {
    it('labels a security agreement on both the box and the connector', () => {
      const payload = builder.build(details({ assignment: { convey_ty: 'security' } }), 500);
      expect(payload.box[0].type).toBe('Security');
      expect(payload.box[1].type).toBe('Security');
      expect(payload.connection[0]).toMatchObject({ type: 'Security', color: '#ffaa00' });
    });

    it('draws a partial release as a release box with its own dashed connector', () => {
      const payload = builder.build(details({ assignment: { convey_ty: 'partialrelease' } }), 500);
      // The assignor keeps the ownership style; only the assignee is a release.
      expect(payload.box[0].type).toBe('Ownership');
      expect(payload.box[1].type).toBe('Partial Release');
      expect(payload.connection[0]).toMatchObject({ type: 'Partial Release', type_line: 'Dashed' });
    });

    it('labels a correction as an ownership box with a Correct connector', () => {
      const payload = builder.build(details({ assignment: { convey_ty: 'correct' } }), 500);
      expect(payload.box[1].type).toBe('Ownership');
      expect(payload.connection[0]).toMatchObject({ type: 'Correct', type_line: 'Dashed' });
    });

    it('labels a name change', () => {
      const payload = builder.build(details({ assignment: { convey_ty: 'namechg' } }), 500);
      expect(payload.box[1].type).toBe('Name Change');
      expect(payload.connection[0].color).toBe('#2493f2');
    });
  });

  it('links documents to our CDN when the recording was mirrored', () => {
    const mirrored = builder.build(details(), 500);
    expect(mirrored.box[1].document).toContain('static.patentrack.com');
    expect(mirrored.box[1].document).toContain('assignment-pat-45231-0812.pdf');

    const remote = builder.build(details({ assignment: { status: 0 } }), 500);
    expect(remote.box[1].document).toContain('legacy-assignments.uspto.gov');
  });

  it('draws no connectors when nothing was assigned to anyone', () => {
    const payload = builder.build(details({ assignee: [] }), 500);
    expect(payload.connection).toEqual([]);
    expect(payload.box).toHaveLength(1);
  });

  it('collects the property columns and the first-property summary', () => {
    const payload = builder.build(
      details({
        properties: [
          { title: 'A', appno_doc_num: '111', appno_date: '2018-01-01', grant_doc_num: '999',
            grant_date: '2019-01-01', pgpub_doc_num: '888', pgpub_date: '2018-06-01' },
          { title: 'B', appno_doc_num: '222', appno_date: '', grant_doc_num: '',
            grant_date: '', pgpub_doc_num: '', pgpub_date: '' },
        ],
      }),
      500
    );
    const [popup] = payload.popup;
    expect(popup.applNum).toEqual(['111', '222']);
    // Blank columns become the literal NULL the client renders as "not recorded".
    expect(popup.patNum).toEqual(['999', 'NULL']);
    expect(popup.applNumSize).toBe(2);
    expect(popup.applNumFirst).toBe('111');
    expect(popup.patNumFirst).toBe('999');
  });

  it('names the diagram by reel-frame and conveyance text', () => {
    const payload = builder.build(details(), 500);
    expect(payload.general.patent_number).toBe('45231-0812 ASSIGNMENT OF ASSIGNORS INTEREST');
    expect(payload.general.original_number).toBe(500);
    expect(payload.popup[0].id).toBe('45231-0812');
  });

  it('does not leak box state between two builds', () => {
    const first = builder.build(details(), 500);
    builder.build(details({ assignor: [
      { id: 99, normalize_name: 'Other Co', or_name: 'O', original_name: 'O', exec_dt: '2021-01-01' },
    ] }), 501);
    expect(first.box[0].name).toBe('Acme Inc');
    expect(first.box).toHaveLength(2);
  });
});
