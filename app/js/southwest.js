// South West England: every city and sizeable town, by county, with the places that reliably bring fares.
// Places are listed only where we are confident they exist; a town without listed places still gets
// the normal town-centre pattern. Busy hours are TYPICAL patterns by kind of place, not live data.
// Coordinates are approximate town centres, used to find the nearest town and to place live events.
// Days: 0 = Monday ... 6 = Sunday. Hours are 24h; an end below the start runs past midnight.

const WEEKDAYS = [0, 1, 2, 3, 4];
const ALL = [0, 1, 2, 3, 4, 5, 6];

// Default demand pattern for each kind of place: [days, start, end, weight]
export const KIND_PATTERNS = {
  station:    [[WEEKDAYS, 7, 9, 2], [WEEKDAYS, 16, 19, 2], [[4, 6], 18, 23, 2]],
  airport:    [[ALL, 5, 8, 2], [ALL, 14, 17, 2], [ALL, 21, 24, 3]],
  hospital:   [[WEEKDAYS, 8, 11, 2], [WEEKDAYS, 14, 18, 1]],
  nightlife:  [[[4, 5], 22, 3, 6], [[3], 22, 1, 2], [[4, 5], 19, 22, 2]],
  stadium:    [],   // event days only
  venue:      [],   // event days only
  retail:     [[[5], 11, 18, 2], [[6], 11, 16, 1]],
  university: [[[0, 1, 2, 3], 16, 19, 1], [[3, 4], 22, 2, 1]],
  port:       [[ALL, 7, 10, 1], [ALL, 18, 22, 1]],
};

export const KIND_ICON = {
  station: "train", airport: "plane", hospital: "hospital", nightlife: "music",
  stadium: "stadium", retail: "bag", university: "school", port: "ship", venue: "ticket",
};

export const COUNTIES = ["Bristol and Bath", "Somerset", "Devon", "Cornwall and Scilly", "Dorset", "Wiltshire", "Gloucestershire"];

