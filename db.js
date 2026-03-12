const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'scam.db');

let db;

async function getDb() {
  if (db) return db;

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
    db.run(`
      CREATE TABLE IF NOT EXISTS phones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT UNIQUE NOT NULL,
        report_count INTEGER DEFAULT 1,
        scam_type TEXT DEFAULT 'unknown',
        description TEXT,
        first_reported DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_reported DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT NOT NULL,
        scam_type TEXT NOT NULL,
        description TEXT,
        reporter_ip TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Seed sample data
    const samples = [
      ['0812345678', 'call_center', 'แก๊งคอลเซ็นเตอร์หลอกให้โอนเงิน อ้างเป็นเจ้าหน้าที่ตำรวจ', 45],
      ['0923456789', 'investment', 'หลอกลงทุนคริปโต รับประกันกำไร 300%', 32],
      ['0634567890', 'romance', 'แก๊งหัวใจหลอกรัก ขอยืมเงินจำนวนมาก', 18],
      ['0745678901', 'parcel', 'หลอกว่ามีพัสดุค้างชำระ ให้โอนเงินค่าภาษี', 67],
      ['0856789012', 'loan', 'ให้กู้เงินด่วน หลอกเก็บค่าธรรมเนียมก่อน', 29],
    ];
    for (const [phone, type, desc, count] of samples) {
      db.run(
        `INSERT INTO phones (phone, scam_type, description, report_count) VALUES (?, ?, ?, ?)`,
        [phone, type, desc, count]
      );
    }
    saveDb();
  }
  return db;
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  if (!fs.existsSync(path.dirname(DB_PATH))) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  }
  fs.writeFileSync(DB_PATH, buffer);
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows[0] || null;
}

function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
}

module.exports = { getDb, saveDb, queryAll, queryOne, run };
