export function isPermissionDeniedError(error: any) {
  const code = String(error?.code || '').toLowerCase();
  if (code === 'permission-denied' || code === 'firestore/permission-denied') return true;
  if (code.includes('permission') && code.includes('denied')) return true;
  const message = String(error?.message || '').toLowerCase();
  return message.includes('missing or insufficient permissions');
}
