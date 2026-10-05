#!/usr/bin/env node
/**
 * sync-fitment.mjs — Union Filters
 *
 * Copies heavy-duty.csv, automotive-trucks.csv and cross-reference.csv into one
 * JSON metafield per Shopify variant (fitment.data), matched by SKU, so Liquid
 * can print fitment and cross-reference as plain HTML.
 *
 * Node 20+, no dependencies.
 *
 *   node sync-fitment.mjs --check            parse the CSVs and report problems (no Shopify access)
 *   node sync-fitment.mjs --preview UAF-7239 print the JSON one SKU would get (no Shopify access)
 *   DRY_RUN=1 node sync-fitment.mjs          compare against Shopify, write nothing
 *   node sync-fitment.mjs                    sync
 *
 * Environment:
 *   SHOPIFY_SHOP            your-store.myshopify.com
 *   SHOPIFY_ADMIN_TOKEN     shpat_... (existing custom app)            -- either this
 *   SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET (Dev Dashboard app)       -- or these two
 *   CSV_DIR                 optional; otherwise the CSVs are found anywhere in the repo
 *   FORCE=1                 allow a run that would delete more than 25% of existing data
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CFG = {
  csvDir: process.env.CSV_DIR || '',
  files: {
    heavyDuty: process.env.CSV_HEAVY_DUTY || 'heavy-duty.csv',
    automotive: process.env.CSV_AUTOMOTIVE || 'automotive-trucks.csv',
    crossRef: process.env.CSV_CROSS_REF || 'cross-reference.csv',
  },
  shop: (process.env.SHOPIFY_SHOP || '').replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
  token: process.env.SHOPIFY_ADMIN_TOKEN || '',
  clientId: process.env.SHOPIFY_CLIENT_ID || '',
  clientSecret: process.env.SHOPIFY_CLIENT_SECRET || '',
  apiVersion: process.env.SHOPIFY_API_VERSION || '2026-07',
  namespace: 'fitment',
  key: 'data',
  comboType: 'Air Filter Combo',
  comboNamespace: 'custom',
  comboKey: 'air_filter_combo_components',
  maxBytes: 120000, // Shopify caps JSON metafields at 128 KB
  dryRun: process.env.DRY_RUN === '1',
  force: process.env.FORCE === '1',
};

const warnings = [];
const warn = (m) => warnings.push(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ----------------------------- CSV reading ----------------------------- */

function findFile(name) {
  if (CFG.csvDir) {
    const p = join(CFG.csvDir, name);
    if (!existsSync(p)) throw new Error(`CSV not found: ${p}`);
    return p;
  }
  const skip = new Set(['node_modules', '.git', '.netlify', '.next', 'dist']);
  const hits = [];
  (function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!skip.has(e.name)) walk(join(dir, e.name)); }
      else if (e.name === name) hits.push(join(dir, e.name));
    }
  })('.');
  if (hits.length === 0) throw new Error(`CSV not found anywhere in the repo: ${name}`);
  if (hits.length > 1) throw new Error(`More than one ${name} in the repo (${hits.join(', ')}). Set CSV_DIR.`);
  return hits[0];
}

// The CSVs are saved from Excel as Windows-1252, not UTF-8. Decode strictly as
// UTF-8 first and fall back, so the script keeps working if that ever changes.
function decode(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { return new TextDecoder('windows-1252').decode(buf); }
}

// RFC 4180 parser: handles quoted fields, embedded commas, quotes and newlines.
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = ''; rows.push(row); row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Non-breaking spaces -> spaces, collapse runs of whitespace, trim.
const clean = (s) => String(s ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
const normHeader = (s) => clean(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const skuKey = (s) => clean(s).toUpperCase();

function loadCsv(name, required) {
  const path = findFile(name);
  const rows = parseCsv(decode(readFileSync(path)));
  if (rows.length < 2) throw new Error(`${path} has no data rows`);
  const header = rows[0].map(normHeader);
  const idx = {};
  for (const [field, aliases] of Object.entries(required)) {
    const at = header.findIndex((h) => aliases.includes(h));
    if (at === -1) throw new Error(`${path}: missing column for "${field}" (looked for ${aliases.join(' / ')})`);
    idx[field] = at;
  }
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    if (rows[r].every((v) => clean(v) === '')) continue;
    const o = {};
    for (const f of Object.keys(idx)) o[f] = clean(rows[r][idx[f]]);
    out.push(o);
  }
  console.log(`  ${path}: ${out.length} rows`);
  return out;
}

const natural = (a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });

