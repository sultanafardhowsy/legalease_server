const router = require("express").Router();
const {
  confirmPayment,
  saveTransaction,
  updateLawyerPlan,
} = require("../controllers/payment.controller");

// Mounted at /api
router.post("/payment/confirm", confirmPayment);
router.post("/transactions/save-success", saveTransaction);
router.patch("/user/:id/plan", updateLawyerPlan);

module.exports = router;
