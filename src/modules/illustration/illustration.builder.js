'use strict';

/**
 * Builds the illustration payload — the box/connector graph the front end draws
 * for one recorded assignment.
 *
 * Pure: it takes the assignment data and returns the payload, so the whole
 * shape is unit-testable. Ported from createJSON in routes/application/
 * illustration.js, where `boxName`, `originalName` and `boxObj` were assigned
 * without declaration and therefore leaked into the global scope (audit F4) —
 * two concurrent requests could overwrite each other's box names.
 */

const { ymd, minusDays } = require('../../utils/dates');
const {
  BOX_STYLES, LINE_STYLES, BOX_MENU, CONVEYANCE, DEFAULT_CONVEYANCE, CDN_URL, USPTO_URL,
} = require('./illustration.constants');

const NULL_TEXT = 'NULL';

const styleFor = (type) => BOX_STYLES.find((style) => style.type === type);
const lineFor = (name) => LINE_STYLES.find((style) => style.name === name);
const conveyance = (code) => CONVEYANCE[code] || DEFAULT_CONVEYANCE;

const applyStyle = (box, styleType, segment) => {
  const style = styleFor(styleType);
  if (!style) return box;
  return {
    ...box,
    boxType: style.id,
    shape: style.shape,
    dimension: style.dimension,
    border_color: style.border_color,
    border_linepx: style.border_px,
    background_color: style.background_color,
    segment: String(segment),
  };
};

/** The property columns, collected in parallel arrays as the client expects. */
const collectProperties = (properties) => {
  const cols = {
    inventionTitle: [], applNum: [], filingDate: [], intlRegNum: [], pctNum: [],
    issueDate: [], patNum: [], publDate: [], publNum: [],
  };
  properties.forEach((doc) => {
    cols.inventionTitle.push(doc.title);
    cols.applNum.push(doc.appno_doc_num || NULL_TEXT);
    cols.filingDate.push(doc.appno_date || NULL_TEXT);
    cols.intlRegNum.push(NULL_TEXT);
    cols.pctNum.push(NULL_TEXT);
    cols.issueDate.push(doc.grant_date || NULL_TEXT);
    cols.patNum.push(doc.grant_doc_num || NULL_TEXT);
    cols.publDate.push(doc.pgpub_date || NULL_TEXT);
    cols.publNum.push(doc.pgpub_doc_num || NULL_TEXT);
  });

  const first = properties[0];
  return {
    ...cols,
    first: {
      inventionTitleFirst: first ? first.title : '',
      applNumFirst: first ? first.appno_doc_num : '',
      filingDateFirst: first ? first.appno_date : '',
      intlPublDateFirst: first ? '0001-01-01T00:00:00Z' : '',
      intlRegNumFirst: first ? NULL_TEXT : '',
      issueDateFirst: first ? first.grant_date : '',
      patNumFirst: first ? first.grant_doc_num : '',
      publDateFirst: first ? first.pgpub_date : '',
      publNumFirst: first ? first.pgpub_doc_num : '',
    },
  };
};

/**
 * Assignees are de-duplicated by display name: two recorded rows for the same
 * company share one box, and later connectors point at that box's id.
 */
const assigneeBoxIds = (assignees) => {
  const idByName = new Map();
  return assignees.map((assignee) => {
    const name = assignee.normalize_name || assignee.ee_name;
    if (!idByName.has(name)) idByName.set(name, assignee.id);
    return { assignee, name, boxId: idByName.get(name), isNew: idByName.get(name) === assignee.id };
  });
};

/**
 * @param {object} details output of shared/assignment-data.byRfId
 * @param {number|string} rfId the transaction this illustration is for
 */