/* ------------------------- Build per-SKU payloads ------------------------- */

function buildData() {
  console.log('Reading CSVs');

  // Heavy-duty: condensed to one row per Make + Type with the list of models.
  // The full row-level detail (serial ranges, engines) stays in the JS table.
  const hd = new Map();
  for (const r of loadCsv(CFG.files.heavyDuty, {
    sku: ['sku'], make: ['make'], type: ['type'], submodel: ['submodel'], model: ['model'],
  })) {
    if (!r.sku || !r.make || !r.model) continue;
    const k = skuKey(r.sku);
    if (!hd.has(k)) hd.set(k, new Map());
    const gk = r.make + '\u0001' + r.type;
    const groups = hd.get(k);
    if (!groups.has(gk)) groups.set(gk, { make: r.make, type: r.type, models: new Set() });
    groups.get(gk).models.add(r.submodel ? `${r.submodel} ${r.model}` : r.model);
  }
  for (const [k, groups] of hd) {
    hd.set(k, [...groups.values()]
      .map((g) => ({ make: g.make, type: g.type, models: [...g.models].sort(natural) }))
      .sort((a, b) => natural(a.make, b.make) || natural(a.type, b.type)));
  }

  // Automotive / trucks: full rows (small).
  const auto = new Map();
  for (const r of loadCsv(CFG.files.automotive, {
    sku: ['sku'], year: ['year'], make: ['make'], model: ['model'], trim: ['trim'], engine: ['engine'],
  })) {
    if (!r.sku || !r.make || !r.model) continue;
    const k = skuKey(r.sku);
    if (!auto.has(k)) auto.set(k, new Map());
    const row = { year: r.year, make: r.make, model: r.model, trim: r.trim, engine: r.engine };
    auto.get(k).set(Object.values(row).join('\u0001'), row);
  }
  for (const [k, rows] of auto) {
    auto.set(k, [...rows.values()].sort((a, b) =>
      natural(a.make, b.make) || natural(a.model, b.model) || natural(a.year, b.year) || natural(a.engine, b.engine)));
  }

  // Cross-reference: Brand + OEM part number, CSV order, de-duplicated.
  const xref = new Map();
  let placeholders = 0;
  for (const r of loadCsv(CFG.files.crossRef, {
    sku: ['unionsku', 'sku'], brand: ['oembrand', 'brand'], part: ['oempart', 'oempartnumber', 'part'],
  })) {
    if (!r.sku) continue;
    const brand = r.brand.toUpperCase() === 'EMPTY' ? '' : r.brand;
    if (!r.part || r.part.toUpperCase() === 'EMPTY') { placeholders++; continue; }
    if (/^\d(\.\d+)?E\+\d+$/i.test(r.part)) {
      warn(`cross-reference: ${r.sku} / ${brand} has part "${r.part}" - Excel turned the real number into scientific notation. Skipped; fix it in the CSV.`);
      continue;
    }
    const k = skuKey(r.sku);
    if (!xref.has(k)) xref.set(k, new Map());
    xref.get(k).set(brand + '\u0001' + r.part, { brand, part: r.part });
  }
  for (const [k, rows] of xref) xref.set(k, [...rows.values()]);
  if (placeholders) console.log(`  cross-reference: ignored ${placeholders} EMPTY placeholder rows`);

  return { hd, auto, xref };
}

