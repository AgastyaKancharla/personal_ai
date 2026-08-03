import assert from 'node:assert/strict';
import { extractStructuredData } from './structuredDataExtractor';

async function run() {
  const jsonLd = await extractStructuredData(`
    <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Dentist","name":"Bright Smile","telephone":"+91 98765 43210","url":"https://bright.example","address":{"@type":"PostalAddress","streetAddress":"12 Main Road","addressLocality":"Bengaluru","postalCode":"560001"}}
    </script>`, 'https://fallback.example');
  assert.deepEqual(jsonLd, {
    name: 'Bright Smile', address: '12 Main Road, Bengaluru, 560001', phone: '+91 98765 43210', website: 'https://bright.example', category: 'Dentist'
  });

  const openGraph = await extractStructuredData('<meta property="og:title" content="Acme Clinic"><meta name="telephone" content="080 1234 5678">', 'https://acme.example');
  assert.deepEqual(openGraph, { name: 'Acme Clinic', phone: '080 1234 5678', website: 'https://acme.example' });

  const empty = await extractStructuredData('<html><title>No business data</title></html>', 'https://empty.example');
  assert.equal(empty, null);
}

run().then(() => console.log('structuredDataExtractor tests passed'));
