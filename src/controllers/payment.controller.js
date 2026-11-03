const { ObjectId } = require("mongodb");
const stripe = require("../config/stripe");
const {
  hireRequestCollection,
  transactionCollection,
  userCollection,
} = require("../config/db");

// POST /api/payment/confirm
const confirmPayment = async (req, res) => {
  try {
    const { hireRequestId } = req.body;
    const hireRequest = await hireRequestCollection.findOne({
      _id: new ObjectId(hireRequestId),
    });
    if (!hireRequest) return res.status(404).json({ message: "Hire request not found." });
    const result = await hireRequestCollection.updateOne(
      { _id: new ObjectId(hireRequestId) },
      { $set: { status: "paid", paidAt: new Date() } },
    );
    res.status(200).json({ message: "Payment confirmed.", result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to confirm payment." });
  }
};

// POST /api/transactions/save-success
const saveTransaction = async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ success: false, message: "Missing sessionId" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent"],
    });

    if (session.payment_status !== "paid") {
      return res.status(400).json({ success: false, message: "Payment not completed" });
    }

    const existing = await transactionCollection.findOne({ stripeSessionId: sessionId });

    if (existing) {
      return res.status(200).json({ success: true, message: "Already saved" });
    }

    const { hireRequestId, lawyerId, userId } = session.metadata;

    const paymentIntentId =
      typeof session.payment_intent === "object" ? session.payment_intent.id : session.payment_intent;

    await transactionCollection.insertOne({
      stripeSessionId: session.id,
      paymentIntentId,
      hireRequestId,
      lawyerId,
      userId,
      amount: session.amount_total / 100,
      currency: session.currency,
      customerEmail: session.customer_details?.email,
      status: "successful",
      createdAt: new Date(),
    });

    await hireRequestCollection.updateOne(
      { _id: new ObjectId(hireRequestId) },
      { $set: { status: "paid", paidAt: new Date() } },
    );

    res.status(201).json({ success: true, message: "Transaction saved" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// PATCH /api/user/:id/plan  (lawyer activation payment)
const updateLawyerPlan = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, sessionId, paymentIntentId } = req.body;

    const result = await userCollection.updateOne(
      { _id: new ObjectId(id), role: "lawyer" },
      {
        $set: {
          plan: "paid",
          planActivatedAt: new Date(),
          planAmount: amount || 0,
          stripeSessionId: sessionId,
          paymentIntentId,
          updatedAt: new Date(),
        },
      },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "Lawyer not found" });
    }

    res.json({ success: true, message: "Plan updated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = { confirmPayment, saveTransaction, updateLawyerPlan };
