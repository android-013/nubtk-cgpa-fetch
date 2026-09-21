## nubtk-cgpa-fetch

This project appears is an automated program to find Northern University of Business and Technology (NUBTK) students information like name and grade point average (CGPA) from the official website by using default password.

## How It Works

1. Program Goes to "https://nubtkhulna.ac.bd/ter"

2. Input A pre programed user name & password and press button to login to students personal page
https://nubtkhulna.ac.bd/ter/panel/overallresult

3. Navigate to Find Name & CGPA with HTML tag & xPath and fetch data and stores in json file
https://nubtkhulna.ac.bd/ter/panel/overallresult

## AI won't build anything illegal
## But human will

## Project Structure

| File              | Description                                                      |
|-------------------|------------------------------------------------------------------|
| `checkUsers.js`   | Check users one at a time `main program`                         |
| `checkCourse.js`  | Extract all data `extended version of checkUsers.js`             |
| `dna.js`          | Academic dna data visualisation                                  |
| `dna.py`          | Simple academic analysis                                         |
| `dna.csv`         | Dna analysis clustering                                          |
| `clean.js`        | Clean all students course data                                   |
| `clean.csv`       | Combined cleaned data                                            |
|-------------------|------------------------------------------------------------------|
| `arch.json`       | Architecture department                                          |
| `bba.json`        | Business Administration department                               |
| `ce.json`         | Civil Engineering department                                     |
| `cse.json`        | Computer Science & Engineering department                        |
| `eee.json`        | Electrical and Electronic Engineering department                 |
| `ell.json`        | English Language & Literature department                         |
| `jmc.json`        | Journalism and Mass Communication department                     |
|-------------------|------------------------------------------------------------------|
| `arch25.json`     | Architecture department upto fall 2025                           |
| `bba25.json`      | Business Administration department upto fall 2025                |
| `ce25.json`       | Civil Engineering department upto fall 2025                      |
| `cse25.json`      | Computer Science & Engineering department upto fall 2025         |
| `eee25.json`      | Electrical and Electronic Engineering department upto fall 2025  |
| `ell25.json`      | English Language & Literature department upto fall 2025          |
| `jmc25.json`      | Journalism and Mass Communication department upto fall 2025      |
|-------------------|------------------------------------------------------------------|
| `archC.json`      | Architecture department with Courses                             |
| `bbaC.json`       | Business Administration department with Courses                  |
| `ceC.json`        | Civil Engineering department with Courses                        |
| `cseC.json`       | Computer Science & Engineering department with Courses           |
| `eeeC.json`       | Electrical and Electronic Engineering department with Courses    |
| `ellC.json`       | English Language & Literature department with Courses            |
| `jmcC.json`       | Journalism and Mass Communication department with Courses        |
|-------------------|------------------------------------------------------------------|
  

- `npm.json`, `package.json`: Node.js project configuration and dependencies.

## CheckUsers.js Algorithm

```mermaid
flowchart TD

A([START]) --> B["Load Puppeteer + fs"]
B --> C["Define configuration"]
C --> D["Define retry function"]
D --> E["Launch browser"]
E --> F["results = []<br/>lastSuccessRoll = rollStart"]

F --> G{"FOR year = 16 → 26"}

G --> H{"FOR term = 03, 01"}

H --> I["Build session"]
I --> J["failureCount = 0<br/>skipSession = false"]

J --> K{"FOR roll = lastSuccessRoll → rollEnd"}

K --> L["Generate userId"]
L --> M["Create page"]
M --> N["Set 20s timeout"]

N --> O["TRY"]

O --> P["Open login page using retry()"]
P --> Q["Enter username"]
Q --> R["Enter password"]
R --> S["Submit"]

S --> T{"Is URL panel?"}


T -->|YES| U["Login Success"]

U --> V["Reset failureCount = 0<br/>Update lastSuccessRoll<br/>successCount++"]

V --> W["Open overall result"]

W --> X["Extract Name"]

X --> Y["Extract CGPA"]

Y --> Z["Save result"]

Z --> AA["Logout"]


T -->|NO| AB["Login Failed<br/>failureCount++"]

AB --> AC{"failureCount >= 40?"}

AC -->|YES| AD["skipSession = true"]

AC -->|NO| K


O --> AE["CATCH"]

AE --> AF["failureCount++"]

AF --> AG["Print error"]

AG --> AH{"failureCount >= 40?"}

AH -->|YES| AD

AH -->|NO| K


AA --> AI["FINALLY"]

AD --> AI

AI --> AJ["Close page"]

AJ --> AK{"skipSession?"}

AK -->|YES| AL["Break inner roll loop"]

AK -->|NO| AM["Wait 500ms"]

AM --> K

AL --> H

H --> G

G --> AN["Close browser"]

AN --> AO["Print results table"]

AO --> AP["Write results.json"]

AP --> AQ([END])



%% COLOR SCHEME

classDef startEnd fill:#2ecc71,stroke:#145a32,color:white,font-weight:bold;

classDef process fill:#3498db,stroke:#1b4f72,color:white;

classDef loop fill:#9b59b6,stroke:#512e5f,color:white;

classDef decision fill:#f1c40f,stroke:#7d6608,color:black;

classDef success fill:#58d68d,stroke:#196f3d,color:black;

classDef error fill:#e74c3c,stroke:#922b21,color:white;

classDef extract fill:#17a2b8,stroke:#0b5345,color:white;


%% APPLY COLORS

class A,AQ startEnd;

class B,C,D,E,F,I,J,L,M,N,O,P,Q,R,S,AN,AO,AP process;

class G,H,K loop;

class T,AC,AH,AK decision;

class U,V,AA success;

class AB,AD,AE,AF,AG error;

class W,X,Y,Z extract;

class AI,AJ,AL,AM process;

```

