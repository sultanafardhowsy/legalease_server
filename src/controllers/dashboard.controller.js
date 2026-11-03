const { hireRequestCollection, lawyerCollection } = require("../config/db");

// GET /api/dashboard/lawyer/:userId
const getLawyerDashboard = async (req, res) => {
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
};

module.exports = { getLawyerDashboard };
