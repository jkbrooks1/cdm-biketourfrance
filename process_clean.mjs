import fs from 'fs';

const rawData = JSON.parse(fs.readFileSync('/tmp/twn_infra_raw.json', 'utf8'));

// Log the structure
console.log('Total rows:', rawData.length);
console.log('Headers count:', rawData[0].length);
console.log('First data row count:', rawData[1].length);
console.log('\nHeaders:');
rawData[0].forEach((h, i) => console.log(`  ${i}: ${h}`));

console.log('\nFirst data row:');
rawData[1].forEach((v, i) => console.log(`  ${i}: ${v}`));

// Corrected data structure
const headers = rawData[0];
const dataRows = rawData.slice(1);

// Map indices properly
const indexMap = {
  rideDay: 0,
  townName: 1,
  population: 2,
  distFromStart: 3,
  wcAvailable: 4,
  wcType: 5,
  wcLocation: 6,
  boulangerieName: 7,
  boulangerieAddr: 8,
  distFromRoute: 9,
  googleLink: 10,
  appleLink: 11,
  cafeCount: 12,
  riderNotes: 13,
  townDesc: 14
};

// Group by day
const days = {};
dataRows.forEach((row, idx) => {
  const rideDay = row[indexMap.rideDay];
  const townName = row[indexMap.townName];
  const distFromStart = parseFloat(row[indexMap.distFromStart]) || 0;

  if (!rideDay || !townName) {
    console.warn(`Skipping row ${idx}: missing day or town`);
    return;
  }

  if (!days[rideDay]) days[rideDay] = [];

  days[rideDay].push({
    mile: distFromStart,
    town: townName,
    population: parseInt(row[indexMap.population]) || 0,
    wc: row[indexMap.wcAvailable]?.toUpperCase() === 'Y',
    wcType: row[indexMap.wcType],
    wcLocation: row[indexMap.wcLocation],
    bakery: row[indexMap.boulangerieName],
    bakeryAddr: row[indexMap.boulangerieAddr],
    distFromRoute: row[indexMap.distFromRoute],
    cafeCount: row[indexMap.cafeCount],
    notes: row[indexMap.riderNotes],
    desc: row[indexMap.townDesc]
  });
});

// Sort each day by mileage
Object.keys(days).forEach(day => {
  days[day].sort((a, b) => a.mile - b.mile);
});

// Generate markdown tables
console.log('\n\n# DAILY INFRASTRUCTURE REFERENCE TABLES\n');

Object.keys(days).sort((a, b) => parseInt(a) - parseInt(b)).forEach(day => {
  const dayNum = parseInt(day);
  
  console.log(`## Day ${dayNum}\n`);
  console.log('| Mile | Service | Facilities | Town | Location |');
  console.log('|------|---------|------------|------|----------|');

  days[day].forEach(town => {
    const services = [];
    const facilities = [];

    // WC
    if (town.wc && town.wcType && town.wcLocation) {
      services.push('WC');
      facilities.push(`${town.wcType} (${town.wcLocation})`);
    }

    // Bakery
    if (town.bakery) {
      services.push('F');
      let bakeryStr = town.bakery;
      if (town.bakeryAddr) {
        bakeryStr += ` — ${town.bakeryAddr}`;
      }
      facilities.push(bakeryStr);
    }

    // Cafes
    if (town.cafeCount) {
      const cafeNum = town.cafeCount.replace(/\D/g, '') || '?';
      services.push('F');
      facilities.push(`Cafés (${town.cafeCount})`);
    }

    const serviceStr = [...new Set(services)].join('/') || '—';
    const facilitiesStr = facilities.join('; ') || '—';

    // Distance classification
    let distClass = 'on-route';
    const distStr = town.distFromRoute?.toLowerCase() || '';
    if (distStr === 'off-route') {
      distClass = 'off-route';
    } else if (distStr.includes('~')) {
      const meters = parseInt(distStr.match(/\d+/)?.[0]) || 0;
      if (meters >= 200) {
        distClass = `${meters}m`;
      }
    } else if (distStr.includes('nearby')) {
      distClass = 'on-route';
    }

    const locationStr = `${town.town} — ${distClass}`;

    console.log(`| ${town.mile.toFixed(1)} | ${serviceStr} | ${facilitiesStr} | ${town.town} | ${locationStr} |`);
  });

  console.log('');
});

// Save structured data
fs.writeFileSync('/tmp/final_infrastructure.json', JSON.stringify(days, null, 2));
console.log('✓ Saved to /tmp/final_infrastructure.json');
