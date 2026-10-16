export const RECEPTION_DEPARTMENT = 'Reception / Front desk';
export function receptionDepartmentAllowed(value: unknown) {
  return value === undefined || value === null || value === '' || (typeof value === 'string'
    && ['reception/frontdesk', 'frontdesk/reception'].includes(value.toLowerCase().replace(/\s+/g, '')));
}
