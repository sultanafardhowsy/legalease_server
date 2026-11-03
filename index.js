// Entry point — keep this file at the root so vercel.json (src: "index.js") still works.
require("dotenv").config();

const app = require("./src/app");

const port = process.env.PORT || 5000;

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

module.exports = app;
