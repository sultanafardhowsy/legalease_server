const { ObjectId } = require("mongodb");
const {
  hireRequestCollection,
  lawyerCollection,
  userCollection,
} = require("../config/db");

// GET /api/lawyers/top  (public)
const getTopLawyers = async (req, res) => {
  try {
    const topLawyers = await hireRequestCollection
      .aggregate([
        // Step 1: Only paid requests
        { $match: { status: "paid" } },

        // Step 2: Group by lawyerId, count hires
        { $group: { _id: "$lawyerId", hireCount: { $sum: 1 } } },

        // Step 3: Sort highest first
        { $sort: { hireCount: -1 } },

        // Step 4: Top 3 only
        { $limit: 3 },

        // Step 5: lookup using string-to-string match
        // because lawyers._id is a plain string, NOT ObjectId
        {
          $lookup: {
            from: "lawyers",
            let: { lid: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: [{ $toString: "$_id" }, "$$lid"] },
                },
              },
            ],
            as: "lawyerInfo",
          },
        },

        // Step 6: Filter out any unmatched
        { $match: { lawyerInfo: { $ne: [] } } },

        // Step 7: Flatten
        { $unwind: "$lawyerInfo" },

        // Step 8: Final shape
        {
          $project: {
            _id: "$lawyerInfo._id",
            name: "$lawyerInfo.name",
            imageUrl: "$lawyerInfo.imageUrl",
            specialization: "$lawyerInfo.specialization",
            hireCount: 1,
          },
        },
      ])
      .toArray();

    res.json(topLawyers);
  } catch (err) {
    console.error("Top lawyers error:", err);
    res.status(500).json({ message: err.message });
  }
};

// GET /api/lawyers/specializations
const getSpecializations = async (req, res) => {
  try {
    const specs = await lawyerCollection
      .aggregate([
        { $group: { _id: "$specialization" } },
        { $match: { _id: { $ne: null } } },
        { $sort: { _id: 1 } },
      ])
      .toArray();
    res.status(200).send(specs.map((s) => s._id));
  } catch (error) {
    console.error("Specializations error:", error);
    res.status(500).send({ message: "Failed to fetch specializations", error: error.message });
  }
};

// GET /api/lawyers  (search, filter, sort, paginate)
const getLawyers = async (req, res) => {
  try {
    const { search, specialization, sort, minFee, maxFee, availability, page, limit } = req.query;

    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { specialization: { $regex: search, $options: "i" } },
      ];
    }

    if (specialization && specialization !== "all") {
      const specializationFilter = {
        specialization: {
          $regex: `^${specialization.trim()}$`,
          $options: "i",
        },
      };

      if (query.$or) {
        query.$and = [{ $or: query.$or }, specializationFilter];
        delete query.$or;
      } else {
        Object.assign(query, specializationFilter);
      }
    }

    if (minFee || maxFee) {
      query.fee = {};
      if (minFee) query.fee.$gte = Number(minFee);
      if (maxFee) query.fee.$lte = Number(maxFee);
    }

    if (availability && availability !== "all") {
      query.status = availability;
    }

    let sortOption = { dateJoined: -1 };
    if (sort === "fee-low") sortOption = { fee: 1 };
    else if (sort === "fee-high") sortOption = { fee: -1 };
    else if (sort === "newest") sortOption = { dateJoined: -1 };

    // Pagination: default page 1, 8 items per page
    const currentPage = parseInt(page) || 1;
    const currentLimit = parseInt(limit) || 8;
    const skip = (currentPage - 1) * currentLimit;

    const totalLawyers = await lawyerCollection.countDocuments(query);

    const lawyers = await lawyerCollection
      .find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(currentLimit)
      .toArray();

    const normalized = lawyers.map((l) => ({
      ...l,
      dateJoined: l.dateJoined?.$date ? new Date(l.dateJoined.$date) : l.dateJoined,
    }));

    res.status(200).send({
      lawyers: normalized,
      currentPage,
      totalPages: Math.ceil(totalLawyers / currentLimit),
      totalLawyers,
      limit: currentLimit,
    });
  } catch (error) {
    console.error("Backend API Error:", error);
    res.status(500).send({ message: "Failed to fetch lawyers", error: error.message });
  }
};

// POST /api/lawyer/profile
const createLawyerProfile = async (req, res) => {
  try {
    const { id, name, specialization, bio, fee, status, imageUrl, dateJoined } = req.body;
    if (!id || !name || !specialization || !bio || !fee || !imageUrl) {
      return res
        .status(400)
        .json({ message: "All fields are required for initial profile registration." });
    }
    if (id !== req.user._id.toString()) {
      return res.status(403).json({ message: "forbidden access" });
    }
    const existingProfile = await lawyerCollection.findOne({ _id: id });
    if (existingProfile) {
      return res
        .status(400)
        .json({ message: "A lawyer profile already exists for this user account." });
    }
    const newLawyerDoc = {
      _id: id,
      name,
      specialization,
      bio,
      fee: Number(fee),
      status: status || "Available",
      imageUrl,
      dateJoined: dateJoined ? new Date(dateJoined) : new Date(),
    };
    const result = await lawyerCollection.insertOne(newLawyerDoc);
    res.status(201).json({
      message: "Lawyer profile registered successfully!",
      insertedId: result.insertedId,
    });
  } catch (apiError) {
    console.error("API Profile Error:", apiError);
    res
      .status(500)
      .json({ message: "Internal server registry breakdown.", error: apiError.message });
  }
};

// PUT /api/lawyer/profile/update
const updateLawyerProfile = async (req, res) => {
  try {
    const { id, name, specialization, bio, fee, status, imageUrl } = req.body;
    if (!id || !name || !specialization || !bio || !fee || !imageUrl) {
      return res.status(400).json({ message: "All form fields are required to update your profile." });
    }
    if (id !== req.user._id.toString()) {
      return res.status(403).json({ message: "forbidden access" });
    }
    const result = await lawyerCollection.updateOne(
      { _id: id },
      { $set: { name, specialization, bio, fee: Number(fee), status, imageUrl } },
    );
    if (result.matchedCount === 0)
      return res.status(404).json({ message: "No active profile found matching this user ID." });
    res.status(200).json({ message: "Profile updated successfully!" });
  } catch (error) {
    console.error("MongoDB Update Error:", error);
    res.status(500).json({ message: "Database entry change failed.", error: error.message });
  }
};

// GET /api/lawyer/profile/:id
const getLawyerProfile = async (req, res) => {
  try {
    const { id } = req.params;
    if (id !== req.user._id.toString()) {
      return res.status(403).json({ message: "forbidden access" });
    }
    const profile = await lawyerCollection.findOne({ _id: id });
    if (!profile) return res.status(404).json({ message: "No profile found for this user id." });
    res.status(200).json(profile);
  } catch (error) {
    res.status(500).json({ message: "Database read error.", error: error.message });
  }
};

// GET /api/lawyer/check-access/:id
const checkLawyerAccess = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await userCollection.findOne({ _id: new ObjectId(id) });
    if (!user) return res.status(404).json({ allowed: false, message: "User not found" });
    if (user.role === "lawyer" && user.plan === "paid") return res.status(200).json({ allowed: true });
    return res.status(200).json({ allowed: false, message: "Account not activated" });
  } catch (error) {
    console.error("Check access error:", error);
    res.status(500).json({ allowed: false, message: "Server database error" });
  }
};

module.exports = {
  getTopLawyers,
  getSpecializations,
  getLawyers,
  createLawyerProfile,
  updateLawyerProfile,
  getLawyerProfile,
  checkLawyerAccess,
};
