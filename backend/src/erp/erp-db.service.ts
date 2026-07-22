import { Injectable, OnModuleDestroy } from '@nestjs/common';
import * as mysql from 'mysql2/promise';
import * as fs from 'fs';

/**
 * Read-only connection to ERPNext's own MariaDB, ported verbatim from
 * PROMAN/backend/src/db.ts — same pool config, same query/queryBigSelect
 * behavior. Used for both the ACE nightly sync and every dashboard module,
 * since they all read from the same ERPNext instance.
 */
@Injectable()
export class ErpDbService implements OnModuleDestroy {
  private pool: mysql.Pool | null = null;

  private getPool(): mysql.Pool {
    if (this.pool) return this.pool;

    const host = process.env.ERP_DB_HOST || '127.0.0.1';
    const port = parseInt(process.env.ERP_DB_PORT || '3306', 10);
    const database = process.env.ERP_DB_NAME || '';
    const user = process.env.ERP_DB_USER || '';
    const connectionLimit = parseInt(process.env.ERP_DB_CONNECTION_LIMIT || '5', 10);

    const sslOptions: { ssl?: { ca: Buffer } | { rejectUnauthorized: boolean } } =
      process.env.ERP_DB_SSL_CA
        ? { ssl: { ca: fs.readFileSync(process.env.ERP_DB_SSL_CA) } }
        : process.env.ERP_DB_SSL === 'true'
          ? { ssl: { rejectUnauthorized: false } }
          : {};

    this.pool = mysql.createPool({
      host,
      port,
      database,
      user,
      password: process.env.ERP_DB_PASSWORD || '',
      connectionLimit,
      waitForConnections: true,
      ...sslOptions,
    });

    return this.pool;
  }

  async query<T = unknown>(sql: string, params?: (string | number | null)[]): Promise<T[]> {
    const [rows] = await this.getPool().execute(sql, params);
    return rows as T[];
  }

  /** For heavy aggregate queries needing SET SQL_BIG_SELECTS=1 at session level. */
  async queryBigSelect<T = unknown>(sql: string, params?: (string | number | null)[]): Promise<T[]> {
    const conn = await this.getPool().getConnection();
    try {
      await conn.query('SET SESSION sql_big_selects = 1');
      const [rows] = await conn.execute(sql, params);
      return rows as T[];
    } finally {
      conn.release();
    }
  }

  async onModuleDestroy() {
    if (this.pool) await this.pool.end();
  }
}
