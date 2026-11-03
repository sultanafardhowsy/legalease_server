const { ObjectId } = require("mongodb");
const { userCollection, transactionCollection } = require("../config/db");

// GET /api/admin/stats  (dashboard overview metrics)
const getAdminStats = async (req, res) => {
  try {
    const totalUsers = await userCollection.countDocuments({});
    const totalLawyers = await userCollection.countDocuments({ role: "lawyer" });

    // Sum of all planAmount values
    const revenueData = await userCollection
      .aggregate([
        { $match: { planAmount: { $exists: true } } },
        { $group: { _id: null, totalSales: { $sum: "$planAmount" } } },
      ])
      .toArray();

    const totalRevenue = revenueData.length > 0 ? revenueData[0].totalSales : 0;

    res.json({
      totalUsers,
      totalLawyers,
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      platformStanding: "Healthy",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/admin/all-transactions
const getAllTransactions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8;
    const skip = (page - 1) * limit;

    // 1. Lawyer activation payments
    const lawyerPayments = await userCollection
      .find({
        role: "lawyer",
        plan: "paid",
        stripeSessionId: { $exists: true },
      })
      .toArray();

    const activationPayments = lawyerPayments.map((lawyer) => ({
      _id: lawyer._id,
      paymentType: "Lawyer Activation",
      transactionId: lawyer.paymentIntentId || lawyer.stripeSessionId,
      userEmail: lawyer.email,
      userRole: lawyer.role,
      lawyerEmail: "N/A",
      lawyerRole: "N/A",
      amount: lawyer.planAmount,
      status: lawyer.plan,
      createdAt: lawyer.planActivatedAt,
    }));

    // 2. Client hiring transactions
    const transactions = await transactionCollection.find({}).toArray();

    const hirePayments = await Promise.all(
      transactions.map(async (transaction) => {
        const user = await userCollection.findOne({
          _id: new ObjectId(transaction.userId),
        });
        const lawyer = await userCollection.findOne({
          _id: new ObjectId(transaction.lawyerId),
        });

        return {
          _id: transaction._id,
          paymentType: "Hire Lawyer",
          transactionId: transaction.paymentIntentId || transaction.stripeSessionId,
          userEmail: user?.email || "N/A",
          userRole: user?.role || "client",
          lawyerEmail: lawyer?.email || "N/A",
          lawyerRole: lawyer?.role || "lawyer",
          amount: transaction.amount,
          status: transaction.status,
          createdAt: transaction.createdAt,
        };
      }),
    );

    // 3. Merge and sort latest first
    const allPayments = [...hirePayments, ...activationPayments];
    allPayments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // 4. Paginate in memory
    const paginatedPayments = allPayments.slice(skip, skip + limit);

    res.send({
      transactions: paginatedPayments,
      totalPages: Math.ceil(allPayments.length / limit),
      totalTransactions: allPayments.length,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to fetch transactions" });
  }
};

// GET /api/admin/analytics
const getAnalytics = async (req, res) => {
  try {
    const totalUsers = await userCollection.countDocuments({ role: "client" });
    const totalLawyers = await userCollection.countDocuments({ role: "lawyer" });
    const totalHires = await transactionCollection.countDocuments();

    // Revenue from hire payments
    const hireRevenue = await transactionCollection
      .aggregate([{ $group: { _id: null, total: { $sum: "$amount" } } }])
      .toArray();

    // Revenue from lawyer activation
    const lawyerRevenue = await userCollection
      .aggregate([
        { $match: { role: "lawyer", plan: "paid" } },
        { $group: { _id: null, total: { $sum: "$planAmount" } } },
      ])
      .toArray();

    const totalRevenue = (hireRevenue[0]?.total || 0) + (lawyerRevenue[0]?.total || 0);

    res.send({ totalUsers, totalLawyers, totalHires, totalRevenue });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: "Failed to load analytics" });
  }
};

module.exports = { getAdminStats, getAllTransactions, getAnalytics };
