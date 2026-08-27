const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// Serve frontend
app.use(express.static(path.join(__dirname, "bellFrontend")));

function parseCgpa(value) {
  const cgpa = Number.parseFloat(value);

  if (Number.isNaN(cgpa)) return null;
  if (cgpa < 2.0 || cgpa > 4.0) return null;

  return cgpa;
}

function extractStudents(data) {
  if (Array.isArray(data)) {
    return data.flatMap(extractStudents);
  }

  if (data && typeof data === "object") {
    if ("cgpa" in data) {
      const cgpa = parseCgpa(data.cgpa);

      if (cgpa !== null) {
        return [
          {
            id: data.id || "",
            name: data.name || "",
            cgpa
          }
        ];
      }
    }

    return Object.values(data).flatMap(extractStudents);
  }

  return [];
}

function loadStudents() {
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

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values, avg) {
  const variance =
    values.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) /
    values.length;

  return Math.sqrt(variance);
}

function normalPdf(x, avg, sd) {
  if (sd === 0) return 0;

  return (
    (1 / (sd * Math.sqrt(2 * Math.PI))) *
    Math.exp(-0.5 * Math.pow((x - avg) / sd, 2))
  );
}

function erf(x) {
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const t = 1 / (1 + p * x);

  const y =
    1 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) *
      t *
      Math.exp(-x * x));

  return sign * y;
}

function normalCdf(x, avg, sd) {
  if (sd === 0) {
    return x < avg ? 0 : 1;
  }

  return 0.5 * (1 + erf((x - avg) / (sd * Math.sqrt(2))));
}

function buildBellCurve(students) {
  const cgpas = students.map((student) => student.cgpa);

  if (cgpas.length === 0) {
    return {
      totalStudents: 0,
      mean: 0,
      standardDeviation: 0,
      min: 0,
      max: 0,
      points: []
    };
  }

  const avg = mean(cgpas);
  const sd = standardDeviation(cgpas, avg);

  const countMap = {};

  for (let i = 200; i <= 400; i++) {
    const cgpa = (i / 100).toFixed(2);
    countMap[cgpa] = 0;
  }

  for (const cgpa of cgpas) {
    const roundedCgpa = Number(cgpa).toFixed(2);
    countMap[roundedCgpa] = (countMap[roundedCgpa] || 0) + 1;
  }

  let maxPdf = 0;

  const rawPoints = [];

  for (let i = 200; i <= 400; i++) {
    const x = i / 100;
    const key = x.toFixed(2);
    const pdf = normalPdf(x, avg, sd);

    if (pdf > maxPdf) maxPdf = pdf;

    rawPoints.push({
      cgpa: key,
      count: countMap[key] || 0,
      bellValue: pdf
    });
  }

  const maxCount = Math.max(...rawPoints.map((point) => point.count), 1);

  const points = rawPoints.map((point) => ({
    cgpa: point.cgpa,
    count: point.count,
    bellValue: point.bellValue,
    bellValueScaled:
      maxPdf === 0
        ? 0
        : Number(((point.bellValue / maxPdf) * maxCount).toFixed(4))
  }));

  return {
    totalStudents: students.length,
    mean: Number(avg.toFixed(4)),
    standardDeviation: Number(sd.toFixed(4)),
    min: Number(Math.min(...cgpas).toFixed(4)),
    max: Number(Math.max(...cgpas).toFixed(4)),
    points
  };
}

app.get("/api/bell-curve", (req, res) => {
  const students = loadStudents();
  const result = buildBellCurve(students);

  res.json(result);
});

app.get("/api/percentile", (req, res) => {
  const inputCgpa = parseCgpa(req.query.cgpa);

  if (inputCgpa === null) {
    return res.status(400).json({
      error: "Invalid CGPA. Please enter a value between 2.00 and 4.00."
    });
  }

  const students = loadStudents();
  const cgpas = students.map((student) => student.cgpa);

  if (cgpas.length === 0) {
    return res.status(404).json({
      error: "No valid CGPA data found."
    });
  }

  const avg = mean(cgpas);
  const sd = standardDeviation(cgpas, avg);

  const studentsBelow = cgpas.filter((cgpa) => cgpa < inputCgpa).length;
  const studentsEqual = cgpas.filter((cgpa) => cgpa === inputCgpa).length;
  const studentsBelowOrEqual = cgpas.filter((cgpa) => cgpa <= inputCgpa).length;
  const studentsAbove = cgpas.filter((cgpa) => cgpa > inputCgpa).length;

  const bottomPercentage = (studentsBelowOrEqual / cgpas.length) * 100;
  const topPercentage = (studentsAbove / cgpas.length) * 100;

  const normalBottomPercentage = normalCdf(inputCgpa, avg, sd) * 100;
  const normalTopPercentage = 100 - normalBottomPercentage;

  res.json({
    cgpa: Number(inputCgpa.toFixed(2)),
    totalStudents: cgpas.length,

    studentsBelow,
    studentsEqual,
    studentsBelowOrEqual,
    studentsAbove,

    bottomPercentage: Number(bottomPercentage.toFixed(2)),
    topPercentage: Number(topPercentage.toFixed(2)),

    normalBottomPercentage: Number(normalBottomPercentage.toFixed(2)),
    normalTopPercentage: Number(normalTopPercentage.toFixed(2)),

    mean: Number(avg.toFixed(4)),
    standardDeviation: Number(sd.toFixed(4))
  });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "bellFrontend", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});