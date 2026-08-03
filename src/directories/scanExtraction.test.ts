import assert from 'node:assert/strict';
import { mergeStructuredFields } from './scanExtraction';

assert.deepEqual(mergeStructuredFields({ name: 'Structured Clinic', phone: '9876543210' }, { name: 'DOM Clinic', address: 'DOM Address', phone: '0000000000', website: 'https://dom.example', category: 'Dentist' }), { name: 'Structured Clinic', address: 'DOM Address', phone: '9876543210', website: 'https://dom.example', category: 'Dentist' });
assert.deepEqual(mergeStructuredFields(null, { name: 'DOM Clinic', address: '', phone: '', website: '', category: '' }), { name: 'DOM Clinic', address: '', phone: '', website: '', category: '' });
console.log('scan extraction tests passed');
