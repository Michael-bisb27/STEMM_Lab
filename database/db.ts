import * as SQLite from 'expo-sqlite';

// 1. Establish a synchronous connection to the local database file.
const db = SQLite.openDatabaseSync('stemm_lab_local.db');

/**
 * 2. Database Schema Initialization
 * Call this once at the root level of your app in root _layout.tsx
 */
export const initializeDatabase = (): void => {
    try {
        db.execSync(`
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;

            -- ACTIVITY 1: PARACHUTE DROP CHALLENGE LOGS
            CREATE TABLE IF NOT EXISTS parachute_trial_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                attempt_id TEXT NOT NULL,
                action_phase INTEGER NOT NULL,
                trial_number INTEGER NOT NULL,
                air_time REAL NOT NULL,
                peak_g_force REAL NOT NULL,
                recorded_at INTEGER NOT NULL
            );
            
            -- ACTIVITY 2: SOUND POLLUTION HUNTER LOGS
            CREATE TABLE IF NOT EXISTS sound_trial_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                attempt_id TEXT NOT NULL,
                member_number INTEGER NOT NULL,
                action_phase INTEGER NOT NULL,
                peak_db REAL NOT NULL,
                recorded_at INTEGER NOT NULL
            );

            -- ACTIVITY 3: HAND FAN CHALLENGE LOGS
            CREATE TABLE IF NOT EXISTS fan_trial_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                attempt_id TEXT NOT NULL,
                member_number INTEGER NOT NULL,
                target_material TEXT NOT NULL,
                distance_gap TEXT NOT NULL,
                fan_design INTEGER NOT NULL,
                fanning_duration INTEGER NOT NULL,
                is_challenge_entry INTEGER NOT NULL DEFAULT 0,
                selected_material_spec TEXT,
                stiffness_k REAL,
                observed_angle REAL,
                calculated_force REAL,
                recorded_at INTEGER NOT NULL
            );

            -- ACTIVITY 4: EARTHQUAKE-RESISTANT STRUCTURE LOGS
            CREATE TABLE IF NOT EXISTS earthquake_trial_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                attempt_id TEXT NOT NULL,
                member_number INTEGER NOT NULL,
                design_number INTEGER NOT NULL,
                peak_displacement REAL NOT NULL,
                angular_deflection REAL NOT NULL,
                recorded_at INTEGER NOT NULL
            );

            -- ACTIVITY 5: HUMAN PERFORMANCE LAB LOGS
            CREATE TABLE IF NOT EXISTS human_trial_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                attempt_id TEXT NOT NULL,
                member_number INTEGER NOT NULL,
                movement_variant INTEGER NOT NULL,
                attempt_number INTEGER NOT NULL,
                duration_ms INTEGER NOT NULL,
                peak_vibration REAL NOT NULL,
                recorded_at INTEGER NOT NULL
            );

            -- ACTIVITY 6: REACTION BOARD CHALLENGE LOGS
            CREATE TABLE IF NOT EXISTS reaction_trial_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                attempt_id TEXT NOT NULL,
                member_number INTEGER NOT NULL,
                phase_number INTEGER NOT NULL,
                trial_number INTEGER NOT NULL,
                recorded_time REAL NOT NULL,
                recorded_at INTEGER NOT NULL
            );

            -- ACTIVITY 7: BREATHING PACE TRAINER LOGS
            CREATE TABLE IF NOT EXISTS breathing_trial_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                attempt_id TEXT NOT NULL,
                member_number INTEGER NOT NULL,
                phase_number INTEGER NOT NULL,
                expansions_detected INTEGER NOT NULL,
                calculated_rpm REAL NOT NULL,
                recorded_at INTEGER NOT NULL
            );
        `);
        console.log('⚡ STEMM Lab Local Master SQLite Engine initialized successfully.');
    } catch (error) {
        console.error('❌ Failed to initialize master local database schemas:', error);
    }
};

/**
 * 3. TypeScript Structural Interfaces
 */
export interface ParachuteTrialRecord {
    id?: number;
    attempt_id: string;
    action_phase: number;
    trial_number: number;
    air_time: number;
    peak_g_force: number;
    recorded_at: number;
}

