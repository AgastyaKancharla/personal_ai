import assert from 'node:assert/strict';
import { clusterCandidates } from './clustering';

const query = { name: 'Bright Smile Dental', phone: '+91 98765 43210', category: 'Dentist' };
const samePhone = clusterCandidates([
  { source: 'google_places', name: 'Bright Smile Dental', phone: '9876543210', category: 'Dentist' },
  { source: 'osm', name: 'Bright Smiles Clinic', phone: '+91 98765 43210', category: 'Dentist' }
], query);
assert.equal(samePhone.length, 1);
assert.equal(samePhone[0].members.length, 2);

const distinctBusinesses = clusterCandidates([
  { source: 'google_places', name: 'Bright Smile Dental', phone: '9876543210', category: 'Dentist' },
  { source: 'osm', name: 'Bright Smile Dental', phone: '9123456789', category: 'Dentist' }
], query);
assert.equal(distinctBusinesses.length, 1);
assert.equal(distinctBusinesses[0].members.length, 1);

console.log('clustering tests passed');
