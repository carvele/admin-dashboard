import fs from 'fs';
import path from 'path';
import { generateProductMeasurements } from './generate_size_charts.mjs';

const inputFilePath = 'C:/Users/carlv/.gemini/antigravity/brain/a49ee08a-eb86-434f-a4ce-cfc52e60fc13/.system_generated/steps/6763/output.txt';
const rawContent = fs.readFileSync(inputFilePath, 'utf-8');

// Parse the JSON wrapper and extract the products array
const parsedWrapper = JSON.parse(rawContent);
const resultText = parsedWrapper.result || rawContent;
const start = resultText.indexOf('[');
const end = resultText.lastIndexOf(']') + 1;
if (start === -1 || end === 0) {
  throw new Error('Could not find JSON array in output file');
}

const products = JSON.parse(resultText.slice(start, end));
console.log(`Loaded ${products.length} active products from database query.`);

if (products.length !== 214) {
  console.warn(`WARNING: Expected 214 products, found ${products.length}`);
}

const dryRunRows = [];
const sqlStatements = [];
const validationErrors = [];

const REQUIRED_CATEGORY_METRICS = {
  tops: ['bust', 'waist', 'shoulderWidth', 'sleeveLength', 'length'],
  outerwear: ['bust', 'waist', 'shoulderWidth', 'sleeveLength', 'totalLength'],
  pants: ['waist', 'hips', 'thigh', 'inseam', 'outseam'],
  leggings: ['waist', 'hips', 'inseam', 'totalLength'],
  shorts: ['waist', 'hips', 'thigh', 'inseam', 'outseam'],
  skirts: ['waist', 'hips', 'totalLength'],
  dresses: ['bust', 'waist', 'hips', 'shoulderWidth', 'totalLength'],
  jumpsuits: ['bust', 'waist', 'hips', 'inseam', 'totalLength'],
  pajamas: ['bust', 'waist', 'hips', 'totalLength'],
  robes: ['bust', 'waist', 'sleeveLength', 'totalLength'],
  bras: ['bust', 'underbust'],
  shapewear: ['waist', 'hips', 'bust', 'totalLength'],
  swimwear: ['bust', 'waist', 'hips'],
  footwear: ['footLength', 'footWidth'],
  bags: ['width', 'height', 'depth', 'strapLength'],
  belts: ['totalLength', 'width', 'waistFitMin', 'waistFitMax'],
  hats: ['circumference', 'brimWidth', 'crownHeight'],
  scarves: ['totalLength', 'width'],
  watches: ['caseDiameter', 'bandWidth', 'bandLength'],
  jewelry: ['length', 'width'],
};

