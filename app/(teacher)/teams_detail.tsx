import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    ImageBackground,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { db_cloud } from '../../services/firebase_config';

import { themes } from '../../theme/theme';
import { useTheme } from '../../theme/theme_context';

const { width, height } = Dimensions.get('window');

interface AttemptWithScore {
    id: string;
    activityId: string;
    trialNumber: number;
    studentReflection: string;
    videoUrls: string[];
    accuracyScore: number | string;
    workScore: number | string;
    totalScore: number;
    isGraded: boolean;
}

const activityNames: Record<string, { short: string; full: string }> = {
    'all': { short: 'All', full: 'All Activities' },
    'eng1': { short: 'Parachute', full: 'Parachute Drop' },
    'eng2': { short: 'Sound', full: 'Sound Pollution' },
    'eng3': { short: 'Hand Fan Eng.', full: 'Hand Fan Engineering' },
    'eng4': { short: 'Earthquake', full: 'Earthquake Design' },
    'heal1': { short: 'Human Perf.', full: 'Human Performance' },
    'heal2': { short: 'Reaction Lab', full: 'Reaction Lab' },
    'heal3': { short: 'Breathing Pace', full: 'Breathing Pace' },
};

// ─── Per-screen content ───────────────────────────────────────────────────────

export default function TeacherTeamDetailScreen() {
    const router = useRouter();
    const { teamId } = useLocalSearchParams();

    const { isDarkMode } = useTheme();
    const currentTheme = isDarkMode ? themes.dark : themes.light;

    const [team, setTeam] = useState<any>(null);
    const [attempts, setAttempts] = useState<AttemptWithScore[]>([]);
    const [filteredAttempts, setFilteredAttempts] = useState<AttemptWithScore[]>([]);
    const [selectedActivity, setSelectedActivity] = useState<string>('all');
    const [loading, setLoading] = useState<boolean>(true);

    const [students, setStudents] = useState<any[]>([]);
    const [isManageModalOpen, setIsManageModalOpen] = useState<boolean>(false);

    useEffect(() => {
        if (!teamId) return;

        const unsubscribeTeam = onSnapshot(doc(db_cloud, "MS_Team", teamId as string), (docSnap) => {
            if (docSnap.exists()) {
                setTeam(docSnap.data());
            }
        });

        const studentsQuery = query(collection(db_cloud, "MS_Student"), where("teamID", "==", teamId));
        const unsubscribeStudents = onSnapshot(studentsQuery, (snapshot) => {
            const studentList: any[] = [];
            snapshot.forEach((doc) => {
                studentList.push({ id: doc.id, ...doc.data() });
            });
            setStudents(studentList);
        });

        let rawAttempts: any[] = [];
        let rawScores: any[] = [];

        // map cross-collection snapshot items to aggregate relational database rows on client side
        const mergeTelemetryData = () => {
            const compiledAttempts: AttemptWithScore[] = rawAttempts.map((attempt) => {
                const matchingScore = rawScores.find(score => score.AttemptID === attempt.id);
                
                const gradedStatus = !!matchingScore;
                const acc = gradedStatus ? matchingScore.accuracyScore : '--';
                const wrk = gradedStatus ? matchingScore.workScore : '--';
                const total = gradedStatus ? (matchingScore.pointsEarned || 0) : 0;

                return {
                    id: attempt.id,
                    activityId: attempt.ActivityID || 'unknown',
                    trialNumber: attempt.trialNumber || 1,
                    studentReflection: attempt.studentReflection || '',
                    videoUrls: attempt.VideoURL || [],
                    accuracyScore: acc,
                    workScore: wrk,
                    totalScore: total,
                    isGraded: gradedStatus
                };
            });

            compiledAttempts.sort((a, b) => b.trialNumber - a.trialNumber);
            setAttempts(compiledAttempts);
            setLoading(false);
        };

        const attemptsQuery = query(collection(db_cloud, "FC_Attempt"), where("TeamID", "==", teamId));
        const unsubscribeAttempts = onSnapshot(attemptsQuery, (snapshot) => {
            rawAttempts = [];
            snapshot.forEach(doc => rawAttempts.push({ id: doc.id, ...doc.data() }));
            mergeTelemetryData();
        });

        const scoresQuery = query(collection(db_cloud, "FC_Scoring_Result"), where("TeamID", "==", teamId));
        const unsubscribeScores = onSnapshot(scoresQuery, (snapshot) => {
            rawScores = [];
            snapshot.forEach(doc => rawScores.push(doc.data()));
            mergeTelemetryData();
        });

        return () => {
            unsubscribeTeam();
            unsubscribeStudents();
            unsubscribeAttempts();
            unsubscribeScores();
        };
    }, [teamId]);

    useEffect(() => {
        if (selectedActivity === 'all') {
            setFilteredAttempts(attempts);
        } else {
            // handle exception routing rules for custom firestore string identifier keys
            setFilteredAttempts(attempts.filter(a => a.activityId === selectedActivity || (selectedActivity === 'eng1' && a.activityId === 'Qvn4OR5l7pf9pCXB2pkq')));
        }
    }, [selectedActivity, attempts]);

    const currentLeaderProfile = students.find(s => s.id === team?.teamLeader);

    const handleSetLeader = async (studentId: string) => {
        try {
            const teamDocRef = doc(db_cloud, "MS_Team", teamId as string);
            const currentLeader = team?.teamLeader === studentId ? "" : studentId;
            await updateDoc(teamDocRef, { teamLeader: currentLeader });
        } catch (error) {
            Alert.alert("Error", "Could not update team leader assignments.");
        }
    };

    const handleRemoveMember = (studentId: string, studentName: string) => {
        Alert.alert(
            "Remove Member",
            `Are you sure you want to remove ${studentName} from this team?`,
            [
                { text: "Cancel", style: "cancel" },
                { 
                    text: "Remove", 
                    style: "destructive",
                    onPress: async () => {
                        try {
                            const studentDocRef = doc(db_cloud, "MS_Student", studentId);
                            await updateDoc(studentDocRef, { teamID: "" });

                            if (team?.teamLeader === studentId) {
                                const teamDocRef = doc(db_cloud, "MS_Team", teamId as string);
                                await updateDoc(teamDocRef, { teamLeader: "" });
                            }
                        } catch (error) {
                            Alert.alert("Error", "Could not remove member from the team.");
                        }
                    }
                }
            ]
        );
    };

    const getActivityLabel = (id: string) => {
        if (id === "Qvn4OR5l7pf9pCXB2pkq") return activityNames['eng1'].full;
        return activityNames[id]?.full || 'Science Lab Activity';
    };

    if (loading) {
        return (
            <View style={[styles.loader, { backgroundColor: isDarkMode ? '#121212' : '#F3F0E9' }]}>
                <ActivityIndicator size="large" color="#00E5FF" />
            </View>
        );
    }

    return (
        <ImageBackground source={currentTheme.backgroundImage} style={styles.background}>
            
            <View style={styles.headerWrapper}>
                <SafeAreaView edges={['top']}>
                    <View style={styles.topBar}>
                        <TouchableOpacity style={styles.iconCircle} onPress={() => router.back()}>
                            <Ionicons name="arrow-back-outline" size={24} color="#666" />
                        </TouchableOpacity>
                        
                        <View style={styles.portalBadgeContainer}>
                            <Text style={styles.portalBadgeText}>TEAM PERFORMANCE</Text>
                        </View>

                        <View style={[styles.iconCircle, { opacity: 0 }]}>
                            <Ionicons name="lock-closed-outline" size={24} color="#666" />
                        </View>
                    </View>
                </SafeAreaView>
            </View>

            <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.mainScroll}>
                    
                    <View style={styles.teamSummaryCard}>
                        <View style={styles.summaryHeaderRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.summaryTeamName}>{team?.teamName || "Syncing Name..."}</Text>
                                <Text style={styles.summaryClassText}>Grade Level Tracker: {team?.classSection || team?.gradeLevel || "5A"}</Text>
                                {team?.teamLeader ? (
                                    <View style={styles.leaderBadgeInline}>
                                        <Ionicons name="star" size={14} color="#FFD700" />
                                        <Text style={styles.leaderBadgeInlineText}>
                                            Leader: {currentLeaderProfile ? currentLeaderProfile.studentName : "Syncing..."}
                                        </Text>
                                    </View>
                                ) : null}
                            </View>
                            <View style={styles.discriminatorBadge}>
                                <Text style={styles.discriminatorText}>#{team?.teamDiscriminator || "0000"}</Text>
                            </View>
                        </View>
                        
                        <View style={styles.metricsRowBar}>
                            <View style={styles.metricBlockItem}>
                                <Text style={styles.metricValueText}>{team?.teamScore || 0}</Text>
                                <Text style={styles.metricLabelText}>Leaderboard Rating</Text>
                            </View>
                            <View style={styles.verticalBarDivider} />
                            <View style={styles.metricBlockItem}>
                                <Text style={styles.metricValueText}>{team?.totalAttempts || 0}</Text>
                                <Text style={styles.metricLabelText}>Total Trials Logged</Text>
                            </View>
                        </View>

                        <TouchableOpacity 
                            style={styles.manageRosterButton} 
                            activeOpacity={0.8}
                            onPress={() => setIsManageModalOpen(true)}
                        >
                            <Ionicons name="people-outline" size={18} color="#000" />
                            <Text style={styles.manageRosterButtonText}>Manage Team Roster ({students.length})</Text>
                        </TouchableOpacity>
                    </View>

                    <Text style={[styles.sectionTitle, { color: currentTheme.textColor }]}>Lab Work Scope Filter</Text>

                    <ScrollView 
                        horizontal 
                        showsHorizontalScrollIndicator={false} 
                        contentContainerStyle={styles.activityHorizontalTrack}
                    >
                        {Object.keys(activityNames).map((key) => {
                            const isSelected = selectedActivity === key;
                            return (
                                <TouchableOpacity
                                    key={key}
                                    style={[styles.filterChip, isSelected && styles.filterChipActive]}
                                    onPress={() => setSelectedActivity(key)}
                                    activeOpacity={0.8}
                                >
                                    <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                                        {isSelected ? activityNames[key].full : activityNames[key].short}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    <Text style={[styles.sectionSubtitle, { color: currentTheme.textColor }]}>Historical Run Instances ({filteredAttempts.length})</Text>

                    <View style={styles.historyFeedWrapper}>
                        {filteredAttempts.length === 0 ? (
                            <View style={styles.emptyFeedCard}>
                                <Ionicons name="documents-outline" size={32} color="#999" />
                                <Text style={styles.emptyFeedText}>No experiment runs documented under this activity filter.</Text>
                            </View>
                        ) : (
                            filteredAttempts.map((item) => (
                                <View key={item.id} style={styles.historyItemCard}>
                                    <View style={styles.cardTopRow}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.activityCardName} numberOfLines={1}>
                                                {getActivityLabel(item.activityId)}
                                            </Text>
                                            <Text style={styles.trialCardBadge}>Trial Run Reference: #{item.trialNumber}</Text>
                                        </View>
                                        <View style={[styles.statusIndicatorBox, item.isGraded ? styles.gradedBg : styles.pendingBg]}>
                                            <Text style={styles.statusIndicatorText}>{item.isGraded ? "EVALUATED" : "PENDING"}</Text>
                                        </View>
                                    </View>

                                    <View style={styles.cardDividerLine} />

                                    <View style={styles.scoreParameterMetricsGrid}>
                                        <View style={styles.paramItemColumn}>
                                            <Text style={styles.paramValueLabel}>{item.accuracyScore}</Text>
                                            <Text style={styles.paramSubLabel}>Accuracy (0-50)</Text>
                                        </View>
                                        <View style={styles.paramItemColumn}>
                                            <Text style={styles.paramValueLabel}>{item.workScore}</Text>
                                            <Text style={styles.paramSubLabel}>Execution (0-50)</Text>
                                        </View>
                                        <View style={styles.paramItemColumn}>
                                            <Text style={styles.paramValueLabel}>{item.totalScore}</Text>
                                            <Text style={styles.paramSubLabel}>Composite Score</Text>
                                        </View>
                                    </View>

                                    {item.studentReflection ? (
                                        <Text style={styles.studentReflectionSnippet} numberOfLines={2}>
                                            💭 Reflection subtext: "{item.studentReflection}"
                                        </Text>
                                    ) : null}

                                    <TouchableOpacity
                                        style={styles.modifyGradeButton}
                                        activeOpacity={0.8}
                                        onPress={() => router.push({
                                            pathname: '/(teacher)/grade_submission',
                                            params: { attemptId: item.id }
                                        })}
                                    >
                                        <Ionicons name="create-outline" size={16} color="#000" />
                                        <Text style={styles.modifyGradeButtonText}>
                                            {item.isGraded ? "Modify / Review Evaluation" : "Evaluate Performance"}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            ))
                        )}
                    </View>

                </ScrollView>

                <Modal
                    visible={isManageModalOpen}
                    animationType="slide"
                    transparent={true}
                    onRequestClose={() => setIsManageModalOpen(false)}
                >
                    <View style={styles.modalOverlayContainer}>
                        <View style={[styles.modalContentBox, { backgroundColor: isDarkMode ? '#1E1E1E' : '#FFFFFF' }]}>
                            
                            <View style={styles.modalHeaderRow}>
                                <Text style={[styles.modalTitleText, { color: isDarkMode ? '#FFF' : '#000' }]}>Team Roster</Text>
                                <TouchableOpacity 
                                    style={styles.modalCloseButton} 
                                    onPress={() => setIsManageModalOpen(false)}
                                >
                                    <Ionicons name="close" size={24} color={isDarkMode ? '#FFF' : '#000'} />
                                </TouchableOpacity>
                            </View>

                            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScrollContainer}>
                                {students.length === 0 ? (
                                    <Text style={styles.noStudentsText}>No members assigned to this team.</Text>
                                ) : (
                                    students.map((student) => {
                                        const isLeader = team?.teamLeader === student.id;
                                        return (
                                            <View key={student.id} style={styles.studentRowCard}>
                                                <View style={{ flex: 1, gap: 2 }}>
                                                    <Text style={styles.studentNameText}>{student.studentName}</Text>
                                                    <Text style={styles.studentEmailText}>{student.schoolEmail || "No Email Provided"}</Text>
                                                </View>

                                                <View style={styles.studentActionControlGroup}>
                                                    <TouchableOpacity 
                                                        style={[styles.actionIconButton, isLeader ? styles.activeLeaderBtn : styles.inactiveActionBtn]}
                                                        onPress={() => handleSetLeader(student.id)}
                                                        activeOpacity={0.7}
                                                    >
                                                        <Ionicons 
                                                            name={isLeader ? "star" : "star-outline"} 
                                                            size={18} 
                                                            color={isLeader ? "#000" : "#666"} 
                                                        />
                                                    </TouchableOpacity>

                                                    <TouchableOpacity 
                                                        style={[styles.actionIconButton, styles.removeActionBtn]}
                                                        onPress={() => handleRemoveMember(student.id, student.studentName)}
                                                        activeOpacity={0.7}
                                                    >
                                                        <Ionicons name="trash-outline" size={18} color="#FF3B30" />
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        );
                                    })
                                )}
                            </ScrollView>
                        </View>
                    </View>
                </Modal>

                <View style={styles.bottomTabs}>
                    <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/(teacher)/home')}>
                        <Image source={require('../../assets/images/Home.png')} style={styles.tabIcon} />
                        <Text style={styles.tabText}>Home</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/(teacher)/leaderboard')}>
                        <Image source={require('../../assets/images/Leaderboard.png')} style={styles.tabIcon} />
                        <Text style={styles.tabText}>Leaderboard</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/(teacher)/teams')}>
                        <Image source={require('../../assets/images/MembersB.png')} style={styles.tabIconActive} />
                        <Text style={styles.tabTextActive}>Teams</Text>
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
    loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    mainScroll: { paddingTop: 110, paddingBottom: 110 },
    headerWrapper: { backgroundColor: 'rgba(243, 240, 233, 0.9)', zIndex: 1000, position: 'absolute', top: 0, width: '100%', paddingBottom: 10, borderBottomWidth: 0.5, borderColor: 'rgba(0,0,0,0.05)' },
    topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: Platform.OS === 'android' ? 10 : 0 },
    iconCircle: { backgroundColor: 'white', width: 45, height: 45, borderRadius: 22.5, justifyContent: 'center', alignItems: 'center', elevation: 4 },
    portalBadgeContainer: { backgroundColor: '#FFFFFF', height: 45, borderRadius: 25, width: width * 0.55, justifyContent: 'center', alignItems: 'center', elevation: 4 },
    portalBadgeText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 13, color: '#00E5FF', letterSpacing: 1 },
    
    teamSummaryCard: { backgroundColor: 'white', marginHorizontal: 20, marginTop: 20, padding: 20, borderRadius: 24, borderWidth: 1.5, borderColor: '#000', elevation: 3 },
    summaryHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    summaryTeamName: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 20, color: '#000' },
    summaryClassText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 13, color: '#666', marginTop: 3 },
    leaderBadgeInline: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, backgroundColor: '#FFF9E6', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#FFE0B2' },
    leaderBadgeInlineText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 12, color: '#FF8F00' },
    discriminatorBadge: { backgroundColor: '#E0E0E0', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    discriminatorText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 12, color: '#333' },
    
    metricsRowBar: { flexDirection: 'row', width: '100%', marginTop: 20, paddingTop: 15, borderTopWidth: 1, borderColor: '#EEE', alignItems: 'center' },
    metricBlockItem: { flex: 1, alignItems: 'center', gap: 2 },
    metricValueText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 22, color: '#000' },
    metricLabelText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 11, color: '#777' },
    verticalBarDivider: { width: 1.5, height: 35, backgroundColor: '#000' },

    manageRosterButton: { flexDirection: 'row', backgroundColor: '#F5F5F5', height: 42, borderRadius: 20, borderWidth: 1.5, borderColor: '#000', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 16 },
    manageRosterButtonText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 13, color: '#000' },

    sectionTitle: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 20, textDecorationLine: 'underline', marginHorizontal: 20, marginTop: 25 },
    activityHorizontalTrack: { paddingHorizontal: 15, paddingVertical: 12, gap: 10, alignItems: 'center' },
    filterChip: { backgroundColor: 'white', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#000', elevation: 1 },
    filterChipActive: { backgroundColor: '#00E5FF' },
    filterChipText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 13, color: '#000' },
    filterChipTextActive: { fontFamily: 'BalsamiqSans_700Bold', color: '#000' },

    sectionSubtitle: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 16, marginHorizontal: 20, marginTop: 10, marginBottom: 12 },
    historyFeedWrapper: { paddingHorizontal: 20, gap: 14 },
    historyItemCard: { backgroundColor: 'white', borderRadius: 22, borderWidth: 1.5, borderColor: '#000', padding: 16, elevation: 3 },
    cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    activityCardName: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 16, color: '#000' },
    trialCardBadge: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, color: '#555', marginTop: 2 },
    statusIndicatorBox: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#000' },
    gradedBg: { backgroundColor: '#C8E6C9' },
    pendingBg: { backgroundColor: '#FFCC80' },
    statusIndicatorText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 10, color: '#000' },
    
    cardDividerLine: { height: 1, backgroundColor: '#EAEAEA', width: '100%', marginVertical: 12 },
    scoreParameterMetricsGrid: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 10, marginVertical: 4 },
    paramItemColumn: { alignItems: 'center', gap: 2 },
    paramValueLabel: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 18, color: '#000' },
    paramSubLabel: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 11, color: '#777' },
    
    studentReflectionSnippet: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 11, color: '#666', fontStyle: 'italic', marginTop: 10, backgroundColor: '#F9F9F9', padding: 8, borderRadius: 8 },
    modifyGradeButton: { backgroundColor: '#00E5FF', flexDirection: 'row', height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: '#000', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 14, elevation: 1 },
    modifyGradeButtonText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 13, color: '#000' },

    emptyFeedCard: { backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 22, borderWidth: 1.5, borderColor: '#BBB', borderStyle: 'dashed', padding: 40, alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10 },
    emptyFeedText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 13, color: '#666', textAlign: 'center' },
    
    modalOverlayContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    modalContentBox: { width: width * 0.9, maxHeight: height * 0.7, borderRadius: 24, borderWidth: 2, borderColor: '#000', padding: 20, elevation: 20 },
    modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, paddingBottom: 10, borderBottomWidth: 1, borderColor: '#EEE' },
    modalTitleText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 20 },
    modalCloseButton: { padding: 4 },
    modalScrollContainer: { gap: 12, paddingBottom: 10 },
    noStudentsText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, color: '#888', textAlign: 'center', marginVertical: 20 },
    
    studentRowCard: { flexDirection: 'row', backgroundColor: '#FAFAFA', padding: 12, borderRadius: 14, borderWidth: 1.5, borderColor: '#000', alignItems: 'center', justifyContent: 'space-between' },
    studentNameText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 15, color: '#000' },
    studentEmailText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, color: '#666' },
    studentActionControlGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    actionIconButton: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#000' },
    inactiveActionBtn: { backgroundColor: '#FFF' },
    activeLeaderBtn: { backgroundColor: '#FFD700' },
    removeActionBtn: { backgroundColor: '#FFEBEA' },

    bottomTabs: { position: 'absolute', bottom: 0, flexDirection: 'row', backgroundColor: '#FFFFFF', height: 90, width: '100%', justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderColor: '#EEEEEE', paddingBottom: 15 },
    tabItem: { alignItems: 'center', marginHorizontal: 40 },
    tabIcon: { width: 26, height: 26, tintColor: '#A0A0A0' },
    tabIconActive: { width: 30, height: 30 },
    tabText: { fontSize: 11, color: '#A0A0A0', marginTop: 5, fontFamily: 'BalsamiqSans_400Regular' },
    tabTextActive: { fontSize: 11, color: '#00E5FF', marginTop: 5, fontFamily: 'BalsamiqSans_700Bold' },
});