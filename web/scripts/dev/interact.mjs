// Interaction review: drives the app in headless Chrome and saves screenshots and downloads.
// usage: node scripts/dev/interact.mjs <baseUrl> <outDir>
import puppeteer from "puppeteer-core";
import { mkdirSync, readdirSync, statSync } from "node:fs";

const [base = "http://localhost:3000", out = "/tmp/interact"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const dl = `${out}/downloads`;
mkdirSync(dl, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME ?? "/usr/bin/google-chrome", headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars"],
});
const logs = [];
const page = await browser.newPage();
page.on("console", (m) => { if (["error", "warning"].includes(m.type())) logs.push(`${m.type()}: ${m.text()}`); });
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
const cdp = await page.createCDPSession();
await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: dl });
await page.setViewport({ width: 1440, height: 900 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const check = (label, ok, detail = "") => console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);

// 1. Focus mode on BSD with the keyboard
await page.goto(base + "/", { waitUntil: "networkidle2" });
await wait(2500);
await page.keyboard.press("f");
await wait(600);
check("focus mode on F", await page.$eval(".app", (a) => a.getAttribute("data-focus") === "true"));
await shot("01-focus");
await page.click(".focus-bar-actions button[aria-pressed]");
await wait(400);
check("inspector drawer in focus mode", await page.$eval(".inspector", (el) => getComputedStyle(el).display !== "none"));
await shot("02-focus-drawer");
await page.keyboard.press("Escape");
await wait(200);
await page.keyboard.press("Escape");
await wait(400);
check("Esc leaves focus mode", await page.$eval(".app", (a) => a.getAttribute("data-focus") !== "true"));

// 2. Export PNG and SVG from the BSD curve
const before = new Set(readdirSync(dl));
const exportBtns = await page.$$(".subnav-right button");
await exportBtns[0].click();
await wait(2500);
await exportBtns[1].click();
await wait(2000);
const files = readdirSync(dl).filter((f) => !before.has(f));
check("export produced files", files.length >= 2, files.map((f) => `${f} (${statSync(`${dl}/${f}`).size} B)`).join(", "));
const toast = await page.$eval(".toast", (t) => t.textContent).catch(() => null);
console.log("toast:", toast);

// 3. Command palette navigation
await page.keyboard.down("Control"); await page.keyboard.press("k"); await page.keyboard.up("Control");
await wait(400);
check("palette opens on Ctrl+K", !!(await page.$(".palette")));
await page.keyboard.type("zeros of");
await wait(300);
await shot("03-palette");
await page.keyboard.press("Enter");
await wait(3500);
check("palette navigates to Riemann", page.url().includes("p=riemann"), page.url());

// 4. Select a zero on the critical line
const zero = await page.$('[aria-label^="Zero number 3 "]');
if (zero) { await zero.click(); await wait(800); }
check("zero selection persists in URL", page.url().includes("zero=3"), page.url());
await shot("04-riemann-zero");

// 5. BSD group law: choose two points and step the construction
await page.goto(base + "/?curve=37a1", { waitUntil: "networkidle2" });
await wait(2500);
const addBtn = await page.$$eval(".seg button", (bs) => bs.findIndex((b) => b.textContent?.trim() === "Add P + Q"));
if (addBtn >= 0) { const bs = await page.$$(".seg button"); await bs[addBtn].click(); await wait(400); }
// click the point markers themselves (a group's box centre can fall between marker and label)
const clickPoint = async (i) => { const c = (await page.$$('[data-pt="1"] circle'))[i * 2]; if (c) await c.click(); };
console.log("rational points clickable:", (await page.$$('[data-pt="1"]')).length);
await clickPoint(0); await wait(400); await clickPoint(1); await wait(1500);
check("two points selected in URL", page.url().includes("pt=") && page.url().includes("pt2="), page.url());
await shot("05-bsd-add");

// 6. Keyboard focus visibility through the tabs
await page.goto(base + "/", { waitUntil: "networkidle2" });
await wait(2000);
for (let i = 0; i < 4; i++) { await page.keyboard.press("Tab"); await wait(120); }
const focused = await page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName}.${a.className} ${a.getAttribute("aria-label") ?? a.textContent?.slice(0, 40)}` : null; });
console.log("focused after 4 tabs:", focused);
await shot("06-focus-ring");
await page.keyboard.press("ArrowRight");
await wait(300);
const tabFocus = await page.evaluate(() => document.activeElement?.id ?? null);
console.log("after ArrowRight in tablist:", tabFocus);

// 7. Reduced motion persists across reloads
await page.evaluate(() => localStorage.setItem("noether:motion", "reduce"));
await page.reload({ waitUntil: "networkidle2" });
await wait(1500);
check("reduced motion restored from storage", await page.evaluate(() => document.documentElement.dataset.motion === "reduce"));
await page.evaluate(() => localStorage.removeItem("noether:motion"));

await browser.close();
if (logs.length) console.log(logs.join("\n"));
