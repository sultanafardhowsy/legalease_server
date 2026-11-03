const router = require("express").Router();
const verifyToken = require("../middleware/verifyToken");
const { verifyLawyer } = require("../middleware/verifyRole");
const {
  getServices,
  getLawyerServices,
  addLawyerService,
  removeLawyerService,
} = require("../controllers/service.controller");

// Public
router.get("/services", getServices);
router.get("/lawyer/services/:lawyerId", getLawyerServices);

// Lawyer only
router.post("/lawyer/services", verifyToken, verifyLawyer, addLawyerService);
router.delete("/lawyer/services/:id", verifyToken, verifyLawyer, removeLawyerService);

module.exports = router;