for (const product of products) {
  const { id, name, category, sub_category, sizes } = product;
  const { templateKey, measurements } = generateProductMeasurements(product);

  const genKeys = Object.keys(measurements);
  const expectedSizes = sizes || [];

  // Validation 1: Every generated measurement key exists in product.sizes
  for (const k of genKeys) {
    if (!expectedSizes.includes(k)) {
      validationErrors.push(`[${id} - ${name}]: Generated key "${k}" is not in product.sizes: ${JSON.stringify(expectedSizes)}`);
    }
  }

  // Validation 1b: Every size in product.sizes has an entry
  for (const s of expectedSizes) {
    if (!measurements[s]) {
      validationErrors.push(`[${id} - ${name}]: Size "${s}" is missing from generated measurements.`);
    }
  }

  // Validation 2: No product receives unrelated category metrics
  const allowedMetrics = REQUIRED_CATEGORY_METRICS[templateKey];
  for (const [sizeToken, metricsObj] of Object.entries(measurements)) {
    for (const [mKey, mVal] of Object.entries(metricsObj)) {
      if (!allowedMetrics.includes(mKey)) {
        validationErrors.push(`[${id} - ${name}]: Metric "${mKey}" is not allowed for category template "${templateKey}"`);
      }
      // Validation 3: No NaN/null/negative measurements
      if (mVal === null || mVal === undefined || typeof mVal !== 'number' || isNaN(mVal) || mVal <= 0) {
        validationErrors.push(`[${id} - ${name}]: Invalid measurement value for ${sizeToken}.${mKey}: ${mVal}`);
      }
    }
  }

  // Validation 4: No malformed legacy keys remain
  for (const k of genKeys) {
    if (k.startsWith('_')) {
      validationErrors.push(`[${id} - ${name}]: Malformed legacy key remaining: "${k}"`);
    }
  }

  // Record dry-run row
  dryRunRows.push({
    id,
    name,
    category,
    sub_category,
    sizes,
    templateKey,
    genKeys,
    measurements,
  });

  // Prepare SQL update statement
  const jsonString = JSON.stringify(measurements).replace(/'/g, "''");
  sqlStatements.push(`UPDATE products SET measurements = '${jsonString}'::jsonb WHERE id = '${id}' AND deleted = false;`);
}

console.log(`Validation completed with ${validationErrors.length} errors.`);
if (validationErrors.length > 0) {
  console.error('Validation Errors Sample:', validationErrors.slice(0, 10));
  process.exit(1);
}

// Generate Markdown Dry-Run Report Artifact
const reportPath = 'C:/Users/carlv/.gemini/antigravity/brain/a49ee08a-eb86-434f-a4ce-cfc52e60fc13/dry_run_size_charts.md';

let markdown = `# Dry-Run Report - Size Chart Data Population (214 Products)

> [!NOTE]
> **DATA CLASSIFICATION**: These measurements are synthetic test/demo data generated from category sizing templates. They are not manufacturer-verified garment specifications. Acceptable for development, QA, demos, and recommender testing.

## Summary & Verification Checks
- **Total active products processed**: ${dryRunRows.length}
- **Validation check 1 (Keys match product.sizes exactly)**: PASS (0 discrepancies)
- **Validation check 2 (No unrelated category metrics)**: PASS (0 discrepancies)
- **Validation check 3 (No NaN / null / negative values)**: PASS (0 invalid numbers)
- **Validation check 4 (No malformed legacy keys remaining)**: PASS (0 legacy keys)
- **Validation check 5 (Canonical size tokens preserved)**: PASS

---

## Detailed Dry-Run Product Audit

| # | Product Name | Category / Subcategory | Sizes | Template | Metric Sample |
|---|---|---|---|---|---|
`;

dryRunRows.forEach((r, idx) => {
  const sampleSize = r.genKeys[0];
  const sampleMetrics = JSON.stringify(r.measurements[sampleSize] || {});
  markdown += `| ${idx + 1} | **${r.name}**<br>\`<small>${r.id}</small>\` | ${r.category} &rarr; ${r.sub_category} | \`${r.sizes.join(', ')}\` | \`${r.templateKey}\` | \`${sampleSize}\`: ${sampleMetrics} |\n`;
});

fs.writeFileSync(reportPath, markdown, 'utf-8');
console.log(`Dry-run report saved to: ${reportPath}`);

// Write SQL file
const sqlFilePath = path.join(process.cwd(), 'scripts', 'apply_size_charts.sql');
const fullSql = `-- DATA CLASSIFICATION: Synthetic test/demo product measurements.
-- Not manufacturer-verified specifications.
BEGIN;

${sqlStatements.join('\n')}

COMMIT;
`;

fs.writeFileSync(sqlFilePath, fullSql, 'utf-8');
console.log(`SQL script generated: ${sqlFilePath} (${sqlStatements.length} updates)`);

// Also generate 3 batches using UPDATE ... FROM (VALUES ...) syntax
const valuesRows = dryRunRows.map(r => {
  const jsonStr = JSON.stringify(r.measurements).replace(/'/g, "''");
  return `('${r.id}', '${jsonStr}')`;
});

const batches = [
  valuesRows.slice(0, 75),
  valuesRows.slice(75, 150),
  valuesRows.slice(150),
];

batches.forEach((b, idx) => {
  const bSql = `UPDATE products AS p
SET measurements = v.m::jsonb
FROM (VALUES
  ${b.join(',\n  ')}
) AS v(id, m)
WHERE p.id = v.id::uuid AND p.deleted = false;`;
  const bPath = path.join(process.cwd(), 'scripts', `batch_${idx + 1}.sql`);
  fs.writeFileSync(bPath, bSql, 'utf-8');
  console.log(`Generated ${bPath} with ${b.length} rows (${bSql.length} chars).`);
});
