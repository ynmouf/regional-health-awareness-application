export const PROFILES = {
  general: {
    label: 'General immunocompromised',
    description: 'Balanced weighting for broad immune vulnerability.',
    weights: { air: 25, infection: 30, healthcare: 30, climate: 15 },
    redFlagSensitivity: 1,
  },
  transplant: {
    label: 'Transplant / severe immunosuppression',
    description: 'Prioritizes infection signals, hospital access, and specialist depth.',
    weights: { air: 20, infection: 38, healthcare: 32, climate: 10 },
    redFlagSensitivity: 1.25,
  },
  oncology: {
    label: 'Chemo / oncology',
    description: 'Prioritizes hospital quality, emergency access, and respiratory infection burden.',
    weights: { air: 20, infection: 34, healthcare: 36, climate: 10 },
    redFlagSensitivity: 1.2,
  },
  respiratory: {
    label: 'Respiratory vulnerability',
    description: 'Prioritizes air pollution, smoke, pollen, respiratory disease, and humidity.',
    weights: { air: 38, infection: 28, healthcare: 20, climate: 14 },
    redFlagSensitivity: 1.2,
  },
  autoimmune: {
    label: 'Autoimmune biologics',
    description: 'Balances infection risk with specialist and pharmacy access.',
    weights: { air: 22, infection: 34, healthcare: 30, climate: 14 },
    redFlagSensitivity: 1.1,
  },
  allergy: {
    label: 'Allergy / asthma dominant',
    description: 'Prioritizes pollen, smoke, humidity, and allergy/immunology access.',
    weights: { air: 34, infection: 20, healthcare: 22, climate: 24 },
    redFlagSensitivity: 1.15,
  },
};

export function getProfile(profileId) {
  return PROFILES[profileId] ?? PROFILES.general;
}
