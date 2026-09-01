const fs = require("fs");

const files = [
    "cse25.json",
    "eee25.json",
    "arch25.json",
    "ce25.json",
    "bba25.json",
    "ell25.json",
    "jmc25.json"
];

const OUTPUT_FILE = "clean.json";

const invalidValues = [
    "",
    "unknown",
    "n/a",
    "na",
    "null",
    "undefined",
    "missing"
];


let allStudents = [];


// Read all input files

files.forEach(file => {

    try {

        const data = JSON.parse(
            fs.readFileSync(file, "utf8")
        );


        if (Array.isArray(data)) {
            allStudents.push(...data);
        }


        console.log(`${file} loaded`);

    } catch(error) {

        console.log(
            `Could not read ${file}: ${error.message}`
        );

    }

});


console.log(
    `Total records before cleaning: ${allStudents.length}`
);



// Cleaning function

function cleanData(records) {


    // Remove invalid records

    let validRecords = records.filter(student => {


        if (
            !student.id ||
            !student.name ||
            !student.cgpa
        ) {
            return false;
        }



        const id = String(student.id)
                    .trim()
                    .toLowerCase();


        const name = String(student.name)
                      .trim()
                      .toLowerCase();


        const cgpaText = String(student.cgpa)
                         .trim()
                         .toLowerCase();



        // Remove unknown / n/a values

        if (
            invalidValues.includes(id) ||
            invalidValues.includes(name) ||
            invalidValues.includes(cgpaText)
        ) {
            return false;
        }



        // Validate CGPA

        const cgpa = Number(cgpaText);


        if (
            isNaN(cgpa) ||
            cgpa <= 0 ||
            cgpa > 4
        ) {
            return false;
        }


        return true;

    });



    // Count duplicate IDs

    const idFrequency = {};


    validRecords.forEach(student => {

        const id = student.id.trim();

        idFrequency[id] =
            (idFrequency[id] || 0) + 1;

    });



    // Remove ALL duplicate IDs

    validRecords = validRecords.filter(student => {

        return idFrequency[student.id.trim()] === 1;

    });



    return validRecords;

}



// Clean data

const cleanedData = cleanData(allStudents);



console.log(
    `Total records after cleaning: ${cleanedData.length}`
);



// Save output

fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(cleanedData, null, 2),
    "utf8"
);


console.log(
    `Successfully created ${OUTPUT_FILE}`
);