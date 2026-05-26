// Reference acoustic database of North American bat species.
// Values are typical published ranges for search-phase (cruising) echolocation
// calls compiled from regional bat-call guides and NABat references. Field calls
// vary with habitat clutter, behaviour and individual; ranges are intentionally
// generous. fcKhz = characteristic frequency; freqRangeKhz = full sweep extent.
//
// IUCN: LC least concern, NT near threatened, VU vulnerable, EN endangered.
// usFederal: status under the US Endangered Species Act where applicable.

export const REGIONS = {
  northeast: 'Northeast',
  southeast: 'Southeast',
  midwest: 'Midwest / Great Plains',
  southwest: 'Southwest',
  west: 'West / Mountain',
  northwest: 'Pacific Northwest',
  national: 'Widespread',
};

export const SPECIES = [
  {
    id: 'EPFU', scientificName: 'Eptesicus fuscus', commonName: 'Big brown bat', genus: 'Eptesicus',
    fcKhz: [24, 30], freqRangeKhz: [23, 55], durationMs: [5, 12], pulseIntervalMs: [80, 130],
    shape: ['FM-QCF', 'QCF'], harmonics: 1, iucn: 'LC', usFederal: null, protected: false,
    migratory: false, regions: ['national'], habitat: ['urban', 'forest edge', 'agricultural'],
    notes: 'Robust, adaptable. Shallow FM-QCF calls; one of the most commonly recorded species.',
  },
  {
    id: 'LANO', scientificName: 'Lasionycteris noctivagans', commonName: 'Silver-haired bat', genus: 'Lasionycteris',
    fcKhz: [24, 29], freqRangeKhz: [23, 48], durationMs: [6, 14], pulseIntervalMs: [90, 150],
    shape: ['FM-QCF', 'QCF'], harmonics: 1, iucn: 'LC', usFederal: null, protected: false,
    migratory: true, regions: ['national', 'northwest', 'west'], habitat: ['coniferous forest', 'riparian'],
    notes: 'Long-distance migrant; overlaps acoustically with big brown bat — separation often uncertain.',
  },
  {
    id: 'LACI', scientificName: 'Lasiurus cinereus', commonName: 'Hoary bat', genus: 'Lasiurus',
    fcKhz: [18, 24], freqRangeKhz: [17, 35], durationMs: [10, 18], pulseIntervalMs: [180, 400],
    shape: ['QCF', 'FM-QCF'], harmonics: 1, iucn: 'LC', usFederal: null, protected: false,
    migratory: true, regions: ['national'], habitat: ['forest', 'open'],
    notes: 'Largest US migratory tree bat. Low-frequency, long, widely-spaced calls. High wind-turbine mortality.',
  },
  {
    id: 'LABO', scientificName: 'Lasiurus borealis', commonName: 'Eastern red bat', genus: 'Lasiurus',
    fcKhz: [38, 45], freqRangeKhz: [37, 65], durationMs: [4, 10], pulseIntervalMs: [70, 130],
    shape: ['FM-QCF'], harmonics: 1, iucn: 'LC', usFederal: null, protected: false,
    migratory: true, regions: ['northeast', 'southeast', 'midwest'], habitat: ['forest', 'edge'],
    notes: 'Migratory tree bat; bright FM-QCF calls. Distinct alternating loud/soft call pattern.',
  },
  {
    id: 'LASE', scientificName: 'Lasiurus seminolus', commonName: 'Seminole bat', genus: 'Lasiurus',
    fcKhz: [38, 43], freqRangeKhz: [37, 60], durationMs: [4, 10], pulseIntervalMs: [70, 130],
    shape: ['FM-QCF'], harmonics: 1, iucn: 'LC', usFederal: null, protected: false,
    migratory: false, regions: ['southeast'], habitat: ['forest', 'Spanish moss roosts'],
    notes: 'Southeastern; acoustically near-identical to eastern red bat.',
  },
  {
    id: 'NYHU', scientificName: 'Nycticeius humeralis', commonName: 'Evening bat', genus: 'Nycticeius',
    fcKhz: [32, 40], freqRangeKhz: [30, 65], durationMs: [3, 7], pulseIntervalMs: [70, 120],
    shape: ['FM-QCF'], harmonics: 1, iucn: 'LC', usFederal: null, protected: false,
    migratory: false, regions: ['southeast', 'midwest'], habitat: ['forest', 'agricultural'],
    notes: 'Colonial; calls intermediate between Lasiurus and Eptesicus.',
  },
  {
    id: 'TABR', scientificName: 'Tadarida brasiliensis', commonName: 'Mexican free-tailed bat', genus: 'Tadarida',
    fcKhz: [22, 30], freqRangeKhz: [20, 45], durationMs: [8, 16], pulseIntervalMs: [120, 300],
    shape: ['QCF', 'FM-QCF'], harmonics: 1, iucn: 'LC', usFederal: null, protected: false,
    migratory: true, regions: ['southwest', 'southeast'], habitat: ['open', 'cave roosts', 'urban'],
    notes: 'Forms enormous colonies; high-flying. Long QCF calls, variable frequency.',
  },
  {
    id: 'MYLU', scientificName: 'Myotis lucifugus', commonName: 'Little brown bat', genus: 'Myotis',
    fcKhz: [38, 45], freqRangeKhz: [38, 80], durationMs: [2, 5], pulseIntervalMs: [60, 110],
    shape: ['FM'], harmonics: 1, iucn: 'EN', usFederal: 'Under review', protected: true,
    migratory: false, regions: ['national'], habitat: ['riparian', 'forest', 'buildings'],
    notes: 'Devastated by white-nose syndrome; populations collapsed >90% in the Northeast.',
  },
  {
    id: 'MYSE', scientificName: 'Myotis septentrionalis', commonName: 'Northern long-eared bat', genus: 'Myotis',
    fcKhz: [38, 45], freqRangeKhz: [40, 110], durationMs: [2, 4], pulseIntervalMs: [55, 100],
    shape: ['FM'], harmonics: 1, iucn: 'NT', usFederal: 'Endangered', protected: true,
    migratory: false, regions: ['northeast', 'midwest', 'southeast'], habitat: ['interior forest'],
    notes: 'Federally Endangered (2023). Extremely steep broadband FM calls; clutter-adapted gleaner.',
  },
  {
    id: 'MYSO', scientificName: 'Myotis sodalis', commonName: 'Indiana bat', genus: 'Myotis',
    fcKhz: [42, 50], freqRangeKhz: [42, 95], durationMs: [3, 6], pulseIntervalMs: [70, 110],
    shape: ['FM'], harmonics: 1, iucn: 'NT', usFederal: 'Endangered', protected: true,
    migratory: false, regions: ['midwest', 'northeast', 'southeast'], habitat: ['riparian forest', 'hibernacula caves'],
    notes: 'Federally Endangered. Hibernates in large clusters; survey effort heavily regulated.',
  },
  {
    id: 'MYGR', scientificName: 'Myotis grisescens', commonName: 'Gray bat', genus: 'Myotis',
    fcKhz: [42, 50], freqRangeKhz: [42, 90], durationMs: [3, 6], pulseIntervalMs: [70, 110],
    shape: ['FM'], harmonics: 1, iucn: 'NT', usFederal: 'Endangered', protected: true,
    migratory: true, regions: ['southeast', 'midwest'], habitat: ['cave-obligate', 'over water'],
    notes: 'Federally Endangered. Cave-obligate year-round; forages over rivers and reservoirs.',
  },
  {
    id: 'PESU', scientificName: 'Perimyotis subflavus', commonName: 'Tricolored bat', genus: 'Perimyotis',
    fcKhz: [40, 48], freqRangeKhz: [40, 70], durationMs: [4, 8], pulseIntervalMs: [80, 130],
    shape: ['FM-QCF'], harmonics: 1, iucn: 'VU', usFederal: 'Proposed Endangered', protected: true,
    migratory: false, regions: ['northeast', 'southeast', 'midwest'], habitat: ['forest edge', 'over water'],
    notes: 'Proposed for federal listing. Weak fluttery flight; flattening hockey-stick call near 45 kHz.',
  },
  {
    id: 'MYYU', scientificName: 'Myotis yumanensis', commonName: 'Yuma myotis', genus: 'Myotis',
    fcKhz: [48, 54], freqRangeKhz: [45, 90], durationMs: [2, 5], pulseIntervalMs: [55, 100],
    shape: ['FM'], harmonics: 1, iucn: 'LC', usFederal: null, protected: false,
    migratory: false, regions: ['west', 'southwest', 'northwest'], habitat: ['over water', 'riparian'],
    notes: 'Strongly associated with water; overlaps with California myotis acoustically.',
  },
  {
    id: 'MYCA', scientificName: 'Myotis californicus', commonName: 'California myotis', genus: 'Myotis',
    fcKhz: [48, 55], freqRangeKhz: [45, 95], durationMs: [2, 4], pulseIntervalMs: [55, 95],
    shape: ['FM'], harmonics: 1, iucn: 'LC', usFederal: null, protected: false,
    migratory: false, regions: ['west', 'southwest', 'northwest'], habitat: ['arid', 'forest edge'],
    notes: 'Small western myotis; high Fc. Difficult to separate from Yuma myotis on calls alone.',
  },
  {
    id: 'MYEV', scientificName: 'Myotis evotis', commonName: 'Long-eared myotis', genus: 'Myotis',
    fcKhz: [35, 45], freqRangeKhz: [35, 95], durationMs: [2, 4], pulseIntervalMs: [60, 110],
    shape: ['FM'], harmonics: 1, iucn: 'LC', usFederal: null, protected: false,
    migratory: false, regions: ['west', 'northwest'], habitat: ['coniferous forest'],
    notes: 'Gleaner with long ears; faint, broadband, steep FM calls often hard to detect.',
  },
  {
    id: 'ANPA', scientificName: 'Antrozous pallidus', commonName: 'Pallid bat', genus: 'Antrozous',
    fcKhz: [28, 35], freqRangeKhz: [25, 60], durationMs: [3, 6], pulseIntervalMs: [80, 140],
    shape: ['FM'], harmonics: 1, iucn: 'LC', usFederal: null, protected: false,
    migratory: false, regions: ['southwest', 'west'], habitat: ['desert', 'grassland'],
    notes: 'Ground-gleaning predator of arthropods; low-intensity FM calls, often missed acoustically.',
  },
  {
    id: 'COTO', scientificName: 'Corynorhinus townsendii', commonName: "Townsend's big-eared bat", genus: 'Corynorhinus',
    fcKhz: [22, 30], freqRangeKhz: [20, 45], durationMs: [3, 6], pulseIntervalMs: [70, 120],
    shape: ['FM'], harmonics: 1, iucn: 'LC', usFederal: 'State sensitive', protected: true,
    migratory: false, regions: ['west', 'southwest', 'northwest'], habitat: ['caves', 'mines', 'old buildings'],
    notes: 'Whispering bat with very low-intensity calls; acoustic detection unreliable. State-sensitive in much of its range.',
  },
  {
    id: 'PAHE', scientificName: 'Parastrellus hesperus', commonName: 'Canyon bat', genus: 'Parastrellus',
    fcKhz: [45, 53], freqRangeKhz: [44, 75], durationMs: [3, 7], pulseIntervalMs: [70, 120],
    shape: ['FM-QCF'], harmonics: 1, iucn: 'LC', usFederal: null, protected: false,
    migratory: false, regions: ['southwest', 'west'], habitat: ['desert canyons', 'rocky'],
    notes: 'Smallest US bat; early, high flyer. High Fc with characteristic J-shaped call.',
  },
  {
    id: 'EUPE', scientificName: 'Eumops perotis', commonName: 'Western mastiff bat', genus: 'Eumops',
    fcKhz: [8, 13], freqRangeKhz: [8, 20], durationMs: [12, 25], pulseIntervalMs: [250, 500],
    shape: ['CF', 'QCF'], harmonics: 1, iucn: 'LC', usFederal: 'State sensitive', protected: true,
    migratory: false, regions: ['southwest'], habitat: ['cliffs', 'open desert'],
    notes: 'Largest US bat. Calls so low (<15 kHz) they are audible to humans; very long pulse intervals.',
  },
  {
    id: 'NOISE', scientificName: '—', commonName: 'Non-bat / noise', genus: '—',
    fcKhz: [0, 200], freqRangeKhz: [0, 200], durationMs: [0, 500], pulseIntervalMs: [0, 5000],
    shape: ['NOISE'], harmonics: 0, iucn: null, usFederal: null, protected: false,
    migratory: false, regions: ['national'], habitat: [],
    notes: 'Insects, birds, wind, rain, vehicles and electronic noise. Filtered before identification.',
  },
];

export const SPECIES_BY_ID = SPECIES.reduce((acc, s) => { acc[s.id] = s; return acc; }, {});

export function speciesById(id) {
  return SPECIES_BY_ID[id] || null;
}

export function isProtected(id) {
  const s = SPECIES_BY_ID[id];
  return !!(s && s.protected);
}

export function conservationLabel(s) {
  if (!s || !s.iucn) return '';
  const map = { LC: 'Least Concern', NT: 'Near Threatened', VU: 'Vulnerable', EN: 'Endangered', CR: 'Critically Endangered' };
  let label = map[s.iucn] || s.iucn;
  if (s.usFederal) label += ` · ${s.usFederal}`;
  return label;
}
