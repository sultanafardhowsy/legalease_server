const router = require("express").Router();
const verifyToken = require("../middleware/verifyToken");
const { verifyClient } = require("../middleware/verifyRole");
const {
  createComment,
  checkEligibility,
  getClientComments,
  getLawyerComments,
  patchComment,
  putComment,
  deleteComment,
} = require("../controllers/comment.controller");

// Mounted at /api/comments
// Static paths must stay before /:id
router.post("/", verifyToken, verifyClient, createComment);
router.get("/check-eligibility", verifyToken, checkEligibility);
router.get("/client/:userId", verifyToken, verifyClient, getClientComments);
router.get("/lawyer/:lawyerId", getLawyerComments);
router.patch("/:id", verifyToken, verifyClient, patchComment);
router.put("/:id", verifyToken, verifyClient, putComment);
router.delete("/:id", verifyToken, verifyClient, deleteComment);

module.exports = router;
