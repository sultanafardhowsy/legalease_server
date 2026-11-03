const router = require("express").Router();
const verifyToken = require("../middleware/verifyToken");
const { verifyClient, verifyLawyer } = require("../middleware/verifyRole");
const {
  createHireRequest,
  getLawyerHireRequests,
  getUserHireRequests,
  updateHireRequestStatus,
} = require("../controllers/hireRequest.controller");

// Mounted at /api/hire-requests
router.post("/", verifyToken, verifyClient, createHireRequest);
router.get("/lawyer/:lawyerId", verifyToken, verifyLawyer, getLawyerHireRequests);
router.get("/user/:userId", verifyToken, verifyClient, getUserHireRequests);
router.patch("/:id", verifyToken, verifyLawyer, updateHireRequestStatus);

module.exports = router;
