// Simple test to verify client-side render sorting logic orders events by date (oldest -> newest)
const assert = require('assert');

function sortEvents(list){
  const items = Array.isArray(list) ? list.slice() : [];
  items.sort((a, b) => {
    const da = a && a.date ? new Date(a.date) : new Date(NaN);
    const db = b && b.date ? new Date(b.date) : new Date(NaN);
    const ta = isNaN(da.getTime()) ? Infinity : da.getTime();
    const tb = isNaN(db.getTime()) ? Infinity : db.getTime();
    return ta - tb;
  });
  return items;
}

function iso(d){ return new Date(d).toISOString().slice(0,10); }

const unsorted = [
  { id: 'a', date: '2025-12-10' },
  { id: 'b', date: '2025-10-01' },
  { id: 'c', date: 'invalid-date' },
  { id: 'd', date: '2025-11-05' }
];

const sorted = sortEvents(unsorted);

// Expect b (2025-10-01), d (2025-11-05), a (2025-12-10), c (invalid -> last)
const order = sorted.map(x => x.id).join(',');
console.log('Sorted order:', order);
assert.strictEqual(order, 'b,d,a,c', 'Events should be sorted oldest->newest with invalid dates last');

console.log('test_render_order.js passed');
