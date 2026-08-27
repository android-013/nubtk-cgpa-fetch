const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Serve index.html and static files from the root directory
app.use(express.static(__dirname));

// Explicit route to serve index.html when opening http://localhost:5000/
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "bellFrontend/index.html"));
});

// Helper function to extract numerical CGPA values from any JSON structure
function extractStudents(data) {
  let cgpas = [];

  if (typeof data === "number") {
    if (data >= 0 && data <= 4.0) cgpas.push(data);
  } else if (Array.isArray(data)) {
    for (const item of data) {
      cgpas.push(...extractStudents(item));
    }
  } else if (typeof data === "object" && data !== null) {
    for (const key in data) {
      if (["cgpa", "gpa", "result", "cg"].includes(key.toLowerCase())) {
        const val = Number.parseFloat(data[key]);
        if (!Number.isNaN(val)) cgpas.push(val);
      } else {
        cgpas.push(...extractStudents(data[key]));
      }
    }
  }

  return cgpas;
}

function loadStudentData() {
  const files = [
    "cse25.json",
    "eee25.json",
    "arch25.json",
    "ce25.json",
    "bba25.json",
    "ell25.json",
    "jmc25.json"
  ];

  let students = [];

  for (const file of files) {
    const filePath = path.join(__dirname, file);

    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const json = JSON.parse(raw);

      students.push(...extractStudents(json));
    } catch (error) {
      console.log(`Skipping ${file}: ${error.message}`);
    }
  }

  return students;
}

const studentData = loadStudentData();

// ------------------------------------------------------------------
// Helper Functions
// ------------------------------------------------------------------
function calculateMedian(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function calculateNormalCDF(x, mean, stdDev) {
  if (stdDev === 0) return x >= mean ? 1 : 0;
  const z = (x - mean) / stdDev;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  let p =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) p = 1 - p;
  return p;
}

// ------------------------------------------------------------------
// API Endpoints
// ------------------------------------------------------------------

// GET /api/bell-curve
app.get("/api/bell-curve", (req, res) => {
  try {
    const minLimit = Number.parseFloat(req.query.minCgpa) || 2.0;
    const maxLimit = Number.parseFloat(req.query.maxCgpa) || 4.0;

    const filteredData = studentData.filter(
      (val) => val >= minLimit && val <= maxLimit
    );

    if (filteredData.length === 0) {
      return res
        .status(400)
        .json({ error: "No student data found in the specified range." });
    }

    const totalStudents = filteredData.length;
    const sum = filteredData.reduce((acc, val) => acc + val, 0);
    const mean = sum / totalStudents;
    const median = calculateMedian(filteredData);

    const variance =
      filteredData.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) /
      totalStudents;
    const standardDeviation = Math.sqrt(variance);

    const countsMap = {};
    filteredData.forEach((cgpa) => {
      const key = cgpa.toFixed(2);
      countsMap[key] = (countsMap[key] || 0) + 1;
    });

    const step = 0.02;
    const points = [];

    for (let x = minLimit; x <= maxLimit; x += step) {
      const key = x.toFixed(2);
      const count = countsMap[key] || 0;

      const bellValue =
        (1 / (standardDeviation * Math.sqrt(2 * Math.PI))) *
        Math.exp(-0.5 * Math.pow((x - mean) / standardDeviation, 2));

      points.push({
        cgpa: key,
        count: count,
        bellValueScaled: Number.parseFloat(
          (bellValue * totalStudents * 0.05).toFixed(2)
        )
      });
    }

    res.json({
      totalStudents,
      mean: Number.parseFloat(mean.toFixed(2)),
      median: Number.parseFloat(median.toFixed(2)),
      standardDeviation: Number.parseFloat(standardDeviation.toFixed(2)),
      min: Math.min(...filteredData),
      max: Math.max(...filteredData),
      points
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/percentile
app.get("/api/percentile", (req, res) => {
  try {
    const cgpa = Number.parseFloat(req.query.cgpa);
    const minLimit = Number.parseFloat(req.query.minCgpa) || 2.0;
    const maxLimit = Number.parseFloat(req.query.maxCgpa) || 4.0;

    if (Number.isNaN(cgpa) || cgpa < minLimit || cgpa > maxLimit) {
      return res.status(400).json({
        error: `Please enter a valid CGPA between ${minLimit.toFixed(2)} and ${maxLimit.toFixed(2)}.`
      });
    }

    const filteredData = studentData.filter(
      (val) => val >= minLimit && val <= maxLimit
    );

    const total = filteredData.length;
    if (total === 0) {
      return res.status(400).json({ error: "No data available in this range." });
    }

    const studentsBelow = filteredData.filter((val) => val < cgpa).length;
    const studentsEqual = filteredData.filter((val) => val === cgpa).length;
    const studentsAbove = filteredData.filter((val) => val > cgpa).length;
    const studentsBelowOrEqual = studentsBelow + studentsEqual;

    const bottomPercentage = ((studentsBelow / total) * 100).toFixed(2);
    const topPercentage = ((studentsAbove / total) * 100).toFixed(2);

    const sum = filteredData.reduce((acc, val) => acc + val, 0);
    const mean = sum / total;
    const variance =
      filteredData.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / total;
    const stdDev = Math.sqrt(variance);

    const cdf = calculateNormalCDF(cgpa, mean, stdDev);
    const normalBottomPercentage = (cdf * 100).toFixed(2);
    const normalTopPercentage = ((1 - cdf) * 100).toFixed(2);

    res.json({
      cgpa,
      bottomPercentage: Number.parseFloat(bottomPercentage),
      topPercentage: Number.parseFloat(topPercentage),
      studentsBelow,
      studentsEqual,
      studentsBelowOrEqual,
      studentsAbove,
      normalBottomPercentage: Number.parseFloat(normalBottomPercentage),
      normalTopPercentage: Number.parseFloat(normalTopPercentage)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});