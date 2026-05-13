function formatMoney(value) {
  const number = Number(value || 0);

  return number.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function formatDate(date) {
  if (!date) return 'Data não informada';

  return new Date(date).toLocaleDateString('pt-BR');
}

function formatParcelas(parcelas) {
  if (!parcelas || parcelas.length === 0) {
    return 'Nenhuma parcela encontrada.';
  }

  return parcelas
    .map((parcela, index) => {
      const vencimento = formatDate(parcela.dueDate);
      const valor = formatMoney(parcela.balanceDue || parcela.amount || parcela.value);

      return `${index + 1}) Vencimento: ${vencimento} - ${valor}`;
    })
    .join('\n');
}

module.exports = {
  formatMoney,
  formatDate,
  formatParcelas
};