// The JSON a variant gets. componentSkus is set for Air Filter Combos, whose
// cross-reference is the two component filters' (Primary, then Secondary).
function payloadFor(data, sku, componentSkus) {
  const k = skuKey(sku);
  const out = { hd: data.hd.get(k) || [], auto: data.auto.get(k) || [], xref: [] };
  if (componentSkus && componentSkus.length) {
    componentSkus.forEach((c, i) => {
      const rows = data.xref.get(skuKey(c)) || [];
      if (rows.length) out.xref.push({ sku: clean(c), role: i === 0 ? 'primary' : 'secondary', rows });
    });
  } else {
    const rows = data.xref.get(k) || [];
    if (rows.length) out.xref.push({ sku: clean(sku), role: '', rows });
  }
  if (!out.hd.length && !out.auto.length && !out.xref.length) return null;
  return JSON.stringify(out);
}

/* ------------------------------- Shopify ------------------------------- */

let accessToken = '';

async function getToken() {
  if (CFG.token) return CFG.token;
  if (!CFG.clientId || !CFG.clientSecret) {
    throw new Error('Set SHOPIFY_ADMIN_TOKEN, or SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET.');
  }
  const res = await fetch(`https://${CFG.shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials', client_id: CFG.clientId, client_secret: CFG.clientSecret,
    }),
  });
  if (!res.ok) throw new Error(`Token request failed (${res.status}): ${await res.text()}`);
  return (await res.json()).access_token;
}

async function gql(query, variables = {}) {
  for (let attempt = 1; ; attempt++) {
    let res, body;
    try {
      res = await fetch(`https://${CFG.shop}/admin/api/${CFG.apiVersion}/graphql.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
        body: JSON.stringify({ query, variables }),
      });
      body = res.status === 429 || res.status >= 500 ? null : await res.json();
    } catch (e) {
      if (attempt >= 6) throw e;
      await sleep(2000 * attempt); continue;
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Shopify rejected the credentials (${res.status}). Check the token and that the app has read_products and write_products.`);
    }
    const throttled = body?.errors?.some?.((e) => e.extensions?.code === 'THROTTLED');
    if (!body || throttled) {
      if (attempt >= 6) throw new Error(`Shopify kept failing (${res.status})`);
      await sleep(2000 * attempt); continue;
    }
    if (body.errors) throw new Error('GraphQL error: ' + JSON.stringify(body.errors));
    const t = body.extensions?.cost?.throttleStatus;
    if (t && t.currentlyAvailable < 300) await sleep(Math.ceil(((300 - t.currentlyAvailable) / t.restoreRate) * 1000));
    return body.data;
  }
}

async function fetchVariants() {
  const q = `query($cursor: String) {
    productVariants(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        sku
        current: metafield(namespace: "${CFG.namespace}", key: "${CFG.key}") { value }
        product {
          productType
          combo: metafield(namespace: "${CFG.comboNamespace}", key: "${CFG.comboKey}") { value }
        }
      }
    }
  }`;
  const all = [];
  let cursor = null;
  do {
    const d = await gql(q, { cursor });
    all.push(...d.productVariants.nodes);
    cursor = d.productVariants.pageInfo.hasNextPage ? d.productVariants.pageInfo.endCursor : null;
  } while (cursor);
  return all;
}

async function inBatches(items, size, fn) {
  for (let i = 0; i < items.length; i += size) await fn(items.slice(i, i + size));
}

/* --------------------------------- Run --------------------------------- */

function printWarnings() {
  if (!warnings.length) return;
  console.log(`\nWarnings (${warnings.length}):`);
  for (const w of warnings) console.log('  - ' + w);
}

async function main() {
  const args = process.argv.slice(2);
  const data = buildData();
  const csvSkus = new Set([...data.hd.keys(), ...data.auto.keys(), ...data.xref.keys()]);
  console.log(`SKUs with data: ${csvSkus.size} (heavy-duty ${data.hd.size}, automotive ${data.auto.size}, cross-reference ${data.xref.size})`);

  if (args[0] === '--preview') {
    const p = payloadFor(data, args[1] || '', null);
    console.log(p ? JSON.stringify(JSON.parse(p), null, 2) : `No data for SKU "${args[1]}"`);
    return;
  }
  if (args[0] === '--check') {
    let max = { sku: '', bytes: 0 };
    for (const k of csvSkus) {
      const b = Buffer.byteLength(payloadFor(data, k, null) || '');
      if (b > max.bytes) max = { sku: k, bytes: b };
    }
    console.log(`Largest payload: ${max.sku} at ${max.bytes} bytes (limit ${CFG.maxBytes})`);
    printWarnings();
    return;
  }

  if (!CFG.shop) throw new Error('Set SHOPIFY_SHOP (your-store.myshopify.com).');
  accessToken = await getToken();
  console.log(`Reading variants from ${CFG.shop}`);
  const variants = await fetchVariants();
  console.log(`  ${variants.length} variants`);

  const sets = [], deletes = [], matched = new Set();
  let unchanged = 0, existing = 0;
  for (const v of variants) {
    const sku = clean(v.sku);
    const current = v.current?.value ?? null;
    if (current !== null) existing++;
    let desired = null;
    if (sku) {
      const isCombo = v.product?.productType === CFG.comboType;
      const components = isCombo
        ? clean(v.product?.combo?.value).split('|').map(clean).filter(Boolean)
        : null;
      desired = payloadFor(data, sku, components);
      if (desired) matched.add(skuKey(sku));
    }
    if (desired && Buffer.byteLength(desired) > CFG.maxBytes) {
      warn(`${sku}: data is ${Buffer.byteLength(desired)} bytes, over the metafield limit. Left unchanged.`);
      continue;
    }
    let same = false;
    if (desired !== null && current !== null) {
      try { same = JSON.stringify(JSON.parse(current)) === desired; } catch { same = false; }
    }
    if (desired === null && current === null) continue;
    if (same) { unchanged++; continue; }
    if (desired === null) deletes.push({ ownerId: v.id, namespace: CFG.namespace, key: CFG.key });
    else sets.push({ ownerId: v.id, namespace: CFG.namespace, key: CFG.key, type: 'json', value: desired });
  }

  const missing = [...csvSkus].filter((k) => !matched.has(k)).sort(natural);
  console.log(`To write: ${sets.length}   to remove: ${deletes.length}   unchanged: ${unchanged}`);
  if (missing.length) {
    console.log(`CSV SKUs with no matching Shopify variant: ${missing.length}`);
    console.log('  ' + missing.slice(0, 40).join(', ') + (missing.length > 40 ? ', ...' : ''));
  }

  // Guard: a bad CSV (wrong file, truncated save) must not wipe the store's data.
  if (existing > 20 && deletes.length > existing * 0.25 && !CFG.force) {
    throw new Error(`This run would remove data from ${deletes.length} of ${existing} variants. That looks like a broken CSV, so nothing was changed. Re-run with FORCE=1 if it is intended.`);
  }

  if (CFG.dryRun) {
    console.log('DRY_RUN=1, nothing written.');
    printWarnings();
    return;
  }

  let failed = 0;
  // Batches of 10 keep each request small even for the largest fitment lists.
  await inBatches(sets, 10, async (batch) => {
    const d = await gql(`mutation($m: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $m) { userErrors { field message } }
    }`, { m: batch });
    for (const e of d.metafieldsSet.userErrors) { failed++; warn(`write failed: ${e.message} (${(e.field || []).join('.')})`); }
  });
  await inBatches(deletes, 25, async (batch) => {
    const d = await gql(`mutation($m: [MetafieldIdentifierInput!]!) {
      metafieldsDelete(metafields: $m) { userErrors { field message } }
    }`, { m: batch });
    for (const e of d.metafieldsDelete.userErrors) { failed++; warn(`remove failed: ${e.message}`); }
  });

  console.log(`Done. Wrote ${sets.length}, removed ${deletes.length}.`);
  printWarnings();
  if (failed) process.exitCode = 1;
}

main().catch((e) => { console.error('\nERROR: ' + e.message); printWarnings(); process.exit(1); });

