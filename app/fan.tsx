import {
    BalsamiqSans_400Regular,
    BalsamiqSans_700Bold,
    useFonts,
} from '@expo-google-fonts/balsamiq-sans';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Image,
    ImageBackground,
    LayoutAnimation,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    UIManager,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// --- FIREBASE IMPORTS ---
import { doc, getDoc } from 'firebase/firestore';
import { db_cloud } from '../services/firebase_config';

// --- THEME IMPORTS ---
import { themes } from '../theme/theme';
import { useTheme } from '../theme/theme_context';

const { width } = Dimensions.get('window');

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function HandFanChallengeScreen() {
    const router = useRouter();
    const [fontsLoaded] = useFonts({ BalsamiqSans_400Regular, BalsamiqSans_700Bold });

    // --- CONSUME GLOBAL THEME CONTEXT ---
    const { isDarkMode } = useTheme();
    const currentTheme = isDarkMode ? themes.dark : themes.light;

    const [activity, setActivity] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [showCurriculum, setShowCurriculum] = useState(false);

    useEffect(() => {
        const fetchActivity = async () => {
            try {
                // Updated with Hand Fan Challenge Document ID
                const actRef = doc(db_cloud, "MS_Activity", "9IWijzqyiclKNayBpFZ1");
                const actSnap = await getDoc(actRef);
                if (actSnap.exists()) setActivity(actSnap.data());
            } catch (error) {
                console.error("Error fetching activity:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchActivity();
    }, []);

    const toggleCurriculum = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setShowCurriculum(!showCurriculum);
    };

    if (!fontsLoaded || loading) {
        /* Adaptive background color container fallback during layout builder instances */
        return (
            <View style={[styles.loader, { backgroundColor: isDarkMode ? '#141414' : '#F3F0E9' }]}>
                <ActivityIndicator size="large" color="#00E5FF" />
            </View>
        );
    }

    return (
        /* Dynamic Theme Background Image Swap */
        <ImageBackground source={currentTheme.backgroundImage} style={styles.background}>
            <Stack.Screen options={{ headerShown: false }} />
            
            {/* --- TOP BAR --- */}
            <View style={styles.headerWrapper}>
                <SafeAreaView edges={['top']}>
                    <View style={styles.topBar}>
                        <TouchableOpacity style={styles.iconCircle} onPress={() => router.push('/settings')}>
                            <Ionicons name="settings-outline" size={24} color="#666" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.iconCircle} onPress={() => router.push('/history')}>
                            <Ionicons name="timer-outline" size={24} color="#666" />
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            </View>

            <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.mainScroll}>
                    
                    {/* Title Section (Dynamic text colors applied) */}
                    <View style={styles.titleSection}>
                        <Text style={[styles.labelItalic, { color: currentTheme.textColor }]}>Activity:</Text>
                        <Text style={[styles.activityName, { color: currentTheme.textColor }]}>{activity?.activityName || "Hand Fan Challenge"}</Text>
                    </View>

                    {/* Updated Curriculum Section */}
                    <TouchableOpacity onPress={toggleCurriculum} style={[styles.curriculumBtn, showCurriculum && styles.curriculumExpanded]}>
                        <View style={styles.curriculumHeader}>
                            <Ionicons name="link-outline" size={18} color="#000" />
                            <Text style={styles.curriculumBtnText}> Curriculum Link</Text>
                        </View>
                        {showCurriculum && (
                            <View style={styles.curriculumInfo}>
                                <Text style={styles.currSubject}>Forces and motion</Text>
                                <Text style={styles.currCode}>ACSSU076</Text>
                            </View>
                        )}
                    </TouchableOpacity>

                    {/* Dynamic section heading color applied */}
                    <Text style={[styles.sectionHeadingUnderlined, { color: currentTheme.textColor }]}>Activity Requirements</Text>

                    <View style={styles.overviewBox}>
                        <Image source={require('../assets/images/fan_snippet.png')} style={styles.fanIcon} />
                        <View style={styles.overviewTextContainer}>
                            <Text style={styles.overviewText}>
                                <Text style={styles.bold}>Overview: </Text>
                                {activity?.activityDescription || "Design and construct different types of hand fans to investigate how material features and structural designs affect forces and motion."}
                            </Text>
                        </View>
                    </View>

                    {/* --- WRITE-UP GUIDE SECTION --- */}
                    <View style={styles.notebookContainer}>
                        <View style={styles.notebookHeader}>
                            <Text style={styles.notebookTitle}>Write-up (on paper):</Text>
                        </View>
                        
                        <View style={styles.bulletList}>
                            <Text style={styles.bulletPoint}>• Predict which fan design makes the paper move the most.</Text>
                            <Text style={styles.bulletPoint}>• Record the results</Text>
                            <Text style={styles.bulletPoint}>• Were you right?</Text>
                            <Text style={styles.bulletPoint}>• Any surprises?</Text>
                            <Text style={styles.bulletPoint}>
                                • How does <Text style={styles.bold}>material stiffness</Text> affect the bend angle?
                            </Text>
                            <Text style={styles.bulletPoint}>
                                • How does <Text style={styles.bold}>fan design</Text> influence air velocity and resulting paper movement?
                            </Text>
                            <Text style={styles.bulletPoint}>
                                • How does <Text style={styles.bold}>distance from the fan</Text> affect bending?
                            </Text>
                        </View>

                        {/* RECREATED DATA TABLE VISUALIZATION */}
                        <View style={styles.tableWrapper}>
                            {/* Table Header Row */}
                            <View style={styles.tableRow}>
                                <View style={[styles.tableCell, styles.headerCell, { flex: 1.3 }]} />
                                <View style={[styles.tableCell, styles.headerCell, { flex: 0.9 }]}>
                                    <Text style={styles.tableHeaderText}>Bend (in degrees)</Text>
                                </View>
                                <View style={[styles.tableCell, styles.headerCell, { flex: 0.9 }]}>
                                    <Text style={styles.tableHeaderText}>Outcome (in degrees)</Text>
                                </View>
                                <View style={[styles.tableCell, styles.headerCell, { flex: 1.1 }]}>
                                    <Text style={styles.tableHeaderText}>Observation Notes: Were you right?</Text>
                                </View>
                            </View>

                            {/* Design 1 Row */}
                            <View style={styles.tableRow}>
                                <View style={[styles.tableCell, { flex: 1.3 }]}>
                                    <Text style={styles.rowLabel}>Design 1</Text>
                                    <Text style={styles.subLabelText}>(e.g. 1cm back and forward folds)</Text>
                                </View>
                                <View style={[styles.tableCell, { flex: 0.9, alignItems: 'center' }]}>
                                    <Text style={styles.degreeText}>30°</Text>
                                </View>
                                <View style={[styles.tableCell, { flex: 0.9 }]} />
                                <View style={[styles.tableCell, { flex: 1.1 }]} />
                            </View>

                            {/* Design 2 Row */}
                            <View style={styles.tableRow}>
                                <View style={[styles.tableCell, { flex: 1.3 }]}>
                                    <Text style={styles.rowLabel}>Design 2</Text>
                                    <Text style={styles.subLabelText}>(e.g. no folds)</Text>
                                </View>
                                <View style={[styles.tableCell, { flex: 0.9 }]} />
                                <View style={[styles.tableCell, { flex: 0.9 }]} />
                                <View style={[styles.tableCell, { flex: 1.1 }]} />
                            </View>

                            {/* Design 3 Row */}
                            <View style={[styles.tableRow, { borderBottomWidth: 0 }]}>
                                <View style={[styles.tableCell, { flex: 1.3 }]}>
                                    <Text style={styles.rowLabel}>Design 3</Text>
                                </View>
                                <View style={[styles.tableCell, { flex: 0.9 }]} />
                                <View style={[styles.tableCell, { flex: 0.9 }]} />
                                <View style={[styles.tableCell, { flex: 1.1 }]} />
                            </View>
                        </View>
                    </View>

                    {/* Updated route targets fan challenge setup */}
                    <TouchableOpacity 
                        style={styles.startChallengeBtn}
                        onPress={() => router.push('/fan_ready')}
                    >
                        <Text style={styles.startChallengeText}>Get ready?</Text>
                    </TouchableOpacity>

                </ScrollView>

                <View style={styles.bottomTabs}>
                    <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/home')}>
                        <Image source={require('../assets/images/Home.png')} style={styles.tabIcon} />
                        <Text style={styles.tabText}>Home</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/leaderboard')}>
                        <Image source={require('../assets/images/Leaderboard.png')} style={styles.tabIcon} />
                        <Text style={styles.tabText}>Leaderboard</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/members')}>
                        <Image source={require('../assets/images/Members.png')} style={styles.tabIcon} />
                        <Text style={styles.tabText}>Members</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        </ImageBackground>
    );
}

