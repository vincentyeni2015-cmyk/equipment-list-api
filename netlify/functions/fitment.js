const fs = require('fs');
const path = require('path');

// Proper CSV parser (RFC 4180): fields wrapped in double quotes may contain
// commas and newlines, and "" inside a quoted field is a literal quote.
// This keeps values like "A93K11001 & Above, AC2P11001 & Above" in ONE column.
function parseCsvRows(text) {
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else { inQuotes = false; }
      } else { field += c; }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Normalize header names so "SKU", "Sub-Model", "Variant 2" etc. all map cleanly
function parseCsv(text) {
  const rows = parseCsvRows(text).filter(r => r.some(c => String(c).trim() !== ''));
  if (!rows.length) return [];
  const headers = rows[0].map(h => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
  return rows.slice(1).map(cells => {
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

// Dedupe machine specs but keep the list of SKUs that map to each spec
function dedupeWithSkus(rows, keyFn, specFn) {
  const map = {};
  rows.forEach(r => {
    const k = keyFn(r);
    if (!map[k]) map[k] = Object.assign(specFn(r), { skus: [] });
    const sku = (r.sku || '').trim();
    if (sku && map[k].skus.indexOf(sku) === -1) map[k].skus.push(sku);
  });
  return Object.keys(map).map(k => map[k]);
}

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=600'
};

const lc = s => (s == null ? '' : String(s).trim().toLowerCase());

function readCsv(file) {
  try { return parseCsv(fs.readFileSync(path.join(__dirname, file), 'utf8')); }
  catch (e) { return []; } // a CSV may not exist yet
}

// Build a Map of sku(lowercased) -> array of rows, for O(1) per-SKU lookups.
function indexBySku(rows, skuFn) {
  const m = new Map();
  for (const r of rows) {
    const k = lc(skuFn(r));
    if (!k) continue;
    let arr = m.get(k);
    if (!arr) { arr = []; m.set(k, arr); }
    arr.push(r);
  }
  return m;
}

// Parsed + indexed ONCE per warm container, then reused across every request.
// This is the key scaling change: no re-reading/re-parsing the CSVs per call.
let CACHE = null;
function getData() {
  if (CACHE) return CACHE;

  const hd = readCsv('heavy-duty.csv');
  const at = readCsv('automotive-trucks.csv');
  const xr = readCsv('cross-reference.csv');

  // Full-dataset payloads are built + serialized once (dropdown list, cross-ref dump).
  const dropdown = {
    heavyDuty: dedupeWithSkus(
      hd,
      r => [r.make, r.type, r.submodel, r.model, r.variant, r.variant2].join('||'),
      r => ({ make: r.make || '', type: r.type || '', submodel: r.submodel || '', model: r.model || '', variant: r.variant || '', variant2: r.variant2 || '' })
    ),
    automotive: dedupeWithSkus(
      at,
      r => [r.year, r.make, r.model, r.trim, r.engine].join('||'),
      r => ({ year: r.year || '', make: r.make || '', model: r.model || '', trim: r.trim || '', engine: r.engine || '' })
    )
  };

  const xrefAll = xr.map(r => ({
    sku: (r.unionsku || r.sku || '').trim(),
    brand: (r.oembrand || r.brand || '').trim(),
    part: (r.oempart || r.oempartnumber || r.part || '').trim()
  })).filter(r => r.sku && (r.brand || r.part));

  CACHE = {
    hd, at,
    hdBySku: indexBySku(hd, r => r.sku),
    atBySku: indexBySku(at, r => r.sku),
    xrBySku: indexBySku(xr, r => r.unionsku || r.sku),
    dropdownBody: JSON.stringify(dropdown),
    xrefAllBody: JSON.stringify({ crossRef: xrefAll })
  };
  return CACHE;
}

// Collect all rows for a set of SKUs using the prebuilt index.
function gather(index, skus) {
  const out = [];
  for (const k of skus) {
    const arr = index.get(k);
    if (arr) for (const r of arr) out.push(r);
  }
  return out;
}

exports.handler = async (event) => {
  try {
    const D = getData();
    const q = (event && event.queryStringParameters) || {};
    const has = k => q[k] !== undefined && q[k] !== null && String(q[k]).trim() !== '';

    // ====== CROSS-REFERENCE (ALL): ?xrefall=1 -> every cross reference WITH its Union SKU ======
    if (has('xrefall')) {
      return { statusCode: 200, headers: CORS, body: D.xrefAllBody };
    }

    // ====== CROSS-REFERENCE MODE: ?xref=A,B,C -> OEM cross references for these SKUs ======
    if (has('xref')) {
      const wants = String(q.xref).split(',').map(lc).filter(Boolean);
      const crossRef = dedupe(
        gather(D.xrBySku, wants).map(r => ({
          brand: (r.oembrand || r.brand || '').trim(),
          part: (r.oempart || r.oempartnumber || r.part || '').trim()
        })).filter(r => r.brand || r.part),
        r => [r.brand, r.part].join('||')
      );
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ crossRef }) };
    }

    // ====== SKU MODE: ?sku=A,B,C -> this product's machines from both CSVs ======
    if (has('sku') && !has('category') && !has('make') && !has('model') && !has('year')) {
      const wants = String(q.sku).split(',').map(lc).filter(Boolean);
      const heavyDuty = dedupe(
        gather(D.hdBySku, wants).map(r => ({
          make: r.make || '', type: r.type || '', submodel: r.submodel || '',
          model: r.model || '', variant: r.variant || '', variant2: r.variant2 || ''
        })),
        r => [r.make, r.type, r.submodel, r.model, r.variant, r.variant2].join('||')
      );
      const automotive = dedupe(
        gather(D.atBySku, wants).map(r => ({
          year: r.year || '', make: r.make || '', model: r.model || '',
          trim: r.trim || '', engine: r.engine || ''
        })),
        r => [r.year, r.make, r.model, r.trim, r.engine].join('||')
      );
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ heavyDuty, automotive }) };
    }

    // ====== SEARCH MODE: machine params present -> matching SKUs ======
    if (has('category') || has('make') || has('model') || has('year')) {
      const norm = v => (v == null ? '' : String(v).trim().toLowerCase());
      const eq = (a, b) => norm(a) === norm(b);
      const isHeavy = q.category === 'Heavy-Duty Machinery' || (has('type') && !has('year'));

      let skus;
      if (isHeavy) {
        skus = D.hd.filter(r =>
          (!has('make')     || eq(r.make, q.make)) &&
          (!has('type')     || eq(r.type, q.type)) &&
          (!has('submodel') || eq(r.submodel, q.submodel)) &&
          (!has('model')    || eq(r.model, q.model)) &&
          (!has('variant')  || eq(r.variant, q.variant)) &&
          (!has('variant2') || eq(r.variant2, q.variant2))
        ).map(r => r.sku);
      } else {
        skus = D.at.filter(r =>
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

    // ====== DROPDOWN MODE: no params -> deduped machine specs (prebuilt) ======
    return { statusCode: 200, headers: CORS, body: D.dropdownBody };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: String(e.message || e) })
    };
  }
};
