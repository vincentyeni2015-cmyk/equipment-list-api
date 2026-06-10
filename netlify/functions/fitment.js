const fs = require('fs');
const path = require('path');

// Normalize header names so "SKU", "Sub-Model", "Variant 2" etc. all map cleanly
function parseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim() !== '');
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
  return lines.slice(1).map(line => {
    const cells = line.split(',');
    const row = {};
    headers.forEach((h, i) => { row[h] = (cells[i] || '').trim(); });
    return row;
  });
}

function dedupe(rows, keyFn) {
  const seen = {}; const out = [];
  rows.forEach(r => { const k = keyFn(r); if (!seen[k]) { seen[k] = true; out.push(r); } });
  return out;
}

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=600'
};

exports.handler = async (event) => {
  try {
    const hd = parseCsv(fs.readFileSync(path.join(__dirname, 'heavy-duty.csv'), 'utf8'));
    const at = parseCsv(fs.readFileSync(path.join(__dirname, 'automotive-trucks.csv'), 'utf8'));

    const q = (event && event.queryStringParameters) || {};
    const has = k => q[k] !== undefined && q[k] !== null && String(q[k]).trim() !== '';

    // ====== SEARCH MODE: machine params present -> return matching SKUs ======
    if (has('category') || has('make') || has('model') || has('year')) {
      const norm = v => (v == null ? '' : String(v).trim().toLowerCase());
      const eq = (a, b) => norm(a) === norm(b);
      const isHeavy = q.category === 'Heavy-Duty Machinery' || (has('type') && !has('year'));

      let skus;
      if (isHeavy) {
        skus = hd.filter(r =>
          (!has('make')     || eq(r.make, q.make)) &&
          (!has('type')     || eq(r.type, q.type)) &&
          (!has('submodel') || eq(r.submodel, q.submodel)) &&
          (!has('model')    || eq(r.model, q.model)) &&
          (!has('variant')  || eq(r.variant, q.variant)) &&
          (!has('variant2') || eq(r.variant2, q.variant2))
        ).map(r => r.sku);
      } else {
        skus = at.filter(r =>
          (!has('year')   || eq(r.year, q.year)) &&
          (!has('make')   || eq(r.make, q.make)) &&
          (!has('model')  || eq(r.model, q.model)) &&
          (!has('trim')   || eq(r.trim, q.trim)) &&
          (!has('engine') || eq(r.engine, q.engine))
        ).map(r => r.sku);
      }

      skus = [...new Set(skus.filter(s => s && s.trim() !== ''))];
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ skus }) };
    }

    // ====== DROPDOWN MODE: no params -> return deduped machine specs ======
    const heavyDuty = dedupe(
      hd.map(r => ({
        make: r.make || '', type: r.type || '', submodel: r.submodel || '',
        model: r.model || '', variant: r.variant || '', variant2: r.variant2 || ''
      })),
      r => [r.make, r.type, r.submodel, r.model, r.variant, r.variant2].join('||')
    );
    const automotive = dedupe(
      at.map(r => ({
        year: r.year || '', make: r.make || '', model: r.model || '',
        trim: r.trim || '', engine: r.engine || ''
      })),
      r => [r.year, r.make, r.model, r.trim, r.engine].join('||')
    );

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ heavyDuty, automotive }) };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: String(e.message || e) })
    };
  }
};
