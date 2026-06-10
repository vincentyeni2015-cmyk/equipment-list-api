const fs = require('fs');
const path = require('path');

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim() !== '');
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.trim());
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

exports.handler = async () => {
  try {
    const hd = parseCsv(fs.readFileSync(path.join(__dirname, 'heavy-duty.csv'), 'utf8'));
    const at = parseCsv(fs.readFileSync(path.join(__dirname, 'automotive-trucks.csv'), 'utf8'));

    const heavyDuty = dedupe(
      hd.map(r => ({ make: r.make||'', type: r.type||'', submodel: r.sub_model||'', model: r.model||'', variant: r.variant||'' })),
      r => [r.make, r.type, r.submodel, r.model, r.variant].join('||')
    );
    const automotive = dedupe(
      at.map(r => ({ year: r.year||'', make: r.make||'', model: r.model||'', trim: r.trim||'', engine: r.engine||'' })),
      r => [r.year, r.make, r.model, r.trim, r.engine].join('||')
    );

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=600'
      },
      body: JSON.stringify({ heavyDuty, automotive })
    };
  } catch (e) {
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: String(e.message || e) }) };
  }
};
