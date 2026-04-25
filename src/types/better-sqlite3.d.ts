declare module 'better-sqlite3' {
  interface Statement<TResult = unknown> {
    all(): TResult[];
    get(): TResult | undefined;
    run(...params: unknown[]): unknown;
  }

  export default class Database {
    constructor(filename: string, options?: { readonly?: boolean; fileMustExist?: boolean });
    prepare<TResult = unknown>(sql: string): Statement<TResult>;
    exec(sql: string): void;
    close(): void;
  }
}