const styles = StyleSheet.create({
    background: { flex: 1 },
    safeArea: { flex: 1 },
    mainScroll: { paddingTop: 110, paddingBottom: 110, paddingHorizontal: 20 },
    loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    headerWrapper: { backgroundColor: 'rgba(243, 240, 233, 0.8)', zIndex: 1000, position: 'absolute', top: 0, width: '100%', paddingBottom: 10, borderBottomWidth: 0.5, borderColor: 'rgba(0,0,0,0.05)' },
    topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: Platform.OS === 'android' ? 10 : 0 },
    iconCircle: { backgroundColor: 'white', width: 45, height: 45, borderRadius: 22.5, justifyContent: 'center', alignItems: 'center', elevation: 4 },
    titleSection: { marginTop: 15, marginBottom: 10 },
    labelItalic: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, fontStyle: 'italic' },
    activityName: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 20 },
    curriculumBtn: { alignSelf: 'flex-start', backgroundColor: '#E0E0E0', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#BBB' },
    curriculumExpanded: { width: '100%', backgroundColor: '#FFF' },
    curriculumHeader: { flexDirection: 'row', alignItems: 'center' },
    curriculumBtnText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 13, textDecorationLine: 'underline' },
    curriculumInfo: { marginTop: 10, paddingBottom: 5 },
    currSubject: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 14, color: '#333' },
    currCode: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, color: '#666' },
    sectionHeadingUnderlined: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 22, textDecorationLine: 'underline', marginTop: 10, marginBottom: 15 },
    overviewBox: { borderWidth: 1.5, borderColor: '#000', borderRadius: 25, padding: 15, flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', marginBottom: 20 },
    fanIcon: { width: 60, height: 60, marginRight: 15, resizeMode: 'contain' },
    overviewTextContainer: { flex: 1 },
    overviewText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 13, lineHeight: 18 },
    bold: { fontFamily: 'BalsamiqSans_700Bold' },
    notebookContainer: { backgroundColor: '#FFF', borderRadius: 15, borderWidth: 1.5, borderColor: '#333', padding: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
    notebookHeader: { borderBottomWidth: 1, borderBottomColor: '#EEE', paddingBottom: 10, marginBottom: 10 },
    notebookTitle: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 18, color: '#000' },
    bulletList: { marginBottom: 20 },
    bulletPoint: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 15, color: '#333', marginBottom: 8, lineHeight: 20 },
    tableWrapper: { borderWidth: 1, borderColor: '#000', borderRadius: 4, overflow: 'hidden', marginTop: 10 },
    tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#000', minHeight: 50 },
    tableCell: { borderRightWidth: 1, borderRightColor: '#000', padding: 6, justifyContent: 'center' },
    headerCell: { backgroundColor: '#F9F9F9', alignItems: 'center' },
    tableHeaderText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 11, textAlign: 'center', color: '#000' },
    rowLabel: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 13, color: '#000' },
    subLabelText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 10, color: '#555', fontStyle: 'italic', marginTop: 2 },
    degreeText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 13, color: '#000' },
    startChallengeBtn: { backgroundColor: '#4FC3F7', borderRadius: 25, paddingVertical: 12, alignItems: 'center', marginTop: 30, marginBottom: 20 },
    startChallengeText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 20, color: '#000' },
    bottomTabs: { position: 'absolute', bottom: 0, flexDirection: 'row', backgroundColor: '#FFFFFF', height: 90, width: '100%', justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderColor: '#EEEEEE', paddingBottom: 15 },
    tabItem: { alignItems: 'center', marginHorizontal: 40 },
    tabIcon: { width: 26, height: 26, tintColor: '#A0A0A0' },
    tabText: { fontSize: 11, color: '#A0A0A0', marginTop: 5, fontFamily: 'BalsamiqSans_400Regular' },
});