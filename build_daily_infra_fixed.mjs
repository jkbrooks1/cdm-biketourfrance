import fs from 'fs';

const routeStops = JSON.parse(fs.readFileSync('/tmp/route_stops.json', 'utf8'));
const infraRaw = JSON.parse(fs.readFileSync('/tmp/twn_infra_raw.json', 'utf8'));
const tourData = JSON.parse(fs.readFileSync('src/data/tour-data.json', 'utf8'));

// Build route stops map
const routeMap = {};
routeStops.slice(1).forEach(row => {
  const town = row[0];
  const routeMP = parseFloat(row[2]);
  routeMap[town] = { routeMP, population: row[1] };
});

// Build infra map (use Ride_Day from infrastructure)
const infraMap = {};
infraRaw.slice(1).forEach(row => {
  const town = row[1];
  const infraKey = town.toLowerCase();
  infraMap[infraKey] = {
    wcAvailable: row[4]?.toUpperCase() === 'Y',
    wcType: row[5],
    wcLocation: row[6],
    bakery: row[7],
    bakeryAddr: row[8],
    distFromRoute: row[9],
    cafeCount: row[12]
  };
});

// Build day boundaries from tour data (including REST days)
const dayBoundaries = [];
let cumulative = 0;
tourData.rides.forEach(ride => {
  dayBoundaries.push({
    tourDay: ride.tourDayNum,
    type: ride.rideType,
    start: cumulative,
    miles: ride.miles,
    end: cumulative + ride.miles
  });
  if (ride.rideType === 'ride') {
    cumulative += ride.miles;
  }
});

console.log('Day boundaries:');
dayBoundaries.forEach(d => {
  if (d.type === 'ride') {
    console.log(`  TourDay ${d.tourDay}: ${d.start.toFixed(2)} - ${d.end.toFixed(2)} (${d.miles} mi)`);
  } else {
    console.log(`  TourDay ${d.tourDay}: ${d.type.toUpperCase()}`);
  }
});

// Organize by tour day
const days = {};
Object.entries(routeMap).forEach(([town, info]) => {
  // Find which tour day this town belongs to
  dayBoundaries.forEach(day => {
    if (day.type === 'ride' && info.routeMP >= day.start && info.routeMP <= day.end) {
      const tourDay = day.tourDay;
      if (!days[tourDay]) days[tourDay] = [];
      
      const dayFromStart = info.routeMP - day.start;
      const infraKey = town.toLowerCase();
      const infra = infraMap[infraKey] || {};
      
      days[tourDay].push({
        dayFromStart,
        town,
        ...infra
      });
    }
  });
});

// Sort each day by distance
Object.keys(days).forEach(day => {
  days[day].sort((a, b) => a.dayFromStart - b.dayFromStart);
});

// Output
console.log('\n\n# DAILY INFRASTRUCTURE REFERENCE\n');

Object.keys(days).sort((a, b) => parseInt(a) - parseInt(b)).forEach(tourDay => {
  if (!days[tourDay].length) return;
  
  console.log(`## Day ${tourDay}\n`);
  console.log('| Mile | Service | Facilities | Town | Location |');
  console.log('|------|---------|------------|------|----------|');

  days[tourDay].forEach(town => {
    const services = [];
    const facilities = [];

    if (town.wcAvailable && town.wcType) {
      services.push('WC');
      facilities.push(`${town.wcType}${town.wcLocation ? ` (${town.wcLocation})` : ''}`);
    }

    if (town.bakery) {
      if (!services.includes('F')) services.push('F');
      let s = town.bakery;
      if (town.bakeryAddr) s += ` — ${town.bakeryAddr}`;
      facilities.push(s);
    }

    if (town.cafeCount && town.cafeCount !== '0') {
      if (!services.includes('F')) services.push('F');
      facilities.push(`Cafés`);
    }

    const serviceStr = services.join('/') || '—';
    const facilitiesStr = facilities.join('; ') || '—';

    let distClass = 'on-route';
    const d = town.distFromRoute?.toLowerCase() || '';
    if (d === 'off-route') {
      distClass = 'off-route';
    } else if (d.includes('~')) {
      const m = parseInt(d.match(/\d+/)?.[0]);
      if (m >= 200) distClass = `${m}m`;
    }

    console.log(`| ${town.dayFromStart.toFixed(1)} | ${serviceStr} | ${facilitiesStr} | ${town.town} | ${distClass} |`);
  });

  console.log('');
});

fs.writeFileSync('/tmp/daily_infra_final.json', JSON.stringify(days, null, 2));
console.log('✓ Saved');
