import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from "@shared/schema";

// Fix DATABASE_URL if it's incorrectly set to SQLite but PostgreSQL credentials are available
if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('file:') && 
    process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD && process.env.PGDATABASE) {
  console.log('🔧 Detected SQLite DATABASE_URL but PostgreSQL credentials available, constructing proper PostgreSQL URL...');
  const pgHost = process.env.PGHOST;
  const pgUser = process.env.PGUSER;
  const pgPassword = process.env.PGPASSWORD;
  const pgDatabase = process.env.PGDATABASE;
  const pgPort = process.env.PGPORT || '5432';
  
  process.env.DATABASE_URL = `postgresql://${pgUser}:${pgPassword}@${pgHost}:${pgPort}/${pgDatabase}?sslmode=require`;
  console.log('✅ DATABASE_URL corrected to PostgreSQL connection string');
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Check if we have a proper PostgreSQL connection string for Neon
const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl.startsWith('file:') || databaseUrl.includes('sqlite')) {
  throw new Error(
    'SQLite databases are not supported. Please provide a PostgreSQL connection string.\n' +
    'Expected format: postgresql://user:password@host.tld/dbname\n' +
    'Current DATABASE_URL: ' + databaseUrl.substring(0, 20) + '...'
  );
}

// Ensure DATABASE_URL is in correct format for neon() function
let formattedUrl = databaseUrl;
if (formattedUrl.startsWith('postgres://')) {
  formattedUrl = formattedUrl.replace('postgres://', 'postgresql://');
}

if (!formattedUrl.startsWith('postgresql://')) {
  throw new Error(
    'DATABASE_URL must be a PostgreSQL connection string.\n' +
    'Expected format: postgresql://user:password@host.tld/dbname\n' +
    'Current format: ' + formattedUrl.split('://')[0] + '://'
  );
}

// Use HTTP driver instead of WebSocket Pool to avoid connection termination issues
const sql = neon(formattedUrl);
export const db = drizzle(sql, { schema });