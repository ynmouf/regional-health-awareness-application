export const PROFILES = {
  general: {
    label: 'General immunocompromised',
    description: 'Balanced weighting across all environmental health factors.',
    weights: { air: 25, water: 30, healthcare: 30, climate: 15 },
    redFlagSensitivity: 1,
  },
  transplant: {
    label: 'Transplant / severe immunosuppression',
    description: 'Prioritizes drinking water safety, hospital access, and specialist depth.',
    weights: { air: 20, water: 35, healthcare: 35, climate: 10 },
    redFlagSensitivity: 1.25,
  },
  oncology: {
    label: 'Chemo / oncology',
    description: 'Prioritizes hospital quality, emergency access, and safe drinking water.',
    weights: { air: 20, water: 32, healthcare: 38, climate: 10 },
    redFlagSensitivity: 1.2,
  },
  respiratory: {
    label: 'Respiratory vulnerability',
    description: 'Prioritizes air pollution, smoke, pollen, water quality, humidity.',
    weights: { air: 38, water: 26, healthcare: 20, climate: 16 },
    redFlagSensitivity: 1.2,
  },
  autoimmune: {
    label: 'Autoimmune biologics',
    description: 'Balances drinking water safety with specialist and pharmacy access.',
    weights: { air: 22, water: 32, healthcare: 30, climate: 16 },
    redFlagSensitivity: 1.1,
  },
  allergy: {
    label: 'Allergy / asthma dominant',
    description: 'Prioritizes pollen, smoke, air toxics, humidity, and allergy specialist access.',
    weights: { air: 34, water: 18, healthcare: 22, climate: 26 },
    redFlagSensitivity: 1.15,
  },
};

export function getProfile(profileId) {
  return PROFILES[profileId] ?? PROFILES.general;
}
