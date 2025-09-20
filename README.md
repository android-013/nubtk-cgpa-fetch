## nubtk-cgpa-fetch

This project appears is an automated program to find Northern University of Business and Technology (NUBTK) students information like name and grade point average (CGPA) from the official website by using default password.

## How It Works

1. Program Goes to "https://nubtkhulna.ac.bd/ter"

2. Input A pre programed user name & password and press button to login to students personal page
https://nubtkhulna.ac.bd/ter/panel/overallresult

3. Navigate to Find Name & CGPA with HTML tag & xPath and fetch data and stores in json file
https://nubtkhulna.ac.bd/ter/panel/overallresult

## Project Structure

| File              | Description                                                      |
|-------------------|------------------------------------------------------------------|
| `checkDept.js`    | Find existing department                                         |
| `checkDP.js`      | Find existing department                                         |
| `checkPara.js`    | Check multiple in parallel                                       |
| `checkUsers.js`   | Check users one at a time `main program`                         |
- `npm.json`, `package.json`: Node.js project configuration and dependencies.

## CheckUsers.js Algorithm

### Configuration

Open the script and review the constants at the top:

- **baseUrl** — Root URL of the authorized environment (e.g., your staging clone or local mock).
- **department** — Department code used in constructing IDs.
- **rollStart, rollEnd** — Inclusive roll number range to try.
- **failCheck** — Maximum consecutive login failures before skipping to next session.
- **Year/term loops** — Adjust the ranges/sets to match the sessions you’re auditing.
- **Throttle** — The `setTimeout(500)` between attempts; raise this to reduce load.

### How It Works (Process)

---
1. Launch headless Chromium.
---
2. For each configured session (year × term):
    - Iterate roll numbers in the specified range.
    - Construct a candidate user ID (same value used as password in this script).
    - Open login page, submit credentials, and wait for navigation.
    - **On success:**
        - Visit the results page and extract allowed fields (e.g., name, CGPA).
        - Append a record to memory.
        - Log out, then continue.
    - **On failure or error:**
        - Increment consecutive failure counter.
        - If it reaches `failCheck`, skip the rest of this session (early exit).
    - Close the page and wait briefly (throttle).
---
3. After all sessions:
    - Close the browser.
    - Print a summary table to console.
    - Write `results.json` with collected records.
---

## Data Obtained

| File                      | Description                                  |
|---------------------------|----------------------------------------------|
| `arch.json`               | Architecture Students                        |
| `ce.json`                 | Civil Engineering                            |
| `bba.json`                | Business Administration                      |
| `cse.json`                | Computer Science & Engineering               |
| `eee.json`                | Electrical and Electronic Engineering        |
| `ell.json`                | English Language & Literature                |
| `jmc.json`                | Journalism and Mass Communication            |
| `results.json`            | Initial Results after checking all students  |
| `found_departments.json`  | Found existing departments                   |

## Getting Started
1. **Install dependencies**:

    Install Puppeteer and dependencies for parallel processing:
    ```powershell
    npm install puppeteer
    npm install p-map
    ```

    Or, to install all dependencies at once (if listed in `package.json`):
    ```powershell
    npm install
    ```

2. **Run scripts**:

    You can run any of the JavaScript files using Node.js. For example:
    ```powershell
    node checkDept.js
    ```

## Purpose
Data scraping for analysis and visiulization of students academic performance. 

## Contributing
Feel free to open issues or submit pull requests for improvements or bug fixes.

