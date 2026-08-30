import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const suppliedInput = process.argv[2];
const canonicalPng = path.join(projectRoot, "src/assets/koenen-brand-logo.png");
const inputFile = suppliedInput ? path.resolve(suppliedInput) : canonicalPng;
const webpFile = path.join(projectRoot, "src/assets/koenen-brand-logo.webp");
const pdfJpegFile = path.join(projectRoot, "src/assets/koenen-brand-logo-pdf.jpg");
const publicLogoFile = path.join(projectRoot, "public/logo/koenen.png");
const icon192File = path.join(projectRoot, "public/icons/icon-192.png");
const icon512File = path.join(projectRoot, "public/icons/icon-512.png");

try {
  await fs.access(inputFile);
  if (path.resolve(inputFile) !== path.resolve(canonicalPng)) {
    await fs.copyFile(inputFile, canonicalPng);
  }

  await sharp(canonicalPng)
    .resize({ width: 1400, withoutEnlargement: true })
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toFile(webpFile);

  await sharp(canonicalPng)
    .resize({ width: 1200, withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4", mozjpeg: true })
    .toFile(pdfJpegFile);

  await sharp(canonicalPng)
    .resize({ width: 1400, withoutEnlargement: true })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(publicLogoFile);

  const iconSource = sharp(canonicalPng).extract({ left: 80, top: 0, width: 720, height: 793 });
  await iconSource.clone().resize(192, 192, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } }).png({ compressionLevel: 9 }).toFile(icon192File);
  await iconSource.clone().resize(512, 512, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } }).png({ compressionLevel: 9 }).toFile(icon512File);

  const metadata = await sharp(canonicalPng).metadata();
  const files = await Promise.all([canonicalPng, webpFile, pdfJpegFile, publicLogoFile, icon192File, icon512File].map(async (file) => ({
    file: path.relative(projectRoot, file),
    bytes: (await fs.stat(file)).size,
  })));

  console.log(JSON.stringify({
    source: path.relative(projectRoot, canonicalPng),
    width: metadata.width,
    height: metadata.height,
    hasAlpha: metadata.hasAlpha,
    outputs: files,
  }, null, 2));
} catch (error) {
  console.error("Logo-Verarbeitung fehlgeschlagen:", error);
  process.exit(1);
}
