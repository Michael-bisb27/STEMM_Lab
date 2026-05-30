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

export default function EarthquakeStructureScreen() {
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
                // Updated with the new document ID for Earthquake-Resistant Structure
                const actRef = doc(db_cloud, "MS_Activity", "9QUEyTVnLCsuXBgWcCQs");
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
                    
                    {/* Title Section (Dynamic text color applied) */}
                    <View style={styles.titleSection}>
                        <Text style={[styles.labelItalic, { color: currentTheme.textColor }]}>Activity:</Text>
                        <Text style={[styles.activityName, { color: currentTheme.textColor }]}>{activity?.activityName || "Earthquake-Resistant Structure"}</Text>
                    </View>

                    {/* --- CURRICULUM LINKS SECTION --- */}
                    <TouchableOpacity onPress={toggleCurriculum} style={[styles.curriculumBtn, showCurriculum && styles.curriculumExpanded]}>
                        <View style={styles.curriculumHeader}>
                            <Ionicons name="link-outline" size={18} color="#000" />
                            <Text style={styles.curriculumBtnText}> Curriculum Links</Text>
                        </View>
                        {showCurriculum && (
                            <View style={styles.curriculumInfo}>
                                <Text style={styles.currSubject}>Earth Sciences & Design Technologies</Text>
                                <Text style={styles.currCode}>• ACSSU096 – Earth processes</Text>
                                <Text style={styles.currCode}>• ACTDEP036 – Testing and improving designs</Text>
                            </View>
                        )}
                    </TouchableOpacity>

                    {/* Dynamic section heading color applied */}
                    <Text style={[styles.sectionHeadingUnderlined, { color: currentTheme.textColor }]}>Activity Requirements</Text>

                    {/* --- OVERVIEW BOX --- */}
                    <View style={styles.overviewBox}>
                        <Image source={require('../assets/images/earthquake_snippet.png')} style={styles.earthquakeIcon} />
                        <View style={styles.overviewTextContainer}>
                            <Text style={styles.overviewText}>
                                <Text style={styles.bold}>Overview: </Text>
                                {activity?.activityDescription || "Test different building design properties under structural stress to determine ideal earthquake resistance."}
                            </Text>
                        </View>
                    </View>

                    {/* --- WRITE-UP GUIDE SECTION --- */}
                    <View style={styles.notebookContainer}>
                        <View style={styles.notebookHeader}>
                            <Text style={styles.notebookTitle}>Write-up (on paper):</Text>
                        </View>
                        
                        <View style={styles.bulletList}>
                            <Text style={styles.bulletPoint}>• Predict which fold design makes the phone move the least.</Text>
                            <Text style={styles.bulletPoint}>• Record the results</Text>
                            <Text style={styles.bulletPoint}>• Were you right?</Text>
                            <Text style={styles.bulletPoint}>• Any surprises?</Text>
                        </View>

                        {/* DATA TABLE VISUALIZATION */}
                        <View style={styles.tableWrapper}>
                            {/* Table Header Row */}
                            <View style={styles.tableRow}>
                                <View style={[styles.tableCell, styles.headerCell, { flex: 1.2 }]} />
                                <View style={[styles.tableCell, styles.headerCell]}>
                                    <Text style={styles.tableHeaderText}>Phone moves</Text>
                                </View>
                                <View style={[styles.tableCell, styles.headerCell]}>
                                    <Text style={styles.tableHeaderText}>Outcome (in degrees)</Text>
                                </View>
                                <View style={[styles.tableCell, styles.headerCell]}>
                                    <Text style={styles.tableHeaderText}>Were you right?</Text>
                                </View>
                            </View>

                            {/* Design Row 1 */}
                            <View style={styles.tableRow}>
                                <View style={[styles.tableCell, { flex: 1.2 }]}>
                                    <Text style={styles.rowLabel}>Design 1</Text>
                                    <Text style={styles.subRowLabel}>(e.g. 4 folds + 4 pillars)</Text>
                                </View>
                                <View style={styles.tableCell}>
                                    <Text style={styles.exampleText}>e.g. +/- 1cm</Text>
                                </View>
                                <View style={styles.tableCell}>
                                    <Text style={styles.outcomeText}>4cm</Text>
                                </View>
                                <View style={styles.tableCell} />
                            </View>

                            {/* Design Row 2 */}
                            <View style={styles.tableRow}>
                                <View style={[styles.tableCell, { flex: 1.2 }]}>
                                    <Text style={styles.rowLabel}>Design 2</Text>
                                    <Text style={styles.subRowLabel}>(e.g. 10 folds + 4 pillars)</Text>
                                </View>
                                <View style={styles.tableCell} />
                                <View style={styles.tableCell} />
                                <View style={styles.tableCell} />
                            </View>

                            {/* Design Row 3 */}
                            <View style={[styles.tableRow, { borderBottomWidth: 0 }]}>
                                <View style={[styles.tableCell, { flex: 1.2 }]}>
                                    <Text style={styles.rowLabel}>Design 3</Text>
                                    <Text style={styles.subRowLabel}>(e.g. 3 folds and 6 pillars)</Text>
                                </View>
                                <View style={styles.tableCell} />
                                <View style={styles.tableCell} />
                                <View style={styles.tableCell} />
                            </View>
                        </View>
                    </View>

                    {/* REDIRECT TO NEXT STAGE */}
                    <TouchableOpacity 
                        style={styles.startChallengeBtn}
                        onPress={() => router.push('/earthquake_ready')}
                    >
                        <Text style={styles.startChallengeText}>Get ready?</Text>
                    </TouchableOpacity>

                </ScrollView>

                {/* BOTTOM NAVIGATION TABS */}
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
    currSubject: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 14, color: '#333', marginBottom: 4 },
    currCode: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, color: '#666', marginTop: 2 },
    sectionHeadingUnderlined: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 22, textDecorationLine: 'underline', marginTop: 10, marginBottom: 15 },
    overviewBox: { borderWidth: 1.5, borderColor: '#000', borderRadius: 25, padding: 15, flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', marginBottom: 20 },
    earthquakeIcon: { width: 60, height: 60, marginRight: 15, resizeMode: 'contain' },
    overviewTextContainer: { flex: 1 },
    overviewText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 13, lineHeight: 18 },
    bold: { fontFamily: 'BalsamiqSans_700Bold' },
    notebookContainer: { backgroundColor: '#FFF', borderRadius: 15, borderWidth: 1.5, borderColor: '#333', padding: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
    notebookHeader: { borderBottomWidth: 1, borderBottomColor: '#EEE', paddingBottom: 10, marginBottom: 10 },
    notebookTitle: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 18, color: '#000' },
    bulletList: { marginBottom: 20 },
    bulletPoint: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, color: '#333', marginBottom: 6 },
    tableWrapper: { borderWidth: 1, borderColor: '#000', borderRadius: 4, overflow: 'hidden' },
    tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#000', minHeight: 50 },
    tableCell: { flex: 1, borderRightWidth: 1, borderRightColor: '#000', padding: 6, justifyContent: 'center' },
    headerCell: { backgroundColor: '#F9F9F9' },
    tableHeaderText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 10, textAlign: 'center', color: '#000' },
    rowLabel: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 12, color: '#000' },
    subRowLabel: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 9, color: '#555', marginTop: 2 },
    exampleText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 11, color: '#888', fontStyle: 'italic', textAlign: 'center' },
    outcomeText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 11, color: '#007AFF', textAlign: 'center', textDecorationLine: 'underline' },
    startChallengeBtn: { backgroundColor: '#4FC3F7', borderRadius: 25, paddingVertical: 12, alignItems: 'center', marginTop: 30, marginBottom: 20 },
    startChallengeText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 20, color: '#000' },
    bottomTabs: { position: 'absolute', bottom: 0, flexDirection: 'row', backgroundColor: '#FFFFFF', height: 90, width: '100%', justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderColor: '#EEEEEE', paddingBottom: 15 },
    tabItem: { alignItems: 'center', marginHorizontal: 40 },
    tabIcon: { width: 26, height: 26, tintColor: '#A0A0A0' },
    tabText: { fontSize: 11, color: '#A0A0A0', marginTop: 5, fontFamily: 'BalsamiqSans_400Regular' },
});