const router = require("express").Router();
const verifyToken = require("../middleware/verifyToken");
const { verifyLawyer } = require("../middleware/verifyRole");
const { getLawyerDashboard } = require("../controllers/dashboard.controller");

// Mounted at /api/dashboard
router.get("/lawyer/:userId", verifyToken, verifyLawyer, getLawyerDashboard);

module.exports = router;
