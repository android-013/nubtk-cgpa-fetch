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
| `checkPara.js`    | Check multiple users in parallel                                 |
| `checkUsers.js`   | Check users one at a time                                        |

## Data Obtained

| File                      | Description                                  |
|---------------------------|----------------------------------------------|
| `arch.json`               | Architecture students                        |
| `ce.json`                 | Civil engineering                            |
| `eee.json`                | Electrical and electronic engineering        |
| `ell.json`                | English language & literature                |
| `jmc.json`                | Journalism and mass communication            |
| `found_departments.json`  | Found existing departments                   |

- `npm.json`, `package.json`: Node.js project configuration and dependencies.

## Getting Started
1. **Install dependencies** (if any):
   ```powershell
   npm install
   ```
2. **Run scripts**:
   You can run any of the JavaScript files using Node.js. For example:
   ```powershell
   node checkDept.js
   ```

## Purpose
The scripts and data files are likely used to validate, process, or analyze department-related information. Please refer to the source code for specific logic and usage.

## Contributing
Feel free to open issues or submit pull requests for improvements or bug fixes.

