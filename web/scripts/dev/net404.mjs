import puppeteer from "puppeteer-core";
const [url] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage();
const bad = [];
page.on("response", (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
page.on("pageerror", (e) => bad.push(`pageerror ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") bad.push(`console ${m.text()}`); });
await page.setViewport({ width: 1440, height: 900 });
for (const p of ["/", "/?p=riemann", "/?p=pnp", "/?p=ns", "/?p=ym", "/?p=hodge", "/?s=research", "/?s=settings", "/?p=archive"]) {
  await page.goto(url + p, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 1500));
}
console.log(bad.length ? bad.join("\n") : "no failed requests or errors");
await browser.close();
