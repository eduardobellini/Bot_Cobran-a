const axios = require('axios');

const siengeApi = axios.create({
    baseURL: process.env.SIENGE_BASE_URL,
    timeout: 15000,
    headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
    }
});

const SIENGE_DEFAULT_COMPANY_ID = 1;

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

function formatSiengeError(error) {
    const data = error.response?.data;

    if (typeof data === 'string') {
        const text = data.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        return text.slice(0, 300) || error.message;
    }

    return data || error.message;
}

function isSiengeNotFound(error) {
    return error.response?.status === 404;
}

function getSiengeCompanyId() {
    return Number(process.env.SIENGE_COMPANY_ID || SIENGE_DEFAULT_COMPANY_ID);
}

function getSiengeCompanyIds() {
    const value = process.env.SIENGE_COMPANY_IDS || process.env.SIENGE_COMPANY_ID;

    if (!value) return [SIENGE_DEFAULT_COMPANY_ID];

    return value
        .split(',')
        .map((companyId) => Number(companyId.trim()))
        .filter(Boolean);
}

function onlyDigits(value) {
    return String(value || '').replace(/\D/g, '');
}

function phoneMatches(inputPhone, siengePhone) {
    const input = onlyDigits(inputPhone).replace(/^55/, '');
    const phone = onlyDigits(siengePhone).replace(/^55/, '');

    return phone === input || phone.endsWith(input) || input.endsWith(phone);
}

function customerHasPhone(customer, telefone) {
    return (customer.phones || []).some((phone) => phoneMatches(telefone, phone.number));
}

function customerHasCpf(customer, cpf) {
    return onlyDigits(customer.cpf) === onlyDigits(cpf);
}

async function buscarClientePorCpf(cpf) {
    try {
        const cpfDigits = onlyDigits(cpf);

        console.log(`Buscando cliente por CPF: ${cpfDigits}`);

        const response = await siengeApi.get('/v1/customers', {
            params: {
                cpf: cpfDigits,
                limit: 20,
                offset: 0
            }
        });

        const results = response.data.results || [];
        const cliente = results.find((customer) => customerHasCpf(customer, cpfDigits));

        if (cliente) {
            console.log(`Cliente encontrado pelo CPF: ${cliente.id}`);
            return cliente;
        }

        return null;
    } catch (error) {
        console.error('Erro ao buscar cliente por CPF:', error.response?.data || error.message);
        return null;
    }
}

async function buscarClientePorTelefone(telefone) {
    try {
        console.log(`Buscando cliente por telefone: ${telefone}`);

        const limit = 100;
        let offset = 0;
        let total = Infinity;

        while (offset < total) {
            const response = await siengeApi.get('/v1/customers', {
                params: {
                    phone: telefone,
                    limit,
                    offset
                }
            });

            const results = response.data.results || [];
            const metadata = response.data.resultSetMetadata || {};
            const cliente = results.find((customer) => customerHasPhone(customer, telefone));

            if (cliente) {
                console.log(`Cliente encontrado pelo telefone: ${cliente.id}`);
                return cliente;
            }

            total = metadata.count || 0;
            offset += limit;

            if (results.length === 0) break;
        }

        return null;
    } catch (error) {
        console.error('Erro ao buscar cliente:', error.response?.data || error.message);
        return null;
    }
}

async function buscarClientePorDocumentoOuTelefone(valor) {
    const digits = onlyDigits(valor);

    if (digits.length === 11) {
        const clientePorCpf = await buscarClientePorCpf(digits);

        if (clientePorCpf) return clientePorCpf;
    }

    return buscarClientePorTelefone(digits);
}

async function buscarBoletosCliente(customerId) {
    console.log(`Buscando titulos a receber do cliente: ${customerId}`);

    const boletos = [];

    for (const companyId of getSiengeCompanyIds()) {
      try {
        const response = await siengeApi.get('/v1/accounts-receivable/receivable-bills', {
          params: {
            companyId,
            customerId
          }
        });

        const inadimplentes = (response.data.results || []).filter((boleto) => boleto.defaulting === true);

        if (inadimplentes.length > 0) {
            console.log(`Encontrados ${inadimplentes.length} titulo(s) inadimplente(s) na empresa ${companyId}`);
            boletos.push(...inadimplentes);
        }
      } catch (error) {
        if (isSiengeNotFound(error)) {
            console.warn(`Nenhum titulo a receber encontrado para o cliente ${customerId} na empresa ${companyId}`);
            continue;
        }

        console.error('Erro ao buscar boletos STATUS:', error.response?.status);
        console.error('Erro ao buscar boletos DATA:', formatSiengeError(error));
      }
    }

    return boletos;
}

async function buscarParcelasInadimplentesCliente(customerId) {
    try {
        console.log(`Buscando parcelas inadimplentes do cliente: ${customerId}`);

        const response = await siengeApi.get('/bulk-data/v1/defaulters-receivable-bills', {
            params: {
                companyId: getSiengeCompanyId(),
                customerId,
                defaultersReceivableBills: true,
                showOnlyDefaulters: true,
                includePartiallyPaidInstallments: true
            }
        });

        const titulos = response.data.data || response.data.results || [];
        const parcelas = [];

        for (const titulo of titulos) {
            const receivableBillId = titulo.receivableBillId || titulo.id;
            const installments = titulo.defaulterInstallments || titulo.installments || [];

            for (const parcela of installments) {
                parcelas.push({
                    ...parcela,
                    receivableBillId,
                    customerId: titulo.customerId,
                    customerName: titulo.customerName,
                    documentNumber: titulo.documentNumber
                });
            }
        }

        return parcelas;
    } catch (error) {
        if (isSiengeNotFound(error)) {
            console.warn(`Nenhuma parcela inadimplente encontrada para o cliente: ${customerId}`);
            return [];
        }

        console.error('Erro ao buscar inadimplencia STATUS:', error.response?.status);
        console.error('Erro ao buscar inadimplencia DATA:', formatSiengeError(error));
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

async function buscarDetalhesBoleto(receivableBillId) {
    try {
        console.log(`Buscando detalhes do boleto: ${receivableBillId}`);

        const response = await siengeApi.get(
            `/v1/accounts-receivable/receivable-bills/${receivableBillId}`
        );

        return response.data || null;
    } catch (error) {
        console.error('Erro ao buscar detalhes do boleto:', error.response?.data || error.message);
        return null;
    }
}

async function buscarBoletoLink(billReceivableId, installmentId) {
    try {
        console.log(`Buscando link do boleto do contrato ${billReceivableId}, parcela: ${installmentId}`);

        const response = await siengeApi.get('/v1/payment-slip-notification', {
            params: {
                billReceivableId,
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
    buscarClientePorDocumentoOuTelefone,
    buscarClientePorCpf,
    buscarClientePorTelefone,
    buscarBoletosCliente,
    buscarParcelasInadimplentesCliente,
    buscarDetalhesBoleto,
    buscarParcelasPorBoleto,
    buscarBoletoLink
};
