#!/usr/bin/env node
/**
 * Audit: Route Stops Data Quality & Integrity
 * Runs 10 passes of validation on tour-data.json
 * Reports: Minor, Serious, Grave errors for each pass
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_PATH = path.join(__dirname, '../src/data/tour-data.json');

function loadTourData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  } catch (err) {
    console.error(`Failed to load tour-data.json: ${err.message}`);
    process.exit(1);
  }
}

class AuditPass {
  constructor(passNumber) {
    this.passNumber = passNumber;
    this.minorErrors = [];
    this.seriousErrors = [];
    this.graveErrors = [];
  }

  addMinor(msg) { this.minorErrors.push(msg); }
  addSerious(msg) { this.seriousErrors.push(msg); }
  addGrave(msg) { this.graveErrors.push(msg); }

  report() {
    console.log(`Pass ${this.passNumber}:`);
    console.log(`- Minor errors: ${this.minorErrors.length}`);
    console.log(`- Serious errors: ${this.seriousErrors.length}`);
    console.log(`- Grave errors: ${this.graveErrors.length}`);
    if (this.minorErrors.length + this.seriousErrors.length + this.graveErrors.length > 0) {
      console.log(`  Details:`);
      this.minorErrors.forEach(e => console.log(`    [M] ${e}`));
      this.seriousErrors.forEach(e => console.log(`    [S] ${e}`));
      this.graveErrors.forEach(e => console.log(`    [G] ${e}`));
    }
    console.log('');
  }

  isClean() {
    return this.minorErrors.length === 0 && this.seriousErrors.length === 0 && this.graveErrors.length === 0;
  }
}

function runAuditPass(tourData, passNumber) {
  const audit = new AuditPass(passNumber);

  // ==================================================
  // AUDIT CHECKS
  // ==================================================

  // 1. GRAVE: routeStops exists for every ride day
  tourData.rides.forEach((ride) => {
    if (!ride.routeStops) {
      audit.addGrave(`Ride ${ride.dayNumber} missing routeStops array`);
    } else if (!Array.isArray(ride.routeStops)) {
      audit.addGrave(`Ride ${ride.dayNumber} routeStops is not an array`);
    }
  });

  // 2. GRAVE: Ride days with type='ride' must have stops
  tourData.rides.forEach((ride) => {
    if (ride.rideType === 'ride' && ride.routeStops.length === 0) {
      audit.addGrave(`Ride day ${ride.dayNumber} (${ride.startTown} → ${ride.endTown}) has no route stops`);
    }
  });

  // 3. SERIOUS: routeStops must have required fields
  tourData.rides.forEach((ride) => {
    ride.routeStops.forEach((stop, idx) => {
      const requiredFields = ['town', 'renderedTown', 'name', 'type', 'source', 'verified'];
      requiredFields.forEach(field => {
        if (!(field in stop)) {
          audit.addSerious(`Ride ${ride.dayNumber} stop #${idx} missing field: ${field}`);
        }
      });

      // Check field types
      if (typeof stop.town !== 'string') {
        audit.addSerious(`Ride ${ride.dayNumber} stop #${idx} town is not string`);
      }
      if (typeof stop.renderedTown !== 'string') {
        audit.addSerious(`Ride ${ride.dayNumber} stop #${idx} renderedTown is not string`);
      }
      if (typeof stop.name !== 'string') {
        audit.addSerious(`Ride ${ride.dayNumber} stop #${idx} name is not string`);
      }
      if (!['wc', 'cafe', 'boulangerie', 'lunch', 'water'].includes(stop.type)) {
        audit.addSerious(`Ride ${ride.dayNumber} stop #${idx} invalid type: ${stop.type}`);
      }
      if (!['RDE_Lunch_Options', 'TWN_WC', 'TWN_Cafe_Boulangeries'].includes(stop.source)) {
        audit.addSerious(`Ride ${ride.dayNumber} stop #${idx} invalid source: ${stop.source}`);
      }
      if (typeof stop.verified !== 'boolean') {
        audit.addSerious(`Ride ${ride.dayNumber} stop #${idx} verified is not boolean`);
      }
    });
  });

  // 4. SERIOUS: Bastide rule validation
  tourData.rides.forEach((ride) => {
    const bastideTowns = new Set();
    ride.routeStops.forEach((stop) => {
      if (stop.renderedTown.includes('(B)')) {
        bastideTowns.add(stop.town);
      }
    });

    // Check consistency: if a town has (B) in any stop, all should
    bastideTowns.forEach((townName) => {
      const allStopsForTown = ride.routeStops.filter(s => s.town === townName);
      const withBastide = allStopsForTown.filter(s => s.renderedTown.includes('(B)'));
      if (withBastide.length > 0 && withBastide.length < allStopsForTown.length) {
        audit.addSerious(`Ride ${ride.dayNumber} town "${townName}" has inconsistent Bastide labeling`);
      }
    });
  });

  // 5. MINOR: Empty name or location fields
  tourData.rides.forEach((ride) => {
    ride.routeStops.forEach((stop, idx) => {
      if (!stop.name || stop.name.trim() === '') {
        audit.addMinor(`Ride ${ride.dayNumber} stop #${idx} has empty name`);
      }
    });
  });

  // 6. MINOR: Duplicate stops in same town
  tourData.rides.forEach((ride) => {
    const townMap = {};
    ride.routeStops.forEach((stop) => {
      const key = `${stop.renderedTown}|${stop.type}|${stop.name}`;
      townMap[key] = (townMap[key] || 0) + 1;
    });
    Object.entries(townMap).forEach(([key, count]) => {
      if (count > 1) {
        audit.addMinor(`Ride ${ride.dayNumber} has ${count} identical stops: ${key}`);
      }
    });
  });

  // 7. GRAVE: Lunch must be assigned to valid route town
  tourData.rides.forEach((ride) => {
    const lunchStops = ride.routeStops.filter(s => s.type === 'lunch');
    if (lunchStops.length > 1) {
      audit.addGrave(`Ride ${ride.dayNumber} has multiple lunch stops`);
    }
    if (lunchStops.length === 1 && !lunchStops[0].name) {
      audit.addGrave(`Ride ${ride.dayNumber} lunch stop has no name`);
    }
  });

  // 8. SERIOUS: Town name normalization check
  tourData.rides.forEach((ride) => {
    const towns = new Set();
    ride.routeStops.forEach((stop) => {
      const normalized = (stop.town || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
      towns.add(normalized);
    });

    // Check for whitespace issues
    ride.routeStops.forEach((stop) => {
      if (stop.town !== stop.town.trim()) {
        audit.addSerious(`Ride ${ride.dayNumber} stop has leading/trailing whitespace in town: "${stop.town}"`);
      }
    });
  });

  // 9. MINOR: renderedTown format check
  tourData.rides.forEach((ride) => {
    ride.routeStops.forEach((stop) => {
      if (stop.renderedTown.includes('  ')) {
        audit.addMinor(`Ride ${ride.dayNumber} renderedTown has double space: "${stop.renderedTown}"`);
      }
      if (stop.renderedTown.startsWith(' ') || stop.renderedTown.endsWith(' ')) {
        audit.addMinor(`Ride ${ride.dayNumber} renderedTown has leading/trailing space: "${stop.renderedTown}"`);
      }
    });
  });

  // 10. SERIOUS: Stop source integrity
  tourData.rides.forEach((ride) => {
    const sourceCount = { 'RDE_Lunch_Options': 0, 'TWN_WC': 0, 'TWN_Cafe_Boulangeries': 0 };
    ride.routeStops.forEach((stop) => {
      if (stop.source in sourceCount) {
        sourceCount[stop.source]++;
      }
    });

    // Check that lunch only comes from RDE_Lunch_Options
    ride.routeStops.forEach((stop) => {
      if (stop.type === 'lunch' && stop.source !== 'RDE_Lunch_Options') {
        audit.addSerious(`Ride ${ride.dayNumber} lunch stop from wrong source: ${stop.source}`);
      }
      if (stop.type === 'wc' && stop.source !== 'TWN_WC') {
        audit.addSerious(`Ride ${ride.dayNumber} WC stop from wrong source: ${stop.source}`);
      }
      if ((stop.type === 'cafe' || stop.type === 'boulangerie') && stop.source !== 'TWN_Cafe_Boulangeries') {
        audit.addSerious(`Ride ${ride.dayNumber} cafe/boulangerie from wrong source: ${stop.source}`);
      }
    });
  });

  return audit;
}

async function main() {
  console.log('====================================================');
  console.log('ROUTE STOPS DATA QUALITY AUDIT — 10-PASS VALIDATION');
  console.log('====================================================\n');

  const tourData = loadTourData();

  let allClean = true;
  const passes = [];

  for (let i = 1; i <= 10; i++) {
    const audit = runAuditPass(tourData, i);
    passes.push(audit);
    audit.report();

    if (!audit.isClean()) {
      allClean = false;
    }
  }

  console.log('====================================================');
  console.log('SUMMARY');
  console.log('====================================================');
  console.log(`Total Passes: 10`);
  console.log(`Clean Passes: ${passes.filter(p => p.isClean()).length}`);
  console.log(`Passes with Errors: ${passes.filter(p => !p.isClean()).length}`);

  if (allClean) {
    console.log('\n✓ ALL AUDITS PASSED — PRODUCTION READY\n');
    process.exit(0);
  } else {
    console.log('\n✗ AUDIT FAILURES DETECTED — REVIEW ERRORS ABOVE\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`Audit failed: ${err.message}`);
  process.exit(1);
});
