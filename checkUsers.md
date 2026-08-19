START
│
├── Load Puppeteer + fs
├── Define configuration
├── Define retry()
│
├── Launch browser
├── results = []
├── lastSuccessRoll = rollStart
│
├── FOR year = 16 → 26
│   │
│   └── FOR term = ["03", "01"]
│       │
│       ├── Build session
│       ├── failureCount = 0
│       ├── skipSession = false
│       │
│       └── FOR roll = lastSuccessRoll → rollEnd
│           │
│           ├── Generate userId
│           ├── Create page
│           ├── Set 20s timeout
│           │
│           ├── TRY
│           │   │
│           │   ├── Open login page using retry()
│           │   ├── Enter username
│           │   ├── Enter password
│           │   ├── Submit
│           │   │
│           │   └── Is URL "panel"?
│           │       │
│           │       ├── YES
│           │       │   ├── failureCount = 0
│           │       │   ├── lastSuccessRoll = roll + 1
│           │       │   ├── successCount++
│           │       │   ├── Open overall result
│           │       │   ├── Extract name
│           │       │   ├── Extract CGPA
│           │       │   ├── Save result
│           │       │   └── Logout
│           │       │
│           │       └── NO
│           │           ├── failureCount++
│           │           └── failureCount >= 40?
│           │               └── YES → skip session
│           │
│           ├── CATCH
│           │   ├── failureCount++
│           │   ├── Print error
│           │   └── failureCount >= 40?
│           │       └── YES → skip session
│           │
│           ├── FINALLY
│           │   └── Close page
│           │
│           ├── skipSession?
│           │   └── YES → break
│           │
│           └── Wait 500ms
│
├── Close browser
├── Print results table
├── Write results.json
│
└── END