export interface SoundTrialRecord {
    id?: number;
    attempt_id: string;
    member_number: number;
    action_phase: number;
    peak_db: number;
    recorded_at: number;
}

export interface FanTrialRecord {
    id?: number;
    attempt_id: string;
    member_number: number;
    target_material: string;
    distance_gap: string;
    fan_design: number;
    fanning_duration: number;
    is_challenge_entry: number;
    selected_material_spec?: string;
    stiffness_k?: number;
    observed_angle?: number;
    calculated_force?: number;
    recorded_at: number;
}

export interface EarthquakeTrialRecord {
    id?: number;
    attempt_id: string;
    member_number: number;
    design_number: number;
    peak_displacement: number;
    angular_deflection: number;
    recorded_at: number;
}

export interface HumanTrialRecord {
    id?: number;
    attempt_id: string;
    member_number: number;
    movement_variant: number;
    attempt_number: number;
    duration_ms: number;
    peak_vibration: number;
    recorded_at: number;
}

export interface ReactionTrialRecord {
    id?: number;
    attempt_id: string;
    member_number: number;
    phase_number: number;
    trial_number: number;
    recorded_time: number;
    recorded_at: number;
}

export interface BreathingTrialRecord {
    id?: number;
    attempt_id: string;
    member_number: number;
    phase_number: number;
    expansions_detected: number;
    calculated_rpm: number;
    recorded_at: number;
}

/**
 * 4. Master Data Access Object (DAO) Controllers
 */

// ACTIVITY 1
export const parachuteOps = {
    insertTrial: (record: ParachuteTrialRecord): void => {
        db.runSync(
            `INSERT INTO parachute_trial_logs (attempt_id, action_phase, trial_number, air_time, peak_g_force, recorded_at) VALUES (?, ?, ?, ?, ?, ?);`,
            [record.attempt_id, record.action_phase, record.trial_number, record.air_time, record.peak_g_force, record.recorded_at]
        );
    },
    getTrialsByAttempt: (attemptId: string): ParachuteTrialRecord[] => {
        return db.getAllSync<ParachuteTrialRecord>(
            `SELECT * FROM parachute_trial_logs WHERE attempt_id = ? ORDER BY action_phase ASC, trial_number ASC;`,
            [attemptId]
        );
    },
    clearSessionData: (attemptId: string): void => {
        db.runSync(`DELETE FROM parachute_trial_logs WHERE attempt_id = ?;`, [attemptId]);
    }
};

// ACTIVITY 2
export const soundOps = {
    insertTrial: (record: SoundTrialRecord): void => {
        db.runSync(
            `INSERT INTO sound_trial_logs (attempt_id, member_number, action_phase, peak_db, recorded_at) VALUES (?, ?, ?, ?, ?);`,
            [record.attempt_id, record.member_number, record.action_phase, record.peak_db, record.recorded_at]
        );
    },
    getTrialsByAttempt: (attemptId: string): SoundTrialRecord[] => {
        return db.getAllSync<SoundTrialRecord>(
            `SELECT * FROM sound_trial_logs WHERE attempt_id = ? ORDER BY member_number ASC, action_phase ASC;`,
            [attemptId]
        );
    },
    clearSessionData: (attemptId: string): void => {
        db.runSync(`DELETE FROM sound_trial_logs WHERE attempt_id = ?;`, [attemptId]);
    }
};

