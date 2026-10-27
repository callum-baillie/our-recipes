/** Supports both current directory records and older saved branch snapshots. */
export function formatStoreAddress(address: Record<string, string>): string {
  if (address.full?.trim()) return address.full.trim();
  const street = [address.house_number, address.street || address.street_address]
    .filter(Boolean)
    .join(' ');
  return [
    street,
    address.unit,
    address.city,
    address.state || address.region,
    address.postcode || address.postal_code,
    address.country,
  ]
    .filter(Boolean)
    .join(', ');
}