const build = (details, rfId) => {
  const boxes = [];
  const connections = [];
  let popup = [];
  let title = '';
  let reelFrameId = '';
  let fakeDate = '';

  const assignment = details && details.assignment;
  const hasData = !!(details && assignment && details.assignor && details.assignor.length > 0);

  if (hasData) {
    const reelFrame = `${assignment.reel_no}-${assignment.frame_no}`;
    reelFrameId = `assignment-pat-${reelFrame}.pdf`;
    title = assignment.convey_text;

    const documentUrl = (assignment.status === 1 ? CDN_URL : USPTO_URL) + reelFrameId;
    const recordedDate = new Date(assignment.record_dt);
    const firstAssignor = details.assignor[0];
    const execDate = ymd(firstAssignor.exec_dt);
    const earliestDate = execDate;

    // Assignor boxes are drawn one day before the execution date so they sit to
    // the left of the assignees on the timeline.
    const assignorFakeDate = minusDays(firstAssignor.exec_dt, 1);
    const rendering = conveyance(assignment.convey_ty);
    const isEmployerAssignment = assignment.employer_assign === 1;
    const assignorStyle = isEmployerAssignment ? 'Inventor' : rendering.assignorBox;
    const assignorSegment = isEmployerAssignment ? 0 : 1;

    details.assignor.forEach((assignor, index) => {
      boxes.push(applyStyle(
        {
          id: `${assignor.id}${index}`,
          name: assignor.normalize_name || assignor.or_name,
          original_name: assignor.original_name,
          assignment_no: 0,
          date_1: ymd(assignorFakeDate),
          execution_date: ymd(assignorFakeDate),
          recorded_date: ymd(recordedDate),
          document: '',
          document_file: '',
          flag: 1,
          type: assignorStyle,
        },
        assignorStyle,
        assignorSegment
      ));
    });

    const assigneeStyle = rendering.assigneeBox;
    // Assignee boxes keep segment 1 even for an employer assignment, where the
    // assignor sits in segment 0.
    const assigneeSegment = assignorSegment === 0 ? 1 : assignorSegment;
    const resolvedAssignees = assigneeBoxIds(details.assignee || []);

    resolvedAssignees.forEach(({ assignee, name, boxId, isNew }) => {
      if (!isNew) return;
      boxes.push(applyStyle(
        {
          id: boxId,
          name,
          original_name: assignee.original_name,
          date_1: execDate,
          assignment_no: 1,
          execution_date: execDate,
          recorded_date: ymd(assignment.record_dt),
          document: documentUrl,
          document_file: documentUrl,
          document_form: documentUrl,
          document_agreement: documentUrl,
          flag: 0,
          // The box borrows another style's colours but keeps its own label.
          type: rendering.boxLabel,
        },
        assigneeStyle,
        assigneeSegment
      ));
    });

    // Connectors run from every assignor box to every assignee box. The
    // assignor date here is nine days back, not one — the legacy offset that
    // spaces the connector origin from the box.
    const connectorDate = minusDays(firstAssignor.exec_dt, 9);
    fakeDate = connectorDate;
    const lineName = details.assignee && details.assignee.length ? rendering.line : null;
    const style = lineName ? lineFor(lineName) : null;

    if (style) {
      details.assignor.forEach((assignor, index) => {
        resolvedAssignees.forEach(({ assignee, boxId }) => {
          const comment = {};
          comment[reelFrame] = ['', ''];
          connections.push({
            id: boxId,
            assignment_no1: 1,
            color: style.color,
            type: lineName,
            type_line: style.line_type === 1 ? 'Dashed' : 'Solid',
            ref_id: assignee.rf_id,
            start_id: `${assignor.id}${index}`,
            end_id: boxId,
            box_creator_id: 0,
            box_creator_id2: 0,
            popup: [reelFrame],
            comment: [comment],
            user_files: [''],
            tooltip: style.name,
            date: execDate,
            recorded: recordedDate,
            document1: documentUrl,
            document1_form: documentUrl,
            document1_agreement: documentUrl,
            document2: '',
            note1: '',
            pdf1: '',
            note2: '',
            pdf2: '',
            popuptop: reelFrame,
            popupbottom: '',
          });
        });
      });
    }

    const props = collectProperties(details.properties || []);
    popup = [{
      id: reelFrame,
      displayId: reelFrame,
      reelNo: assignment.reel_no,
      frameNo: assignment.frame_no,
      recordedDate: assignment.record_dt,
      pageCount: assignment.page_count,
      conveyanceText: assignment.convey_text,
      corrName: assignment.cname,
      corrAddress1: assignment.caddress_1,
      corrAddress2: assignment.caddress_2,
      patAssignorEarliestExDate: earliestDate,
      patAssignorName: details.assignor.map((a) => ({
        recorded_name: a.original_name,
        normalize_name: a.representative_original_name,
      })),
      patAssigneeName: (details.assignee || []).map((a) => ({
        recorded_name: a.original_name,
        normalize_name: a.representative_original_name,
      })),
      patAssigneeAddress1: (details.assignee || []).map((a) => a.ee_address_1),
      patAssigneeAddress2: (details.assignee || []).map((a) => a.ee_address_2),
      patAssigneeCity: (details.assignee || []).map((a) => a.ee_city),
      patAssigneeState: (details.assignee || []).map((a) => a.ee_state),
      patAssigneeCountryName: (details.assignee || []).map((a) => a.ee_country),
      patAssigneePostcode: (details.assignee || []).map((a) => a.ee_postcode),
      applNum: props.applNum,
      filingDate: props.filingDate,
      intlRegNum: props.intlRegNum,
      inventionTitle: props.inventionTitle,
      issueDate: props.issueDate,
      patNum: props.patNum,
      pctNum: props.pctNum,
      publDate: props.publDate,
      publNum: props.publNum,
      inventors: NULL_TEXT,
      applNumSize: (details.properties || []).length,
      patNumSize: (details.properties || []).length,
      ...props.first,
    }];
  }

  return {
    box: boxes,
    connection: connections,
    // The client reads the connector list under both keys.
    line: connections,
    all_boxes: BOX_STYLES,
    legend: LINE_STYLES,
    box_menu: BOX_MENU,
    general: {
      background: '#000000',
      patent_number: hasData
        ? `${assignment.reel_no}-${assignment.frame_no} ${title}`
        : '',
      original_number: rfId,
      logo_1: '',
      logo_2: '',
      copyright: '',
    },
    popup,
    comment: '',
    fakeDate,
  };
};

module.exports = { build, styleFor, lineFor, conveyance, collectProperties, assigneeBoxIds };
