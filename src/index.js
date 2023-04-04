const express = require("express");
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const AWS = require("aws-sdk");
const multer = require("multer");
const cors = require("cors");

require("dotenv").config();
// Create an instance of AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const storage = multer.diskStorage({
  destination: function (req, file, callback) {
    // Set the upload directory path
    callback(null, "./uploads/");
  },
  filename: function (req, file, callback) {
    // Set the file name with a unique identifier and the original extension
    callback(null, uuidv4() + "-" + file.originalname);
  },
});

const upload = multer({ storage: storage });

async function mongo_connect() {
  console.log("connecting db");

  await mongoose.connect(process.env.MONGO_URI);
  console.log("connected to db!");
}
mongo_connect();
// Create a student schema
const studentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  id: { type: Number, required: true },
  projectFile: { type: String, required: true },
});

const classSchema = new mongoose.Schema({
  name: { type: String, required: true },
  students: [studentSchema],
});
const Class = mongoose.model("Class", classSchema);
// Create a student model
const Student = mongoose.model("Student", studentSchema);

// Create an Express app
const app = express();
app.use(express.json());
app.use(cors());

// Define a route to list all students
app.get("/students", async (req, res) => {
  try {
    const students = await Student.find();
    res.json(students);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});
app.post("/deneme", upload.single("reqfile"), (req, res) => {
  const name = req.body.name;
  const number = req.body.number;
  const className = req.body.class;
  const file = req.file;

  console.log("Name:", name);
  console.log("Number:", number);
  console.log("Class:", className);
  console.log("File:", file);
  console.log("BODY headers", req.headers);
  res.status(200).json({ message: "Data received successfully." });
});
app.post("/add-student", (req, res) => {
  // Call the multer upload middleware
  const bodyText = JSON.stringify(req.body);
  console.log("REQ BODY:", bodyText);
  upload.single("projectFile")(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      // A multer error occurred
      return res.status(500).json({ error: err });
    } else if (err) {
      // An unknown error occurred
      return res.status(500).json({ error: err });
    }

    // Create a new unique filename for the project file
    const filename = `${uuidv4()}-${req.file.originalname}`;

    // Set the S3 upload parameters
    const uploadParams = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: filename,
      Body: req.file.buffer,
      ACL: "public-read",
    };

    // Upload the file to S3
    s3.upload(uploadParams, function (err, data) {
      if (err) {
        // S3 upload error
        return res.status(500).json({ error: err });
      }

      // Successfully uploaded to S3, now create the student in the database
      const student = new Student({
        name: req.body.name,
        id: req.body.id,
        projectFile: data.Location, // Store the S3 URL of the file as the projectFile property
      });

      student.save((err) => {
        if (err) {
          // MongoDB save error
          return res.status(500).json({ error: err });
        }

        // Successfully saved student to the database
        return res.status(201).json({ message: "Student added successfully." });
      });
    });
  });
});

app.post("/create-class", async (req, res) => {
  try {
    const { name } = req.body;

    // create the class
    const newClass = await Class.create({ name, students: [] });

    // return the new class
    res.status(201).json({ success: true, data: newClass });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to create class" });
  }
});
app.get("/classes", async (req, res) => {
  try {
    const classes = await Class.find();
    res.status(200).json(classes);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal server error");
  }
});

// Start the server
const PORT = process.env.PORT || 7373;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
