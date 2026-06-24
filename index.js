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
      "https://leagalease-client.vercel.app",
      "https://leagalease-client.vercel.app/",
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

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    const database = client.db("legalease_user");
    const userCollection = database.collection("user");
    const lawyerCollection = database.collection("lawyers");
    const hireRequestCollection = database.collection("hireRequests");
    const transactionCollection = database.collection("transaction");
    const commentCollection = database.collection("comments");

    // POST /api/comments
    app.post('/api/comments', async (req, res) => {
      try {
        const { lawyerId, userId, userName, userImage, text } = req.body;
        if (!lawyerId || !userId || !text) {
          return res.status(400).json({ message: "Missing required comment fields." });
        }
        const hasHired = await hireRequestCollection.findOne({ userId, lawyerId, status: "paid" });
        if (!hasHired) {
          return res.status(403).json({ message: "Access Denied. Only clients who have completed payment for this lawyer can leave a review." });
        }
        const newComment = {
          lawyerId, userId,
          userName: userName || "Anonymous Client",
          userImage: userImage || null,
          text,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        const result = await commentCollection.insertOne(newComment);
        res.status(201).json({ message: "Comment posted successfully!", insertedId: result.insertedId });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to post comment." });
      }
    });

    // GET /api/comments/check-eligibility — must be before /api/comments/lawyer/:lawyerId
    app.get('/api/comments/check-eligibility', async (req, res) => {
      try {
        const { userId, lawyerId } = req.query;
        const hasHired = await hireRequestCollection.findOne({ userId, lawyerId, status: "paid" });
        res.status(200).json({ canComment: !!hasHired });
      } catch (error) {
        res.status(500).json({ canComment: false });
      }
    });

    // GET /api/comments/client/:userId — must be before /api/comments/:id
    app.get('/api/comments/client/:userId', async (req, res) => {
      try {
        const { userId } = req.params;
        const comments = await commentCollection.find({ userId }).toArray();
        const enriched = await Promise.all(
          comments.map(async (comment) => {
            const lawyer = await lawyerCollection.findOne({ _id: comment.lawyerId });
            return { ...comment, lawyerName: lawyer?.name || "Unknown Professional" };
          })
        );
        res.status(200).json(enriched);
      } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ message: "Failed to fetch comments." });
      }
    });

    // GET /api/comments/lawyer/:lawyerId
    app.get('/api/comments/lawyer/:lawyerId', async (req, res) => {
      try {
        const { lawyerId } = req.params;
        const comments = await commentCollection.find({ lawyerId }).sort({ createdAt: -1 }).toArray();
        res.status(200).json(comments);
      } catch (error) {
        res.status(500).json({ message: "Failed to fetch comments." });
      }
    });

    // PATCH /api/comments/:id
    app.patch('/api/comments/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const { text, userId } = req.body;
        if (!text || text.trim() === "") {
          return res.status(400).json({ message: "Comment text cannot be empty." });
        }
        const comment = await commentCollection.findOne({ _id: new ObjectId(id) });
        if (!comment) return res.status(404).json({ message: "Comment not found." });
        if (comment.userId !== userId) return res.status(403).json({ message: "Unauthorized. You can only edit your own reviews." });
        await commentCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { text, updatedAt: new Date() } }
        );
        res.status(200).json({ message: "Comment updated successfully." });
      } catch (error) {
        res.status(500).json({ message: "Failed to update comment." });
      }
    });

    // PUT /api/comments/:id
    app.put('/api/comments/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const { userId, text } = req.body;
        const result = await commentCollection.updateOne(
          { _id: new ObjectId(id), userId },
          { $set: { text, updatedAt: new Date() } }
        );
        if (result.matchedCount === 0) return res.status(403).json({ message: "Unauthorized or comment not found." });
        res.status(200).json({ message: "Comment updated successfully!" });
      } catch (error) {
        res.status(500).json({ message: "Failed to update comment." });
      }
    });

    // DELETE /api/comments/:id
    app.delete('/api/comments/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const { userId } = req.body;
        const comment = await commentCollection.findOne({ _id: new ObjectId(id) });
        if (!comment) return res.status(404).json({ message: "Comment not found." });
        if (comment.userId !== userId) return res.status(403).json({ message: "Unauthorized. You can only delete your own reviews." });
        await commentCollection.deleteOne({ _id: new ObjectId(id) });
        res.status(200).json({ message: "Comment deleted successfully." });
      } catch (error) {
        res.status(500).json({ message: "Failed to delete comment." });
      }
    });

    // POST /api/lawyer/profile
    app.post('/api/lawyer/profile', async (req, res) => {
      try {
        const { id, name, specialization, bio, fee, status, imageUrl, dateJoined } = req.body;
        if (!id || !name || !specialization || !bio || !fee || !imageUrl) {
          return res.status(400).json({ message: "All fields are required for initial profile registration." });
        }
        const existingProfile = await lawyerCollection.findOne({ _id: id });
        if (existingProfile) {
          return res.status(400).json({ message: "A lawyer profile already exists for this user account." });
        }
        const newLawyerDoc = {
          _id: id, name, specialization, bio,
          fee: Number(fee),
          status: status || 'Available',
          imageUrl,
          dateJoined: dateJoined ? new Date(dateJoined) : new Date()
        };
        const result = await lawyerCollection.insertOne(newLawyerDoc);
        res.status(201).json({ message: "Lawyer profile registered successfully!", insertedId: result.insertedId });
      } catch (apiError) {
        console.error("API Profile Error:", apiError);
        res.status(500).json({ message: "Internal server registry breakdown.", error: apiError.message });
      }
    });

    // PUT /api/lawyer/profile/update — must be before /api/lawyer/profile/:id
    app.put('/api/lawyer/profile/update', async (req, res) => {
      try {
        const { id, name, specialization, bio, fee, status, imageUrl } = req.body;
        if (!id || !name || !specialization || !bio || !fee || !imageUrl) {
          return res.status(400).json({ message: "All form fields are required to update your profile." });
        }
        const result = await lawyerCollection.updateOne(
          { _id: id },
          { $set: { name, specialization, bio, fee: Number(fee), status, imageUrl } }
        );
        if (result.matchedCount === 0) return res.status(404).json({ message: "No active profile found matching this user ID." });
        res.status(200).json({ message: "Profile updated successfully!" });
      } catch (error) {
        console.error("MongoDB Update Error:", error);
        res.status(500).json({ message: "Database entry change failed.", error: error.message });
      }
    });

    // GET /api/lawyer/profile/:id
    app.get('/api/lawyer/profile/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const profile = await lawyerCollection.findOne({ _id: id });
        if (!profile) return res.status(404).json({ message: "No profile found for this user id." });
        res.status(200).json(profile);
      } catch (error) {
        res.status(500).json({ message: "Database read error.", error: error.message });
      }
    });

    // GET /api/lawyers/specializations — must be before /api/lawyers
    app.get("/api/lawyers/specializations", async (req, res) => {
      try {
        const specs = await lawyerCollection
          .aggregate([
            { $group: { _id: "$specialization" } },
            { $match: { _id: { $ne: null } } },
            { $sort: { _id: 1 } },
          ])
          .toArray();
        res.status(200).send(specs.map((s) => s._id));
      } catch (error) {
        console.error("Specializations error:", error);
        res.status(500).send({ message: "Failed to fetch specializations", error: error.message });
      }
    });

    // GET /api/lawyers
    app.get("/api/lawyers", async (req, res) => {
      try {
        const { search, specialization, sort, minFee, maxFee, availability } = req.query;
        const query = {};

        if (search) {
          query.$or = [
            { name: { $regex: search, $options: "i" } },
            { specialization: { $regex: search, $options: "i" } },
          ];
        }

        if (specialization && specialization !== "all") {
          if (query.$or) {
            query.$and = [{ $or: query.$or }, { specialization }];
            delete query.$or;
          } else {
            query.specialization = specialization;
          }
        }

        if (minFee || maxFee) {
          query.fee = {};
          if (minFee) query.fee.$gte = Number(minFee);
          if (maxFee) query.fee.$lte = Number(maxFee);
        }

        if (availability && availability !== "all") {
          query.status = availability;
        }

        let sortOption = { dateJoined: -1 };
        if (sort === "fee-low")       sortOption = { fee: 1 };
        else if (sort === "fee-high") sortOption = { fee: -1 };
        else if (sort === "newest")   sortOption = { dateJoined: -1 };

        const lawyers = await lawyerCollection.find(query).sort(sortOption).toArray();

        const normalized = lawyers.map((l) => ({
          ...l,
          dateJoined: l.dateJoined?.$date ? new Date(l.dateJoined.$date) : l.dateJoined,
        }));

        res.status(200).send(normalized);
      } catch (error) {
        console.error("Backend API Error:", error);
        res.status(500).send({ message: "Failed to fetch lawyers", error: error.message });
      }
    });

    // POST /api/hire-requests
    app.post('/api/hire-requests', async (req, res) => {
      try {
        const { userId, lawyerId } = req.body;
        if (!userId || !lawyerId) return res.status(400).json({ message: "userId and lawyerId are required." });
        const existing = await hireRequestCollection.findOne({ userId, lawyerId, status: "pending" });
        if (existing) return res.status(409).json({ message: "You already have a pending request for this lawyer." });
        const result = await hireRequestCollection.insertOne({
          userId, lawyerId, status: "pending", requestDate: new Date(),
        });
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
        const requests = await hireRequestCollection.find({ lawyerId }).sort({ requestDate: -1 }).toArray();
        if (requests.length === 0) return res.status(200).json([]);
        const userIds = [...new Set(requests.map(r => r.userId))];
        const users = await userCollection.find({ _id: { $in: userIds.map(id => new ObjectId(id)) } }).toArray();
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

    // GET /api/hire-requests/user/:userId
    app.get('/api/hire-requests/user/:userId', async (req, res) => {
      try {
        const { userId } = req.params;
        const requests = await hireRequestCollection.find({ userId }).sort({ requestDate: -1 }).toArray();
        if (requests.length === 0) return res.status(200).json([]);
        const lawyerIds = [...new Set(requests.map(r => r.lawyerId))];
        const lawyers = await lawyerCollection.find({ _id: { $in: lawyerIds } }).toArray();
        const lawyerMap = {};
        lawyers.forEach(l => { lawyerMap[l._id.toString()] = l; });
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

    // PATCH /api/hire-requests/:id
    app.patch('/api/hire-requests/:id', async (req, res) => {
      try {
        const { status } = req.body;
        if (!["accepted", "rejected"].includes(status)) return res.status(400).json({ message: "Status must be accepted or rejected." });
        const result = await hireRequestCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { status } }
        );
        if (result.matchedCount === 0) return res.status(404).json({ message: "Request not found." });
        res.status(200).json({ message: `Request ${status} successfully.` });
      } catch (error) {
        console.error("Update status error:", error);
        res.status(500).json({ message: "Failed to update status.", error: error.message });
      }
    });

    // GET /api/dashboard/lawyer/:userId
    app.get('/api/dashboard/lawyer/:userId', async (req, res) => {
      try {
        const { userId } = req.params;
        const lawyerProfile = await lawyerCollection.findOne({ _id: userId });
        if (!lawyerProfile) return res.status(404).json({ message: "Lawyer profile not found." });
        const lawyerId = lawyerProfile._id.toString();
        const pendingCount = await hireRequestCollection.countDocuments({ lawyerId, status: "pending" });
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

    // POST /api/payment/confirm
    app.post("/api/payment/confirm", async (req, res) => {
      try {
        const { hireRequestId } = req.body;
        const result = await hireRequestCollection.updateOne(
          { _id: new ObjectId(hireRequestId) },
          { $set: { status: "paid", paidAt: new Date() } }
        );
        res.status(200).json({ message: "Payment confirmed.", result });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to confirm payment." });
      }
    });

    // POST /api/transactions/save-success
    app.post('/api/transactions/save-success', async (req, res) => {
      try {
        const { sessionId } = req.body;
        if (!sessionId) return res.status(400).json({ success: false, message: "Missing sessionId" });
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status !== 'paid') return res.status(400).json({ success: false, message: "Payment not completed" });
        const existing = await transactionCollection.findOne({ stripeSessionId: sessionId });
        if (existing) return res.status(200).json({ success: true, message: "Already saved" });
        const { hireRequestId, lawyerId, userId } = session.metadata;
        await transactionCollection.insertOne({
          stripeSessionId: session.id, hireRequestId, lawyerId, userId,
          amount: session.amount_total / 100,
          currency: session.currency,
          customerEmail: session.customer_details?.email,
          status: "successful",
          createdAt: new Date(),
        });
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

    // PATCH /user/:id/plan
   app.patch("/api/user/:id/plan", async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, sessionId } = req.body; // ← receive from frontend

    const result = await userCollection.updateOne(
      { _id: new ObjectId(id), role: "lawyer" },
      {
        $set: {
          plan: "paid",
          planActivatedAt: new Date(),
          planAmount: amount || 0,        // ← dynamic from frontend
          stripeSessionId: sessionId,     // ← store session id for reference
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "Lawyer not found" });
    }

    res.json({ success: true, message: "Plan updated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

    // GET /api/lawyer/check-access/:id
    app.get("/api/lawyer/check-access/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const user = await userCollection.findOne({ _id: new ObjectId(id) });
        if (!user) return res.status(404).json({ allowed: false, message: "User not found" });
        if (user.role === "lawyer" && user.plan === "paid") return res.status(200).json({ allowed: true });
        return res.status(200).json({ allowed: false, message: "Account not activated" });
      } catch (error) {
        console.error("Check access error:", error);
        res.status(500).json({ allowed: false, message: "Server database error" });
      }
    });

   //api for admin
// 1. GET ALL USERS
app.get("/api/users", async (req, res) => {
  try {
    const users = await userCollection.find({}).toArray();
    res.json(users);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. UPDATE USER ROLE
app.patch("/api/users/:id/role", async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    const result = await userCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { role: role, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({ success: true, message: "User role updated successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. DELETE USER
app.delete("/api/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await userCollection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET ADMIN DASHBOARD OVERVIEW METRICS
app.get("/api/admin/stats", async (req, res) => {
  try {
    // 1. Total count of all documents inside user collection
    const totalUsers = await userCollection.countDocuments({});

    // 2. Count users whose role field is exactly "lawyer"
    const totalLawyers = await userCollection.countDocuments({ role: "lawyer" });

    // 3. Aggregate total transaction calculations (calculating the sum of all planAmount values)
    const revenueData = await userCollection.aggregate([
      { $match: { planAmount: { $exists: true } } },
      { $group: { _id: null, totalSales: { $sum: "$planAmount" } } }
    ]).toArray();

    const totalRevenue = revenueData.length > 0 ? revenueData[0].totalSales : 0;

    res.json({
      totalUsers,
      totalLawyers,
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      platformStanding: "Healthy"
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error(error);
  }  // ← closes try/catch inside run()
}    // ← closes run()

run();

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
});