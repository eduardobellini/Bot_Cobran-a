require('dotenv').config();

const app = require('./app');
const startInadimplenciaCron = require('./cron/inadimplencia.cron');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor iniciado na porta ${PORT}`);
  startInadimplenciaCron();
});