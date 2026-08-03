import assert from 'node:assert/strict';
import { statusMessageFor } from './messages';

assert.equal(statusMessageFor({ type: 'start', directoryName: 'Justdial' }), 'Checking Justdial...');
assert.equal(statusMessageFor({ type: 'cache', directoryName: 'Justdial' }), 'Justdial — using recent data.');
console.log('audit status message tests passed');
