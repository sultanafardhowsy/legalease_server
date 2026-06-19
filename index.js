const express = require('express')
const app = express()
const port = 5000
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require('dotenv').config()

// app.use(
//   cors({
//     origin: [
//       "http://localhost:3000",
//       "https://yourdomain.com",
//     ],
//     credentials: true,
//   })
// );

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3000/",
      "https://yourdomain.com",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  })
);
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello World!')
})

const uri = process.env.MONGODB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();

    const database = client.db("legalease_user");
    
    const userCollection = database.collection("user");
    const lawyerCollection = database.collection("lawyers");

    // Existing users route
    app.get('/api/users', async (req, res) => {
      const cursor = userCollection.find().skip(1);
      const result = await cursor.toArray();
      res.send(result);
    })

    // app.get('/api/lawyers', async (req, res) => {
    //   const cursor = lawyerCollection.find().skip(1);
    //   const result = await cursor.toArray();
    //   res.send(result);
    // })

    // 2. NEW POST API: Save lawyer details for the first time
    app.post('/api/lawyer/profile', async (req, res) => {
      try {
        const { id, name, specialization, bio, fee, status, imageUrl, dateJoined } = req.body;

        // Validation guard checklist
        if (!id || !name || !specialization || !bio || !fee || !imageUrl) {
          return res.status(400).json({ message: "All fields are required for initial profile registration." });
        }

        // Check if a profile already exists for this exact user id string
        const existingProfile = await lawyerCollection.findOne({ _id: id });
        if (existingProfile) {
          return res.status(400).json({ message: "A lawyer profile already exists for this user account." });
        }

        // Structure the pristine document mapping the 'id' parameter directly to '_id'
        const newLawyerDoc = {
          _id: id, 
          name,
          specialization,
          bio,
          fee: Number(fee), // Safely cast incoming payload value to numeric type
          status: status || 'Available',
          imageUrl,
          dateJoined: dateJoined ? new Date(dateJoined) : new Date()
        };

        const result = await lawyerCollection.insertOne(newLawyerDoc);
        
        res.status(201).json({ 
          message: "Lawyer profile registered successfully!", 
          insertedId: result.insertedId 
        });

      } catch (apiError) {
        console.error("API Profile Error:", apiError);
        res.status(500).json({ message: "Internal server registry breakdown.", error: apiError.message });
      }
    });


    // 1. GET API: Fetch a single lawyer's data by their string ID on component load
app.get('/api/lawyer/profile/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const profile = await lawyerCollection.findOne({ _id: id });
    
    if (!profile) {
      return res.status(404).json({ message: "No profile found for this user id." });
    }
    
    res.status(200).json(profile);
  } catch (error) {
    res.status(500).json({ message: "Database read error.", error: error.message });
  }
});

// 2. PUT API: Update an existing lawyer profile
app.put('/api/lawyer/profile/update', async (req, res) => {
  try {
    const { id, name, specialization, bio, fee, status, imageUrl } = req.body;

    if (!id || !name || !specialization || !bio || !fee || !imageUrl) {
      return res.status(400).json({ message: "All form fields are required to update your profile." });
    }

    const result = await lawyerCollection.updateOne(
      { _id: id },
      { 
        $set: { 
          name,
          specialization,
          bio,
          fee: Number(fee),
          status,
          imageUrl
          // Notice we do NOT change 'dateJoined' to keep their initial history intact
        } 
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "No active profile found matching this user ID." });
    }

    res.status(200).json({ message: "Profile updated successfully!" });
  } catch (error) {
    console.error("MongoDB Update Error:", error);
    res.status(500).json({ message: "Database entry change failed.", error: error.message });
  }
});

//get all lw=awyers
app.get("/api/lawyers", async (req, res) => {
  try {
    const { search, specialization, sort } = req.query;
    const query = {};

    // 1. Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { specialization: { $regex: search, $options: "i" } },
      ];
    }

    // 2. Specialization filter
    if (specialization && specialization !== "all") {
      query.specialization = specialization;
    }

    // 3. Sorting logic
    let sortOption = { dateJoined: -1 };

    if (sort === "fee-low") {
      sortOption = { fee: 1 }; // Ascending
    } else if (sort === "fee-high") {
      sortOption = { fee: -1 }; // Descending
    } else if (sort === "newest") {
      sortOption = { dateJoined: -1 };
    }

    // ❌ FIXED THE TYPO HERE: Changed lawyersCollection to lawyerCollection
    const lawyers = await lawyerCollection
      .find(query)
      .sort(sortOption)
      .toArray();

    res.status(200).send(lawyers);
  } catch (error) {
    console.error("Backend API Error:", error);
    res.status(500).send({ message: "Failed to fetch lawyers", error: error.message });
  }
});

    await client.db("admin").command({ ping: 1 });
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error(error);
  }
}

run();

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})