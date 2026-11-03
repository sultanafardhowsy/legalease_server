const router = require("express").Router();
const verifyToken = require("../middleware/verifyToken");
const { verifyAdmin } = require("../middleware/verifyRole");
const { getUsers, updateUserRole, deleteUser } = require("../controllers/user.controller");

// Mounted at /api/users — admin only
router.use(verifyToken, verifyAdmin);

router.get("/", getUsers);
router.patch("/:id/role", updateUserRole);
router.delete("/:id", deleteUser);

module.exports = router;
