const { ObjectId } = require("mongodb");
const {
  commentCollection,
  hireRequestCollection,
  lawyerCollection,
} = require("../config/db");

// POST /api/comments
const createComment = async (req, res) => {
  try {
    const { lawyerId, userName, userImage, text } = req.body;
    const userId = req.user._id.toString();
    if (!lawyerId || !text) {
      return res.status(400).json({ message: "Missing required comment fields." });
    }
    const hasHired = await hireRequestCollection.findOne({ userId, lawyerId, status: "paid" });
    if (!hasHired) {
      return res.status(403).json({
        message:
          "Access Denied. Only clients who have completed payment for this lawyer can leave a review.",
      });
    }
    const newComment = {
      lawyerId,
      userId,
      userName: userName || "Anonymous Client",
      userImage: userImage || null,
      text,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await commentCollection.insertOne(newComment);
    res.status(201).json({ message: "Comment posted successfully!", insertedId: result.insertedId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to post comment." });
  }
};

// GET /api/comments/check-eligibility
const checkEligibility = async (req, res) => {
  try {
    const { lawyerId } = req.query;
    if (!lawyerId) {
      return res.status(400).json({ message: "lawyerId is required." });
    }
    const userId = req.user._id.toString();
    const hasHired = await hireRequestCollection.findOne({ userId, lawyerId, status: "paid" });
    res.status(200).json({ canComment: !!hasHired });
  } catch (error) {
    res.status(500).json({ canComment: false });
  }
};

// GET /api/comments/client/:userId
const getClientComments = async (req, res) => {
  try {
    const { userId } = req.params;
    if (userId !== req.user._id.toString()) {
      return res.status(403).json({ message: "forbidden access" });
    }
    const comments = await commentCollection.find({ userId }).toArray();
    const enriched = await Promise.all(
      comments.map(async (comment) => {
        const lawyer = await lawyerCollection.findOne({ _id: comment.lawyerId });
        return { ...comment, lawyerName: lawyer?.name || "Unknown Professional" };
      }),
    );
    res.status(200).json(enriched);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Failed to fetch comments." });
  }
};

// GET /api/comments/lawyer/:lawyerId  (public)
const getLawyerComments = async (req, res) => {
  try {
    const { lawyerId } = req.params;
    const comments = await commentCollection.find({ lawyerId }).sort({ createdAt: -1 }).toArray();
    res.status(200).json(comments);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch comments." });
  }
};

// PATCH /api/comments/:id
const patchComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
    const userId = req.user._id.toString();
    if (!text || text.trim() === "") {
      return res.status(400).json({ message: "Comment text cannot be empty." });
    }
    const comment = await commentCollection.findOne({ _id: new ObjectId(id) });
    if (!comment) return res.status(404).json({ message: "Comment not found." });
    if (comment.userId !== userId)
      return res.status(403).json({ message: "Unauthorized. You can only edit your own reviews." });
    await commentCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { text, updatedAt: new Date() } },
    );
    res.status(200).json({ message: "Comment updated successfully." });
  } catch (error) {
    res.status(500).json({ message: "Failed to update comment." });
  }
};

// PUT /api/comments/:id
const putComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
    const userId = req.user._id.toString();
    const result = await commentCollection.updateOne(
      { _id: new ObjectId(id), userId },
      { $set: { text, updatedAt: new Date() } },
    );
    if (result.matchedCount === 0)
      return res.status(403).json({ message: "Unauthorized or comment not found." });
    res.status(200).json({ message: "Comment updated successfully!" });
  } catch (error) {
    res.status(500).json({ message: "Failed to update comment." });
  }
};

// DELETE /api/comments/:id
const deleteComment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id.toString();
    const comment = await commentCollection.findOne({ _id: new ObjectId(id) });
    if (!comment) return res.status(404).json({ message: "Comment not found." });
    if (comment.userId !== userId)
      return res
        .status(403)
        .json({ message: "Unauthorized. You can only delete your own reviews." });
    await commentCollection.deleteOne({ _id: new ObjectId(id) });
    res.status(200).json({ message: "Comment deleted successfully." });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete comment." });
  }
};

module.exports = {
  createComment,
  checkEligibility,
  getClientComments,
  getLawyerComments,
  patchComment,
  putComment,
  deleteComment,
};
