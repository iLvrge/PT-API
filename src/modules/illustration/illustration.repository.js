'use strict';

const { connections } = require('../../db');
const q = require('../../db/query');

/** Resolve a reel/frame pair to its transaction id. */
const rfIdForReelFrame = (reelNo, frameNo) =>
  q.selectValue(
    connections.resources,
    `SELECT rf_id FROM assignment WHERE reel_no = :reelNo AND frame_no = :frameNo LIMIT 1`,
    { reelNo, frameNo },
    'rf_id',
    null
  );

/**
 * The transaction behind an "incorrect names" finding (metric 17) for one
 * application, scoped to the caller's companies.
 */
const rfIdForIncorrectName = ({ applicationNumber, companies, bankMode }) => {
  const repl = { applicationNumber, organisationId: 0, companies };
  if (bankMode) repl.mode = 1;
  return q.selectValue(
    connections.applicationNew,
    `SELECT rf_id FROM db_new_application.dashboard_items
      WHERE type = 17 AND application = :applicationNumber AND organisation_id = :organisationId
      ${bankMode ? ' AND mode IN (:mode) ' : ''}
        AND representative_id IN (:companies) LIMIT 1`,
    repl,
    'rf_id',
    null
  );
};

module.exports = { rfIdForReelFrame, rfIdForIncorrectName };
