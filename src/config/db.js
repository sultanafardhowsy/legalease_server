const { MongoClient, ServerApiVersion } = require("mongodb");

const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const database = client.db("legalease_user");

module.exports = {
  client,
  database,
  userCollection: database.collection("user"),
  sessionCollection: database.collection("session"),
  lawyerCollection: database.collection("lawyers"),
  hireRequestCollection: database.collection("hireRequests"),
  transactionCollection: database.collection("transaction"),
  commentCollection: database.collection("comments"),
  serviceCollection: database.collection("services"),
  lawyerServiceCollection: database.collection("lawyerservices"),
};
