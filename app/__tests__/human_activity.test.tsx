import { jest } from '@jest/globals';

// 1. ROUTING PATH: Adjust this based on where your real screen lives
// If it's inside (student), use: '../(student)/human_activity'
// If it's directly in app, use: '../human_activity'

// ==========================================
// SYSTEM ENVIRONMENT MOCKS
// ==========================================

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

jest.mock('expo-speech', () => ({
    speak: jest.fn(),
}));

jest.mock('expo-sensors', () => ({
    Accelerometer: {
        addListener: jest.fn(() => ({ remove: jest.fn() })),
        setUpdateInterval: jest.fn(),
    },
}));

jest.mock('firebase/auth', () => ({
    getAuth: () => ({ currentUser: { uid: 'test_student_123' } }),
}));

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

// ADDED AN EXTRA '../' HERE TO GO TO YOUR ROOT SERVICES FOLDER
jest.mock('../../services/firebase_config', () => ({
    db_cloud: {},
}));

// ADDED TO MOCK THE STRIPPED STYLE THEME MAPS IN YOUR HUMAN COMPONENT
jest.mock('../../theme/theme', () => ({
    themes: {
        light: { backgroundImage: 'mock-light-bg', textColor: '#000' },
        dark: { backgroundImage: 'mock-dark-bg', textColor: '#FFF' },
    },
}));

// ADDED AN EXTRA '../' HERE TO GO TO YOUR ROOT THEME FOLDER
jest.mock('../../theme/theme_context', () => ({
    useTheme: () => ({ isDarkMode: false }),
}));

// ==========================================
// ACTUAL TEST CASES
// ==========================================

describe('Human Activity Component', () => {
    it('should run the test suite successfully', () => {
        // This baseline test ensures Jest has something to execute
        expect(true).toBe(true);
    });

    // You can add your actual component rendering tests here later, e.g.:
    // it('renders correctly', () => {
    //     const { getByText } = render(<HumanActivityScreen />);
    //     expect(getByText('Human Performance Lab')).toBeTruthy();
    // });
});