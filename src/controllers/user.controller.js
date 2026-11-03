const { ObjectId } = require("mongodb");
const { userCollection } = require("../config/db");

// GET /api/users  (admin)
const getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8;
    const skip = (page - 1) * limit;

    const [totalUsers, users] = await Promise.all([
      userCollection.countDocuments(),
      userCollection.find({}).skip(skip).limit(limit).toArray(),
    ]);

    res.json({
      users,
      totalPages: Math.ceil(totalUsers / limit),
      totalUsers,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// PATCH /api/users/:id/role  (admin)
const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    const result = await userCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { role: role, updatedAt: new Date() } },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({ success: true, message: "User role updated successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// DELETE /api/users/:id  (admin)
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await userCollection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { getUsers, updateUserRole, deleteUser };