// ACTIVITY 3
export const fanOps = {
    insertTrial: (record: FanTrialRecord): void => {
        db.runSync(
            `INSERT INTO fan_trial_logs (attempt_id, member_number, target_material, distance_gap, fan_design, fanning_duration, is_challenge_entry, selected_material_spec, stiffness_k, observed_angle, calculated_force, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [record.attempt_id, record.member_number, record.target_material, record.distance_gap, record.fan_design, record.fanning_duration, record.is_challenge_entry, record.selected_material_spec || null, record.stiffness_k !== undefined ? record.stiffness_k : null, record.observed_angle !== undefined ? record.observed_angle : null, record.calculated_force !== undefined ? record.calculated_force : null, record.recorded_at]
        );
    },
    getTrialsByAttempt: (attemptId: string): FanTrialRecord[] => {
        return db.getAllSync<FanTrialRecord>(
            `SELECT * FROM fan_trial_logs WHERE attempt_id = ? ORDER BY is_challenge_entry ASC, id ASC;`,
            [attemptId]
        );
    },
    clearSessionData: (attemptId: string): void => {
        db.runSync(`DELETE FROM fan_trial_logs WHERE attempt_id = ?;`, [attemptId]);
    }
};

// ACTIVITY 4
export const earthquakeOps = {
    insertTrial: (record: EarthquakeTrialRecord): void => {
        db.runSync(
            `INSERT INTO earthquake_trial_logs (attempt_id, member_number, design_number, peak_displacement, angular_deflection, recorded_at) VALUES (?, ?, ?, ?, ?, ?);`,
            [record.attempt_id, record.member_number, record.design_number, record.peak_displacement, record.angular_deflection, record.recorded_at]
        );
    },
    getTrialsByAttempt: (attemptId: string): EarthquakeTrialRecord[] => {
        return db.getAllSync<EarthquakeTrialRecord>(
            `SELECT * FROM earthquake_trial_logs WHERE attempt_id = ? ORDER BY member_number ASC, design_number ASC;`,
            [attemptId]
        );
    },
    clearSessionData: (attemptId: string): void => {
        db.runSync(`DELETE FROM earthquake_trial_logs WHERE attempt_id = ?;`, [attemptId]);
    }
};

// ACTIVITY 5
export const humanOps = {
    insertTrial: (record: HumanTrialRecord): void => {
        db.runSync(
            `INSERT INTO human_trial_logs (attempt_id, member_number, movement_variant, attempt_number, duration_ms, peak_vibration, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?);`,
            [record.attempt_id, record.member_number, record.movement_variant, record.attempt_number, record.duration_ms, record.peak_vibration, record.recorded_at]
        );
    },
    getTrialsByAttempt: (attemptId: string): HumanTrialRecord[] => {
        return db.getAllSync<HumanTrialRecord>(
            `SELECT * FROM human_trial_logs WHERE attempt_id = ? ORDER BY member_number ASC, movement_variant ASC, attempt_number ASC;`,
            [attemptId]
        );
    },
    clearSessionData: (attemptId: string): void => {
        db.runSync(`DELETE FROM human_trial_logs WHERE attempt_id = ?;`, [attemptId]);
    }
};

// ACTIVITY 6
export const reactionOps = {
    insertTrial: (record: ReactionTrialRecord): void => {
        db.runSync(
            `INSERT INTO reaction_trial_logs (attempt_id, member_number, phase_number, trial_number, recorded_time, recorded_at) VALUES (?, ?, ?, ?, ?, ?);`,
            [record.attempt_id, record.member_number, record.phase_number, record.trial_number, record.recorded_time, record.recorded_at]
        );
    },
    getTrialsByAttempt: (attemptId: string): ReactionTrialRecord[] => {
        return db.getAllSync<ReactionTrialRecord>(
            `SELECT * FROM reaction_trial_logs WHERE attempt_id = ? ORDER BY member_number ASC, phase_number ASC, trial_number ASC;`,
            [attemptId]
        );
    },
    clearSessionData: (attemptId: string): void => {
        db.runSync(`DELETE FROM reaction_trial_logs WHERE attempt_id = ?;`, [attemptId]);
    }
};

// ACTIVITY 7
export const breathingOps = {
    insertTrial: (record: BreathingTrialRecord): void => {
        db.runSync(
            `INSERT INTO breathing_trial_logs (attempt_id, member_number, phase_number, expansions_detected, calculated_rpm, recorded_at) VALUES (?, ?, ?, ?, ?, ?);`,
            [record.attempt_id, record.member_number, record.phase_number, record.expansions_detected, record.calculated_rpm, record.recorded_at]
        );
    },
    getTrialsByAttempt: (attemptId: string): BreathingTrialRecord[] => {
        return db.getAllSync<BreathingTrialRecord>(
            `SELECT * FROM breathing_trial_logs WHERE attempt_id = ? ORDER BY member_number ASC, phase_number ASC;`,
            [attemptId]
        );
    },
    clearSessionData: (attemptId: string): void => {
        db.runSync(`DELETE FROM breathing_trial_logs WHERE attempt_id = ?;`, [attemptId]);
    }
};

export default db;