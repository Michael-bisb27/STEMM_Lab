import * as SQLite from 'expo-sqlite';

// Open the database
const db = SQLite.openDatabaseSync('stemmlab.db');

export const setupDatabase = () => {
  db.withTransactionSync(() => {
    // === EXISTING STUDENT TABLES (UNTOUCHED) ===
    db.execSync(`
      CREATE TABLE IF NOT EXISTS FC_Sensor_Log (
        LogID INTEGER PRIMARY KEY AUTOINCREMENT,
        AttemptID TEXT, 
        SensorType TEXT,
        PeakValue REAL,
        DurationSec REAL
      );
    `);

    db.execSync(`
      CREATE TABLE IF NOT EXISTS MS_Activity (
        ActivityID INTEGER PRIMARY KEY NOT NULL,
        Name TEXT,
        SubjectArea TEXT,
        BaseInstructions TEXT
      );
    `);
  });
};

export default db;