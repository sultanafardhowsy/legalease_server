const router = require("express").Router();

router.use(require("./lawyer.routes"));
router.use(require("./service.routes"));
router.use(require("./payment.routes"));
router.use("/comments", require("./comment.routes"));
router.use("/hire-requests", require("./hireRequest.routes"));
router.use("/dashboard", require("./dashboard.routes"));
router.use("/users", require("./user.routes"));
router.use("/admin", require("./admin.routes"));

module.exports = router;
