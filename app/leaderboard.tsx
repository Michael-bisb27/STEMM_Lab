import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
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

let globalHasShownLeaderboardNotice = false;

const { id: eng1, title: _1, fullTitle: _2, image: _3, route: _4 } = { id: '', title: '', fullTitle: '', image: 0, route: '' }; 

// ─── Per-screen content ───────────────────────────────────────────────────────

export default function LeaderboardScreen() {
    const router = useRouter();

    const { isDarkMode } = useTheme();
    const currentTheme = isDarkMode ? themes.dark : themes.light;

    const [leaderboard, setLeaderboard] = useState<any[]>([]);
    const [userTeamId, setUserTeamId] = useState<string>('');
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [attemptedCount, setAttemptedCount] = useState(0);

    const [contentHeight, setContentHeight] = useState(1);
    const [containerHeight, setContainerHeight] = useState(1);
    const scrollY = useRef(new Animated.Value(0)).current;

    const notificationY = useRef(new Animated.Value(-120)).current;
    const notificationOpacity = useRef(new Animated.Value(0)).current;

    const scrollIndicatorSize = contentHeight > containerHeight
        ? (containerHeight / contentHeight) * containerHeight
        : 0;

    // map scroll position to custom scrollbar thumb track offset
    const scrollIndicatorOffset = Animated.multiply(
        scrollY,
        containerHeight / contentHeight
    );

    const getRankSuffix = (n: number) => {
        const s = ["th", "st", "nd", "rd"], v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    useEffect(() => {
        const auth = getAuth();
        const user = auth.currentUser;

        let teamsCache: any[] = [];
        let scoresCache: any[] = [];

        // manually join and aggregate collections to avoid complex firestore indexing
        const compileLeaderboard = () => {
            const compiledList: any[] = [];

            teamsCache.forEach((team) => {
                const teamResults = scoresCache.filter(score => score.TeamID === team.id);
                const activityMap: Record<string, { maxScore: number; trials: number }> = {};

                // extract only the highest score per unique activity id
                teamResults.forEach((res) => {
                    const actId = res.ActivityID || "unknown_activity";
                    const score = (res.accuracyScore || 0) + (res.workScore || 0);

                    if (!activityMap[actId]) {
                        activityMap[actId] = { maxScore: 0, trials: 0 };
                    }
                    
                    activityMap[actId].trials += 1;
                    if (score > activityMap[actId].maxScore) {
                        activityMap[actId].maxScore = score;
                    }
                });

                let totalBestScore = 0;
                let totalTrialsUsed = 0;

                Object.values(activityMap).forEach((activity) => {
                    totalBestScore += activity.maxScore;
                    totalTrialsUsed += activity.trials;
                });

                let rawGrade = team.gradeLevel || team.classSection || team.category || "5a";
                if (rawGrade.toLowerCase() === "primary" || rawGrade.toLowerCase() === "junior high") {
                    rawGrade = "5a";
                }

                compiledList.push({
                    id: team.id,
                    rank: 1,
                    name: team.teamName || "Unnamed Team",
                    grade: `grade ${rawGrade.toLowerCase()}`,
                    points: totalBestScore,
                    totalAttempts: totalTrialsUsed,
                    discriminator: team.teamDiscriminator || "0000"
                });
            });

            // tie-breaker rule: team with fewer attempts wins
            compiledList.sort((a, b) => {
                if (b.points === a.points) {
                    return a.totalAttempts - b.totalAttempts; 
                }
                return b.points - a.points;
            });

            compiledList.forEach((item, index) => {
                item.rank = index + 1;
            });

            setLeaderboard(compiledList);
        };

        const unsubscribeTeams = onSnapshot(collection(db_cloud, "MS_Team"), (snapshot) => {
            teamsCache = [];
            snapshot.forEach(doc => teamsCache.push({ id: doc.id, ...doc.data() }));
            compileLeaderboard();
        });

        const unsubscribeScores = onSnapshot(collection(db_cloud, "FC_Scoring_Result"), (snapshot) => {
            scoresCache = [];
            snapshot.forEach(doc => scoresCache.push(doc.data()));
            compileLeaderboard();
        });

        const fetchUserData = async () => {
            if (!user) return;
            try {
                const studentDoc = await getDoc(doc(db_cloud, "MS_Student", user.uid));
                if (studentDoc.exists()) {
                    const teamID = studentDoc.data().teamID;
                    setUserTeamId(teamID);
                    
                    const attemptsSnap = await getDocs(collection(db_cloud, "MS_Team", teamID, "FC_Attempt"));
                    
                    let totalAcc = 0;
                    let totalWork = 0;
                    let count = 0;

                    attemptsSnap.forEach((doc) => {
                        const result = doc.data().FC_Scoring_Result;
                        if (result) {
                            totalAcc += result.accuracyScore || 0;
                            totalWork += result.workScore || 0;
                            count++;
                        }
                    });

                    const avgAcc = count > 0 ? totalAcc / count : 0;
                    const avgWork = count > 0 ? totalWork / count : 0;

                    let newSuggestions = [];
                    if (avgAcc < 5 && avgWork < 5) {
                        newSuggestions.push("Too few succeeded attempts");
                    } else {
                        if (avgAcc < 7) newSuggestions.push("Be more accurate");
                        if (avgWork < 7) newSuggestions.push("Please do more activities more time effective");
                        if (avgAcc >= 9 && avgWork >= 9) newSuggestions.push("Good enough, but do more research to get the perfect score");
                    }
                    
                    if (count === 0) newSuggestions.push("Start your first activity!");

                    setSuggestions(newSuggestions);
                }
            } catch (err) {
                console.error("Error fetching leaderboard stats:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchUserData();
        
        return () => {
            unsubscribeTeams();
            unsubscribeScores();
        };
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

            setAttemptedCount(Math.min(uniqueActivities.size, 7));
        }, (error) => {
            console.error("Error monitoring activity progress on leaderboard: ", error);
        });

        return unsubscribe;
    }, [userTeamId]);

    useEffect(() => {
        if (leaderboard.length > 0 && !loading && !globalHasShownLeaderboardNotice) {
            globalHasShownLeaderboardNotice = true;

            Animated.parallel([
                Animated.timing(notificationY, {
                    toValue: Platform.OS === 'ios' ? 60 : 40,
                    duration: 500,
                    useNativeDriver: true,
                }),
                Animated.timing(notificationOpacity, {
                    toValue: 1,
                    duration: 400,
                    useNativeDriver: true,
                })
            ]).start(() => {
                setTimeout(() => {
                    Animated.parallel([
                        Animated.timing(notificationY, {
                            toValue: -120,
                            duration: 500,
                            useNativeDriver: true,
                        }),
                        Animated.timing(notificationOpacity, {
                            toValue: 0,
                            duration: 400,
                            useNativeDriver: true,
                        })
                    ]).start();
                }, 3500);
            });
        }
    }, [leaderboard, loading]);

    if (loading) {
        return (
            <View style={{flex: 1, justifyContent: 'center', backgroundColor: isDarkMode ? '#141414' : '#F3F0E9'}}>
                <ActivityIndicator size="large" color="#00E5FF" />
            </View>
        );
    }

    const myRankData = leaderboard.find(t => t.id === userTeamId) || leaderboard[0];

    return (
        <ImageBackground source={currentTheme.backgroundImage} style={styles.background}>
            <Animated.View style={[
                styles.notificationToast, 
                { transform: [{ translateY: notificationY }], opacity: notificationOpacity }
            ]}>
                <View style={styles.notificationBadge}>
                    <Ionicons name="trophy" size={14} color="#FFF" />
                    <Text style={styles.notificationBadgeText}>RANK</Text>
                </View>
                <Text style={styles.notificationText}>You are currently on the {getRankSuffix(myRankData?.rank || 1)} position! 🚀</Text>
            </Animated.View>

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

                    <View style={styles.rankGoalsCard}>
                        <Text style={styles.cardHeaderTitle}>My Rank & Goals</Text>
                        <View style={styles.userIdBadge}>
                            <Text style={styles.userIdText}>#{myRankData?.discriminator}</Text>
                        </View>
                        <View style={styles.statsRow}>
                            <Text style={styles.statLabel}>Current Rank: </Text>
                            <View style={styles.rankHighlight}>
                                <Text style={styles.rankHighlightText}>{getRankSuffix(myRankData?.rank)}</Text>
                            </View>
                            <Text style={styles.statLabel}> (out of {leaderboard.length})</Text>
                            <View style={{flex: 1}} />
                            <Text style={styles.statLabel}>Rating: {myRankData?.points}</Text>
                        </View>
                        <Text style={styles.goalText}>
                            Current Goal: {myRankData?.rank > 1 ? `${getRankSuffix(myRankData.rank - 1)} Place` : "Keep Top Rank!"}
                        </Text>
                    </View>

                    <Text style={[styles.sectionTitle, { color: currentTheme.textColor }]}>Leaderboard</Text>

                    <View style={styles.leaderboardMainCard}>
                        <View style={styles.leaderboardHeader}>
                             <Image source={require('../assets/images/First.png')} style={styles.medalIcon} />
                             <Text style={styles.leaderboardTitle}>Top Scientists</Text>
                        </View>

                        <View style={styles.listContainer}>
                            <ScrollView 
                                showsVerticalScrollIndicator={false}
                                onContentSizeChange={(w, h) => setContentHeight(h)}
                                onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}
                                onScroll={Animated.event(
                                    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                                    { useNativeDriver: false }
                                )}
                                scrollEventThrottle={16}
                            >
                                {leaderboard.map((item, index) => (
                                    <View key={index} style={styles.leaderboardRow}>
                                        <Text style={styles.rowRank}>{getRankSuffix(item.rank)}</Text>
                                        <Text style={[styles.rowName, item.id === myRankData?.id && styles.boldText]}>
                                            {item.name} {item.id === myRankData?.id ? "(You)" : ""}
                                        </Text>
                                        <Text style={styles.rowGrade}>{item.grade}</Text>
                                        <View style={styles.verticalDivider} />
                                        <Text style={styles.rowPoints}>{item.points}</Text>
                                    </View>
                                ))}
                            </ScrollView>

                            <View style={styles.customScrollTrack}>
                                <Animated.View 
                                    style={[
                                        styles.customScrollThumb, 
                                        { 
                                          height: scrollIndicatorSize,
                                          transform: [{ translateY: scrollIndicatorOffset }]
                                        }
                                    ]} 
                                />
                            </View>
                        </View>
                    </View>

                    <View style={styles.summaryCard}>
                        <View style={styles.cyanRankBox}>
                            <Text style={styles.cyanRankText}>{myRankData?.rank}</Text>
                        </View>
                        <View style={styles.summaryContent}>
                            <Text style={styles.summaryTeamName}>{myRankData?.name}</Text>
                            <Text style={styles.summarySuggestions}>Suggestions:</Text>
                            {suggestions.map((s, i) => (
                                <Text key={i} style={styles.suggestionItem}>· {s}</Text>
                            ))}
                        </View>
                        <Image source={require('../assets/images/Bars.png')} style={styles.barsImage} resizeMode="contain" />
                    </View>

                </ScrollView>

                <View style={styles.bottomTabs}>
                    <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/home')}>
                        <Image source={require('../assets/images/Home.png')} style={styles.tabIcon} />
                        <Text style={styles.tabText}>Home</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.tabItem}>
                        <Image source={require('../assets/images/LeaderboardB.png')} style={styles.tabIconActive} />
                        <Text style={styles.tabTextActive}>Leaderboard</Text>
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    background: { flex: 1 },
    safeArea: { flex: 1 },
    mainScroll: { paddingTop: 110, paddingBottom: 110 },
    headerWrapper: { backgroundColor: 'rgba(243, 240, 233, 0.8)', zIndex: 1000, position: 'absolute', top: 0, width: '100%', paddingBottom: 10 },
    topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: Platform.OS === 'android' ? 10 : 0 },
    iconCircle: { backgroundColor: 'white', width: 45, height: 45, borderRadius: 22.5, justifyContent: 'center', alignItems: 'center', elevation: 4 },
    progressContainer: { backgroundColor: 'white', height: 45, borderRadius: 25, width: width * 0.6, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 5, elevation: 4 },
    progressBarBase: { flex: 1, height: 35, backgroundColor: '#F0F0F0', borderRadius: 20, overflow: 'hidden', justifyContent: 'center' },
    progressFill: { height: '100%', backgroundColor: '#4FC3F7', borderRadius: 20 },
    progressText: { position: 'absolute', width: '100%', textAlign: 'center', fontFamily: 'BalsamiqSans_400Regular', fontSize: 16 },
    rankGoalsCard: { backgroundColor: 'white', marginHorizontal: 20, marginTop: 20, padding: 15, borderRadius: 20, borderWidth: 1.5, borderColor: '#000' },
    cardHeaderTitle: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 16, textAlign: 'center', fontStyle: 'italic' },
    userIdBadge: { position: 'absolute', top: 10, right: 10, backgroundColor: '#E0E0E0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
    userIdText: { fontSize: 10, fontFamily: 'BalsamiqSans_400Regular' },
    statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 15 },
    statLabel: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14 },
    rankHighlight: { backgroundColor: '#00E5FF', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
    rankHighlightText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 14, color: 'white' },
    goalText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, marginTop: 15, fontStyle: 'italic' },
    sectionTitle: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 24, marginHorizontal: 20, marginTop: 25, textDecorationLine: 'underline' },
    leaderboardMainCard: { backgroundColor: 'white', marginHorizontal: 20, marginTop: 15, padding: 20, borderRadius: 24, borderWidth: 1.5, borderColor: '#000', height: 380 },
    leaderboardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    medalIcon: { width: 30, height: 30, marginRight: 10 },
    leaderboardTitle: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 16 },
    listContainer: { flex: 1, flexDirection: 'row' },
    customScrollTrack: { width: 6, backgroundColor: '#F0F0F0', borderRadius: 3, marginLeft: 10, height: '100%' },
    customScrollThumb: { width: 6, backgroundColor: '#00E5FF', borderRadius: 3 },
    leaderboardRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
    rowRank: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 20, width: 60 },
    rowName: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, flex: 1.2 },
    boldText: { fontFamily: 'BalsamiqSans_700Bold' },
    rowGrade: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, color: '#000', fontStyle: 'italic', flex: 1, textAlign: 'right', paddingRight: 10 },
    verticalDivider: { width: 1, height: '100%', backgroundColor: '#000' },
    rowPoints: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, width: 80, textAlign: 'right' },
    summaryCard: { backgroundColor: 'white', marginHorizontal: 20, marginTop: 20, borderRadius: 24, borderWidth: 1.5, borderColor: '#000', flexDirection: 'row', height: 140, overflow: 'hidden' },
    cyanRankBox: { backgroundColor: '#4FC3F7', width: 80, justifyContent: 'center', alignItems: 'center', borderRightWidth: 1.5 },
    cyanRankText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 28 },
    summaryContent: { flex: 1, padding: 15 },
    summaryTeamName: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 18 },
    summarySuggestions: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, marginTop: 5, fontStyle: 'italic' },
    suggestionItem: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, marginLeft: 5 },
    barsImage: { width: 80, height: 80, alignSelf: 'center', marginRight: 10 },
    bottomTabs: { position: 'absolute', bottom: 0, flexDirection: 'row', backgroundColor: '#FFFFFF', height: 90, width: '100%', justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderColor: '#EEEEEE', paddingBottom: 15 },
    tabItem: { alignItems: 'center', marginHorizontal: 40 },
    tabIcon: { width: 26, height: 26, tintColor: '#A0A0A0' },
    tabIconActive: { width: 30, height: 30 },
    tabText: { fontSize: 11, color: '#A0A0A0', marginTop: 5, fontFamily: 'BalsamiqSans_400Regular' },
    tabTextActive: { fontSize: 11, color: '#00E5FF', marginTop: 5, fontFamily: 'BalsamiqSans_700Bold' },
    notificationToast: { position: 'absolute', top: 40, left: '5%', right: '5%', width: '90%', backgroundColor: '#1E1E24', borderRadius: 15, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', zIndex: 9999, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 6, elevation: 10 },
    notificationBadge: { backgroundColor: '#4FC3F7', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, flexDirection: 'row', alignItems: 'center', marginRight: 10 },
    notificationBadgeText: { color: '#FFF', fontSize: 9, fontFamily: 'BalsamiqSans_700Bold', marginLeft: 3 },
    notificationText: { color: '#FFF', fontSize: 13, fontFamily: 'BalsamiqSans_400Regular', flex: 1 },
    userInfoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 15, marginBottom: 10 },
    welcomeText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 16 },
    userName: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 16 },
    gradeContainer: { alignItems: 'flex-end', justifyContent: 'center' },
    userId: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, color: '#666' },
    gradeText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14 },
});