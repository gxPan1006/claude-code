// Stub: protectedNamespace was not included in this source snapshot.
// Re-export a permissive shape so envUtils side-steps protected-env handling.
export const PROTECTED_NAMESPACE_PREFIXES: string[] = [];
export function isProtectedEnvName(_name: string): boolean {
  return false;
}
export function isProtectedEnvVar(_name: string): boolean {
  return false;
}
