const cron = require('node-cron');

function startInadimplenciaCron() {
  cron.schedule(
    '0 9 * * *',
    async () => {
      try {
        console.log('Executando cron de inadimplentes...');

        // TODO:
        // 1. Buscar inadimplentes no Sienge
        // 2. Filtrar clientes com telefone
        // 3. Enviar mensagem pelo Twilio
        // 4. Registrar quem recebeu cobrança

      } catch (error) {
        console.error('Erro ao executar cron:', error.message);
      }
    },
    {
      timezone: 'America/Sao_Paulo'
    }
  );
}

module.exports = startInadimplenciaCron;