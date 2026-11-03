const router = require("express").Router();
const verifyToken = require("../middleware/verifyToken");
const { verifyAdmin } = require("../middleware/verifyRole");
const {
  getAdminStats,
  getAllTransactions,
  getAnalytics,
} = require("../controllers/admin.controller");

// Mounted at /api/admin — admin only
router.use(verifyToken, verifyAdmin);

router.get("/stats", getAdminStats);
router.get("/all-transactions", getAllTransactions);
router.get("/analytics", getAnalytics);

module.exports = router;
