const twilio = require('twilio');

const {
    buscarClientePorDocumentoOuTelefone,
    buscarBoletosCliente,
    buscarDetalhesBoleto,
    buscarParcelasPorBoleto,
    buscarBoletoLink
} = require('../services/sienge.service');

const { getSession, deleteSession } = require('../services/session.service');
const { formatParcelaLabel, formatParcelas } = require('../utils/formatter');

function respond(res, msg) {
    const twiml = new twilio.twiml.MessagingResponse();
    const messages = Array.isArray(msg) ? msg : [msg];

    for (const message of messages) {
        twiml.message(message);
    }

    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(twiml.toString());
}

function chunkArray(items, size) {
    const chunks = [];

    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }

    return chunks;
}

function buildMensagensEscolha(parcelas) {
    const chunks = chunkArray(parcelas, 4);
    const messages = [
        `Encontramos ${parcelas.length} parcelas vencidas. Escolha uma parcela pelo numero.`
    ];

    chunks.forEach((chunk, chunkIndex) => {
        const start = chunkIndex * 4;
        const formatted = chunk
            .map((parcela, index) => {
                const globalIndex = start + index;
                return formatParcelas([parcela]).replace(/^1\)/, `${globalIndex + 1})`);
            })
            .join('\n\n');

        messages.push(formatted);
    });

    messages.push('Responda apenas com o numero da parcela desejada.');

    return messages;
}

function isParcelaVencidaEmAberto(parcela) {
    const balanceDue = Number(parcela.balanceDue ?? parcela.value ?? parcela.amount ?? 0);
    const dueDate = parcela.dueDate ? new Date(`${parcela.dueDate}T00:00:00`) : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return balanceDue > 0 && dueDate && dueDate <= today;
}

async function handleWebhook(req, res) {
    try {
        const from = req.body.From;
        const body = (req.body.Body || '').trim();

        console.log(`Mensagem recebida de ${from}: "${body}"`);

        const session = getSession(from);

        if (session.step === 'inicio') {
            session.step = 'aguardando_documento';

            return respond(
                res,
                'Ola! Para consultar as parcelas vencidas, informe o CPF ou telefone com DDD.'
            );
        }

        if (session.step === 'aguardando_documento' || session.step === 'aguardando_telefone') {
            const documentoCliente = body.replace(/\D/g, '');

            if (documentoCliente.length < 10 || documentoCliente.length > 13) {
                return respond(
                    res,
                    'Dado invalido. Envie CPF com 11 digitos ou telefone com DDD. Exemplo: 12345678901'
                );
            }

            session.data.documento = documentoCliente;

            const cliente = await buscarClientePorDocumentoOuTelefone(documentoCliente);

            if (!cliente) {
                deleteSession(from);
                return respond(res, 'Nao encontramos nenhum cliente vinculado a esse CPF ou telefone.');
            }

            session.data.cliente = cliente;

            const boletos = await buscarBoletosCliente(cliente.id);

            if (!boletos || boletos.length === 0) {
                deleteSession(from);
                return respond(
                    res,
                    'Cliente encontrado, mas nao encontramos parcelas vencidas para ele.'
                );
            }

            const todasAsParcelas = [];

            for (const boleto of boletos) {
                const receivableBillId = boleto.receivableBillId || boleto.id;

                if (!receivableBillId) continue;

                const detalhesBoleto = await buscarDetalhesBoleto(receivableBillId);
                const boletoInfo = detalhesBoleto || boleto;
                const parcelas = await buscarParcelasPorBoleto(receivableBillId);

                todasAsParcelas.push(
                    ...parcelas
                        .filter(isParcelaVencidaEmAberto)
                        .map((parcela) => ({
                            ...parcela,
                            receivableBillId,
                            enterpriseName: boletoInfo.enterpriseName,
                            unityName: boletoInfo.unityName,
                            units: boletoInfo.units,
                            documentNumber: boletoInfo.documentNumber,
                            documentId: boletoInfo.documentId
                        }))
                );
            }

            if (!todasAsParcelas.length) {
                deleteSession(from);
                return respond(res, 'Nenhuma parcela encontrada para este cliente.');
            }

            if (todasAsParcelas.length === 1) {
                const parcela = todasAsParcelas[0];
                const installmentId = parcela.installmentId || parcela.id;
                const receivableBillId = parcela.receivableBillId;
                const boletoUrl = await buscarBoletoLink(receivableBillId, installmentId);

                deleteSession(from);

                if (boletoUrl) {
                    return respond(res, `Encontramos 1 parcela vencida:\n\n${formatParcelaLabel(parcela)}\nLink: ${boletoUrl}`);
                }

                return respond(res, 'Encontramos uma parcela vencida, mas nao conseguimos gerar o boleto agora. Tente novamente mais tarde.');
            }

            session.step = 'aguardando_escolha';
            session.data.parcelas = todasAsParcelas;

            return respond(res, buildMensagensEscolha(todasAsParcelas));
        }

        if (session.step === 'aguardando_escolha') {
            const escolha = parseInt(body, 10);
            const parcelas = session.data.parcelas || [];
            const parcela = parcelas[escolha - 1];

            if (!parcela) {
                return respond(res, 'Escolha invalida. Responda apenas com o numero da parcela desejada.');
            }

            const installmentId = parcela.installmentId || parcela.id;
            const receivableBillId = parcela.receivableBillId;

            if (!receivableBillId || !installmentId) {
                deleteSession(from);
                return respond(res, 'Nao conseguimos identificar essa parcela. Tente novamente mais tarde.');
            }

            const boletoUrl = await buscarBoletoLink(receivableBillId, installmentId);

            if (boletoUrl) {
                deleteSession(from);
                return respond(res, `Segue o boleto da parcela selecionada:\n\n${formatParcelaLabel(parcela)}\nLink: ${boletoUrl}`);
            }

            deleteSession(from);
            return respond(res, 'Desculpe, nao conseguimos gerar o boleto agora. Tente novamente mais tarde.');
        }

        deleteSession(from);
        return respond(res, 'Ola! Envie uma mensagem para consultar suas parcelas.');

    } catch (error) {
        console.error('Erro no webhook:', error.message);
        return respond(res, 'Ocorreu um erro no atendimento. Tente novamente mais tarde.');
    }
}

module.exports = {
    handleWebhook
};
