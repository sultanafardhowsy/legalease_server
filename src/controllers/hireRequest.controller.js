const { ObjectId } = require("mongodb");
const {
  hireRequestCollection,
  lawyerCollection,
  userCollection,
} = require("../config/db");

// POST /api/hire-requests
const createHireRequest = async (req, res) => {
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
      return res.status(409).json({ message: "You already have a pending request for this lawyer." });

    const result = await hireRequestCollection.insertOne({
      userId,
      lawyerId,
      status: "pending",
      requestDate: new Date(),
      serviceId: serviceId || null,
      serviceName: serviceName || null,
      fee: fee || null,
    });

    res.status(201).json({ message: "Hire request sent successfully!", insertedId: result.insertedId });
  } catch (error) {
    console.error("Hire Request Error:", error);
    res.status(500).json({ message: "Failed to send hire request.", error: error.message });
  }
};

// GET /api/hire-requests/lawyer/:lawyerId
const getLawyerHireRequests = async (req, res) => {
  try {
    const { lawyerId } = req.params;
    if (lawyerId !== req.user._id.toString()) {
      return res.status(403).json({ message: "forbidden access" });
    }
    const requests = await hireRequestCollection.find({ lawyerId }).sort({ requestDate: -1 }).toArray();
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
};

// GET /api/hire-requests/user/:userId
const getUserHireRequests = async (req, res) => {
  try {
    const { userId } = req.params;
    if (userId !== req.user._id.toString()) {
      return res.status(403).json({ message: "forbidden access" });
    }
    const requests = await hireRequestCollection.find({ userId }).sort({ requestDate: -1 }).toArray();
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
};

// PATCH /api/hire-requests/:id
const updateHireRequestStatus = async (req, res) => {
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
    if (result.matchedCount === 0) return res.status(404).json({ message: "Request not found." });
    res.status(200).json({ message: `Request ${status} successfully.` });
  } catch (error) {
    console.error("Update status error:", error);
    res.status(500).json({ message: "Failed to update status.", error: error.message });
  }
};

module.exports = {
  createHireRequest,
  getLawyerHireRequests,
  getUserHireRequests,
  updateHireRequestStatus,
};
