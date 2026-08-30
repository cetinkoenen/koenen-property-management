import sharp from "sharp";
import fs from "fs";
import path from "path";

// ======================================================
// Koenen Property Management Logo Optimizer
// Converts huge PNG logo into optimized WebP
// ======================================================

// INPUT FILE
const inputFile = "./src/assets/koenen-brand-logo.png";

// OUTPUT FILE
const outputFile = "./src/assets/koenen-brand-logo.webp";

// ======================================================
// CHECK FILE EXISTS
// ======================================================

if (!fs.existsSync(inputFile)) {
  console.error(`❌ Datei nicht gefunden: ${inputFile}`);
  process.exit(1);
}

// ======================================================
// OPTIMIZATION
// ======================================================

try {
  const beforeStats = fs.statSync(inputFile);

  await sharp(inputFile)
    .resize({
      width: 1200,
      withoutEnlargement: true,
    })
    .webp({
      quality: 75,
      effort: 6,
    })
    .toFile(outputFile);

  const afterStats = fs.statSync(outputFile);

  const beforeMB = (beforeStats.size / 1024 / 1024).toFixed(2);
  const afterMB = (afterStats.size / 1024 / 1024).toFixed(2);

  console.log("✅ Logo erfolgreich optimiert");
  console.log("-----------------------------------");
  console.log(`Vorher: ${beforeMB} MB`);
  console.log(`Nachher: ${afterMB} MB`);
  console.log(`Datei: ${outputFile}`);
  console.log("-----------------------------------");

} catch (error) {
  console.error("❌ Fehler beim Optimieren:");
  console.error(error);
  process.exit(1);
}