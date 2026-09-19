/** Token DI untuk instans Drizzle. */
export const DRIZZLE = Symbol('DRIZZLE');

/** Token DI untuk `pg.Pool` mentah — dipakai `/health/ready` dan penutupan rapi. */
export const PG_POOL = Symbol('PG_POOL');
