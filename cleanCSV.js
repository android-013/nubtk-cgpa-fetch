const fs = require("fs");
const path = require("path");
const { createObjectCsvWriter } = require("csv-writer");


const files = [
    "cseC.json",
    "eeeC.json",
    "archC.json",
    "ceC.json",
    "bbaC.json",
    "ellC.json",
    "jmcC.json"
];


const invalidValues = [
    "",
    "unknown",
    "n/a",
    "na",
    "null",
    "undefined",
    "missing"
];


// Check invalid values
function isInvalid(value) {

    if (value === null || value === undefined)
        return true;


    if (typeof value === "string") {

        return invalidValues.includes(
            value.trim().toLowerCase()
        );
    }

    return false;
}



// Check student data
function hasInvalidData(student) {

    for (const key in student) {

        if (key === "courses")
            continue;


        if (isInvalid(student[key]))
            return true;
    }


    for (const course of student.courses || []) {

        for (const key in course) {

            if (isInvalid(course[key]))
                return true;
        }
    }


    return false;
}



// Read files

let students = [];


for (const file of files) {

    const filePath = path.join(__dirname, file);


    const data = JSON.parse(
        fs.readFileSync(filePath, "utf8")
    );


    students.push(...data);
}



console.log("Initial:", students.length);



// Remove invalid CGPA

students = students.filter(student => {

    const cgpa = Number(student.cgpa);

    return cgpa > 0 && cgpa <= 4;

});


console.log("After CGPA:", students.length);




// Remove invalid values

students = students.filter(
    student => !hasInvalidData(student)
);


console.log("After invalid data:", students.length);




// Remove duplicate IDs completely

const idFrequency = {};


students.forEach(student => {

    idFrequency[student.id] =
        (idFrequency[student.id] || 0) + 1;

});


students = students.filter(student =>
    idFrequency[student.id] === 1
);



console.log(
    "After duplicate removal:",
    students.length
);





// Find maximum courses

let maxCourses = 0;


students.forEach(student => {

    if (student.courses.length > maxCourses)
        maxCourses = student.courses.length;

});


console.log(
    "Maximum courses:",
    maxCourses
);




// Create CSV headers

let headers = [

    {
        id: "id",
        title: "ID"
    },

    {
        id: "name",
        title: "NAME"
    },

    {
        id: "cgpa",
        title: "CGPA"
    }

];




// Add course columns dynamically

for (let i = 1; i <= maxCourses; i++) {


    headers.push(

        {
            id: `S${i}_CODE`,
            title: `S${i}_CODE`
        },

        {
            id: `S${i}_TITLE`,
            title: `S${i}_TITLE`
        },

        {
            id: `S${i}_CREDIT`,
            title: `S${i}_CREDIT`
        },

        {
            id: `S${i}_GRADE`,
            title: `S${i}_GRADE`
        },

        {
            id: `S${i}_POINT`,
            title: `S${i}_POINT`
        }

    );

}





// Convert students to flat objects

const csvRows = students.map(student => {


    let row = {


        id: student.id,

        name: student.name,

        cgpa: student.cgpa

    };



    student.courses.forEach((course,index)=>{


        const n = index + 1;


        row[`S${n}_CODE`] =
            course.courseCode;


        row[`S${n}_TITLE`] =
            course.courseTitle;


        row[`S${n}_CREDIT`] =
            course.creditHour;


        row[`S${n}_GRADE`] =
            course.grade;


        row[`S${n}_POINT`] =
            course.point;


    });


    return row;

});






// Write CSV

const csvWriter = createObjectCsvWriter({

    path: "clean.csv",

    header: headers

});



csvWriter.writeRecords(csvRows)
.then(()=>{

    console.log(
        "cleaned_students.csv created"
    );

});