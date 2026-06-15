import { writeFileSync } from "node:fs";

// Lazily import the native renderer so the core tool runs without it.
export async function svgToPng(svg: string, outPath: string): Promise<void> {
  const { Resvg } = await import("@resvg/resvg-js");
  const resvg = new Resvg(svg, {
    fitTo: { mode: "zoom", value: 2 }, // 2x for crisp retina/social screenshots
    font: { loadSystemFonts: true },
    // transparent outside the rounded card; the card draws its own themed bg
  });
  const png = resvg.render().asPng();
  writeFileSync(outPath, png);
}
