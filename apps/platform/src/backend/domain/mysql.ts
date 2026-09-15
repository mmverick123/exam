import mysql, { type Pool, type RowDataPacket, type ResultSetHeader } from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';

export interface MysqlConfig { url?: string; }

function parseUrl(url: string) {
  const parsed = new URL(url);
  return { host: parsed.hostname, port: Number(parsed.port || 3306), user: decodeURIComponent(parsed.username), password: decodeURIComponent(parsed.password), database: parsed.pathname.replace(/^\//, '') };
}

export function createMysqlPool(config: MysqlConfig = {}): Pool {
  const url = config.url ?? process.env.DATABASE_URL ?? 'mysql://exam:exam@127.0.0.1:3306/exam';
  return mysql.createPool({ ...parseUrl(url), waitForConnections: true, connectionLimit: 10, decimalNumbers: true, timezone: 'Z' });
}

export async function ensureSchema(pool: Pool): Promise<void> {
  const sql = await readFile(resolve(process.cwd(), 'schema.sql'), 'utf8');
  const connection = await pool.getConnection();
  try {
    for (const raw of sql.split(';').map((item) => item.trim()).filter(Boolean)) {
      const statement = raw.replace(/^CREATE TABLE\s+/i, 'CREATE TABLE IF NOT EXISTS ');
      await connection.query(statement);
    }
    for (const statement of [
      'ALTER TABLE answer_record ADD COLUMN user_id BIGINT NULL',
      'ALTER TABLE answer_record ADD COLUMN project_id BIGINT NULL',
    ]) {
      try { await connection.query(statement); } catch (error) {
        // Existing installations already contain these columns; all other errors are fatal.
        if (!String((error as { code?: string }).code).includes('ER_DUP_FIELDNAME')) throw error;
      }
    }
    const [countRows] = await connection.query<any[]>('SELECT COUNT(*) AS count FROM users');
    if (Number(countRows[0]?.count ?? 0) === 0) {
      const makeHash = (password: string) => { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`; };
      const now = new Date();
      await connection.execute('INSERT INTO users (username,display_name,password_hash,role,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?),(?,?,?,?,?,?,?)', ['admin', '管理员', makeHash(process.env.EXAM_ADMIN_PASSWORD ?? 'admin123'), 'admin', 'active', now, now, 'user', '答题用户', makeHash(process.env.EXAM_USER_PASSWORD ?? 'user123'), 'user', 'active', now, now]);
    }
    const [projectRows] = await connection.query<any[]>('SELECT COUNT(*) AS count FROM projects');
    if (Number(projectRows[0]?.count ?? 0) === 0) {
      const [adminRows] = await connection.execute<any[]>('SELECT id FROM users WHERE username=? LIMIT 1', ['admin']);
      const [userRows] = await connection.execute<any[]>('SELECT id FROM users WHERE username=? LIMIT 1', ['user']);
      if (adminRows[0] && userRows[0]) {
        const now = new Date(); const [project] = await connection.execute<any>('INSERT INTO projects (code,name,description,created_by,status,created_at,updated_at) VALUES (?,?,?,?,\'active\',?,?)', ['PRJ-DEMO', '演示项目', '默认答题项目', adminRows[0].id, now, now]);
        await connection.execute('INSERT INTO project_members (project_id,user_id,permission,created_at) VALUES (?,?,\'manage\',?),(?,?,\'answer\',?)', [project.insertId, adminRows[0].id, now, project.insertId, userRows[0].id, now]);
      }
    }
  } finally { connection.release(); }
}

export type DbRow = RowDataPacket;
export type DbResult = ResultSetHeader;
