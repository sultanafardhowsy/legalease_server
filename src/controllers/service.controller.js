const { ObjectId } = require("mongodb");
const { serviceCollection, lawyerServiceCollection } = require("../config/db");

// GET /api/services  (public, for dropdown)
const getServices = async (req, res) => {
  try {
    const services = await serviceCollection.find({}).sort({ name: 1 }).toArray();
    res.status(200).json(services);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch services" });
  }
};

// GET /api/lawyer/services/:lawyerId  (public)
const getLawyerServices = async (req, res) => {
  try {
    const entries = await lawyerServiceCollection
      .find({ lawyerId: req.params.lawyerId })
      .sort({ createdAt: -1 })
      .toArray();

    // Manually join with services collection
    const enriched = await Promise.all(
      entries.map(async (entry) => {
        const service = await serviceCollection.findOne({ _id: new ObjectId(entry.serviceId) });
        return { ...entry, service };
      }),
    );

    res.status(200).json(enriched);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch lawyer services" });
  }
};

// POST /api/lawyer/services
const addLawyerService = async (req, res) => {
  const { serviceId } = req.body;
  const lawyerId = req.body.lawyerId || req.user._id.toString();
  if (lawyerId !== req.user._id.toString()) {
    return res.status(403).json({ message: "forbidden access" });
  }
  if (!serviceId) {
    return res.status(400).json({ message: "lawyerId and serviceId are required" });
  }
  try {
    const already = await lawyerServiceCollection.findOne({ lawyerId, serviceId });
    if (already) return res.status(409).json({ message: "Service already added" });

    const result = await lawyerServiceCollection.insertOne({
      lawyerId,
      serviceId,
      createdAt: new Date(),
    });

    const service = await serviceCollection.findOne({ _id: new ObjectId(serviceId) });
    res.status(201).json({ _id: result.insertedId, lawyerId, serviceId, service });
  } catch (err) {
    res.status(500).json({ message: "Failed to add service" });
  }
};

// DELETE /api/lawyer/services/:id
const removeLawyerService = async (req, res) => {
  try {
    const entry = await lawyerServiceCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!entry) return res.status(404).json({ message: "Service not found" });
    if (entry.lawyerId !== req.user._id.toString()) {
      return res.status(403).json({ message: "forbidden access" });
    }
    const result = await lawyerServiceCollection.deleteOne({
      _id: new ObjectId(req.params.id),
    });
    if (result.deletedCount === 0) return res.status(404).json({ message: "Service not found" });
    res.status(200).json({ message: "Service removed successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to remove service" });
  }
};

module.exports = { getServices, getLawyerServices, addLawyerService, removeLawyerService };
