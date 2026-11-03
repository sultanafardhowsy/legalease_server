const verifyClient = (req, res, next) => {
  const role = req.user?.role || "client";
  if (role !== "client") {
    return res.status(403).send({ message: "forbidden access" });
  }
  next();
};

const verifyLawyer = (req, res, next) => {
  if (req.user?.role !== "lawyer") {
    return res.status(403).send({ message: "forbidden access" });
  }
  next();
};

const verifyAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).send({ message: "forbidden access" });
  }
  next();
};

module.exports = { verifyClient, verifyLawyer, verifyAdmin };