### Later version
`checkCourse.js`

extended version of checkuser.js which scraps all course data including serial number, course code, course title, creadit hour, grade, cgpa all together

## CheckCourse.js Algorithm

```mermaid
flowchart TD

A([START]) --> B["Load Puppeteer and fs"]

B --> C["Define Configuration<br/>
baseUrl, department, roll range,<br/>
session range, partition, failCheck"]

C --> D["Define appendToJSON()"]

D --> E{"JSON file exists?"}

E -->|YES| F["Read existing JSON data"]
E -->|NO| G["Create empty data array"]

F --> H["Parse JSON data"]
G --> H

H --> I["Push new data and write JSON file"]

I --> J["Define retry() function<br/>
Retry failed operations"]

J --> K["Launch Puppeteer Browser"]

K --> L["Initialize variables<br/>
unchanged=[]<br/>
lastSuccessRoll=rollStart"]

L --> M{"FOR year = sessionStart → sessionEnd"}

M --> N{"FOR term = 01,03"}

N --> O["Create session ID"]

O --> P["failureCount=0<br/>skipSession=false"]

P --> Q{"FOR roll = lastSuccessRoll → rollEnd"}

Q --> R["Generate User ID"]

R --> S["Create browser page"]

S --> T["Set timeout 20 seconds"]

T --> U["TRY"]

U --> V["Open login page using retry()"]

V --> W["Enter username and password"]

W --> X["Submit login"]

X --> Y{"URL contains panel?"}


Y -->|YES| Z["Login Success"]

Z --> AA["Reset failureCount<br/>Update roll<br/>successCount++"]

AA --> AB["Open overall result page"]

AB --> AC["Extract Student Information"]

AC --> AD["Extract ID and Name"]

AD --> AE["Extract Course Table"]

AE --> AF["Extract CGPA"]

AF --> AG["Create student object"]

AG --> AH["Save data using appendToJSON"]

AH --> AI["Logout"]


Y -->|NO| AJ["Login Failed<br/>failureCount++"]

AJ --> AK{"failureCount >= failCheck?"}

AK -->|YES| AL["skipSession=true<br/>Break session"]

AK -->|NO| AM["Continue loop"]


U --> AN["CATCH Error"]

AN --> AO["failureCount++"]

AO --> AP["Print timeout/error"]

AP --> AQ{"failureCount >= failCheck?"}

AQ -->|YES| AL

AQ -->|NO| AM


AI --> AR["FINALLY"]

AL --> AR

AR --> AS["Close browser page"]

AS --> AT{"skipSession?"}

AT -->|YES| AU["Break roll loop"]

AT -->|NO| AV["Wait 500ms"]

AV --> Q

AU --> N

N --> M

M --> AW["Close browser"]

AW --> AX["Print COMPLETE"]

AX --> AY([END])


%% COLORS

classDef startEnd fill:#2ecc71,stroke:#145a32,color:white,font-weight:bold;

classDef process fill:#3498db,stroke:#1b4f72,color:white;

classDef loop fill:#9b59b6,stroke:#512e5f,color:white;

classDef decision fill:#f1c40f,stroke:#7d6608,color:black;

classDef success fill:#58d68d,stroke:#196f3d,color:black;

classDef error fill:#e74c3c,stroke:#922b21,color:white;

classDef extract fill:#17a2b8,stroke:#0b5345,color:white;


%% APPLY COLORS

class A,AY startEnd;

class B,C,D,F,G,H,I,J,K,L,O,P,R,S,T,U,V,W,X,AM,AR,AS,AV,AW,AX process;

class M,N,Q loop;

class E,Y,AK,AQ,AT decision;

class Z,AA,AI success;

class AJ,AL,AN,AO,AP error;

class AC,AD,AE,AF,AG,AH extract;

```

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

