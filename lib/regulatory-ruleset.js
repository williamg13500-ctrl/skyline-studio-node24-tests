// Regulatory screening is deliberately separate from geometry-derived clearance.
// TEST-ONLY fixtures can exercise the comparison logic but can never be release evidence.
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const nonEmpty = value => typeof value === 'string' && value.trim().length > 0;
const validDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
};
export function validateRegulatoryRuleset(ruleset) {
  if (!record(ruleset)) return { valid:false, code:'ruleset_missing_or_malformed', message:'A named, versioned regulatory ruleset is required.' };
  const publisherOrSource = nonEmpty(ruleset.publisher) || nonEmpty(ruleset.source);
  const fields = {
    name: nonEmpty(ruleset.name),
    version: nonEmpty(ruleset.version),
    publisherOrSource,
    jurisdiction: nonEmpty(ruleset.jurisdiction),
    effectiveDate: validDate(ruleset.effectiveDate),
    minimumClearanceM: typeof ruleset.minimumClearanceM === 'number' && Number.isFinite(ruleset.minimumClearanceM) && ruleset.minimumClearanceM > 0
  };
  const missing = Object.entries(fields).filter(([,ok])=>!ok).map(([key])=>key);
  return missing.length
    ? { valid:false, code:'ruleset_fields_invalid', missing, message:'The regulatory ruleset is malformed or missing required fields.' }
    : { valid:true, code:null, missing:[] };
}
export function assessRegulatoryClearance({ clearanceM, ruleset, projectJurisdiction, releaseContext = false } = {}) {
  const result = { status:'not_checked', evidenceClass:'none', rulesetName:null, rulesetVersion:null, jurisdiction:null, issues:[], releaseBlockers:[] };
  const block = (code,message) => result.releaseBlockers.push({code,message});
  if (!record(ruleset)) {
    result.issues.push({code:'regulatory_ruleset_missing',message:'No versioned named regulatory ruleset was supplied; regulatory status remains not_checked.'});
    block('regulatory_ruleset_missing','Regulatory screening cannot pass without a complete named, versioned and sourced ruleset.');
    return result;
  }
  const validation = validateRegulatoryRuleset(ruleset);
  if (!validation.valid) {
    result.issues.push({code:validation.code,missing:validation.missing||[],message:validation.message});
    block(validation.code,'The supplied regulatory ruleset is malformed or incomplete.');
    return result;
  }
  result.rulesetName = ruleset.name;
  result.rulesetVersion = ruleset.version;
  result.jurisdiction = ruleset.jurisdiction;
  const testOnly = ruleset.testOnly === true || /^TEST-ONLY(?:\b|:)/i.test(ruleset.name.trim());
  if (testOnly && releaseContext) {
    result.evidenceClass = 'test_only';
    result.issues.push({code:'test_only_ruleset_not_release_evidence',message:'A TEST-ONLY ruleset cannot be used as production or release evidence.'});
    block('test_only_ruleset_not_release_evidence','TEST-ONLY rulesets are prohibited in release contexts.');
    return result;
  }
  if (!nonEmpty(projectJurisdiction) || projectJurisdiction.trim().toLowerCase() !== ruleset.jurisdiction.trim().toLowerCase()) {
    result.evidenceClass = testOnly ? 'test_only' : 'unverified';
    result.issues.push({code:'ruleset_jurisdiction_mismatch',projectJurisdiction:projectJurisdiction||null,rulesetJurisdiction:ruleset.jurisdiction,message:'The ruleset jurisdiction does not match the project jurisdiction.'});
    block('ruleset_jurisdiction_mismatch','A ruleset for a different or unspecified project jurisdiction cannot be applied.');
    return result;
  }
  if (typeof clearanceM !== 'number' || !Number.isFinite(clearanceM)) {
    result.evidenceClass = testOnly ? 'test_only' : 'versioned_ruleset';
    result.issues.push({code:'geometry_clearance_unavailable',message:'A geometry-derived clearance is required before regulatory screening.'});
    block('geometry_clearance_unavailable','Regulatory screening is blocked until geometry-derived clearance is available.');
    return result;
  }
  result.evidenceClass = testOnly ? 'test_only' : 'versioned_ruleset';
  result.status = clearanceM < ruleset.minimumClearanceM ? 'failed' : 'passed';
  if (result.status === 'failed') {
    result.issues.push({code:'clearance_below_ruleset_threshold',clearanceM,minimumClearanceM:ruleset.minimumClearanceM});
    block('clearance_below_ruleset_threshold','Geometry-derived clearance is below the supplied ruleset threshold.');
  }
  return result;
}
