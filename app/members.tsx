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
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getAuth } from 'firebase/auth';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    query,
    where
} from 'firebase/firestore';
import { db_cloud } from '../services/firebase_config';

import { themes } from '../theme/theme';
import { useTheme } from '../theme/theme_context';

const { width } = Dimensions.get('window');

const MemberGridCard = React.memo(({ item }: { item: any }) => (
    <View style={styles.smallMemberCard}>
        <Image source={require('../assets/images/User.png')} style={styles.smallAvatar} />
        <View style={styles.smallMemberInfo}>
            <Text style={styles.memberNameText} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.memberIdText}>ID: {item.memberId}</Text>
            <Text style={styles.memberGradeText}>{item.grade}</Text>
        </View>
    </View>
));

// ─── Per-screen content ───────────────────────────────────────────────────────

export default function MembersScreen() {
    const router = useRouter();

    const { isDarkMode } = useTheme();
    const currentTheme = isDarkMode ? themes.dark : themes.light;

    const [userData, setUserData] = useState<any>(null);
    const [teamData, setTeamData] = useState<any>(null);
    const [otherMembers, setOtherMembers] = useState<any[]>([]);
    const [stats, setStats] = useState({ avgAcc: 0, avgWork: 0, attemptCount: 0, suggestion: "" });
    const [loading, setLoading] = useState(true);
    const [userTeamId, setUserTeamId] = useState<string>('');
    const [attemptedCount, setAttemptedCount] = useState(0);

    useEffect(() => {
        let isMounted = true;
        const fetchData = async () => {
            try {
                const auth = getAuth();
                const user = auth.currentUser;
                if (!user) return;

                const studentDoc = await getDoc(doc(db_cloud, "MS_Student", user.uid));
                if (!studentDoc.exists()) return;
                const sData = studentDoc.data();
                const teamID = sData.teamID;
                
                if (isMounted) {
                    setUserTeamId(teamID);
                }

                const teamDoc = await getDoc(doc(db_cloud, "MS_Team", teamID));
                const tData = teamDoc.exists() ? teamDoc.data() : {};
                
                const rawName = tData.teamName || "Un";
                // enforce standard team prefix naming convention
                const cleanTeamName = rawName.toLowerCase().startsWith("team") 
                    ? rawName 
                    : `Team ${rawName}`;

                // query remaining group roster while filtering out current user id
                const membersQuery = query(collection(db_cloud, "MS_Student"), where("teamID", "==", teamID));
                const membersSnap = await getDocs(membersQuery);
                const membersList = membersSnap.docs
                    .filter(d => d.id !== user.uid)
                    .map(d => ({
                        id: d.id,
                        name: d.data().studentName || "Member",
                        memberId: `#${d.data().studentID || "0000"}`,
                        grade: `Grade ${d.data().gradeLevel || "--"}`
                    }));

                const attemptsSnap = await getDocs(collection(db_cloud, "MS_Team", teamID, "FC_Attempt"));
                let totalAcc = 0, totalWork = 0, count = 0;

                // parse and reduce history attempts into profile performance metrics
                attemptsSnap.forEach((doc) => {
                    const res = doc.data().FC_Scoring_Result;
                    if (res) {
                        totalAcc += res.accuracyScore || 0;
                        totalWork += res.workScore || 0;
                        count++;
                    }
                });

                const avgAcc = count > 0 ? totalAcc / count : 0;
                const avgWork = count > 0 ? totalWork / count : 0;

                let suggestion = "Keep up the hard work!";
                if (avgAcc < 5 && avgWork < 5) {
                    suggestion = "Too few succeeded attempts";
                } else if (avgAcc >= 9 && avgWork >= 9) {
                    suggestion = "Good enough, but do more research for the perfect score";
                } else if (avgAcc < 7) {
                    suggestion = "Be more accurate";
                } else if (avgWork < 7) {
                    suggestion = "Please do more activities more time effective";
                }

                if (isMounted) {
                    setUserData({
                        name: sData.studentName,
                        id: sData.studentID,
                        grade: sData.gradeLevel,
                        isLeader: tData.teamLeader === user.uid
                    });
                    setTeamData({
                        name: cleanTeamName,
                        points: tData.TotalPoints || 0,
                        discriminator: tData.teamDiscriminator || "0000"
                    });
                    setOtherMembers(membersList);
                    setStats({ avgAcc, avgWork, attemptCount: count, suggestion });
                }

            } catch (error) {
                console.error("Error fetching member data:", error);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchData();
        return () => { isMounted = false; };
    }, []);

    useEffect(() => {
        const auth = getAuth();
        const user = auth.currentUser;
        if (!user) return;

        const attemptsQuery = userTeamId
            ? query(collection(db_cloud, "FC_Attempt"), where("TeamID", "==", userTeamId))
            : query(collection(db_cloud, "FC_Attempt"), where("createdBy", "==", user.uid));

        const unsubscribe = onSnapshot(attemptsQuery, (snapshot) => {
            const uniqueActivities = new Set<string>();

            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                if (data.ActivityID) {
                    uniqueActivities.add(data.ActivityID);
                }
            });

            // evaluate unique task completions and cap progress bar layout ceiling
            setAttemptedCount(Math.min(uniqueActivities.size, 7));
        }, (error) => {
            console.error("Error monitoring activity progress on members tab: ", error);
        });

        return unsubscribe;
    }, [userTeamId]);

    const handleEditPress = () => {
        Alert.alert("Information", "Please contact a teacher to change your information");
    };

    if (loading) {
        return (
            <View style={[styles.loader, { backgroundColor: isDarkMode ? '#141414' : '#F3F0E9' }]}>
                <ActivityIndicator size="large" color="#00E5FF" />
            </View>
        );
    }

    return (
        <ImageBackground source={currentTheme.backgroundImage} style={styles.background}>
            
            <View style={styles.headerWrapper}>
                <SafeAreaView edges={['top']}>
                    <View style={styles.topBar}>
                        <TouchableOpacity style={styles.iconCircle} onPress={() => router.push('/settings')}>
                            <Ionicons name="settings-outline" size={24} color="#666" />
                        </TouchableOpacity>
                        <View style={styles.progressContainer}>
                            <View style={styles.progressBarBase}>
                                <View style={[styles.progressFill, { width: `${(attemptedCount / 7) * 100}%` }]} />
                            </View>
                            <Text style={styles.progressText}>{`Progress (${attemptedCount}/7)`}</Text>
                        </View>
                        <TouchableOpacity style={styles.iconCircle} onPress={() => router.push('/history')}>
                            <Ionicons name="timer-outline" size={24} color="#666" />
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            </View>

            <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.mainScroll}>

                    <View style={styles.rosterHeader}>
                        <View style={styles.titleRow}>
                            <Text style={[styles.rosterTitle, { color: currentTheme.textColor }]}>Member Roster</Text>
                            <View style={styles.teamSide}>
                                <Text style={[styles.teamNameText, { color: currentTheme.textColor }]}>{teamData?.name}</Text>
                                <TouchableOpacity style={styles.editTouchable} onPress={handleEditPress}>
                                    <Text style={[styles.editText, { color: currentTheme.textColor }]}>Edit</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>

                    <View style={styles.profileCard}>
                        <Image source={require('../assets/images/User.png')} style={styles.profileAvatar} />
                        <View style={styles.profileInfo}>
                            <Text style={styles.profileLabel}>Your Profile</Text>
                            <Text style={styles.profileName}>{userData?.name}</Text>
                            {userData?.isLeader && (
                                <View style={styles.profileSubInfo}>
                                    <Text style={styles.leaderBadgeText}>★ Team Leader</Text>
                                </View>
                            )}
                        </View>
                    </View>

                    <View style={styles.membersGrid}>
                        {otherMembers.map((member) => (
                            <MemberGridCard key={member.id} item={member} />
                        ))}
                    </View>

                    <Text style={[styles.sectionTitle, { color: currentTheme.textColor }]}>Performance</Text>
                    
                    <View style={styles.performanceCard}>
                        <View style={styles.performanceIconWrapper}>
                            <Image source={require('../assets/images/Performance.png')} style={styles.performanceIcon} />
                        </View>

                        <View style={styles.performanceContent}>
                            <Text style={styles.pointsText}>Point: {teamData?.points}</Text>
                            
                            <Text style={styles.progressLabel}>Accuracy (Avg: {stats.avgAcc.toFixed(1)}/10)</Text>
                            <View style={styles.miniProgressBar}>
                                <View style={[styles.miniProgressFill, { width: `${stats.avgAcc * 10}%` }]} />
                            </View>

                            <Text style={styles.progressLabel}>Work (Avg: {stats.avgWork.toFixed(1)}/10)</Text>
                            <View style={styles.miniProgressBar}>
                                <View style={[styles.miniProgressFill, { width: `${stats.avgWork * 10}%` }]} />
                            </View>

                            <Text style={styles.performanceSuggestion}>Status: {stats.suggestion}</Text>
                        </View>
                    </View>

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
                    <TouchableOpacity style={styles.tabItem}>
                        <Image source={require('../assets/images/MembersB.png')} style={styles.tabIconActive} />
                        <Text style={styles.tabTextActive}>Members</Text>
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
    loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    headerWrapper: { backgroundColor: 'rgba(243, 240, 233, 0.8)', zIndex: 1000, position: 'absolute', top: 0, width: '100%', paddingBottom: 10, borderBottomWidth: 0.5, borderColor: 'rgba(0,0,0,0.05)' },
    topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: Platform.OS === 'android' ? 10 : 0 },
    iconCircle: { backgroundColor: 'white', width: 45, height: 45, borderRadius: 22.5, justifyContent: 'center', alignItems: 'center', elevation: 4 },
    progressContainer: { backgroundColor: 'white', height: 45, borderRadius: 25, width: width * 0.6, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 5, elevation: 4 },
    progressBarBase: { flex: 1, height: 35, backgroundColor: '#F0F0F0', borderRadius: 20, overflow: 'hidden', justifyContent: 'center' },
    progressFill: { width: '40%', height: '100%', backgroundColor: '#4FC3F7', borderRadius: 20 },
    progressText: { position: 'absolute', width: '100%', textAlign: 'center', fontFamily: 'BalsamiqSans_400Regular', fontSize: 16, color: '#000' },
    userInfoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 15, marginBottom: 15 },
    welcomeLabel: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14 },
    userName: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 16 },
    gradeContainer: { alignItems: 'flex-end', justifyContent: 'center' },
    idBadge: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 10, color: '#666', backgroundColor: '#E0E0E0', paddingHorizontal: 6, borderRadius: 8 },
    gradeText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, marginTop: 2 },
    rosterHeader: { paddingHorizontal: 20, marginTop: 10, marginBottom: 25 },
    titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    rosterTitle: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 24, textDecorationLine: 'underline', lineHeight: 30 },
    teamSide: { alignItems: 'flex-end' },
    teamNameText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 24, textDecorationLine: 'underline', lineHeight: 30 },
    editTouchable: { marginTop: 2 },
    editText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14 },
    profileCard: { backgroundColor: 'white', marginHorizontal: 20, borderRadius: 24, borderWidth: 1.5, borderColor: '#000', padding: 20, flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
    profileAvatar: { width: 80, height: 80, marginRight: 20 },
    profileInfo: { flex: 1 },
    profileLabel: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, fontStyle: 'italic' },
    profileName: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 18, marginVertical: 2 },
    profileSubInfo: { marginTop: 5 },
    profileAttempts: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, color: '#4FC3F7' },
    leaderBadgeText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 14, color: '#D4AF37' },
    membersGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 15, justifyContent: 'space-between' },
    smallMemberCard: { backgroundColor: 'white', width: '47%', borderRadius: 24, borderWidth: 1.5, borderColor: '#000', padding: 15, marginBottom: 15, alignItems: 'center', flexDirection: 'row' },
    smallAvatar: { width: 50, height: 50, marginRight: 10 },
    smallMemberInfo: { flex: 1 },
    memberNameText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12 },
    memberIdText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 11, color: '#333' },
    memberGradeText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 11, color: '#333' },
    sectionTitle: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 24, textDecorationLine: 'underline', marginHorizontal: 20, marginTop: 10, marginBottom: 15 },
    performanceCard: { backgroundColor: 'white', marginHorizontal: 20, borderRadius: 24, borderWidth: 1.5, borderColor: '#000', padding: 20, flexDirection: 'row', alignItems: 'center' },
    performanceIconWrapper: { width: 60, height: 60, marginRight: 15, justifyContent: 'center', alignItems: 'center' },
    performanceIcon: { width: '100%', height: '100%', resizeMode: 'contain' },
    performanceContent: { flex: 1 },
    pointsText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 16, marginBottom: 10 },
    progressLabel: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, marginBottom: 5, fontStyle: 'italic' },
    performanceSuggestion: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, marginTop: 5, color: '#4FC3F7' },
    miniProgressBar: { height: 12, backgroundColor: '#F0F0F0', borderRadius: 6, marginBottom: 10, borderWidth: 0.5, borderColor: '#CCC' },
    miniProgressFill: { height: '100%', backgroundColor: '#00E5FF', borderRadius: 6 },
    bottomTabs: { position: 'absolute', bottom: 0, flexDirection: 'row', backgroundColor: '#FFFFFF', height: 90, width: '100%', justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderColor: '#EEEEEE', paddingBottom: 15 },
    tabItem: { alignItems: 'center', marginHorizontal: 40 },
    tabIcon: { width: 26, height: 26, tintColor: '#A0A0A0' },
    tabIconActive: { width: 30, height: 30 },
    tabText: { fontSize: 11, color: '#A0A0A0', marginTop: 5, fontFamily: 'BalsamiqSans_400Regular' },
    tabTextActive: { fontSize: 11, color: '#00E5FF', marginTop: 5, fontFamily: 'BalsamiqSans_700Bold' },
});