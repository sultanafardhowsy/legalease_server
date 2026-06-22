const express = require('express')
const app = express()
const port = 5000
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require('dotenv').config()
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);




app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3000/",
      "https://yourdomain.com",
    ],
     methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
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
    const hireRequestCollection = database.collection("hireRequests");
    const transactionCollection = database.collection("transaction")
    

    // Existing users route
    app.get('/api/users', async (req, res) => {
      const cursor = userCollection.find().skip(1);
      const result = await cursor.toArray();
      res.send(result);
    })

   

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

    // ✅ FIX: Search by raw string 'id' instead of wrapping it in new ObjectId(id)
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



// POST /api/hire-requests — user sends hire request
app.post('/api/hire-requests', async (req, res) => {
  try {
    const { userId, lawyerId } = req.body;

    if (!userId || !lawyerId) {
      return res.status(400).json({ message: "userId and lawyerId are required." });
    }

    // Prevent duplicate pending request
    const existing = await hireRequestCollection.findOne({ userId, lawyerId, status: "pending" });
    if (existing) {
      return res.status(409).json({ message: "You already have a pending request for this lawyer." });
    }

    const newRequest = {
      userId,
      lawyerId,
      status: "pending",
      requestDate: new Date(),
    };

    const result = await hireRequestCollection.insertOne(newRequest);

    res.status(201).json({ message: "Hire request sent successfully!", insertedId: result.insertedId });
  } catch (error) {
    console.error("Hire Request Error:", error);
    res.status(500).json({ message: "Failed to send hire request.", error: error.message });
  }
});




// GET /api/hire-requests/lawyer/:lawyerId
app.get('/api/hire-requests/lawyer/:lawyerId', async (req, res) => {
  try {
    const { lawyerId } = req.params;

    const requests = await hireRequestCollection
      .find({ lawyerId })
      .sort({ requestDate: -1 })
      .toArray();

    if (requests.length === 0) return res.status(200).json([]);

    const userIds = [...new Set(requests.map(r => r.userId))];

    // ✅ Fix: convert string userIds to ObjectId for lookup
    const users = await userCollection
      .find({ _id: { $in: userIds.map(id => new ObjectId(id)) } })
      .toArray();

    // ✅ Fix: store by string version of _id for matching
    const userMap = {};
    users.forEach(u => { userMap[u._id.toString()] = u; });

    const enriched = requests.map(r => ({
      ...r,
      clientName:  userMap[r.userId]?.name  || "Unknown",
      clientEmail: userMap[r.userId]?.email || "Unknown",
      clientImage: userMap[r.userId]?.image || null,
    }));

    res.status(200).json(enriched);
  } catch (error) {
    console.error("Hiring history error:", error);
    res.status(500).json({ message: "Failed to fetch hiring history.", error: error.message });
  }
});

// PATCH /api/hire-requests/:id — accept or reject
app.patch('/api/hire-requests/:id', async (req, res) => {
  try {
    const { status } = req.body;

    if (!["accepted", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Status must be accepted or rejected." });
    }

    const result = await hireRequestCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Request not found." });
    }

    res.status(200).json({ message: `Request ${status} successfully.` });
  } catch (error) {
    console.error("Update status error:", error);
    res.status(500).json({ message: "Failed to update status.", error: error.message });
  }
});

// GET /api/dashboard/lawyer/:lawyerId — dashboard stats
app.get('/api/dashboard/lawyer/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log("userId received:", userId);

    // Step 1: find lawyer profile where _id matches userId
    const lawyerProfile = await lawyerCollection.findOne({ _id: userId });
    console.log("Lawyer profile found:", lawyerProfile);

    if (!lawyerProfile) {
      return res.status(404).json({ message: "Lawyer profile not found." });
    }

    const lawyerId = lawyerProfile._id.toString();
    console.log("Using lawyerId:", lawyerId);

    // Step 2: count pending requests using lawyerId from lawyers collection
    const pendingCount = await hireRequestCollection.countDocuments({ 
      lawyerId, 
      status: "pending" 
    });

    console.log("Pending count:", pendingCount);

    res.status(200).json({
      pendingRequests: pendingCount,
      status: lawyerProfile?.status || "Available",
      specialization: lawyerProfile?.specialization || "N/A",
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    res.status(500).json({ message: "Failed to fetch dashboard stats.", error: error.message });
  }
});

