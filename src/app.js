const express = require('express');
const cors = require('cors');

const webhookRoutes = require('./routes/webhook.routes');

const app = express();

app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use('/webhook', webhookRoutes);

app.get('/', (req, res) => {
  res.send('Bot de boletos Sienge rodando.');
});

module.exports = app;