require('dotenv').config();
const express = require('express');
const twilio = require('twilio');
const cron = require('node-cron');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const sessions = new Map();

const SIENGE_BASE_URL = 'https://api.sienge.com.br/yrconstrucoes/public/api';
const SIENGE_TOKEN = process.env.SIENGE_API_TOKEN || ''; // TODO: add to .env

function whatsappNumber(value) {
  if (!value) return value;
  return value.startsWith('whatsapp:') ? value : `whatsapp:${value}`;
}

async function sendWhatsAppText(to, body) {
  return client.messages.create({
    from: process.env.TWILIO_WHATSAPP_FROM,
    to: whatsappNumber(to),
    body
  });
}

async function sendWhatsAppTemplate(to, contentSid, contentVariables) {
  return client.messages.create({
    from: process.env.TWILIO_WHATSAPP_FROM,
    to: whatsappNumber(to),
    contentSid,
    contentVariables: JSON.stringify(contentVariables)
  });
}

// Funções para chamar a API Sienge
async function buscarBoletosCliente(cpf) {
  try {
    const url = `${SIENGE_BASE_URL}/v1/accounts-receivable/receivable-bills?customerId=${cpf}`;
    console.log(`🔍 Buscando boletos em: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': SIENGE_TOKEN,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`📊 Status Sienge: ${response.status}`);
    const data = await response.json();
    console.log(`📦 Resposta Sienge:`, JSON.stringify(data, null, 2));
    
    return data.results || [];
  } catch (error) {
    console.error('❌ Erro ao buscar boletos:', error.message);
    return [];
  }
}

async function buscarParcelasBoletoPor(receivableBillId) {
  try {
    const url = `${SIENGE_BASE_URL}/v1/accounts-receivable/receivable-bills/${receivableBillId}/installments`;
    console.log(`🔍 Buscando parcelas em: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': SIENGE_TOKEN,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`📊 Status: ${response.status}`);
    const data = await response.json();
    console.log(`📦 Resposta:`, JSON.stringify(data, null, 2));
    
    return data.results || [];
  } catch (error) {
    console.error('❌ Erro ao buscar parcelas:', error.message);
    return [];
  }
}

async function buscarBoletoLink(installmentId) {
  try {
    const url = `${SIENGE_BASE_URL}/v1/payment-slip-notification?installmentId=${installmentId}`;
    console.log(`🔍 Buscando boleto em: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': SIENGE_TOKEN,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`📊 Status: ${response.status}`);
    const data = await response.json();
    console.log(`📦 Resposta:`, JSON.stringify(data, null, 2));
    
    if (data.results && data.results.length > 0) {
      return data.results[0].urlReport;
    }
  } catch (error) {
    console.error('❌ Erro ao buscar boleto link:', error.message);
  }
  return null;
}


function formatParcelas(parcelas) {
  if (!parcelas || parcelas.length === 0) {
    return 'Nenhuma parcela encontrada.';
  }
  return parcelas
    .map((p, index) => {
      const data = new Date(p.dueDate).toLocaleDateString('pt-BR');
      return `${index + 1}) Vencimento: ${data} - R$ ${p.balanceDue.toFixed(2)}`;
    })
    .join('\n');
}

function getSession(from) {
  if (!sessions.has(from)) {
    sessions.set(from, { step: 'pedindo_cpf', data: {} });
  }
  return sessions.get(from);
}

function respond(res, msg) {
  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message(msg);
  res.writeHead(200, { 'Content-Type': 'text/xml' });
  res.end(twiml.toString());
}

app.post('/webhook', async (req, res) => {
  const from = req.body.From;
  const body = (req.body.Body || '').trim();
  console.log(`📱 Mensagem recebida de ${from}: "${body}"`);
  const session = getSession(from);

  if (session.step === 'pedindo_cpf') {
    // Valida se é CPF (11 dígitos)
    const cpfLimpo = body.replace(/\D/g, '');
    if (cpfLimpo.length !== 11) {
      return respond(res, 'Por favor, envie um CPF válido (11 dígitos).');
    }

    session.data.cpf = cpfLimpo;
    const boletos = await buscarBoletosCliente(cpfLimpo);

    if (!boletos || boletos.length === 0) {
      sessions.delete(from);
      return respond(res, 'Não encontramos boletos para esse CPF.');
    }

    // Busca parcelas de cada boleto
    const todasAsParcelas = [];
    for (const boleto of boletos) {
      const parcelas = await buscarParcelasBoletoPor(boleto.receivableBillId);
      todasAsParcelas.push(...parcelas.map(p => ({
        ...p,
        receivableBillId: boleto.receivableBillId
      })));
    }

    if (!todasAsParcelas || todasAsParcelas.length === 0) {
      sessions.delete(from);
      return respond(res, 'Nenhuma parcela em atraso encontrada.');
    }

    session.step = 'aguardando_escolha';
    session.data.parcelas = todasAsParcelas;

    const mensagem = `Você tem parcelas:\n${formatParcelas(todasAsParcelas)}\n\nResponda com o número da parcela para receber o boleto.`;
    return respond(res, mensagem);
  }

  if (session.step === 'aguardando_escolha') {
    const escolha = parseInt(body, 10);
    const parcelas = session.data.parcelas || [];
    const parcela = parcelas[escolha - 1];

    if (!parcela) {
      return respond(res, 'Escolha inválida. Responda com o número da parcela desejada.');
    }

    const boletoUrl = await buscarBoletoLink(parcela.installmentId);
    if (boletoUrl) {
      await sendWhatsAppText(from, `Boleto para parcela vencimento ${parcela.dueDate}:\n${boletoUrl}`);
    } else {
      await sendWhatsAppText(from, `Desculpe, não conseguimos gerar o boleto. Tente novamente.`);
    }

    sessions.delete(from);
    return respond(res, `OK! Estou enviando o boleto para o seu WhatsApp.`);
  }

  sessions.delete(from);
  return respond(res, 'Olá! Para ver suas parcelas, envie seu CPF (11 dígitos).');
});

app.get('/', (req, res) => {
  res.send('Bot de boletos Sienge rodando.');
});

cron.schedule('0 9 * * *', async () => {
  try {
    console.log('Executando cron de inadimplentes...');
    // TODO: implementar busca de inadimplentes
  } catch (error) {
    console.error('Erro ao executar cron:', error);
  }
}, {
  timezone: 'America/Sao_Paulo'
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor iniciado na porta ${PORT}`);
});
