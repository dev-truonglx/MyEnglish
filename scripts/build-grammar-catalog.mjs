import fs from "fs";
import path from "path";

const dir = "json-data";
const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));

// Sort by chapter number and part number
files.sort((a, b) => {
  const matchA = a.match(/^ch(\d+)-p(\d+)\.json$/);
  const matchB = b.match(/^ch(\d+)-p(\d+)\.json$/);
  if (!matchA || !matchB) return a.localeCompare(b);
  const chDiff = parseInt(matchA[1], 10) - parseInt(matchB[1], 10);
  if (chDiff !== 0) return chDiff;
  return parseInt(matchA[2], 10) - parseInt(matchB[2], 10);
});

console.log(`Found ${files.length} grammar book files.`);

const fileDataList = files.map(f => {
  const content = fs.readFileSync(path.join(dir, f), "utf8");
  return JSON.parse(content);
});

const catalog = {
  version: 1,
  totalFiles: fileDataList.length,
  files: fileDataList
};

const outPath = path.join("src", "data", "grammarCatalog.json");
fs.writeFileSync(outPath, JSON.stringify(catalog), "utf8");
const stats = fs.statSync(outPath);
console.log(`✅ Saved ${outPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB, ${catalog.files.length} files)`);
