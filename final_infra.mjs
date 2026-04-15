import fs from 'fs';

const routeStops = JSON.parse(fs.readFileSync('/tmp/route_stops.json', 'utf8'));
const infraRaw = JSON.parse(fs.readFileSync('/tmp/twn_infra_raw.json', 'utf8'));
const tourData = JSON.parse(fs.readFileSync('src/data/tour-data.json', 'utf8'));

const routeMap = {};
routeStops.slice(1).forEach(row => {
  routeMap[row[0]] = parseFloat(row[2]);
});

const infraMap = {};
infraRaw.slice(1).forEach(row => {
  infraMap[row[1]] = {
    wc: row[4]?.toUpperCase() === 'Y',
    wcType: row[5],
    wcLoc: row[6],
    bakery: row[7],
    bakeryAddr: row[8],
    distRoute: row[9],
    cafes: row[12]
  };
});

const dayBoundaries = [];
let cumul = 0;
tourData.rides.forEach(r => {
  dayBoundaries.push({
    day: r.tourDayNum,
    type: r.rideType,
    startCumul: cumul,
    miles: r.miles,
    endCumul: cumul + r.miles
  });
  if (r.rideType === 'ride') cumul += r.miles;
});

const days = {};
Object.entries(routeMap).forEach(([town, routeMP]) => {
  dayBoundaries.forEach(d => {
    if (d.type === 'ride' && routeMP >= d.startCumul && routeMP <= d.endCumul) {
      if (!days[d.day]) days[d.day] = [];
      const dayFromStart = routeMP - d.startCumul;
      const infra = infraMap[town] || {};
      days[d.day].push({ dayFromStart, town, ...infra });
    }
  });
});

Object.keys(days).forEach(d => days[d].sort((a, b) => a.dayFromStart - b.dayFromStart));

const round = n => Math.round(n * 10) / 10;

let output = '# DAILY INFRASTRUCTURE REFERENCE\n\n';

Object.keys(days).sort((a, b) => parseInt(a) - parseInt(b)).forEach(day => {
  if (!days[day].length) return;
  const dayInfo = dayBoundaries.find(d => d.day == day);
  output += `## Day ${day} (${round(dayInfo.miles)} miles)\n\n`;
  output += '| Mile | Service | Facilities | Town | Location |\n';
  output += '|------|---------|------------|------|----------|\n';

  days[day].forEach(t => {
    const services = [];
    const facilities = [];
    
    if (t.wc && t.wcType) {
      services.push('WC');
      facilities.push(`${t.wcType}${t.wcLoc ? ` (${t.wcLoc})` : ''}`);
    }
    if (t.bakery) {
      if (!services.includes('F')) services.push('F');
      facilities.push(t.bakery + (t.bakeryAddr ? ` — ${t.bakeryAddr}` : ''));
    }
    if (t.cafes && t.cafes !== '0') {
      if (!services.includes('F')) services.push('F');
      facilities.push('Cafés');
    }

    let distClass = 'on-route';
    if (t.distRoute?.toLowerCase() === 'off-route') distClass = 'off-route';
    else if (t.distRoute?.includes('~')) {
      const m = parseInt(t.distRoute.match(/\d+/)?.[0]);
      if (m >= 200) distClass = `${m}m`;
    }

    const service = services.join('/') || '—';
    const fac = facilities.join('; ') || '—';
    output += `| ${round(t.dayFromStart)} | ${service} | ${fac} | ${t.town} | ${distClass} |\n`;
  });
  output += '\n';
});

console.log(output);
fs.writeFileSync('/tmp/daily_infrastructure_final.md', output);
console.log('\n✓ Saved to /tmp/daily_infrastructure_final.md');
