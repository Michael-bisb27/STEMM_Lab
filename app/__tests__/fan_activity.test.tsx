import { jest } from '@jest/globals';

jest.mock('@expo-google-fonts/balsamiq-sans', () => ({
    useFonts: () => [true],
    BalsamiqSans_400Regular: {},
    BalsamiqSans_700Bold: {},
}));

jest.mock('@expo/vector-icons', () => ({
    Ionicons: 'Ionicons',
}));

jest.mock('expo-router', () => ({
    useRouter: () => ({ push: jest.fn() }),
    Stack: { Screen: () => null },
}));

// mock the nested listener cleanup so it doesn't crash
jest.mock('expo-sensors', () => ({
    Accelerometer: {
        addListener: jest.fn(() => ({ remove: jest.fn() })),
        setUpdateInterval: jest.fn(),
    },
}));

jest.mock('firebase/auth', () => ({
    getAuth: () => ({ currentUser: { uid: 'test_student_123' } }),
}));

// mock the nested chain for doc verification/fetching
jest.mock('firebase/firestore', () => ({
    collection: jest.fn(),
    doc: jest.fn(),
    getDoc: () => Promise.resolve({ exists: () => true, data: () => ({ teamID: 'team_alpha' }) }),
    getDocs: () => Promise.resolve({ empty: true }),
    query: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
    limit: jest.fn(),
    Timestamp: { now: () => 'mock-time' },
}));

jest.mock('../../services/firebase_config', () => ({
    db_cloud: {},
}));

// ─── Styles ───────────────────────────────────────────────────────────────────
jest.mock('../../theme/theme', () => ({
    themes: {
        light: { backgroundImage: 'mock-light-bg' },
        dark: { backgroundImage: 'mock-dark-bg' },
    },
}));

jest.mock('../../theme/theme_context', () => ({
    useTheme: () => ({ isDarkMode: false }),
}));

// ─── Per-screen content ───────────────────────────────────────────────────────
describe('Fan Activity Component', () => {
    // simple baseline check to make sure jest runs
    it('should run the test suite successfully', () => {
        expect(true).toBe(true);
    });
});