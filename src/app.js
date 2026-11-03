const express = require("express");
const cors = require("cors");
const routes = require("./routes");

const app = express();

app.use(
  cors({
    origin: [process.env.CLIENT_URL, process.env.CLIENT_URL_PROD],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: true,
  }),
);
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.use("/api", routes);

module.exports = app;
