/**
 * The ethnic-wear supplement (seed_ethnic_manual.py) intentionally reuses a
 * small photo pool across SKUs (documented, no-scraping constraint) — but
 * the real distribution ended up far more clustered than intended: 9 of 12
 * Women/Kurtas products shared the exact same single photo, visibly
 * duplicated side-by-side in the Wedding Matrix lookbook.
 *
 * Adds a curated, pre-verified set of additional Wikimedia Commons images
 * (same sourcing policy as the original supplement — openly licensed,
 * fetched via Special:FilePath, not scraped from any retailer) and
 * redistributes each category's products round-robin across the expanded
 * pool instead of leaving them clustered on 1-2 images.
 *
 * Usage: DATABASE_URL=<postgres url> node src/scripts/diversify_ethnic_images.js
 *        node src/scripts/diversify_ethnic_images.js   (targets local Oracle)
 */
require('dotenv').config();
const { query } = require('../db');

const NEW_IMAGES = {
  'Women/Kurtas': [
    'Colorful kurtas.jpg',
    'Different types of kurtas.jpg',
    'Handloom Cotton Kurta in Tea Dyed.jpg',
    'Blue khadi kurta.jpg',
    'Assamese style kurta and sari (3859548298).jpg',
  ],
  'Men/Kurtas': [
    'Kurta - Mens.jpg',
    'A portrait of an Indian Man in Traditional Kurta Pyjama.jpg',
    'A punjabi guy in Jeans & Kurta.jpg',
    'Charan Singh in traditional Dhoti and Kurta.jpg',
    'Kurta churidar nehru vest.jpg',
  ],
  'Men/Sherwanis': [
    'Rajput Sherwani 2014-04-23 04-27.JPG',
    'Rajput Sherwani style 2014-04-23 03-01.JPG',
    'DASH COLLECTION 1.jpg',
    "Groom's outfit.jpg",
  ],
  'Women/Lehenga Choli': [
    'A-store-person-showcases-a-lehenga.jpg',
    'Close-up of a red velvet lehenga with intricate gold embroidery, featuring a choli and a flowing skirt.jpg',
    'Studded Lehenga.jpg',
    'Lehenga-Choli (6375587865).jpg',
    'Historical 1960s Bridal Lehenga Design.png',
  ],
  'Women/Sarees': [
    'Sari 2.jpg',
    'Sari on mannequin for demo.jpg',
    'Women in Saree.jpg',
    'Saree Soiree 1.jpg',
    'Saree Soiree 2.jpg',
    'Saree Soiree 3.jpg',
    'Embroidery on a saree 01.jpg',
  ],
};

function toUrl(filename) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=800`;
}

async function main() {
  const { rows } = await query(
    `SELECT id, images, gender, article_type FROM products WHERE source = 'ethnic_manual_supplement' ORDER BY gender, article_type, id`
  );

  const byCategory = {};
  for (const row of rows) {
    const key = `${row.GENDER}/${row.ARTICLE_TYPE}`;
    (byCategory[key] = byCategory[key] || []).push(row);
  }

  let updated = 0;
  for (const [category, products] of Object.entries(byCategory)) {
    // Normalize everything to plain URL strings first — existing DB values
    // are JSON arrays ('["https://..."]'), new candidates are plain URLs.
    const existingUrls = [...new Set(products.map(p => {
      try { return JSON.parse(p.IMAGES)[0]; } catch { return p.IMAGES; }
    }))];
    const newUrls = (NEW_IMAGES[category] || []).map(toUrl);
    const pool = [...new Set([...existingUrls, ...newUrls])];

    // Round-robin assignment — every product in this category gets spread
    // as evenly as possible across the whole pool instead of clustering.
    for (let i = 0; i < products.length; i++) {
      const newImages = JSON.stringify([pool[i % pool.length]]);
      await query('UPDATE products SET images = :imgs WHERE id = :id', { imgs: newImages, id: products[i].ID });
      updated++;
    }
    console.log(`${category}: ${products.length} products spread across ${pool.length} unique images`);
  }

  console.log(`\nDone — ${updated} products updated.`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
