// Serverless CJ → XML feed (Node 18+; fetch is ingebouwd)
const CJ_TOKEN = process.env.CJ_TOKEN;

// simpele XML escape
const esc = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// CJ ophalen
async function fetchCjProducts({ kw, ids, pageNum = 1, pageSize = 50 }) {
  if (!CJ_TOKEN) throw new Error("CJ_TOKEN ontbreekt (zet in Vercel → Project → Settings → Environment Variables).");

  const BASE = "https://developers.cjdropshipping.com/api2.0";
  const headers = {
    "Content-Type": "application/json",
    "CJ-Access-Token": CJ_TOKEN
  };

  // Zoeken op keyword
  if (kw) {
    const url = `${BASE}/v1/product/query?keyWords=${encodeURIComponent(kw)}&pageNum=${pageNum}&pageSize=${pageSize}`;
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error(`CJ query error: ${r.status}`);
    const js = await r.json();
    const list = js?.data?.list || js?.data || [];
    return Array.isArray(list) ? list : [];
  }

  // Ophalen op IDs (kommagescheiden)
  if (ids) {
    const arr = ids.split(",").map(s => s.trim()).filter(Boolean);
    const out = [];
    for (const id of arr) {
      const url = `${BASE}/v1/product/detail?id=${encodeURIComponent(id)}`;
      const r = await fetch(url, { headers });
      if (!r.ok) continue;
      const js = await r.json();
      if (js?.data) out.push(js.data);
    }
    return out;
  }

  return [];
}

// Normaliseren
function mapCjToSimple(p) {
  const id = p.id || p.productId || p.sku || p.productSku || "";
  const title = p.name || p.productName || p.title || "";
  const desc = p.description || p.productDescription || p.productDesc || p.sellPoint || "";
  const vendor = p.vendorName || p.storeName || p.brand || "CJdropshipping";
  let image = (Array.isArray(p.productImages) && p.productImages[0]) || p.image || p.mainImage || p.img || "";

  const priceRaw = p.sellPrice || p.price || p.retailPrice || p.wholesalePrice || 0;
  const price = Number(priceRaw) || 0;
  const currency = p.currency || "USD";
  let inventory = p.inventory || p.stock || p.quantity || 0;

  const variants = Array.isArray(p.variants) ? p.variants
    : Array.isArray(p.variantList) ? p.variantList : [];

  const mappedVariants = variants.map((v, idx) => {
    const vId = v.id || v.variantId || `${id}-${idx+1}`;
    const vSku = v.sku || v.variantSku || v.productSku || vId;
    const vPrice = Number(v.sellPrice || v.price || v.retailPrice || price) || price;
    const vInv = Number(v.inventory || v.stock || v.quantity || 0) || 0;
    const o1 = v.option1 || v.size || v.attribute1 || v.attributeName || v.color || "";
    const o2 = v.option2 || v.attribute2 || v.style || "";
    const o3 = v.option3 || v.attribute3 || "";
    const vImg = v.image || v.img || (Array.isArray(v.images) && v.images[0]) || image;

    return { id: vId, sku: vSku, price: vPrice, inventory: vInv, option1: o1, option2: o2, option3: o3, image: vImg };
  });

  if (!inventory && mappedVariants.length) {
    inventory = mappedVariants.reduce((s, v) => s + (v.inventory || 0), 0);
  }
  if (!image && mappedVariants.length) image = mappedVariants[0].image || "";

  const sku = p.productSku || p.sku || (mappedVariants[0] && mappedVariants[0].sku) || id;

  return { id: String(id), title: String(title), desc: String(desc), vendor: String(vendor),
           image: String(image), price, currency, inventory: Number(inventory)||0, sku: String(sku),
           variants: mappedVariants };
}

// XML bouwen
function buildXml(items = []) {
  const now = new Date().toISOString();
  const parts = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(`<products generated_at="${esc(now)}">`);
  for (const it of items) {
    parts.push(`  <product>`);
    parts.push(`    <id>${esc(it.id)}</id>`);
    parts.push(`    <title>${esc(it.title)}</title>`);
    parts.push(`    <description><![CDATA[${it.desc || ""}]]></description>`);
    parts.push(`    <vendor>${esc(it.vendor)}</vendor>`);
    parts.push(`    <sku>${esc(it.sku)}</sku>`);
    parts.push(`    <price>${it.price.toFixed(2)}</price>`);
    parts.push(`    <currency>${esc(it.currency)}</currency>`);
    parts.push(`    <inventory>${it.inventory}</inventory>`);
    parts.push(`    <image>${esc(it.image)}</image>`);
    if (it.variants?.length) {
      parts.push(`    <variants>`);
      for (const v of it.variants) {
        parts.push(`      <variant>`);
        parts.push(`        <id>${esc(v.id)}</id>`);
        parts.push(`        <sku>${esc(v.sku)}</sku>`);
        parts.push(`        <price>${Number(v.price || it.price).toFixed(2)}</price>`);
        parts.push(`        <inventory>${Number(v.inventory || 0)}</inventory>`);
        if (v.option1) parts.push(`        <option1>${esc(v.option1)}</option1>`);
        if (v.option2) parts.push(`        <option2>${esc(v.option2)}</option2>`);
        if (v.option3) parts.push(`        <option3>${esc(v.option3)}</option3>`);
        if (v.image)  parts.push(`        <image>${esc(v.image)}</image>`);
        parts.push(`      </variant>`);
      }
      parts.push(`    </variants>`);
    }
    parts.push(`  </product>`);
  }
  parts.push(`</products>`);
  return parts.join("\n");
}

export default async function handler(req, res) {
  try {
    const { kw = "", ids = "", pageNum = "1", pageSize = "50" } = req.query || {};
    const raw = await fetchCjProducts({
      kw: String(kw).trim(),
      ids: String(ids).trim(),
      pageNum: Number(pageNum),
      pageSize: Number(pageSize)
    });
    const mapped = raw.map(mapCjToSimple);
    const xml = buildXml(mapped);
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.status(200).send(xml);
  } catch (e) {
    res
      .status(500)
      .send(`<?xml version="1.0" encoding="UTF-8"?><error>${esc(e.message || "Server error")}</error>`);
  }
}
