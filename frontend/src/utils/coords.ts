export function pixelToNormalized(
  px: number,
  py: number,
  pageWidth: number,
  pageHeight: number
) {
  return { x: px / pageWidth, y: py / pageHeight };
}

export function normalizedToPixel(
  nx: number,
  ny: number,
  pageWidth: number,
  pageHeight: number
) {
  return { x: nx * pageWidth, y: ny * pageHeight };
}
