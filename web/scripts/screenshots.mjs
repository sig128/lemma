// Visual review helper: renders routes in headless Chrome at several sizes.
// usage: node scripts/screenshots.mjs <baseUrl> <outDir> "<name>|<path>|<w>x<h>[|<waitMs>][|<js>]" ...
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const [base, out, ...specs] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME ?? "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars"],
});
const logs = [];
for (const spec of specs) {
  const [name, path, size, wait = "2500", js = ""] = spec.split("|");
  const [w, h] = size.split("x").map(Number);
  const page = await browser.newPage();
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) logs.push(`[${name}] ${m.type()}: ${m.text()}`); });
  page.on("pageerror", (e) => logs.push(`[${name}] pageerror: ${e.message}`));
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.goto(base + path, { waitUntil: "networkidle2", timeout: 90000 });
  await new Promise((r) => setTimeout(r, Number(wait)));
  if (js) { await page.evaluate(js); await new Promise((r) => setTimeout(r, 1200)); }
  await page.screenshot({ path: `${out}/${name}.png` });
  await page.close();
  console.log("shot", name);
}
await browser.close();
if (logs.length) console.log(logs.join("\n"));
