const twilio = require('twilio');

const {
    buscarClientePorTelefone,
    buscarBoletosCliente,
    buscarParcelasPorBoleto,
    buscarBoletoLink
} = require('../services/sienge.service');

const { sendWhatsAppText } = require('../services/twilio.service');
const { getSession, deleteSession } = require('../services/session.service');
const { formatParcelas } = require('../utils/formatter');

function respond(res, msg) {
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(msg);

    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(twiml.toString());
}

async function handleWebhook(req, res) {
    try {
        const from = req.body.From;
        const body = (req.body.Body || '').trim();

        console.log(`Mensagem recebida de ${from}: "${body}"`);

        const session = getSession(from);

        if (session.step === 'inicio') {
            session.step = 'aguardando_telefone';

            return respond(
                res,
                'Olá! Para consultar as parcelas, informe o telefone do cliente com DDD. Exemplo: 83999999999'
            );
        }

        if (session.step === 'aguardando_telefone') {
            const telefoneCliente = body.replace(/\D/g, '');

            if (telefoneCliente.length < 10 || telefoneCliente.length > 13) {
                return respond(
                    res,
                    'Telefone inválido. Envie apenas números, com DDD. Exemplo: 83999999999'
                );
            }

            session.data.telefone = telefoneCliente;

            const cliente = await buscarClientePorTelefone(telefoneCliente);

            if (!cliente) {
                deleteSession(from);
                return respond(res, 'Não encontramos nenhum cliente vinculado a este telefone.');
            }

            session.data.cliente = cliente;

            const boletos = await buscarBoletosCliente(cliente.id);

            if (!boletos || boletos.length === 0) {
                deleteSession(from);
                return respond(
                    res,
                    'Cliente encontrado, mas não encontramos parcelas vencidas para ele.'
                );
            }

            const todasAsParcelas = [];

            for (const boleto of boletos) {
                const receivableBillId = boleto.receivableBillId || boleto.id;

                if (!receivableBillId) continue;

                const parcelas = await buscarParcelasPorBoleto(receivableBillId);

                todasAsParcelas.push(
                    ...parcelas.map((parcela) => ({
                        ...parcela,
                        receivableBillId
                    }))
                );
            }

            if (!todasAsParcelas.length) {
                deleteSession(from);
                return respond(res, 'Nenhuma parcela encontrada para este cliente.');
            }

            session.step = 'aguardando_escolha';
            session.data.parcelas = todasAsParcelas;

            const mensagem = `Encontramos estas parcelas:\n\n${formatParcelas(todasAsParcelas)}\n\nResponda com o número da parcela para receber o boleto.`;

            return respond(res, mensagem);
        }

        if (session.step === 'aguardando_escolha') {
            const escolha = parseInt(body, 10);
            const parcelas = session.data.parcelas || [];
            const parcela = parcelas[escolha - 1];

            if (!parcela) {
                return respond(res, 'Escolha inválida. Responda apenas com o número da parcela desejada.');
            }

            const installmentId = parcela.installmentId || parcela.id;

            if (!installmentId) {
                deleteSession(from);
                return respond(res, 'Não conseguimos identificar essa parcela. Tente novamente mais tarde.');
            }

            const boletoUrl = await buscarBoletoLink(installmentId);

            if (boletoUrl) {
                await sendWhatsAppText(
                    from,
                    `Segue o boleto da parcela selecionada:\n${boletoUrl}`
                );

                deleteSession(from);
                return respond(res, 'OK! Enviei o boleto para você.');
            }

            deleteSession(from);
            return respond(res, 'Desculpe, não conseguimos gerar o boleto agora. Tente novamente mais tarde.');
        }

        deleteSession(from);
        return respond(res, 'Olá! Envie uma mensagem para consultar suas parcelas.');

    } catch (error) {
        console.error('Erro no webhook:', error.message);
        return respond(res, 'Ocorreu um erro no atendimento. Tente novamente mais tarde.');
    }
}

module.exports = {
    handleWebhook
};