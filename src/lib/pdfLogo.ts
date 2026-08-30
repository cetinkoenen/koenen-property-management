import pdfLogoDataUrl from "../assets/koenen-brand-logo-pdf.jpg?inline";

export const PDF_LOGO_PIXEL_WIDTH = 1200;
export const PDF_LOGO_PIXEL_HEIGHT = 480;

let cachedHex = "";

export function getPdfLogoHex(): string {
  if (cachedHex) return cachedHex;
  const base64 = pdfLogoDataUrl.slice(pdfLogoDataUrl.indexOf(",") + 1);
  const binary = atob(base64);
  cachedHex = Array.from(binary, (character) => character.charCodeAt(0).toString(16).padStart(2, "0")).join("");
  return cachedHex;
}

export function createPdfLogoObject(): string {
  const hex = getPdfLogoHex();
  return `<< /Type /XObject /Subtype /Image /Width ${PDF_LOGO_PIXEL_WIDTH} /Height ${PDF_LOGO_PIXEL_HEIGHT} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${hex.length + 1} >>\nstream\n${hex}>\nendstream`;
}

export function drawPdfLogo(x: number, y: number, width: number, height = width * PDF_LOGO_PIXEL_HEIGHT / PDF_LOGO_PIXEL_WIDTH): string[] {
  return ["q", `${width} 0 0 ${height} ${x} ${y} cm`, "/BrandLogo Do", "Q"];
}
