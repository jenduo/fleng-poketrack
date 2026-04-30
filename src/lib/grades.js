// Mapping of Collectr's grade_id → human-readable grade.
// Returns null for ungraded (raw) cards.
//
// Discovered by scanning Frank's portfolios — extend this map as new
// grade_ids appear in the data (any unmapped non-52 id will fall back to
// a generic "GRADED · <id>" banner so they're easy to spot.)
const GRADE_LOOKUP = {
  '6':  { company: 'PSA', grade: '5' },
  '8':  { company: 'PSA', grade: '7' },
  '9':  { company: 'PSA', grade: '8' },
  '11': { company: 'PSA', grade: '9' },
  '12': { company: 'PSA', grade: '10' },
  '51': { company: 'CGC', grade: '10' },
  '52': null, // raw, no grade
  '73': { company: 'TAG', grade: '10' },
  '74': { company: 'TAG', grade: '9' },
  '79': { company: 'TAG', grade: '6.5' },
}

const RAW_IDS = new Set(['52'])

// Returns { company, grade, isGraded } for any card. Unknown ids that aren't
// in RAW_IDS are treated as graded-but-unmapped so they surface as
// "GRADED · <id>" (you'll know to extend the table).
export function gradeFromCard(card) {
  if (!card) return { isGraded: false, label: '—' }
  return gradeFromId(card.grade_id)
}

export function gradeFromId(id) {
  if (id == null || id === '') return { isGraded: false, label: '—' }
  const key = String(id)
  if (RAW_IDS.has(key)) return { isGraded: false, label: 'Raw' }
  const known = GRADE_LOOKUP[key]
  if (known) return { ...known, isGraded: true, label: `${known.company} ${known.grade}` }
  return { company: 'GRADED', grade: `· ${id}`, isGraded: true, unmapped: true, label: `GRADED · ${id}` }
}

// True if the given grade_id is in the lookup or in RAW_IDS.
export function isKnownGradeId(id) {
  if (id == null) return false
  const key = String(id)
  return RAW_IDS.has(key) || Object.prototype.hasOwnProperty.call(GRADE_LOOKUP, key)
}
