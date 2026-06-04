import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    ImageBackground,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db_cloud } from '../../services/firebase_config';

import { themes } from '../../theme/theme';
import { useTheme } from '../../theme/theme_context';

const { width } = Dimensions.get('window');

interface Attempt {
    id: string;
    teamName: string;
    activityName: string;
    category: string;
    isScored: boolean;
    score?: number;
    reflection?: string;
    trialNumber: number;
    submittedAt: any;
}

// ─── Per-screen content ───────────────────────────────────────────────────────

export default function TeacherHomeScreen() {
    const router = useRouter();

    const { isDarkMode } = useTheme();
    const currentTheme = isDarkMode ? themes.dark : themes.light;

    const [teacherData, setTeacherData] = useState<any>(null);
    const [selectedDivision, setSelectedDivision] = useState<string>('');
    const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>('All Teams');
    const [teamFilterOptions, setTeamFilterOptions] = useState<string[]>([]);
    
    const [unscoredAttempts, setUnscoredAttempts] = useState<Attempt[]>([]);
    const [scoredAttempts, setScoredAttempts] = useState<Attempt[]>([]);
    const [loading, setLoading] = useState(true);

    const [dbAttempts, setDbAttempts] = useState<any[]>([]);
    const [dbTeams, setDbTeams] = useState<Record<string, any>>({});
    const [dbScores, setDbScores] = useState<Record<string, any>>({});

    const formatTimestampLabel = (timestamp: any) => {
        if (!timestamp) return 'Just now';
        const dateObject = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return dateObject.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    useEffect(() => {
        const fetchTeacherProfile = async () => {
            try {
                const targetPin = "9a9t"; 

                const teacherQuery = query(
                    collection(db_cloud, "MS_Teacher"), 
                    where("teacherPin", "==", targetPin)
                );
                
                const querySnapshot = await getDocs(teacherQuery);

                if (!querySnapshot.empty) {
                    const docData = querySnapshot.docs[0].data();
                    const divisionList = docData.teacherGrade 
                        ? docData.teacherGrade.split(',') 
                        : ["Primary"];

                    setTeacherData({
                        name: docData.teacherName || "Mr. Smith",
                        divisions: divisionList
                    });
                    setSelectedDivision(divisionList[0]);
                } else {
                    console.warn("No teacher profile matched the provided PIN.");
                    setTeacherData({ name: "Educator", divisions: ["Primary"] });
                    setSelectedDivision("Primary");
                }
            } catch (error) {
                console.error("Error reading teacher profile from Firestore:", error);
                setTeacherData({ name: "Educator", divisions: ["Primary"] });
                setSelectedDivision("Primary");
            }
        };

        fetchTeacherProfile();
    }, []);

    useEffect(() => {
        setLoading(true);

        // stream multiple collections in real-time to build a client-side relational store
        const unsubAttempts = onSnapshot(collection(db_cloud, "FC_Attempt"), (snapshot) => {
            const list: any[] = [];
            snapshot.forEach(doc => {
                list.push({ id: doc.id, ...doc.data() });
            });
            setDbAttempts(list);
        });

        const unsubTeams = onSnapshot(collection(db_cloud, "MS_Team"), (snapshot) => {
            const map: Record<string, any> = {};
            snapshot.forEach(doc => {
                map[doc.id] = doc.data();
            });
            setDbTeams(map);
        });

        const unsubScores = onSnapshot(collection(db_cloud, "FC_Scoring_Result"), (snapshot) => {
            const map: Record<string, any> = {};
            snapshot.forEach(doc => {
                const d = doc.data();
                map[d.AttemptID] = d;
            });
            setDbScores(map);
        });

        return () => {
            unsubAttempts();
            unsubTeams();
            unsubScores();
        };
    }, []);

    // client-side relational join and filter logic matching active division
    useEffect(() => {
        if (!selectedDivision || dbAttempts.length === 0) {
            setUnscoredAttempts([]);
            setScoredAttempts([]);
            return;
        }

        let unscored: Attempt[] = [];
        let scored: Attempt[] = [];
        const detectedTeams = new Set<string>();

        dbAttempts.forEach((attempt) => {
            const teamProfile = dbTeams[attempt.TeamID];

            if (teamProfile && teamProfile.category === selectedDivision) {
                const scoreRecord = dbScores[attempt.id];
                const currentTeamName = teamProfile.teamName || "Anonymous Team";
                
                // track unique team names to populate layout filter chip row
                detectedTeams.add(currentTeamName);

                // checks if non-zero scores exist to verify lab review state
                const evaluatedState = scoreRecord && 
                                       (scoreRecord.accuracyScore > 0) && 
                                       (scoreRecord.workScore > 0);

                let resolvedActivityName = "STEMM Science Lab";
                if (attempt.ActivityID === "Qvn4OR5l7pf9pCXB2pkq" || attempt.ActivityID === "eng1") {
                    resolvedActivityName = "Parachute Drop Challenge";
                } else if (attempt.ActivityID === "eng2") {
                    resolvedActivityName = "Sound Pollution Hunter";
                } else if (attempt.ActivityID === "eng3") {
                    resolvedActivityName = "Hand Fan Engineering";
                } else if (attempt.ActivityID === "eng4") {
                    resolvedActivityName = "Earthquake Resistant Design";
                } else if (attempt.ActivityID === "heal1") {
                    resolvedActivityName = "Human Performance Analysis";
                }

                let totalScore = 0;
                if (scoreRecord) {
                    totalScore = (scoreRecord.accuracyScore || 0) + (scoreRecord.workScore || 0);
                }

                const compositeItem: Attempt = {
                    id: attempt.id,
                    teamName: currentTeamName,
                    activityName: resolvedActivityName,
                    category: teamProfile.category,
                    isScored: !!evaluatedState,
                    score: totalScore,
                    reflection: attempt.studentReflection || "",
                    trialNumber: attempt.trialNumber || 1,
                    submittedAt: attempt.attemptAt
                };

                if (evaluatedState) {
                    scored.push(compositeItem);
                } else {
                    unscored.push(compositeItem);
                }
            }
        });

        setTeamFilterOptions(['All Teams', ...Array.from(detectedTeams).sort()]);

        // sort unscored items oldest-first for a fifo grading queue
        unscored.sort((a, b) => {
            const timeA = a.submittedAt?.seconds || 0;
            const timeB = b.submittedAt?.seconds || 0;
            return timeA - timeB; 
        });

        scored.sort((a, b) => {
            const timeA = a.submittedAt?.seconds || 0;
            const timeB = b.submittedAt?.seconds || 0;
            return timeB - timeA;
        });

        // filter rows if a specific team chip filter is active
        if (selectedTeamFilter !== 'All Teams') {
            unscored = unscored.filter(item => item.teamName === selectedTeamFilter);
            scored = scored.filter(item => item.teamName === selectedTeamFilter);
        }

        setUnscoredAttempts(unscored);
        setScoredAttempts(scored);
        setFalseLoading(false);
    }, [selectedDivision, selectedTeamFilter, dbAttempts, dbTeams, dbScores]);

    const handleDivisionSwitch = (divName: string) => {
        setSelectedTeamFilter('All Teams');
        setSelectedDivision(divName);
    };

    const setFalseLoading = (state: boolean) => {
        setLoading(state);
    };

    return (
        <ImageBackground source={currentTheme.backgroundImage} style={styles.background}>
            <View style={styles.headerWrapper}>
                <SafeAreaView edges={['top']}>
                    <View style={styles.topBar}>
                        <TouchableOpacity 
                            style={styles.iconCircle} 
                            onPress={() => router.push('/(teacher)/settings')}
                        >
                            <Ionicons name="settings-outline" size={24} color="#666" />
                        </TouchableOpacity>

                        <View style={styles.portalBadgeContainer}>
                            <Text style={styles.portalBadgeText}>TEACHER CONSOLE</Text>
                        </View>

                        <TouchableOpacity 
                            style={styles.iconCircle} 
                            onPress={() => {
                                Alert.alert("Sign Out", "Are you sure you want to lock the teacher portal?", [
                                    { text: "Cancel", style: "cancel" },
                                    { text: "Lock Portal", onPress: () => router.replace('/signup_1') }
                                ]);
                            }}
                        >
                            <Ionicons name="lock-closed-outline" size={24} color="#666" />
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            </View>

            <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
                <ScrollView 
                    showsVerticalScrollIndicator={false} 
                    contentContainerStyle={styles.mainScroll}
                >
                    <View style={styles.userInfoRow}>
                        <View>
                            <Text style={[styles.welcomeText, { color: currentTheme.textColor }]}>Welcome back,</Text>
                            <Text style={[styles.userName, { color: currentTheme.textColor }]}>{teacherData ? teacherData.name : "Syncing..."}</Text>
                        </View>
                        <View style={styles.gradeContainer}>
                            <Text style={styles.roleLabel}>Role: Class Instructor</Text>
                            <Text style={styles.assignedGradesLabel}>Sectors: {teacherData?.divisions.join(', ')}</Text>
                        </View>
                    </View>

                    {teacherData && teacherData.divisions.length > 1 && (
                        <View style={styles.gradeToggleWrapper}>
                            {teacherData.divisions.map((div: string) => (
                                <TouchableOpacity 
                                    key={div} 
                                    style={[styles.gradeTab, selectedDivision === div && styles.gradeTabActive]}
                                    onPress={() => handleDivisionSwitch(div)}
                                >
                                    <Text style={[styles.gradeTabText, selectedDivision === div && styles.gradeTabTextActive]}>
                                        {div} Dashboard
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    <View style={styles.statsMetricsRow}>
                        <View style={[styles.metricCard, { borderColor: '#FFB74D' }]}>
                            <Text style={styles.metricNumber}>{unscoredAttempts.length}</Text>
                            <Text style={styles.metricLabel}>Pending Review</Text>
                        </View>
                        <View style={[styles.metricCard, { borderColor: '#81C784' }]}>
                            <Text style={styles.metricNumber}>{scoredAttempts.length}</Text>
                            <Text style={styles.metricLabel}>Scored Labs</Text>
                        </View>
                    </View>

                    <View style={styles.filterSectionWrapper}>
                        <Text style={[styles.filterBarTitle, { color: currentTheme.textColor }]}>🔍 Workspace Filter Row</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScrollTrack}>
                            {teamFilterOptions.map((teamOption) => (
                                <TouchableOpacity
                                    key={teamOption}
                                    style={[styles.filterChip, selectedTeamFilter === teamOption && styles.filterChipActive]}
                                    onPress={() => setSelectedTeamFilter(teamOption)}
                                    activeOpacity={0.8}
                                >
                                    <Text style={[styles.filterChipText, selectedTeamFilter === teamOption && styles.filterChipTextActive]}>
                                        {teamOption}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>

                    <Text style={[styles.sectionTitle, { color: currentTheme.textColor }]}>📋 Needs Grading ({unscoredAttempts.length})</Text>
                    {loading ? (
                        <ActivityIndicator size="large" color="#00E5FF" style={{ marginTop: 20 }} />
                    ) : unscoredAttempts.length === 0 ? (
                        <View style={styles.emptyCard}>
                            <Text style={styles.emptyCardText}>All caught up! No pending items match your current filter limits.</Text>
                        </View>
                    ) : (
                        unscoredAttempts.map((attempt, index) => (
                            <TouchableOpacity 
                                key={attempt.id} 
                                style={[styles.attemptListItem, { borderColor: '#FFB74D' }]}
                                onPress={() => router.push({
                                    pathname: '/(teacher)/grade_submission',
                                    params: { attemptId: attempt.id }
                                })}
                            >
                                <View style={styles.attemptLeftBlock}>
                                    {index === 0 && selectedTeamFilter === 'All Teams' ? (
                                        <View style={styles.urgencyFlagBadge}>
                                            <Text style={styles.urgencyFlagText}>⚠️ OLDEST IN QUEUE</Text>
                                        </View>
                                    ) : null}
                                    
                                    <Text style={styles.activityTitleText}>{attempt.activityName}</Text>
                                    <Text style={styles.metaSubtitleText}>Team: {attempt.teamName} (Trial {attempt.trialNumber})</Text>
                                    <Text style={styles.timestampCardText}>Submitted: {formatTimestampLabel(attempt.submittedAt)}</Text>
                                    {attempt.reflection ? (
                                        <Text style={styles.reflectionSnippetText} numberOfLines={1}>
                                            "{attempt.reflection}"
                                        </Text>
                                    ) : null}
                                </View>
                                <View style={styles.actionBadgePending}>
                                    <Text style={styles.actionBadgeText}>SCORE</Text>
                                    <Ionicons name="chevron-forward" size={14} color="#FFF" />
                                </View>
                            </TouchableOpacity>
                        ))
                    )}

                    <Text style={[styles.sectionTitle, { color: currentTheme.textColor }]}>✅ Recently Evaluated ({scoredAttempts.length})</Text>
                    {loading ? (
                        <ActivityIndicator size="large" color="#00E5FF" style={{ marginTop: 20 }} />
                    ) : scoredAttempts.length === 0 ? (
                        <View style={styles.emptyCard}>
                            <Text style={styles.emptyCardText}>No completed evaluations recorded inside this segment layout configuration.</Text>
                        </View>
                    ) : (
                        scoredAttempts.map((attempt) => (
                            <TouchableOpacity 
                                key={attempt.id} 
                                style={[styles.attemptListItem, { borderColor: '#81C784' }]}
                                onPress={() => router.push({
                                    pathname: '/(teacher)/grade_submission',
                                    params: { attemptId: attempt.id }
                                })}
                            >
                                <View style={styles.attemptLeftBlock}>
                                    <Text style={styles.activityTitleText}>{attempt.activityName}</Text>
                                    <Text style={styles.metaSubtitleText}>Team: {attempt.teamName} • Trial {attempt.trialNumber}</Text>
                                    <Text style={styles.timestampCardText}>Logged: {formatTimestampLabel(attempt.submittedAt)}</Text>
                                </View>
                                <View style={styles.scoreResultContainer}>
                                    <Text style={styles.scoreValueText}>{attempt.score} pts</Text>
                                    <Text style={styles.scoreSubLabel}>Marks</Text>
                                </View>
                            </TouchableOpacity>
                        ))
                    )}
                </ScrollView>

                <View style={styles.bottomTabs}>
                    <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/(teacher)/home')}>
                        <Image source={require('../../assets/images/HomeB.png')} style={styles.tabIconActive} />
                        <Text style={styles.tabTextActive}>Home</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/(teacher)/leaderboard')}>
                        <Image source={require('../../assets/images/Leaderboard.png')} style={styles.tabIcon} />
                        <Text style={styles.tabText}>Leaderboard</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/(teacher)/teams')}>
                        <Image source={require('../../assets/images/Members.png')} style={styles.tabIcon} />
                        <Text style={styles.tabText}>Teams</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        </ImageBackground>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    background: { flex: 1 },
    safeArea: { flex: 1 },
    mainScroll: { paddingTop: 110, paddingBottom: 110 },
    headerWrapper: { backgroundColor: 'rgba(243, 240, 233, 0.9)', zIndex: 1000, position: 'absolute', top: 0, width: '100%', paddingBottom: 10, borderBottomWidth: 0.5, borderColor: 'rgba(0,0,0,0.05)' },
    topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: Platform.OS === 'android' ? 10 : 0 },
    iconCircle: { backgroundColor: 'white', width: 45, height: 45, borderRadius: 22.5, justifyContent: 'center', alignItems: 'center', elevation: 4 },
    portalBadgeContainer: { backgroundColor: '#FFFFFF', height: 45, borderRadius: 25, width: width * 0.55, justifyContent: 'center', alignItems: 'center', elevation: 4 },
    portalBadgeText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 13, color: '#00E5FF', letterSpacing: 1 },
    userInfoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 15, marginBottom: 10 },
    welcomeText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 15 },
    userName: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 20 },
    gradeContainer: { alignItems: 'flex-end', justifyContent: 'center' },
    roleLabel: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, color: '#FFFFFF' },
    assignedGradesLabel: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 13, color: '#00E5FF' },
    
    gradeToggleWrapper: { flexDirection: 'row', paddingHorizontal: 20, marginVertical: 10, gap: 10 },
    gradeTab: { flex: 1, backgroundColor: '#E0E0E0', paddingVertical: 8, borderRadius: 12, alignItems: 'center' },
    gradeTabActive: { backgroundColor: '#000000' },
    gradeTabText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 13, color: '#666' },
    gradeTabTextActive: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 13, color: '#FFFFFF' },

    statsMetricsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginVertical: 12, gap: 15 },
    metricCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 2, elevation: 2 },
    metricNumber: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 28, color: '#000' },
    metricLabel: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, color: '#666', marginTop: 2 },

    filterSectionWrapper: { marginVertical: 8, paddingHorizontal: 20 },
    filterBarTitle: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 13, marginBottom: 8 },
    filterScrollTrack: { gap: 10, paddingRight: 15 },
    filterChip: { backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#000000', paddingVertical: 6, paddingHorizontal: 16, borderRadius: 20, elevation: 1 },
    filterChipActive: { backgroundColor: '#00E5FF', borderColor: '#000000' },
    filterChipText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 13, color: '#000' },
    filterChipTextActive: { fontFamily: 'BalsamiqSans_700Bold', color: '#000' },

    sectionTitle: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 18, marginHorizontal: 20, marginTop: 20, marginBottom: 12 },
    emptyCard: { backgroundColor: 'rgba(255,255,255,0.6)', marginHorizontal: 20, padding: 20, borderRadius: 16, borderStyle: 'dashed', borderWidth: 1.5, borderColor: '#A0A0A0', alignItems: 'center' },
    emptyCardText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, color: '#666', textAlign: 'center' },
    
    attemptListItem: { backgroundColor: '#FFF', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 20, marginBottom: 12, padding: 16, borderRadius: 18, borderWidth: 1.5, elevation: 2 },
    attemptLeftBlock: { flex: 0.73, gap: 1 },
    activityTitleText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 15, color: '#000' },
    metaSubtitleText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, color: '#444', marginTop: 2 },
    timestampCardText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 11, color: '#888', marginTop: 1 },
    reflectionSnippetText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 11, color: '#666', fontStyle: 'italic', marginTop: 4 },
    
    urgencyFlagBadge: { backgroundColor: '#FF5252', paddingVertical: 2, paddingHorizontal: 8, borderRadius: 6, alignSelf: 'flex-start', marginBottom: 4 },
    urgencyFlagText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 9, color: '#FFF' },

    actionBadgePending: { backgroundColor: '#FFB74D', flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12, gap: 4 },
    actionBadgeText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 12, color: '#FFF' },
    
    scoreResultContainer: { alignItems: 'center', flex: 0.25 },
    scoreValueText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 15, color: '#2E7D32' },
    scoreSubLabel: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 10, color: '#888' },

    bottomTabs: { position: 'absolute', bottom: 0, flexDirection: 'row', backgroundColor: '#FFFFFF', height: 90, width: '100%', justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderColor: '#EEEEEE', paddingBottom: 15 },
    tabItem: { alignItems: 'center', marginHorizontal: 40 },
    tabIcon: { width: 26, height: 26, tintColor: '#A0A0A0' },
    tabIconActive: { width: 30, height: 30 },
    tabText: { fontSize: 11, color: '#A0A0A0', marginTop: 5, fontFamily: 'BalsamiqSans_400Regular' },
    tabTextActive: { fontSize: 11, color: '#00E5FF', marginTop: 5, fontFamily: 'BalsamiqSans_700Bold' },
});