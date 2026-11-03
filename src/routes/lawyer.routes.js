const router = require("express").Router();
const verifyToken = require("../middleware/verifyToken");
const { verifyLawyer } = require("../middleware/verifyRole");
const {
  getTopLawyers,
  getSpecializations,
  getLawyers,
  createLawyerProfile,
  updateLawyerProfile,
  getLawyerProfile,
  checkLawyerAccess,
} = require("../controllers/lawyer.controller");

// Public
router.get("/lawyers/top", getTopLawyers);
router.get("/lawyers/specializations", getSpecializations);
router.get("/lawyers", getLawyers);
router.get("/lawyer/check-access/:id", checkLawyerAccess);

// Lawyer profile (update must stay before the :id route)
router.post("/lawyer/profile", verifyToken, verifyLawyer, createLawyerProfile);
router.put("/lawyer/profile/update", verifyToken, verifyLawyer, updateLawyerProfile);
router.get("/lawyer/profile/:id", verifyToken, getLawyerProfile);

module.exports = router;
