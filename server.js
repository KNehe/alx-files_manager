const express = require('express');
const router = require('./routes/index');

const port = 5000;

const app = express();

app.use(express.json());
app.use(router);

app.listen(port, () => {
  console.log(`Server running on ${port}`);
});