// [id, name, county index, lat, lon, places: [name, kind, note?][]]
const RAW = [
  // Bristol, Bath, North Somerset, South Gloucestershire
  ["bristol", "Bristol", 0, 51.454, -2.588, [
    ["Bristol Temple Meads", "station"], ["Bristol Parkway", "station"], ["Bristol Airport", "airport", "Lulsgate"],
    ["Southmead Hospital", "hospital"], ["Bristol Royal Infirmary", "hospital"],
    ["Harbourside and Park Street", "nightlife"], ["Cabot Circus", "retail"], ["The Mall at Cribbs Causeway", "retail"],
    ["University of Bristol", "university"], ["UWE Bristol", "university", "Frenchay"],
    ["Ashton Gate", "stadium", "Bristol City and Bristol Bears"], ["Memorial Stadium", "stadium", "Bristol Rovers"],
    ["Bristol Beacon", "venue"], ["O2 Academy Bristol", "venue"]]],
  ["bath", "Bath", 0, 51.381, -2.359, [
    ["Bath Spa station", "station"], ["Royal United Hospital", "hospital"], ["George Street and city centre", "nightlife"],
    ["University of Bath", "university", "Claverton Down"], ["The Rec", "stadium", "Bath Rugby"]]],
  ["weston", "Weston-super-Mare", 0, 51.346, -2.977, [
    ["Weston-super-Mare station", "station"], ["Weston General Hospital", "hospital"], ["Weston town centre and seafront", "nightlife"]]],
  ["clevedon", "Clevedon", 0, 51.442, -2.854, []],
  ["portishead", "Portishead", 0, 51.483, -2.768, []],
  ["nailsea", "Nailsea", 0, 51.432, -2.757, [["Nailsea and Backwell station", "station"]]],
  ["keynsham", "Keynsham", 0, 51.414, -2.497, [["Keynsham station", "station"]]],
  ["midsomer-norton", "Midsomer Norton", 0, 51.284, -2.484, []],
  ["thornbury", "Thornbury", 0, 51.609, -2.524, []],
  ["yate", "Yate", 0, 51.540, -2.411, [["Yate station", "station"]]],
  ["kingswood", "Kingswood", 0, 51.453, -2.508, []],
  ["bradley-stoke", "Bradley Stoke", 0, 51.530, -2.546, []],

  // Somerset
  ["taunton", "Taunton", 1, 51.015, -3.103, [
    ["Taunton station", "station"], ["Musgrove Park Hospital", "hospital"], ["Taunton town centre", "nightlife"],
    ["County Ground", "stadium", "Somerset cricket"]]],
  ["bridgwater", "Bridgwater", 1, 51.128, -3.003, [["Bridgwater station", "station"]]],
  ["yeovil", "Yeovil", 1, 50.942, -2.633, [
    ["Yeovil Junction", "station"], ["Yeovil Pen Mill", "station"], ["Yeovil District Hospital", "hospital"],
    ["Huish Park", "stadium", "Yeovil Town"]]],
  ["frome", "Frome", 1, 51.228, -2.322, [["Frome station", "station"], ["Cheese and Grain", "venue"]]],
  ["wells", "Wells", 1, 51.209, -2.647, []],
  ["glastonbury", "Glastonbury", 1, 51.148, -2.714, [["Worthy Farm, Pilton", "venue", "Glastonbury Festival"]]],
  ["street", "Street", 1, 51.127, -2.740, [["Clarks Village", "retail"]]],
  ["minehead", "Minehead", 1, 51.204, -3.479, [["Butlin's Minehead", "venue"]]],
  ["burnham", "Burnham-on-Sea", 1, 51.238, -2.997, [["Highbridge and Burnham station", "station"]]],
  ["chard", "Chard", 1, 50.873, -2.959, []],
  ["shepton-mallet", "Shepton Mallet", 1, 51.190, -2.546, [["Royal Bath and West Showground", "venue"]]],
  ["wellington", "Wellington", 1, 50.978, -3.224, []],
  ["crewkerne", "Crewkerne", 1, 50.883, -2.794, [["Crewkerne station", "station"]]],
  ["cheddar", "Cheddar", 1, 51.279, -2.778, []],

  // Devon
  ["exeter", "Exeter", 2, 50.718, -3.534, [
    ["Exeter St Davids", "station"], ["Exeter Central", "station"], ["Exeter Airport", "airport"],
    ["Royal Devon and Exeter Hospital", "hospital", "Wonford"], ["Exeter Quay and city centre", "nightlife"],
    ["University of Exeter", "university"], ["Sandy Park", "stadium", "Exeter Chiefs"], ["St James Park", "stadium", "Exeter City"]]],
  ["plymouth", "Plymouth", 2, 50.375, -4.143, [
    ["Plymouth station", "station"], ["Derriford Hospital", "hospital"], ["Barbican and Union Street", "nightlife"],
    ["Millbay ferry port", "port"], ["University of Plymouth", "university"], ["Home Park", "stadium", "Plymouth Argyle"],
    ["Theatre Royal Plymouth", "venue"]]],
  ["torquay", "Torquay", 2, 50.462, -3.525, [
    ["Torquay station", "station"], ["Torbay Hospital", "hospital", "Lowes Bridge"], ["Torquay harbourside", "nightlife"],
    ["Plainmoor", "stadium", "Torquay United"]]],
  ["paignton", "Paignton", 2, 50.435, -3.565, [["Paignton station", "station"], ["Paignton seafront", "nightlife"]]],
  ["brixham", "Brixham", 2, 50.395, -3.514, []],
  ["newton-abbot", "Newton Abbot", 2, 50.528, -3.609, [["Newton Abbot station", "station"], ["Newton Abbot Racecourse", "stadium"]]],
  ["exmouth", "Exmouth", 2, 50.620, -3.413, [["Exmouth station", "station"]]],
  ["barnstaple", "Barnstaple", 2, 51.080, -4.058, [["Barnstaple station", "station"], ["North Devon District Hospital", "hospital"]]],
  ["bideford", "Bideford", 2, 51.016, -4.207, []],
  ["ilfracombe", "Ilfracombe", 2, 51.208, -4.122, []],
  ["tiverton", "Tiverton", 2, 50.902, -3.488, [["Tiverton Parkway", "station", "Sampford Peverell"]]],
  ["cullompton", "Cullompton", 2, 50.857, -3.393, []],
  ["totnes", "Totnes", 2, 50.432, -3.684, [["Totnes station", "station"]]],
  ["dartmouth", "Dartmouth", 2, 50.351, -3.579, []],
  ["teignmouth", "Teignmouth", 2, 50.547, -3.494, [["Teignmouth station", "station"]]],
  ["dawlish", "Dawlish", 2, 50.581, -3.466, [["Dawlish station", "station"]]],
  ["okehampton", "Okehampton", 2, 50.739, -4.004, [["Okehampton station", "station"]]],
  ["tavistock", "Tavistock", 2, 50.549, -4.144, []],
  ["honiton", "Honiton", 2, 50.800, -3.189, [["Honiton station", "station"]]],
  ["sidmouth", "Sidmouth", 2, 50.680, -3.239, []],
  ["kingsbridge", "Kingsbridge", 2, 50.284, -3.777, []],
  ["crediton", "Crediton", 2, 50.791, -3.656, [["Crediton station", "station"]]],
  ["ivybridge", "Ivybridge", 2, 50.389, -3.920, [["Ivybridge station", "station"]]],
  ["axminster", "Axminster", 2, 50.781, -2.996, [["Axminster station", "station"]]],
  ["seaton", "Seaton", 2, 50.705, -3.072, []],

  // Cornwall and the Isles of Scilly
  ["truro", "Truro", 3, 50.263, -5.051, [
    ["Truro station", "station"], ["Royal Cornwall Hospital", "hospital", "Treliske"], ["Hall for Cornwall", "venue"]]],
  ["newquay", "Newquay", 3, 50.415, -5.073, [
    ["Cornwall Airport Newquay", "airport"], ["Newquay station", "station"], ["Newquay town centre", "nightlife"]]],
  ["falmouth", "Falmouth", 3, 50.154, -5.071, [["Falmouth Town station", "station"], ["Falmouth town centre", "nightlife"]]],
  ["penryn", "Penryn", 3, 50.169, -5.107, [["Penryn station", "station"], ["Penryn Campus", "university", "Falmouth University and University of Exeter"]]],
  ["penzance", "Penzance", 3, 50.119, -5.537, [
    ["Penzance station", "station"], ["West Cornwall Hospital", "hospital"], ["Penzance harbour", "port", "Isles of Scilly ferry"],
    ["Land's End Airport", "airport", "St Just"]]],
  ["st-ives", "St Ives", 3, 50.210, -5.480, [["St Ives station", "station"]]],
  ["camborne", "Camborne", 3, 50.213, -5.300, [["Camborne station", "station"]]],
  ["redruth", "Redruth", 3, 50.233, -5.226, [["Redruth station", "station"]]],
  ["st-austell", "St Austell", 3, 50.340, -4.790, [["St Austell station", "station"], ["Eden Project", "venue", "Eden Sessions"]]],
  ["bodmin", "Bodmin", 3, 50.471, -4.719, [["Bodmin Parkway", "station"]]],
  ["liskeard", "Liskeard", 3, 50.455, -4.465, [["Liskeard station", "station"]]],
  ["launceston", "Launceston", 3, 50.636, -4.360, []],
  ["bude", "Bude", 3, 50.829, -4.543, []],
  ["saltash", "Saltash", 3, 50.409, -4.212, [["Saltash station", "station"]]],
  ["torpoint", "Torpoint", 3, 50.375, -4.195, [["Torpoint Ferry", "port"]]],
  ["hayle", "Hayle", 3, 50.186, -5.420, [["Hayle station", "station"]]],
  ["helston", "Helston", 3, 50.101, -5.274, []],
  ["wadebridge", "Wadebridge", 3, 50.517, -4.835, [["Royal Cornwall Showground", "venue"]]],
  ["padstow", "Padstow", 3, 50.542, -4.938, []],
  ["looe", "Looe", 3, 50.354, -4.454, [["Looe station", "station"]]],
  ["st-marys", "St Mary's (Isles of Scilly)", 3, 49.914, -6.312, [["St Mary's Airport", "airport"]]],

  // Dorset
  ["bournemouth", "Bournemouth", 4, 50.720, -1.880, [
    ["Bournemouth station", "station"], ["Bournemouth Airport", "airport", "Hurn"], ["Royal Bournemouth Hospital", "hospital"],
    ["Town centre and Old Christchurch Road", "nightlife"], ["Bournemouth University", "university"],
    ["Bournemouth International Centre", "venue"], ["Vitality Stadium", "stadium", "AFC Bournemouth"]]],
  ["poole", "Poole", 4, 50.715, -1.987, [
    ["Poole station", "station"], ["Poole Hospital", "hospital"], ["Poole ferry port", "port"], ["Lighthouse Poole", "venue"]]],
  ["christchurch", "Christchurch", 4, 50.735, -1.778, [["Christchurch station", "station"]]],
  ["weymouth", "Weymouth", 4, 50.614, -2.457, [["Weymouth station", "station"], ["Weymouth seafront", "nightlife"]]],
  ["dorchester", "Dorchester", 4, 50.715, -2.437, [["Dorchester South station", "station"], ["Dorset County Hospital", "hospital"]]],
  ["portland", "Portland", 4, 50.548, -2.441, [["Portland Port", "port"]]],
  ["bridport", "Bridport", 4, 50.733, -2.758, []],
  ["lyme-regis", "Lyme Regis", 4, 50.725, -2.937, []],
  ["swanage", "Swanage", 4, 50.609, -1.960, []],
  ["wareham", "Wareham", 4, 50.687, -2.110, [["Wareham station", "station"]]],
  ["wimborne", "Wimborne Minster", 4, 50.800, -1.986, []],
  ["ferndown", "Ferndown", 4, 50.807, -1.900, []],
  ["verwood", "Verwood", 4, 50.881, -1.877, []],
  ["blandford", "Blandford Forum", 4, 50.856, -2.165, []],
  ["sherborne", "Sherborne", 4, 50.947, -2.517, [["Sherborne station", "station"]]],
  ["shaftesbury", "Shaftesbury", 4, 51.005, -2.197, []],
  ["gillingham-dorset", "Gillingham", 4, 51.038, -2.276, [["Gillingham station", "station"]]],

  // Wiltshire
  ["swindon", "Swindon", 5, 51.556, -1.780, [
    ["Swindon station", "station"], ["Great Western Hospital", "hospital"], ["Swindon town centre", "nightlife"],
    ["Swindon Designer Outlet", "retail"], ["County Ground", "stadium", "Swindon Town"]]],
  ["salisbury", "Salisbury", 5, 51.069, -1.795, [["Salisbury station", "station"], ["Salisbury District Hospital", "hospital"], ["Salisbury city centre", "nightlife"]]],
  ["chippenham", "Chippenham", 5, 51.458, -2.116, [["Chippenham station", "station"]]],
  ["trowbridge", "Trowbridge", 5, 51.320, -2.208, [["Trowbridge station", "station"]]],
  ["devizes", "Devizes", 5, 51.351, -1.995, []],
  ["marlborough", "Marlborough", 5, 51.419, -1.729, []],
  ["warminster", "Warminster", 5, 51.205, -2.181, [["Warminster station", "station"]]],
  ["melksham", "Melksham", 5, 51.373, -2.138, [["Melksham station", "station"]]],
  ["calne", "Calne", 5, 51.438, -2.005, []],
  ["corsham", "Corsham", 5, 51.430, -2.187, []],
  ["amesbury", "Amesbury", 5, 51.173, -1.780, []],
  ["westbury", "Westbury", 5, 51.260, -2.187, [["Westbury station", "station"]]],
  ["bradford-on-avon", "Bradford on Avon", 5, 51.347, -2.251, [["Bradford on Avon station", "station"]]],
  ["wootton-bassett", "Royal Wootton Bassett", 5, 51.539, -1.903, []],
  ["tidworth", "Tidworth", 5, 51.239, -1.663, []],
  ["malmesbury", "Malmesbury", 5, 51.584, -2.098, []],

  // Gloucestershire
  ["gloucester", "Gloucester", 6, 51.864, -2.244, [
    ["Gloucester station", "station"], ["Gloucestershire Royal Hospital", "hospital"], ["Gloucester city centre", "nightlife"],
    ["Gloucester Quays", "retail"], ["Kingsholm", "stadium", "Gloucester Rugby"]]],
  ["cheltenham", "Cheltenham", 6, 51.899, -2.078, [
    ["Cheltenham Spa station", "station"], ["Cheltenham General Hospital", "hospital"], ["Cheltenham town centre", "nightlife"],
    ["Cheltenham Racecourse", "stadium"]]],
  ["stroud", "Stroud", 6, 51.745, -2.217, [["Stroud station", "station"]]],
  ["cirencester", "Cirencester", 6, 51.718, -1.968, []],
  ["tewkesbury", "Tewkesbury", 6, 51.993, -2.160, [["Ashchurch for Tewkesbury", "station"]]],
  ["lydney", "Lydney", 6, 51.728, -2.530, [["Lydney station", "station"]]],
  ["cinderford", "Cinderford", 6, 51.824, -2.499, []],
  ["coleford", "Coleford", 6, 51.795, -2.616, []],
  ["dursley", "Dursley", 6, 51.681, -2.354, [["Cam and Dursley station", "station"]]],
  ["moreton", "Moreton-in-Marsh", 6, 51.990, -1.703, [["Moreton-in-Marsh station", "station"]]],
  ["stow", "Stow-on-the-Wold", 6, 51.930, -1.722, []],
  ["bourton", "Bourton-on-the-Water", 6, 51.885, -1.758, []],
  ["tetbury", "Tetbury", 6, 51.637, -2.159, []],
];

export const TOWNS = RAW.map(([id, name, c, lat, lon, places]) => ({
  id, name, county: COUNTIES[c], lat, lon,
  places: places.map(([pname, kind, area]) => ({ name: pname, kind, area })),
}));

// Distance in km between two points
export function km(aLat, aLon, bLat, bLon) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Nearest town to a point, or null if none within maxKm
export function nearestTown(lat, lon, maxKm = 20) {
  let best = null, bestD = Infinity;
  for (const t of TOWNS) {
    const d = km(lat, lon, t.lat, t.lon);
    if (d < bestD) { best = t; bestD = d; }
  }
  return bestD <= maxKm ? best : null;
}

// Hour bands for the week grid
export const BANDS = [[6, 10], [10, 14], [14, 18], [18, 22], [22, 26]];