// GET /api/hire-requests/user/:userId — get all requests for a user
app.get('/api/hire-requests/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const requests = await hireRequestCollection
      .find({ userId })
      .sort({ requestDate: -1 })
      .toArray();

    if (requests.length === 0) return res.status(200).json([]);

    // Get unique lawyerIds
    const lawyerIds = [...new Set(requests.map(r => r.lawyerId))];

    // Fetch lawyer details
    const lawyers = await lawyerCollection
      .find({ _id: { $in: lawyerIds } })
      .toArray();

    // Map lawyerId → lawyer
    const lawyerMap = {};
    lawyers.forEach(l => { lawyerMap[l._id.toString()] = l; });

    // Merge lawyer info into each request
    const enriched = requests.map(r => ({
      ...r,
      lawyerName:           lawyerMap[r.lawyerId]?.name           || "Unknown",
      lawyerSpecialization: lawyerMap[r.lawyerId]?.specialization || "N/A",
      lawyerFee:            lawyerMap[r.lawyerId]?.fee            || 0,
      lawyerImage:          lawyerMap[r.lawyerId]?.imageUrl       || null,
    }));

    res.status(200).json(enriched);
  } catch (error) {
    console.error("User hiring history error:", error);
    res.status(500).json({ message: "Failed to fetch hiring history.", error: error.message });
  }
});

app.post("/api/payment/confirm", async (req, res) => {
  try {
    const { hireRequestId } = req.body;

    console.log("hireRequestId:", hireRequestId);

    const result = await hireRequestCollection.updateOne(
      {
        _id: new ObjectId(hireRequestId),
      },
      {
        $set: {
          status: "paid",
          paidAt: new Date(),
        },
      }
    );

    console.log(result);

    res.status(200).json({
      message: "Payment confirmed.",
      result,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to confirm payment.",
    });
  }
});




// in index.js
app.post('/api/transactions/save-success', async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ success: false, message: "Missing sessionId" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      return res.status(400).json({ success: false, message: "Payment not completed" });
    }

    const existing = await transactionCollection.findOne({ stripeSessionId: sessionId });
    if (existing) {
      return res.status(200).json({ success: true, message: "Already saved" });
    }

    const { hireRequestId, lawyerId, userId } = session.metadata;

    // ✅ Save transaction
    await transactionCollection.insertOne({
      stripeSessionId: session.id,
      hireRequestId,
      lawyerId,
      userId,
      amount: session.amount_total / 100,
      currency: session.currency,
      customerEmail: session.customer_details?.email,
      status: "successful",
      createdAt: new Date(),
    });

    // ✅ Update hire request status to "paid"
    await hireRequestCollection.updateOne(
      { _id: new ObjectId(hireRequestId) },
      { $set: { status: "paid", paidAt: new Date() } }
    );

    res.status(201).json({ success: true, message: "Transaction saved" });

  } catch (error) {
    console.error("Database save error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.patch("/user/:id/plan", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await userCollection.updateOne(
      {
        _id: new ObjectId(id),
        role: "lawyer",
      },
      {
        $set: {
          plan: "paid",
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({
        success: false,
        message: "Lawyer not found",
      });
    }

    res.send({
      success: true,
      message: "Plan updated successfully",
    });
  } catch (error) {
    console.error(error);

    res.status(500).send({
      success: false,
      message: "Server error",
    });
  }
});

// Add this route to your Express backend
app.get("/api/lawyer/check-access/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Look up the user in your database
    const user = await userCollection.findOne({ _id: new ObjectId(id) });

    if (!user) {
      return res.status(404).json({ allowed: false, message: "User not found" });
    }

    // Grant access if their role is lawyer AND their plan is paid
    if (user.role === "lawyer" && user.plan === "paid") {
      return res.status(200).json({ allowed: true });
    }

    // Otherwise, deny access cleanly
    return res.status(200).json({ allowed: false, message: "Account not activated" });

  } catch (error) {
    console.error("Check access error:", error);
    res.status(500).json({ allowed: false, message: "Server database error" });
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