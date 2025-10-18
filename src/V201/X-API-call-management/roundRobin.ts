// Round-robin admission logic for tenants
let lastTenantIndex = 0;

export function getNextTenant(tenants: string[]): string {
  if (tenants.length === 0) return '';
  lastTenantIndex = (lastTenantIndex + 1) % tenants.length;
  return tenants[lastTenantIndex];
}
