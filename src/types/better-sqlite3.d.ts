declare module 'better-sqlite3' {
  interface Statement<TResult = unknown> {
    all(): TResult[];
    get(): TResult | undefined;
  }

  export default class Database {
    constructor(filename: string, options?: { readonly?: boolean });
    prepare<TResult = unknown>(sql: string): Statement<TResult>;
    close(): void;
  }
}
