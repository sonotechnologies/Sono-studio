/** "₦4,500", "$12.50", "€9": whole amounts without decimals. */
export function formatPrice(amount: number, currency: string): string {
  const whole = Number.isInteger(amount);
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString('en')}`;
  }
}

export interface OrderLine {
  name: string;
  price: number;
  qty: number;
  options?: Record<string, string>;
}

/** The pre-filled WhatsApp order: one line per item, the total and the customer's details. */
export function orderMessage(input: { business: string; lines: OrderLine[]; currency: string; customer?: string; note?: string }): string {
  const total = input.lines.reduce((s, l) => s + l.price * l.qty, 0);
  const rows = input.lines.map((l) => {
    const opts = l.options && Object.keys(l.options).length ? ` (${Object.entries(l.options).map(([k, v]) => `${k}: ${v}`).join(', ')})` : '';
    return `• ${l.qty} × ${l.name}${opts}: ${formatPrice(l.price * l.qty, input.currency)}`;
  });
  return [
    `Hello ${input.business}, I’d like to order:`,
    ...rows,
    `Total: ${formatPrice(total, input.currency)}`,
    input.customer?.trim() ? `Name: ${input.customer.trim()}` : '',
    input.note?.trim() ? `Delivery / note: ${input.note.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
