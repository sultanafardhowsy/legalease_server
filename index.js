const express = require('express')
const app = express()
const port = 5000
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require('dotenv').config()

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://yourdomain.com",
    ],
    credentials: true,
  })
);
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello World!')
})


const uri = process.env.MONGODB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();

    const database = client.db("legalease_user");
    
    const userCollection = database.collection("user");
    

    app.get('/api/users', async (req, res) => {
      const cursor = userCollection.find().skip(2);
      const result = await cursor.toArray();
      res.send(result);
    })

 


    await client.db("admin").command({ ping: 1 });
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error(error);
  }
}


run();
//run().catch(console.dir);


app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})