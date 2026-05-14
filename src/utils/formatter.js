function formatMoney(value) {
  const number = Number(value || 0);

  return number.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function formatDate(date) {
  if (!date) return 'Data nao informada';

  return new Date(date).toLocaleDateString('pt-BR');
}

function getParcelaValue(parcela) {
  return (
    parcela.balanceDue ||
    parcela.amount ||
    parcela.value ||
    parcela.correctedValueWithAdditions ||
    parcela.correctedValueWithoutAdditions ||
    parcela.proRata
  );
}

function formatParcelaLabel(parcela) {
  const unidade = parcela.unityName || parcela.unitName || parcela.units;
  const empreendimento = parcela.enterpriseName;
  const documento = parcela.documentNumber;
  const contrato = parcela.receivableBillId;
  const parcelaId = parcela.installmentNumber || parcela.installmentId || parcela.id;
  const vencimento = formatDate(parcela.dueDate);
  const valor = formatMoney(getParcelaValue(parcela));

  const origem = [
    unidade && `Unidade/Lote: ${unidade}`,
    empreendimento && `Empreendimento: ${empreendimento}`,
    documento && `Documento: ${documento}`,
    contrato && `Contrato: ${contrato}`
  ].filter(Boolean).join(' | ');

  return [
    origem,
    `Parcela: ${parcelaId}`,
    `Vencimento: ${vencimento}`,
    `Valor: ${valor}`
  ].filter(Boolean).join('\n');
}

function formatParcelaResumo(parcela, index) {
  const unidade = parcela.unityName || parcela.unitName || parcela.units || parcela.documentNumber || 'Unidade nao informada';
  const empreendimento = parcela.enterpriseName;
  const contrato = parcela.receivableBillId;
  const parcelaId = parcela.installmentNumber || parcela.installmentId || parcela.id;
  const vencimento = formatDate(parcela.dueDate);
  const valor = formatMoney(getParcelaValue(parcela));

  return [
    `${index + 1}) Unidade/Lote: ${unidade}`,
    empreendimento && `Empreendimento: ${empreendimento}`,
    `Contrato: ${contrato}`,
    `Parcela: ${parcelaId}`,
    `Vencimento: ${vencimento}`,
    `Valor: ${valor}`
  ].filter(Boolean).join('\n');
}

function formatParcelas(parcelas) {
  if (!parcelas || parcelas.length === 0) {
    return 'Nenhuma parcela encontrada.';
  }

  return parcelas
    .map((parcela, index) => formatParcelaResumo(parcela, index))
    .join('\n\n');
}

module.exports = {
  formatMoney,
  formatDate,
  formatParcelaLabel,
  formatParcelaResumo,
  formatParcelas
};
