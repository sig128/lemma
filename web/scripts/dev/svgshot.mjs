import puppeteer from "puppeteer-core";
const [file, out] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox", "--allow-file-access-from-files"] });
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 720 });
await page.goto("file://" + file);
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: out });
await browser.close();
