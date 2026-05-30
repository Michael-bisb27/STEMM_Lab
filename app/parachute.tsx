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

export default function ParachuteDropScreen() {
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
                // Target Doc ID: Qvn4OR5l7pf9pCXB2pkq
                const actRef = doc(db_cloud, "MS_Activity", "Qvn4OR5l7pf9pCXB2pkq");
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
        /* Adaptive background loader layer container to prevent initial white screen flashes */
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
                        <Text style={[styles.activityName, { color: currentTheme.textColor }]}>{activity?.activityName || "Parachute Drop Challenge"}</Text>
                    </View>

                    {/* EXPANDABLE CURRICULUM CODES */}
                    <TouchableOpacity onPress={toggleCurriculum} style={[styles.curriculumBtn, showCurriculum && styles.curriculumExpanded]}>
                        <View style={styles.curriculumHeader}>
                            <Ionicons name="link-outline" size={18} color="#000" />
                            <Text style={styles.curriculumBtnText}> Curriculum Links</Text>
                        </View>
                        {showCurriculum && (
                            <View style={styles.curriculumInfo}>
                                <Text style={styles.currSubject}>Science</Text>
                                <Text style={styles.currCode}>• ACSSU076 / ACSSU117 – Forces affect motion</Text>
                                <Text style={styles.currCode}>• ACSIS124 – Planning and conducting investigations</Text>
                                <Text style={styles.currCode}>• ACSIS126 – Analysing patterns in data</Text>
                                
                                <Text style={styles.currSubject}>Design & Technologies</Text>
                                <Text style={styles.currCode}>• ACTDEP036 – Generate, test, and improve solutions</Text>
                                
                                <Text style={styles.currSubject}>Mathematics</Text>
                                <Text style={styles.currCode}>• ACMMG108 – Measuring speed</Text>
                                <Text style={styles.currCode}>• ACMSP147 – Comparing data and averages</Text>
                            </View>
                        )}
                    </TouchableOpacity>

                    {/* Dynamic text color applied */}
                    <Text style={[styles.sectionHeadingUnderlined, { color: currentTheme.textColor }]}>Activity Requirements</Text>

                    <View style={styles.overviewBox}>
                        <Image source={require('../assets/images/parachute_snippet.png')} style={styles.parachuteIcon} />
                        <View style={styles.overviewTextContainer}>
                            <Text style={styles.overviewText}>
                                <Text style={styles.bold}>Overview: </Text>
                                {activity?.activityDescription || "Design and build different parachute setups to explore how forces like air resistance and gravity interact to affect terminal velocity and drop pacing."}
                            </Text>
                        </View>
                    </View>

                    {/* --- WRITE-UP GUIDE SECTION --- */}
                    <View style={styles.notebookContainer}>
                        <View style={styles.notebookHeader}>
                            <Text style={styles.notebookTitle}>Write-up (on paper):</Text>
                        </View>
                        
                        <View style={styles.bulletList}>
                            <Text style={styles.bulletPoint}>• Predict which parachute design was the best.</Text>
                            <Text style={styles.bulletPoint}>• Sketch each of the designs.</Text>
                            <Text style={styles.bulletPoint}>• Record the times of the design.</Text>
                            <Text style={styles.bulletPoint}>• Were you correct in timings?</Text>
                            <Text style={styles.bulletPoint}>• What design was the easiest to make?</Text>
                        </View>

                        {/* DATA TABLE MATRIX VISUALIZATION */}
                        <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.tableScroll}>
                            <View style={styles.tableWrapper}>
                                {/* Header Row */}
                                <View style={styles.tableRow}>
                                    <View style={[styles.tableCell, styles.headerCell, { width: 130 }]} />
                                    <View style={[styles.tableCell, styles.headerCell, { width: 120 }]}>
                                        <Text style={styles.tableHeaderText}>How long will it take to hit the ground?</Text>
                                    </View>
                                    <View style={[styles.tableCell, styles.headerCell, { width: 120 }]}>
                                        <Text style={styles.tableHeaderText}>Time (time to first hit the ground)</Text>
                                    </View>
                                    <View style={[styles.tableCell, styles.headerCell, { width: 100 }]}>
                                        <Text style={styles.tableHeaderText}>Were you right?</Text>
                                    </View>
                                    <View style={[styles.tableCell, styles.headerCell, { width: 150 }]}>
                                        <Text style={styles.tableHeaderText}>Time (time from first hitting the ground and stop moving) – need slow motion.</Text>
                                    </View>
                                </View>

                                {/* Action 1 Row */}
                                <View style={styles.tableRow}>
                                    <View style={[styles.tableCell, { width: 130 }]}>
                                        <Text style={styles.rowLabel}>Action 1</Text>
                                        <Text style={styles.rowSubLabel}>(e.g. No parachute as the baseline)</Text>
                                    </View>
                                    <View style={[styles.tableCell, { width: 120 }]} />
                                    <View style={[styles.tableCell, { width: 120 }]} />
                                    <View style={[styles.tableCell, { width: 100 }]} />
                                    <View style={[styles.tableCell, { width: 150 }]} />
                                </View>

                                {/* Action 2 Row */}
                                <View style={styles.tableRow}>
                                    <View style={[styles.tableCell, { width: 130 }]}>
                                        <Text style={styles.rowLabel}>Action 2</Text>
                                        <Text style={styles.rowSubLabel}>(e.g. use plastic with four corners tied to the toy)</Text>
                                    </View>
                                    <View style={[styles.tableCell, { width: 120 }]} />
                                    <View style={[styles.tableCell, { width: 120 }]} />
                                    <View style={[styles.tableCell, { width: 100 }]} />
                                    <View style={[styles.tableCell, { width: 150 }]} />
                                </View>

                                {/* Action 3 Row */}
                                <View style={[styles.tableRow, { borderBottomWidth: 0 }]}>
                                    <View style={[styles.tableCell, { width: 130 }]}>
                                        <Text style={styles.rowLabel}>Action 3</Text>
                                    </View>
                                    <View style={[styles.tableCell, { width: 120 }]} />
                                    <View style={[styles.tableCell, { width: 120 }]} />
                                    <View style={[styles.tableCell, { width: 100 }]} />
                                    <View style={[styles.tableCell, { width: 150 }]} />
                                </View>
                            </View>
                        </ScrollView>
                    </View>

                    <TouchableOpacity 
                        style={styles.startChallengeBtn}
                        onPress={() => router.push('/parachute_ready')}
                    >
                        <Text style={styles.startChallengeText}>Get ready?</Text>
                    </TouchableOpacity>

                </ScrollView>

                {/* BOTTOM TAB NAVIGATION */}
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
    currSubject: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 13, color: '#333', marginTop: 6, marginBottom: 2 },
    currCode: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, color: '#666', marginLeft: 4, marginBottom: 2 },
    sectionHeadingUnderlined: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 22, textDecorationLine: 'underline', marginTop: 10, marginBottom: 15 },
    overviewBox: { borderWidth: 1.5, borderColor: '#000', borderRadius: 25, padding: 15, flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', marginBottom: 20 },
    parachuteIcon: { width: 60, height: 60, marginRight: 15, resizeMode: 'contain' },
    overviewTextContainer: { flex: 1 },
    overviewText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 13, lineHeight: 18 },
    bold: { fontFamily: 'BalsamiqSans_700Bold' },
    notebookContainer: { backgroundColor: '#FFF', borderRadius: 15, borderWidth: 1.5, borderColor: '#333', padding: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
    notebookHeader: { borderBottomWidth: 1, borderBottomColor: '#EEE', paddingBottom: 10, marginBottom: 10 },
    notebookTitle: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 18, color: '#000' },
    bulletList: { marginBottom: 15 },
    bulletPoint: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, color: '#333', marginBottom: 5 },
    tableScroll: { marginTop: 10 },
    tableWrapper: { borderWidth: 1, borderColor: '#000', borderRadius: 4, overflow: 'hidden' },
    tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#000', minHeight: 60 },
    tableCell: { borderRightWidth: 1, borderRightColor: '#000', padding: 6, justifyContent: 'center' },
    headerCell: { backgroundColor: '#F9F9F9' },
    tableHeaderText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 10, textAlign: 'center', color: '#000' },
    rowLabel: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 12, color: '#000' },
    rowSubLabel: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 10, color: '#555', marginTop: 2 },
    startChallengeBtn: { backgroundColor: '#4FC3F7', borderRadius: 25, paddingVertical: 12, alignItems: 'center', marginTop: 30, marginBottom: 20 },
    startChallengeText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 20, color: '#000' },
    bottomTabs: { position: 'absolute', bottom: 0, flexDirection: 'row', backgroundColor: '#FFFFFF', height: 90, width: '100%', justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderColor: '#EEEEEE', paddingBottom: 15 },
    tabItem: { alignItems: 'center', marginHorizontal: 40 },
    tabIcon: { width: 26, height: 26, tintColor: '#A0A0A0' },
    tabText: { fontSize: 11, color: '#A0A0A0', marginTop: 5, fontFamily: 'BalsamiqSans_400Regular' },
});