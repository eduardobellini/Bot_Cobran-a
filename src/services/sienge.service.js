const axios = require('axios');

const siengeApi = axios.create({
    baseURL: process.env.SIENGE_BASE_URL,
    timeout: 15000,
    headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
    }
});

siengeApi.interceptors.request.use((config) => {
    config.headers.Authorization = getSiengeAuthorizationHeader();
    return config;
});

function getSiengeAuthorizationHeader() {
    const token = process.env.SIENGE_API_TOKEN || '';

    if (!token.trim()) {
        throw new Error('SIENGE_API_TOKEN não configurado no .env');
    }

    return /^(Basic|Bearer)\s+/i.test(token) ? token : `Basic ${token}`;
}

async function buscarClientePorTelefone(telefone) {
    try {
        console.log(`Buscando cliente por telefone: ${telefone}`);

        const response = await siengeApi.get('/v1/customers', {
            params: {
                phone: telefone
            }
        });

        return response.data.results?.[0] || null;
    } catch (error) {
        console.error('Erro ao buscar cliente:', error.response?.data || error.message);
        return null;
    }
}

async function buscarBoletosCliente(customerId) {
  try {
    console.log(`Buscando contas vencidas do cliente: ${customerId}`);

    const response = await siengeApi.get('/v1/accounts-receivable/overdue-receivables', {
      params: {
        customerId
      }
    });

    console.log('Status contas vencidas:', response.status);
    console.log('Resposta contas vencidas:', JSON.stringify(response.data, null, 2));

    return response.data.results || [];
  } catch (error) {
    console.error('Erro ao buscar boletos STATUS:', error.response?.status);
    console.error('Erro ao buscar boletos DATA:', error.response?.data || error.message);
    return [];
  }
}

async function buscarParcelasPorBoleto(receivableBillId) {
    try {
        console.log(`Buscando parcelas do boleto: ${receivableBillId}`);

        const response = await siengeApi.get(
            `/v1/accounts-receivable/receivable-bills/${receivableBillId}/installments`
        );

        return response.data.results || [];
    } catch (error) {
        console.error('Erro ao buscar parcelas:', error.response?.data || error.message);
        return [];
    }
}

async function buscarBoletoLink(installmentId) {
    try {
        console.log(`Buscando link do boleto da parcela: ${installmentId}`);

        const response = await siengeApi.get('/v1/payment-slip-notification', {
            params: {
                installmentId
            }
        });

        return response.data.results?.[0]?.urlReport || null;
    } catch (error) {
        console.error('Erro ao buscar boleto:', error.response?.data || error.message);
        return null;
    }
}

module.exports = {
    buscarClientePorTelefone,
    buscarBoletosCliente,
    buscarParcelasPorBoleto,
    buscarBoletoLink
};