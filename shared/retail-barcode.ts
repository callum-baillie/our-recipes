/** Expand only an explicitly identified UPC-E. Eight-digit EAN codes are different identities. */
export function expandScannedBarcode(value: string, format: string): string {
  if (format !== 'upc_e') return value;
  // Scanners supply number system + six compressed digits + the original UPC-A check digit.
  if (!/^[01]\d{7}$/u.test(value)) throw new Error('Scan the complete UPC-E barcode again.');
  const system = value[0]!;
  const digits = value.slice(1, 7);
  const last = digits[5]!;
  const body =
    last <= '2'
      ? `${digits.slice(0, 2)}${last}0000${digits.slice(2, 5)}`
      : last === '3'
        ? `${digits.slice(0, 3)}00000${digits.slice(3, 5)}`
        : last === '4'
          ? `${digits.slice(0, 4)}00000${digits[4]}`
          : `${digits.slice(0, 5)}0000${last}`;
  const expanded = `${system}${body}${value[7]}`;
  const sum = [...expanded.slice(0, -1)].reduce(
    (total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1),
    0,
  );
  if ((10 - (sum % 10)) % 10 !== Number(value[7]))
    throw new Error('Barcode check digit is invalid. Scan the UPC-E barcode again.');
  return expanded;
}
