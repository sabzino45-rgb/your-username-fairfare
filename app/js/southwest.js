// South West England: towns and the places that reliably bring fares.
// Hours are TYPICAL patterns by kind of place, not live data. The app says so on screen.
// Days: 0 = Monday ... 6 = Sunday. Hours are 24h; an end below the start runs past midnight.

const WEEKDAYS = [0, 1, 2, 3, 4];
const ALL = [0, 1, 2, 3, 4, 5, 6];

// Default demand pattern for each kind of place: [days, start, end, weight]
export const KIND_PATTERNS = {
  station:   [[WEEKDAYS, 7, 9, 2], [WEEKDAYS, 16, 19, 2], [[4, 6], 18, 23, 2]],
  airport:   [[ALL, 5, 8, 2], [ALL, 14, 17, 2], [ALL, 21, 24, 3]],
  hospital:  [[WEEKDAYS, 8, 11, 2], [WEEKDAYS, 14, 18, 1]],
  nightlife: [[[4, 5], 22, 3, 6], [[3], 22, 1, 2], [[4, 5], 19, 22, 2]],
  stadium:   [],                     // event days only - add the fixture as an event
  retail:    [[[5], 11, 18, 2], [[6], 11, 16, 1]],
  university:[[[0, 1, 2, 3], 16, 19, 1], [[3, 4], 22, 2, 1]],
  port:      [[ALL, 7, 10, 1], [ALL, 18, 22, 1]],
  venue:     [],                     // event days only
};

export const KIND_ICON = {
  station: "train", airport: "plane", hospital: "hospital", nightlife: "music",
  stadium: "stadium", retail: "bag", university: "school", port: "ship", venue: "ticket",
};

export const TOWNS = [
  { id: "bristol", name: "Bristol", places: [
    { name: "Bristol Temple Meads", kind: "station" },
    { name: "Bristol Airport", kind: "airport", area: "Lulsgate" },
    { name: "Southmead Hospital", kind: "hospital" },
    { name: "Bristol Royal Infirmary", kind: "hospital" },
    { name: "Harbourside and Park Street", kind: "nightlife" },
    { name: "Cabot Circus", kind: "retail" },
    { name: "Ashton Gate", kind: "stadium", area: "Bristol City and Bristol Bears" },
  ]},
  { id: "bath", name: "Bath", places: [
    { name: "Bath Spa station", kind: "station" },
    { name: "Royal United Hospital", kind: "hospital" },
    { name: "George Street and city centre", kind: "nightlife" },
    { name: "The Rec", kind: "stadium", area: "Bath Rugby" },
    { name: "University of Bath", kind: "university", area: "Claverton Down" },
  ]},
  { id: "exeter", name: "Exeter", places: [
    { name: "Exeter St Davids", kind: "station" },
    { name: "Exeter Airport", kind: "airport" },
    { name: "Royal Devon and Exeter Hospital", kind: "hospital", area: "Wonford" },
    { name: "Exeter Quay and city centre", kind: "nightlife" },
    { name: "University of Exeter", kind: "university" },
    { name: "Sandy Park", kind: "stadium", area: "Exeter Chiefs" },
    { name: "St James Park", kind: "stadium", area: "Exeter City" },
  ]},
  { id: "torquay", name: "Torquay", places: [
    { name: "Torquay station", kind: "station" },
    { name: "Torbay Hospital", kind: "hospital", area: "Lowes Bridge" },
    { name: "Torquay harbourside", kind: "nightlife" },
    { name: "Plainmoor", kind: "stadium", area: "Torquay United" },
  ]},
  { id: "plymouth", name: "Plymouth", places: [
    { name: "Plymouth station", kind: "station" },
    { name: "Derriford Hospital", kind: "hospital" },
    { name: "Barbican and Union Street", kind: "nightlife" },
    { name: "Millbay ferry port", kind: "port" },
    { name: "Home Park", kind: "stadium", area: "Plymouth Argyle" },
    { name: "University of Plymouth", kind: "university" },
  ]},
  { id: "newquay", name: "Newquay", places: [
    { name: "Cornwall Airport Newquay", kind: "airport" },
    { name: "Newquay station", kind: "station" },
    { name: "Newquay town centre", kind: "nightlife" },
  ]},
  { id: "truro", name: "Truro", places: [
    { name: "Truro station", kind: "station" },
    { name: "Royal Cornwall Hospital", kind: "hospital", area: "Treliske" },
    { name: "Hall for Cornwall", kind: "venue" },
  ]},
  { id: "taunton", name: "Taunton", places: [
    { name: "Taunton station", kind: "station" },
    { name: "Musgrove Park Hospital", kind: "hospital" },
    { name: "County Ground", kind: "stadium", area: "Somerset cricket" },
  ]},
  { id: "cheltenham", name: "Cheltenham", places: [
    { name: "Cheltenham Spa station", kind: "station" },
    { name: "Cheltenham General Hospital", kind: "hospital" },
    { name: "Cheltenham Racecourse", kind: "stadium" },
  ]},
  { id: "bournemouth", name: "Bournemouth", places: [
    { name: "Bournemouth station", kind: "station" },
    { name: "Bournemouth Airport", kind: "airport", area: "Hurn" },
    { name: "Royal Bournemouth Hospital", kind: "hospital" },
    { name: "Town centre and Old Christchurch Road", kind: "nightlife" },
    { name: "Bournemouth International Centre", kind: "venue" },
    { name: "Vitality Stadium", kind: "stadium", area: "AFC Bournemouth" },
  ]},
];

// Hour bands for the week grid
export const BANDS = [[6, 10], [10, 14], [14, 18], [18, 22], [22, 26]];
