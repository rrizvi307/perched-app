declare module '@firebase/rules-unit-testing' {
  export type RulesTestEnvironment = any;
  export function assertFails<T = unknown>(promise: Promise<T>): Promise<unknown>;
  export function assertSucceeds<T = unknown>(promise: Promise<T>): Promise<T>;
  export function initializeTestEnvironment(config: any): Promise<RulesTestEnvironment>;
}
