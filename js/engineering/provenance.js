/**
 * Data provenance and model-fidelity taxonomy.
 *
 * Every engineering value shown by AEROLAB X carries one of these labels so the
 * user can always tell a target from an assumption, an estimate from a
 * calculation, and a simulation from a measurement. The taxonomy is ordered from
 * "least evidence about the real aircraft" to "most evidence".
 */
export const PROVENANCE = Object.freeze({
  requirement: {
    label: 'Requirement',
    short: 'REQ',
    tone: 'neutral',
    description: 'A target or constraint set by the user. It describes what the design should achieve, not what it does.',
  },
  'user-input': {
    label: 'User input',
    short: 'USER',
    tone: 'neutral',
    description: 'A design parameter entered by the user. AEROLAB X has not checked it against hardware.',
  },
  assumption: {
    label: 'Assumption',
    short: 'ASSUME',
    tone: 'caution',
    description: 'A value assumed in order to proceed with a calculation (for example an efficiency). Must be revisited.',
  },
  illustrative: {
    label: 'Illustrative',
    short: 'ILLUS',
    tone: 'caution',
    description: 'Example data for learning or demonstration. It does not describe any real product.',
  },
  datasheet: {
    label: 'Datasheet',
    short: 'DATA',
    tone: 'info',
    description: 'Taken from a manufacturer datasheet. A source reference must be recorded with the value.',
  },
  'conceptual-estimate': {
    label: 'Conceptual estimate',
    short: 'EST',
    tone: 'caution',
    description: 'Rule-of-thumb or statistical estimate. Large uncertainty; suitable only for early trade studies.',
  },
  analytical: {
    label: 'Analytical calculation',
    short: 'CALC',
    tone: 'info',
    description: 'Closed-form calculation from documented equations and stated assumptions. Accuracy is limited by the model and its inputs.',
  },
  simulation: {
    label: 'Numerical simulation',
    short: 'SIM',
    tone: 'info',
    description: 'Output of a numerical simulation with a documented model and initial conditions. It is not measured data.',
  },
  measured: {
    label: 'Measured',
    short: 'MEAS',
    tone: 'good',
    description: 'Measured on physical hardware. A test reference (date, setup, instrument) must be recorded.',
  },
  validated: {
    label: 'Experimentally validated',
    short: 'VALID',
    tone: 'good',
    description: 'A model result confirmed by measurement within a stated tolerance, for a stated operating range.',
  },
});

export const PROVENANCE_KINDS = Object.freeze(Object.keys(PROVENANCE));

export function isProvenance(kind) {
  return Object.prototype.hasOwnProperty.call(PROVENANCE, kind);
}

export function provenanceInfo(kind) {
  return PROVENANCE[kind] ?? {
    label: 'Unknown provenance',
    short: '?',
    tone: 'caution',
    description: 'The origin of this value has not been recorded.',
  };
}

/** Standard disclaimer shown wherever preliminary results are presented. */
export const FIDELITY_DISCLAIMER =
  'Preliminary engineering estimates for learning and early design exploration. ' +
  'They are not certified engineering analysis, validated CFD or FEA, flight approval or regulatory authorisation.';
