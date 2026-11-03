const { sessionCollection, userCollection } = require("../config/db");

// Verifies the Better Auth session token (header or cookie) against MongoDB
const verifyToken = async (req, res, next) => {
  try {
    // Check Authorization header first
    let token = req.headers.authorization?.split(" ")[1];

    // Fallback: read from Better Auth session cookie
    if (!token && req.headers.cookie) {
      const cookies = req.headers.cookie.split(";").reduce((acc, c) => {
        const [k, v] = c.trim().split("=");
        acc[k] = v;
        return acc;
      }, {});

      const rawToken =
        cookies["better-auth.session_token"] || cookies["__Secure-better-auth.session_token"];

      // Strip the .signature part Better Auth appends
      if (rawToken) {
        token = decodeURIComponent(rawToken).split(".")[0];
      }
    }

    if (!token) {
      return res.status(401).json({ message: "Unauthorized: No token provided" });
    }

    const sessionRecord = await sessionCollection.findOne({ token });

    if (!sessionRecord || new Date(sessionRecord.expiresAt) < new Date()) {
      return res.status(401).json({ message: "Unauthorized: Invalid or expired session" });
    }

    const user = await userCollection.findOne({ _id: sessionRecord.userId });
    if (!user) {
      return res.status(401).json({ message: "Unauthorized: User not found" });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("verifyToken error:", err);
    res.status(401).json({ message: "Unauthorized" });
  }
};

module.exports = verifyToken;
