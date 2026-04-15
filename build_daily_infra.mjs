import fs from 'fs';

// Load all data
const routeStops = JSON.parse(fs.readFileSync('/tmp/route_stops.json', 'utf8'));
const infraRaw = JSON.parse(fs.readFileSync('/tmp/twn_infra_raw.json', 'utf8'));
const tourData = JSON.parse(fs.readFileSync('src/data/tour-data.json', 'utf8'));

// Build route stops map by town name
const routeMap = {};
routeStops.slice(1).forEach(row => {
  const town = row[0];
  const routeMP = parseFloat(row[2]);
  routeMap[town] = { routeMP, population: row[1] };
});

// Build infra map by town + ride day
const infraMap = {};
infraRaw.slice(1).forEach(row => {
  const town = row[1];
  const rideDay = parseInt(row[0]);
  const key = `${rideDay}:${town}`;
  infraMap[key] = {
    wcAvailable: row[4]?.toUpperCase() === 'Y',
    wcType: row[5],
    wcLocation: row[6],
    bakery: row[7],
    bakeryAddr: row[8],
    distFromRoute: row[9],
    cafeCount: row[12],
    notes: row[13]
  };
});

// Calculate cumulative day starts
const dayStarts = {};
let cumulative = 0;
let rideDay = 0;
tourData.rides.forEach(r => {
  if (r.rideType === 'rest' || r.rideType === 'arrival' || r.rideType === 'train') return;
  rideDay++;
  dayStarts[rideDay] = cumulative;
  cumulative += r.miles;
});

console.log('Day starts (cumulative miles):');
Object.entries(dayStarts).forEach(([day, start]) => {
  console.log(`  Day ${day}: ${start.toFixed(2)} - ${(start + tourData.rides.find(r => r.rideType === 'ride' && r.tourDayNum == day)?.miles || 0).toFixed(2)}`);
});

// Organize by day
const days = {};
Object.entries(routeMap).forEach(([town, info]) => {
  // Find which ride day this town belongs to
  for (let day = 1; day <= 9; day++) {
    const dayStart = dayStarts[day] || 0;
    const dayEnd = dayStart + (tourData.rides.find(r => r.tourDayNum == day)?.miles || 0);
    
    if (info.routeMP >= dayStart && info.routeMP <= dayEnd) {
      if (!days[day]) days[day] = [];
      
      const dayFromStart = info.routeMP - dayStart;
      const infraKey = `${day}:${town}`;
      const infra = infraMap[infraKey] || infraMap[`1:${town}`] || {}; // Fallback
      
      days[day].push({
        dayFromStart,
        town,
        routeMP: info.routeMP,
        ...infra
      });
      break;
    }
  }
});

// Sort each day by distance from start
Object.keys(days).forEach(day => {
  days[day].sort((a, b) => a.dayFromStart - b.dayFromStart);
});

// Output markdown tables
console.log('\n\n# DAILY INFRASTRUCTURE REFERENCE\n');

Object.keys(days).sort((a, b) => parseInt(a) - parseInt(b)).forEach(day => {
  console.log(`## Day ${day}\n`);
  console.log('| Mile | Service | Facilities | Town | Location |');
  console.log('|------|---------|------------|------|----------|');

  days[day].forEach(town => {
    const services = [];
    const facilities = [];

    // WC
    if (town.wcAvailable && town.wcType) {
      services.push('WC');
      facilities.push(`${town.wcType}${town.wcLocation ? ` (${town.wcLocation})` : ''}`);
    }

    // Bakery
    if (town.bakery) {
      if (!services.includes('F')) services.push('F');
      let s = town.bakery;
      if (town.bakeryAddr) s += ` — ${town.bakeryAddr}`;
      facilities.push(s);
    }

    // Cafes
    if (town.cafeCount && town.cafeCount !== '0') {
      if (!services.includes('F')) services.push('F');
      facilities.push(`Cafés (${town.cafeCount})`);
    }

    const serviceStr = services.join('/') || '—';
    const facilitiesStr = facilities.join('; ') || '—';

    // Distance from route
    let distClass = 'on-route';
    const d = town.distFromRoute?.toLowerCase() || '';
    if (d === 'off-route') {
      distClass = 'off-route';
    } else if (d.includes('~')) {
      const m = parseInt(d.match(/\d+/)?.[0]);
      if (m >= 200) distClass = `${m}m`;
    } else if (d.includes('nearby')) {
      distClass = 'on-route';
    }

    console.log(`| ${town.dayFromStart.toFixed(1)} | ${serviceStr} | ${facilitiesStr} | ${town.town} | ${distClass} |`);
  });

  console.log('');
});

fs.writeFileSync('/tmp/final_daily_infra.json', JSON.stringify(days, null, 2));
console.log('✓ Saved to /tmp/final_daily_infra.json');
