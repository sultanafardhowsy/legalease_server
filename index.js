const express = require("express");
const app = express();
const port = 5000;
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

app.use(
  cors({
    origin: [process.env.CLIENT_URL, process.env.CLIENT_URL_PROD],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: true,
  }),
);
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello World!");
});

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const database = client.db("legalease_user");
    const userCollection = database.collection("user");
    const lawyerCollection = database.collection("lawyers");
    const hireRequestCollection = database.collection("hireRequests");
    const transactionCollection = database.collection("transaction");
    const commentCollection = database.collection("comments");

    const serviceCollection = database.collection("services");
    const lawyerServiceCollection = database.collection("lawyerservices");

    // ✅ ADD THIS — verify Better Auth session token via MongoDB
    const verifyToken = async (req, res, next) => {
      try {
        // Check Authorization header first
        let token = req.headers.authorization?.split(" ")[1];

        // Fallback: read from Better Auth session cookie
        if (!token && req.headers.cookie) {
          const cookies = req.headers.cookie.split(";").reduce((acc, c) => {
            const [k, v] = c.trim().split("=");
            acc[k] = v;
            return acc;
          }, {});

          const rawToken =
            cookies["better-auth.session_token"] || cookies["__Secure-better-auth.session_token"];

          // Strip the .signature part Better Auth appends
          if (rawToken) {
            token = decodeURIComponent(rawToken).split(".")[0];
          }
        }

        console.log("Resolved token:", token); // Should now print just: GOMJMpFlLRoJjW0s4Ion651o1yFCuupX

        if (!token) {
          return res.status(401).json({ message: "Unauthorized: No token provided" });
        }

        const sessionRecord = await client
          .db("legalease_user")
          .collection("session")
          .findOne({ token });

        if (!sessionRecord || new Date(sessionRecord.expiresAt) < new Date()) {
          return res.status(401).json({ message: "Unauthorized: Invalid or expired session" });
        }

        const user = await client
          .db("legalease_user")
          .collection("user")
          .findOne({ _id: sessionRecord.userId });
        console.log(user, "user of the session");
        if (!user) {
          return res.status(401).json({ message: "Unauthorized: User not found" });
        }

        req.user = user;
        next();
      } catch (err) {
        console.error("verifyToken error:", err);
        res.status(401).json({ message: "Unauthorized" });
      }
    };

    const verifyClient = async (req, res, next) => {
      const role = req.user?.role || "client";
      if (role !== "client") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    const verifyLawyer = async (req, res, next) => {
      if (req.user?.role !== "lawyer") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    const verifyAdmin = async (req, res, next) => {
      if (req.user?.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };
    //top 3/ verification not needed
    app.get("/api/lawyers/top", async (req, res) => {
      try {
        const topLawyers = await hireRequestCollection
          .aggregate([
            // Step 1: Only paid requests
            {
              $match: { status: "paid" },
            },

            // Step 2: Group by lawyerId, count hires
            {
              $group: {
                _id: "$lawyerId",
                hireCount: { $sum: 1 },
              },
            },

            // Step 3: Sort highest first
            { $sort: { hireCount: -1 } },

            // Step 4: Top 3 only
            { $limit: 3 },

            // Step 5: lookup using string-to-string match
            // because lawyers._id is a plain string, NOT ObjectId
            {
              $lookup: {
                from: "lawyers",
                let: { lid: "$_id" },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $eq: [{ $toString: "$_id" }, "$$lid"],
                      },
                    },
                  },
                ],
                as: "lawyerInfo",
              },
            },

            // Step 6: Filter out any unmatched
            {
              $match: {
                lawyerInfo: { $ne: [] },
              },
            },

            // Step 7: Flatten
            { $unwind: "$lawyerInfo" },

            // Step 8: Final shape
            {
              $project: {
                _id: "$lawyerInfo._id",
                name: "$lawyerInfo.name",
                imageUrl: "$lawyerInfo.imageUrl",
                specialization: "$lawyerInfo.specialization",
                hireCount: 1,
              },
            },
          ])
          .toArray();

        res.json(topLawyers);
      } catch (err) {
        console.error("Top lawyers error:", err);
        res.status(500).json({ message: err.message });
      }
    });

    // GET all services (for dropdown)/ verification not needed
    app.get("/api/services", async (req, res) => {
      try {
        const services = await serviceCollection.find({}).sort({ name: 1 }).toArray();
        res.status(200).json(services);
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch services" });
      }
    });

    // GET a lawyer's added services/ verification not needed
    app.get("/api/lawyer/services/:lawyerId", async (req, res) => {
      try {
        const entries = await lawyerServiceCollection
          .find({ lawyerId: req.params.lawyerId })
          .sort({ createdAt: -1 })
          .toArray();

        // Manually join with services collection
        const enriched = await Promise.all(
          entries.map(async (entry) => {
            const service = await serviceCollection.findOne({ _id: new ObjectId(entry.serviceId) });
            return { ...entry, service };
          }),
        );

        res.status(200).json(enriched);
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch lawyer services" });
      }
    });

    // POST add a service to lawyer profile
    app.post("/api/lawyer/services", verifyToken, verifyLawyer, async (req, res) => {
      const { serviceId } = req.body;
      const lawyerId = req.body.lawyerId || req.user._id.toString();
      if (lawyerId !== req.user._id.toString()) {
        return res.status(403).json({ message: "forbidden access" });
      }
      if (!serviceId) {
        return res.status(400).json({ message: "lawyerId and serviceId are required" });
      }
      try {
        const already = await lawyerServiceCollection.findOne({ lawyerId, serviceId });
        if (already) return res.status(409).json({ message: "Service already added" });

        const result = await lawyerServiceCollection.insertOne({
          lawyerId,
          serviceId,
          createdAt: new Date(),
        });

        const service = await serviceCollection.findOne({ _id: new ObjectId(serviceId) });
        res.status(201).json({ _id: result.insertedId, lawyerId, serviceId, service });
      } catch (err) {
        res.status(500).json({ message: "Failed to add service" });
      }
    });

    // DELETE remove a service from lawyer profile
    app.delete("/api/lawyer/services/:id", verifyToken, verifyLawyer, async (req, res) => {
      try {
        const entry = await lawyerServiceCollection.findOne({ _id: new ObjectId(req.params.id) });
        if (!entry) return res.status(404).json({ message: "Service not found" });
        if (entry.lawyerId !== req.user._id.toString()) {
          return res.status(403).json({ message: "forbidden access" });
        }
        const result = await lawyerServiceCollection.deleteOne({
          _id: new ObjectId(req.params.id),
        });
        if (result.deletedCount === 0)
          return res.status(404).json({ message: "Service not found" });
        res.status(200).json({ message: "Service removed successfully" });
      } catch (err) {
        res.status(500).json({ message: "Failed to remove service" });
      }
    });

    // POST /api/comments
    app.post("/api/comments", verifyToken, verifyClient, async (req, res) => {
      try {
        const { lawyerId, userName, userImage, text } = req.body;
        const userId = req.user._id.toString();
        if (!lawyerId || !text) {
          return res.status(400).json({ message: "Missing required comment fields." });
        }
        const hasHired = await hireRequestCollection.findOne({ userId, lawyerId, status: "paid" });
        if (!hasHired) {
          return res
            .status(403)
            .json({
              message:
                "Access Denied. Only clients who have completed payment for this lawyer can leave a review.",
            });
        }
        const newComment = {
          lawyerId,
          userId,
          userName: userName || "Anonymous Client",
          userImage: userImage || null,
          text,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        const result = await commentCollection.insertOne(newComment);
        res
          .status(201)
          .json({ message: "Comment posted successfully!", insertedId: result.insertedId });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to post comment." });
      }
    });

    // GET /api/comments/check-eligibility — must be before /api/comments/lawyer/:lawyerId
    app.get("/api/comments/check-eligibility", verifyToken, async (req, res) => {
      try {
        const { lawyerId } = req.query;
        if (!lawyerId) {
          return res.status(400).json({ message: "lawyerId is required." });
        }
        const userId = req.user._id.toString();
        const hasHired = await hireRequestCollection.findOne({ userId, lawyerId, status: "paid" });
        res.status(200).json({ canComment: !!hasHired });
        res.status(200).json({ canComment: !!hasHired });
      } catch (error) {
        res.status(500).json({ canComment: false });
      }
    });

    // GET /api/comments/client/:userId — must be before /api/comments/:id
    app.get("/api/comments/client/:userId", verifyToken, verifyClient, async (req, res) => {
      try {
        const { userId } = req.params;
        if (userId !== req.user._id.toString()) {
          return res.status(403).json({ message: "forbidden access" });
        }
        const comments = await commentCollection.find({ userId }).toArray();
        const enriched = await Promise.all(
          comments.map(async (comment) => {
            const lawyer = await lawyerCollection.findOne({ _id: comment.lawyerId });
            return { ...comment, lawyerName: lawyer?.name || "Unknown Professional" };
          }),
        );
        res.status(200).json(enriched);
      } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ message: "Failed to fetch comments." });
      }
    });

    // GET /api/comments/lawyer/:lawyerId
    app.get("/api/comments/lawyer/:lawyerId", async (req, res) => {
      try {
        const { lawyerId } = req.params;
        const comments = await commentCollection
          .find({ lawyerId })
          .sort({ createdAt: -1 })
          .toArray();
        res.status(200).json(comments);
      } catch (error) {
        res.status(500).json({ message: "Failed to fetch comments." });
      }
    });

    // PATCH /api/comments/:id
    app.patch("/api/comments/:id", verifyToken, verifyClient, async (req, res) => {
      try {
        const { id } = req.params;
        const { text } = req.body;
        const userId = req.user._id.toString();
        if (!text || text.trim() === "") {
          return res.status(400).json({ message: "Comment text cannot be empty." });
        }
        const comment = await commentCollection.findOne({ _id: new ObjectId(id) });
        if (!comment) return res.status(404).json({ message: "Comment not found." });
        if (comment.userId !== userId)
          return res
            .status(403)
            .json({ message: "Unauthorized. You can only edit your own reviews." });
        await commentCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { text, updatedAt: new Date() } },
        );
        res.status(200).json({ message: "Comment updated successfully." });
      } catch (error) {
        res.status(500).json({ message: "Failed to update comment." });
      }
    });

    // PUT /api/comments/:id
    app.put("/api/comments/:id", verifyToken, verifyClient, async (req, res) => {
      try {
        const { id } = req.params;
        const { text } = req.body;
        const userId = req.user._id.toString();
        const result = await commentCollection.updateOne(
          { _id: new ObjectId(id), userId },
          { $set: { text, updatedAt: new Date() } },
        );
        if (result.matchedCount === 0)
          return res.status(403).json({ message: "Unauthorized or comment not found." });
        res.status(200).json({ message: "Comment updated successfully!" });
      } catch (error) {
        res.status(500).json({ message: "Failed to update comment." });
      }
    });

    // DELETE /api/comments/:id
    app.delete("/api/comments/:id", verifyToken, verifyClient, async (req, res) => {
      try {
        const { id } = req.params;
        const userId = req.user._id.toString();
        const comment = await commentCollection.findOne({ _id: new ObjectId(id) });
        if (!comment) return res.status(404).json({ message: "Comment not found." });
        if (comment.userId !== userId)
          return res
            .status(403)
            .json({ message: "Unauthorized. You can only delete your own reviews." });
        await commentCollection.deleteOne({ _id: new ObjectId(id) });
        res.status(200).json({ message: "Comment deleted successfully." });
      } catch (error) {
        res.status(500).json({ message: "Failed to delete comment." });
      }
    });

    // POST /api/lawyer/profile
    app.post("/api/lawyer/profile", verifyToken, verifyLawyer, async (req, res) => {
      try {
        const { id, name, specialization, bio, fee, status, imageUrl, dateJoined } = req.body;
        if (!id || !name || !specialization || !bio || !fee || !imageUrl) {
          return res
            .status(400)
            .json({ message: "All fields are required for initial profile registration." });
        }
        if (id !== req.user._id.toString()) {
          return res.status(403).json({ message: "forbidden access" });
        }
        const existingProfile = await lawyerCollection.findOne({ _id: id });
        if (existingProfile) {
          return res
            .status(400)
            .json({ message: "A lawyer profile already exists for this user account." });
        }
        const newLawyerDoc = {
          _id: id,
          name,
          specialization,
          bio,
          fee: Number(fee),
          status: status || "Available",
          imageUrl,
          dateJoined: dateJoined ? new Date(dateJoined) : new Date(),
        };
        const result = await lawyerCollection.insertOne(newLawyerDoc);
        res
          .status(201)
          .json({
            message: "Lawyer profile registered successfully!",
            insertedId: result.insertedId,
          });
      } catch (apiError) {
        console.error("API Profile Error:", apiError);
        res
          .status(500)
          .json({ message: "Internal server registry breakdown.", error: apiError.message });
      }
    });

    // PUT /api/lawyer/profile/update — must be before /api/lawyer/profile/:id
    app.put("/api/lawyer/profile/update", verifyToken, verifyLawyer, async (req, res) => {
      try {
        const { id, name, specialization, bio, fee, status, imageUrl } = req.body;
        if (!id || !name || !specialization || !bio || !fee || !imageUrl) {
          return res
            .status(400)
            .json({ message: "All form fields are required to update your profile." });
        }
        if (id !== req.user._id.toString()) {
          return res.status(403).json({ message: "forbidden access" });
        }
        const result = await lawyerCollection.updateOne(
          { _id: id },
          { $set: { name, specialization, bio, fee: Number(fee), status, imageUrl } },
        );
        if (result.matchedCount === 0)
          return res
            .status(404)
            .json({ message: "No active profile found matching this user ID." });
        res.status(200).json({ message: "Profile updated successfully!" });
      } catch (error) {
        console.error("MongoDB Update Error:", error);
        res.status(500).json({ message: "Database entry change failed.", error: error.message });
      }
    });

    // GET /api/lawyer/profile/:id
    app.get("/api/lawyer/profile/:id", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        if (id !== req.user._id.toString()) {
          return res.status(403).json({ message: "forbidden access" });
        }
        const profile = await lawyerCollection.findOne({ _id: id });
        if (!profile)
          return res.status(404).json({ message: "No profile found for this user id." });
        res.status(200).json(profile);
      } catch (error) {
        res.status(500).json({ message: "Database read error.", error: error.message });
      }
    });

    // GET /api/lawyers/specializations
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
        // 1. Extract all query parameters, including page and limit
        const { search, specialization, sort, minFee, maxFee, availability, page, limit } =
          req.query;

        const query = {};

        // --- YOUR FILTERING LOGIC (Unchanged) ---
        if (search) {
          query.$or = [
            { name: { $regex: search, $options: "i" } },
            { specialization: { $regex: search, $options: "i" } },
          ];
        }

        if (specialization && specialization !== "all") {
          const specializationFilter = {
            specialization: {
              $regex: `^${specialization.trim()}$`,
              $options: "i",
            },
          };

          if (query.$or) {
            query.$and = [{ $or: query.$or }, specializationFilter];
            delete query.$or;
          } else {
            Object.assign(query, specializationFilter);
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

        // --- YOUR SORTING LOGIC (Unchanged) ---
        let sortOption = { dateJoined: -1 };
        if (sort === "fee-low") sortOption = { fee: 1 };
        else if (sort === "fee-high") sortOption = { fee: -1 };
        else if (sort === "newest") sortOption = { dateJoined: -1 };

        // --- NEW PAGINATION LOGIC ---
        // Default to page 1, and 6 items per page
        const currentPage = parseInt(page) || 1;
        const currentLimit = parseInt(limit) || 8;
        const skip = (currentPage - 1) * currentLimit;

        // Count how many total documents match the user's filters
        const totalLawyers = await lawyerCollection.countDocuments(query);

        // Fetch the data with sorting, skipping, and limiting applied
        const lawyers = await lawyerCollection
          .find(query)
          .sort(sortOption)
          .skip(skip)
          .limit(currentLimit)
          .toArray();

        // --- YOUR DATA NORMALIZATION (Unchanged) ---
        const normalized = lawyers.map((l) => ({
          ...l,
          dateJoined: l.dateJoined?.$date ? new Date(l.dateJoined.$date) : l.dateJoined,
        }));

        // --- NEW RESPONSE FORMAT ---
        // Send back the data plus the pagination metadata
        res.status(200).send({
          lawyers: normalized,
          currentPage,
          totalPages: Math.ceil(totalLawyers / currentLimit),
          totalLawyers,
          limit: currentLimit,
        });
      } catch (error) {
        console.error("Backend API Error:", error);
        res.status(500).send({ message: "Failed to fetch lawyers", error: error.message });
      }
    });

    // POST /api/hire-requests
    app.post("/api/hire-requests", verifyToken, verifyClient, async (req, res) => {
      try {
        const { lawyerId, serviceId, serviceName, fee } = req.body;
        const userId = req.user._id.toString();
        if (!lawyerId) return res.status(400).json({ message: "lawyerId is required." });

        const existing = await hireRequestCollection.findOne({
          userId,
          lawyerId,
          status: "pending",
        });
        if (existing)
          return res
            .status(409)
            .json({ message: "You already have a pending request for this lawyer." });

        const result = await hireRequestCollection.insertOne({
          userId,
          lawyerId,
          status: "pending",
          requestDate: new Date(),
          serviceId: serviceId || null,
          serviceName: serviceName || null,
          fee: fee || null,
        });

        res
          .status(201)
          .json({ message: "Hire request sent successfully!", insertedId: result.insertedId });
      } catch (error) {
        console.error("Hire Request Error:", error);
        res.status(500).json({ message: "Failed to send hire request.", error: error.message });
      }
    });

    // GET /api/hire-requests/lawyer/:lawyerId
    app.get("/api/hire-requests/lawyer/:lawyerId", verifyToken, verifyLawyer, async (req, res) => {
      try {
        const { lawyerId } = req.params;
        if (lawyerId !== req.user._id.toString()) {
          return res.status(403).json({ message: "forbidden access" });
        }
        const requests = await hireRequestCollection
          .find({ lawyerId })
          .sort({ requestDate: -1 })
          .toArray();
        if (requests.length === 0) return res.status(200).json([]);
        const userIds = [...new Set(requests.map((r) => r.userId))];
        const users = await userCollection
          .find({ _id: { $in: userIds.map((id) => new ObjectId(id)) } })
          .toArray();
        const userMap = {};
        users.forEach((u) => {
          userMap[u._id.toString()] = u;
        });
        const enriched = requests.map((r) => ({
          ...r,
          clientName: userMap[r.userId]?.name || "Unknown",
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
    app.get("/api/hire-requests/user/:userId", verifyToken, verifyClient, async (req, res) => {
      try {
        const { userId } = req.params;
        if (userId !== req.user._id.toString()) {
          return res.status(403).json({ message: "forbidden access" });
        }
        const requests = await hireRequestCollection
          .find({ userId })
          .sort({ requestDate: -1 })
          .toArray();
        if (requests.length === 0) return res.status(200).json([]);
        const lawyerIds = [...new Set(requests.map((r) => r.lawyerId))];
        const lawyers = await lawyerCollection.find({ _id: { $in: lawyerIds } }).toArray();
        const lawyerMap = {};
        lawyers.forEach((l) => {
          lawyerMap[l._id.toString()] = l;
        });
        const enriched = requests.map((r) => ({
          ...r,
          lawyerName: lawyerMap[r.lawyerId]?.name || "Unknown",
          lawyerSpecialization: lawyerMap[r.lawyerId]?.specialization || "N/A",
          lawyerFee: lawyerMap[r.lawyerId]?.fee || 0,
          lawyerImage: lawyerMap[r.lawyerId]?.imageUrl || null,
        }));
        res.status(200).json(enriched);
      } catch (error) {
        console.error("User hiring history error:", error);
        res.status(500).json({ message: "Failed to fetch hiring history.", error: error.message });
      }
    });

    // PATCH /api/hire-requests/:id
    app.patch("/api/hire-requests/:id", verifyToken, verifyLawyer, async (req, res) => {
      try {
        const { status } = req.body;
        if (!["accepted", "rejected"].includes(status))
          return res.status(400).json({ message: "Status must be accepted or rejected." });
        const hireRequest = await hireRequestCollection.findOne({
          _id: new ObjectId(req.params.id),
        });
        if (!hireRequest) return res.status(404).json({ message: "Request not found." });
        if (hireRequest.lawyerId !== req.user._id.toString()) {
          return res.status(403).json({ message: "forbidden access" });
        }
        const result = await hireRequestCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { status } },
        );
        if (result.matchedCount === 0)
          return res.status(404).json({ message: "Request not found." });
        res.status(200).json({ message: `Request ${status} successfully.` });
      } catch (error) {
        console.error("Update status error:", error);
        res.status(500).json({ message: "Failed to update status.", error: error.message });
      }
    });

    // GET /api/dashboard/lawyer/:userId
    app.get("/api/dashboard/lawyer/:userId", verifyToken, verifyLawyer, async (req, res) => {
      try {
        const { userId } = req.params;
        if (userId !== req.user._id.toString()) {
          return res.status(403).json({ message: "forbidden access" });
        }
        const lawyerProfile = await lawyerCollection.findOne({ _id: userId });
        if (!lawyerProfile) {
          return res.status(200).json({
            pendingRequests: 0,
            status: "Incomplete",
            specialization: "N/A",
          });
        }
        const lawyerId = lawyerProfile._id.toString();
        const pendingCount = await hireRequestCollection.countDocuments({
          lawyerId,
          status: "pending",
        });
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
        const hireRequest = await hireRequestCollection.findOne({
          _id: new ObjectId(hireRequestId),
        });
        if (!hireRequest) return res.status(404).json({ message: "Hire request not found." });
        const result = await hireRequestCollection.updateOne(
          { _id: new ObjectId(hireRequestId) },
          { $set: { status: "paid", paidAt: new Date() } },
        );
        res.status(200).json({ message: "Payment confirmed.", result });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to confirm payment." });
      }
    });

    // POST /api/transactions/save-success

    app.post("/api/transactions/save-success", async (req, res) => {
      try {
        const { sessionId } = req.body;

        if (!sessionId) {
          return res.status(400).json({
            success: false,
            message: "Missing sessionId",
          });
        }

        const session = await stripe.checkout.sessions.retrieve(sessionId, {
          expand: ["payment_intent"],
        });

        if (session.payment_status !== "paid") {
          return res.status(400).json({
            success: false,
            message: "Payment not completed",
          });
        }


        const existing = await transactionCollection.findOne({
          stripeSessionId: sessionId,
        });

        if (existing) {
          return res.status(200).json({
            success: true,
            message: "Already saved",
          });
        }

        const { hireRequestId, lawyerId, userId } = session.metadata;

        // IMPORTANT
        const paymentIntentId =
          typeof session.payment_intent === "object"
            ? session.payment_intent.id
            : session.payment_intent;

        await transactionCollection.insertOne({
          stripeSessionId: session.id,

          paymentIntentId, // <-- add this

          hireRequestId,

          lawyerId,

          userId,

          amount: session.amount_total / 100,

          currency: session.currency,

          customerEmail: session.customer_details?.email,

          status: "successful",

          createdAt: new Date(),
        });

        await hireRequestCollection.updateOne(
          {
            _id: new ObjectId(hireRequestId),
          },

          {
            $set: {
              status: "paid",
              paidAt: new Date(),
            },
          },
        );

        res.status(201).json({
          success: true,

          message: "Transaction saved",
        });
      } catch (error) {
        console.error(error);

        res.status(500).json({
          success: false,

          message: "Server error",
        });
      }
    });

    app.patch("/api/user/:id/plan", async (req, res) => {
      try {
        const { id } = req.params;

        const { amount, sessionId, paymentIntentId } = req.body;

        console.log(req.body);

        const result = await userCollection.updateOne(
          {
            _id: new ObjectId(id),
            role: "lawyer",
          },
          {
            $set: {
              plan: "paid",

              planActivatedAt: new Date(),

              planAmount: amount || 0,

              stripeSessionId: sessionId,

              paymentIntentId,

              updatedAt: new Date(),
            },
          },
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Lawyer not found",
          });
        }

        res.json({
          success: true,
          message: "Plan updated successfully",
        });
      } catch (error) {
        console.error(error);

        res.status(500).json({
          success: false,
          message: "Server error",
        });
      }
    });

    // GET /api/lawyer/check-access/:id
    app.get("/api/lawyer/check-access/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const user = await userCollection.findOne({ _id: new ObjectId(id) });
        if (!user) return res.status(404).json({ allowed: false, message: "User not found" });
        if (user.role === "lawyer" && user.plan === "paid")
          return res.status(200).json({ allowed: true });
        return res.status(200).json({ allowed: false, message: "Account not activated" });
      } catch (error) {
        console.error("Check access error:", error);
        res.status(500).json({ allowed: false, message: "Server database error" });
      }
    });

    //api for admin

    // 1. GET ALL USERS
    //  app.get("/api/users", async (req, res) => {
    app.get("/api/users", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 8;
        const skip = (page - 1) * limit;

        // Fetch total count and the sliced data in parallel
        const [totalUsers, users] = await Promise.all([
          userCollection.countDocuments(),
          userCollection.find({}).skip(skip).limit(limit).toArray(),
        ]);

        res.json({
          users,
          totalPages: Math.ceil(totalUsers / limit),
          totalUsers,
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // 2. UPDATE USER ROLE
    app.patch("/api/users/:id/role", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const { id } = req.params;
        const { role } = req.body;

        const result = await userCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role: role, updatedAt: new Date() } },
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
    app.delete("/api/users/:id", verifyToken, verifyAdmin, async (req, res) => {
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
    app.get("/api/admin/stats", verifyToken, verifyAdmin, async (req, res) => {
      try {
        // 1. Total count of all documents inside user collection
        const totalUsers = await userCollection.countDocuments({});

        // 2. Count users whose role field is exactly "lawyer"
        const totalLawyers = await userCollection.countDocuments({ role: "lawyer" });

        // 3. Aggregate total transaction calculations (calculating the sum of all planAmount values)
        const revenueData = await userCollection
          .aggregate([
            { $match: { planAmount: { $exists: true } } },
            { $group: { _id: null, totalSales: { $sum: "$planAmount" } } },
          ])
          .toArray();

        const totalRevenue = revenueData.length > 0 ? revenueData[0].totalSales : 0;

        res.json({
          totalUsers,
          totalLawyers,
          totalRevenue: parseFloat(totalRevenue.toFixed(2)),
          platformStanding: "Healthy",
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    app.get("/api/admin/all-transactions", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 8;
        const skip = (page - 1) * limit;

        // 1. Fetch un-paginated pool of Lawyer Activation Payments
        const lawyerPayments = await userCollection
          .find({
            role: "lawyer",
            plan: "paid",
            stripeSessionId: { $exists: true },
          })
          .toArray();

        const activationPayments = lawyerPayments.map((lawyer) => ({
          _id: lawyer._id,
          paymentType: "Lawyer Activation",
          transactionId: lawyer.paymentIntentId || lawyer.stripeSessionId,
          userEmail: lawyer.email,
          userRole: lawyer.role,
          lawyerEmail: "N/A",
          lawyerRole: "N/A",
          amount: lawyer.planAmount,
          status: lawyer.plan,
          createdAt: lawyer.planActivatedAt,
        }));

        // 2. Fetch un-paginated pool of Client Hiring Transactions
        const transactions = await transactionCollection.find({}).toArray();

        const hirePayments = await Promise.all(
          transactions.map(async (transaction) => {
            const user = await userCollection.findOne({
              _id: new ObjectId(transaction.userId),
            });
            const lawyer = await userCollection.findOne({
              _id: new ObjectId(transaction.lawyerId),
            });

            return {
              _id: transaction._id,
              paymentType: "Hire Lawyer",
              transactionId: transaction.paymentIntentId || transaction.stripeSessionId,
              userEmail: user?.email || "N/A",
              userRole: user?.role || "client",
              lawyerEmail: lawyer?.email || "N/A",
              lawyerRole: lawyer?.role || "lawyer",
              amount: transaction.amount,
              status: transaction.status,
              createdAt: transaction.createdAt,
            };
          }),
        );

        // 3. Merge both arrays and sort latest first
        const allPayments = [...hirePayments, ...activationPayments];
        allPayments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // 4. Apply Pagination Slicing in memory
        const paginatedPayments = allPayments.slice(skip, skip + limit);

        // 5. Send back the subset alongside boundaries
        res.send({
          transactions: paginatedPayments,
          totalPages: Math.ceil(allPayments.length / limit),
          totalTransactions: allPayments.length,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({
          message: "Failed to fetch transactions",
        });
      }
    });
    //admin analitics api
    app.get("/api/admin/analytics", verifyToken, verifyAdmin, async (req, res) => {
      try {
        // Total users (clients)
        const totalUsers = await userCollection.countDocuments({
          role: "client",
        });

        // Total lawyers
        const totalLawyers = await userCollection.countDocuments({
          role: "lawyer",
        });

        // Total hires
        const totalHires = await transactionCollection.countDocuments();

        // Revenue from hire payments
        const hireRevenue = await transactionCollection
          .aggregate([
            {
              $group: {
                _id: null,
                total: { $sum: "$amount" },
              },
            },
          ])
          .toArray();

        // Revenue from lawyer activation
        const lawyerRevenue = await userCollection
          .aggregate([
            {
              $match: {
                role: "lawyer",
                plan: "paid",
              },
            },
            {
              $group: {
                _id: null,
                total: { $sum: "$planAmount" },
              },
            },
          ])
          .toArray();

        const totalRevenue = (hireRevenue[0]?.total || 0) + (lawyerRevenue[0]?.total || 0);

        res.send({
          totalUsers,

          totalLawyers,

          totalHires,

          totalRevenue,
        });
      } catch (error) {
        console.log(error);

        res.status(500).send({
          message: "Failed to load analytics",
        });
      }
    });

    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error(error);
  } // ← closes try/catch inside run()
} // ← closes run()

run();

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
