import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
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

import { collection, onSnapshot } from 'firebase/firestore';
import { db_cloud } from '../../services/firebase_config';

import { themes } from '../../theme/theme';
import { useTheme } from '../../theme/theme_context';

const { width } = Dimensions.get('window');

interface LeaderboardTeam {
    id: string;
    rank: number;
    name: string;
    category: string;
    teamScore: number;
    totalAttempts: number;
    discriminator: string;
}

// ─── Per-screen content ───────────────────────────────────────────────────────

export default function TeacherLeaderboardScreen() {
    const router = useRouter();

    const { isDarkMode } = useTheme();
    const currentTheme = isDarkMode ? themes.dark : themes.light;

    const [leaderboard, setLeaderboard] = useState<LeaderboardTeam[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    
    const [classAverage, setClassAverage] = useState<number>(0);
    const [highestScore, setHighestScore] = useState<number>(0);
    const [classVelocity, setClassVelocity] = useState<string>('Low Progress');
    const [insightsList, setInsightsList] = useState<string[]>([]);

    const [contentHeight, setContentHeight] = useState<number>(1);
    const [containerHeight, setContainerHeight] = useState<number>(1);
    const scrollY = useRef(new Animated.Value(0)).current;

    const scrollIndicatorSize = contentHeight > containerHeight
        ? (containerHeight / contentHeight) * containerHeight
        : 0;

    // map track scroll position directly to custom scrollbar thumb layout overlay
    const scrollIndicatorOffset = Animated.multiply(
        scrollY,
        containerHeight / contentHeight
    );

    useEffect(() => {
        let teamsCache: any[] = [];
        let scoresCache: any[] = [];

        // manually stream and map collections on client to avoid complex server indexing
        const compileLeaderboard = () => {
            let totalScoreAccumulator = 0;
            let maxScoreFound = 0;
            const compiledList: LeaderboardTeam[] = [];

            teamsCache.forEach((team) => {
                const teamResults = scoresCache.filter(score => score.TeamID === team.id);
                const activityMap: Record<string, { maxScore: number; trials: number }> = {};

                // isolate peak scored attempt performance per single unique activity id
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

                totalScoreAccumulator += totalBestScore;
                if (totalBestScore > maxScoreFound) {
                    maxScoreFound = totalBestScore;
                }

                compiledList.push({
                    id: team.id,
                    rank: 1,
                    name: team.teamName || "Unnamed Team",
                    category: team.gradeLevel || team.classSection || "5a", 
                    teamScore: totalBestScore,
                    totalAttempts: totalTrialsUsed,
                    discriminator: team.teamDiscriminator || "0000"
                });
            });

            // tie-breaker layout rule: less trials breaks equivalent scores
            compiledList.sort((a, b) => {
                if (b.teamScore === a.teamScore) {
                    return a.totalAttempts - b.totalAttempts; 
                }
                return b.teamScore - a.teamScore;
            });

            compiledList.forEach((item, index) => {
                item.rank = index + 1;
            });

            const totalTeamsCount = compiledList.length;
            const computedAverage = totalTeamsCount > 0 ? Math.round(totalScoreAccumulator / totalTeamsCount) : 0;
            
            setLeaderboard(compiledList);
            setClassAverage(computedAverage);
            setHighestScore(maxScoreFound);

            // evaluate dynamic class analytic metrics against custom point thresholds
            const dynamicInsights: string[] = [];
            if (totalTeamsCount === 0) {
                setClassVelocity('No Data Available');
                dynamicInsights.push("No active student lab teams registered inside this database layout yet.");
            } else {
                if (computedAverage < 100) {
                    setClassVelocity('Low Progress');
                    dynamicInsights.push("Class is in the early phase. Most groups are on their first lab milestones.");
                } else if (computedAverage >= 100 && computedAverage <= 350) {
                    setClassVelocity('Mid Progress');
                    dynamicInsights.push("Steady workflow pacing. Multiple activities are being submitted cleanly.");
                } else {
                    setClassVelocity('High Velocity');
                    dynamicInsights.push("Excellent momentum! Multiple units have reached optimal scoring thresholds.");
                }

                const efficientTeam = compiledList.find(t => t.teamScore > 0 && t.totalAttempts <= totalTeamsCount);
                if (efficientTeam) {
                    dynamicInsights.push(`Highest efficiency profile: ${efficientTeam.name} reaching solid milestones with low trials.`);
                } else {
                    dynamicInsights.push("All project units are maintaining consistent operational velocity markers.");
                }
            }
            setInsightsList(dynamicInsights);
            setLoading(false);
        };

        const unsubscribeTeams = onSnapshot(collection(db_cloud, "MS_Team"), (snapshot) => {
            teamsCache = [];
            snapshot.forEach(doc => teamsCache.push({ id: doc.id, ...doc.data() }));
            compileLeaderboard();
        }, (error) => {
            console.error("Teams Stream Error:", error);
        });

        const unsubscribeScores = onSnapshot(collection(db_cloud, "FC_Scoring_Result"), (snapshot) => {
            scoresCache = [];
            snapshot.forEach(doc => scoresCache.push(doc.data()));
            compileLeaderboard();
        }, (error) => {
            console.error("Scores Stream Error:", error);
        });

        return () => {
            unsubscribeTeams();
            unsubscribeScores();
        };
    }, []);

    const getRankSuffix = (n: number) => {
        const s = ["th", "st", "nd", "rd"], v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    if (loading) {
        return (
            <View style={[styles.loadingContainer, { backgroundColor: isDarkMode ? '#121212' : '#F3F0E9' }]}>
                <ActivityIndicator size="large" color="#00E5FF" />
            </View>
        );
    }

    const topRankedTeam = leaderboard[0] || { name: "None", discriminator: "0000", teamScore: 0 };

    return (
        <ImageBackground source={currentTheme.backgroundImage} style={styles.background}>
            
            <View style={styles.headerWrapper}>
                <SafeAreaView edges={['top']}>
                    <View style={styles.topBar}>
                        <TouchableOpacity style={styles.iconCircle} onPress={() => router.push('/(teacher)/settings')}>
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
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.mainScroll}>
                    
                    <View style={styles.rankGoalsCard}>
                        <View style={styles.cardHeaderRow}>
                            <Text style={styles.cardHeaderTitle}>Class Performance Overview</Text>
                            <View style={styles.userIdBadge}>
                                <Text style={styles.userIdText}>Active Groups: {leaderboard.length}</Text>
                            </View>
                        </View>
                        
                        <View style={styles.statsRow}>
                            <Text style={styles.statLabel}>Highest Score: </Text>
                            <View style={styles.rankHighlight}>
                                <Text style={styles.rankHighlightText}>{highestScore}</Text>
                            </View>
                            <View style={{ width: 15 }} />
                            <Text style={styles.statLabel}>Class Average: {classAverage}</Text>
                        </View>
                        <Text style={styles.goalText}>
                            Current Leader: {topRankedTeam.name} (#{topRankedTeam.discriminator})
                        </Text>
                    </View>

                    <Text style={[styles.sectionTitle, { color: currentTheme.textColor }]}>Lab Standings</Text>

                    <View style={styles.leaderboardMainCard}>
                        <View style={styles.leaderboardHeader}>
                             <Image source={require('../../assets/images/First.png')} style={styles.medalIcon} />
                             <Text style={styles.leaderboardTitle}>Top Project Teams</Text>
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
                                {leaderboard.map((item) => (
                                    <View key={item.id} style={styles.leaderboardRow}>
                                        <Text style={styles.rowRank}>{getRankSuffix(item.rank)}</Text>
                                        <Text style={styles.rowName} numberOfLines={1}>
                                            {item.name}
                                        </Text>
                                        <Text style={styles.rowGrade}>grade {item.category.toLowerCase()}</Text>
                                        <View style={styles.verticalDivider} />
                                        <Text style={styles.rowPoints}>{item.teamScore}</Text>
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
                            <Ionicons name="analytics" size={32} color="#000" />
                            <Text style={styles.velocityIndicatorSubtext}>{classVelocity}</Text>
                        </View>
                        <View style={styles.summaryContent}>
                            <Text style={styles.summaryTeamName}>Instructional Review Actions</Text>
                            <Text style={styles.summarySuggestions}>Automated Analysis Metrics:</Text>
                            {insightsList.map((insight, idx) => (
                                <Text key={idx} style={styles.suggestionItem} numberOfLines={2}>• {insight}</Text>
                            ))}
                        </View>
                    </View>

                </ScrollView>

                <View style={styles.bottomTabs}>
                    <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/(teacher)/home')}>
                        <Image source={require('../../assets/images/Home.png')} style={styles.tabIcon} />
                        <Text style={styles.tabText}>Home</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.tabItem}>
                        <Image source={require('../../assets/images/LeaderboardB.png')} style={styles.tabIconActive} />
                        <Text style={styles.tabTextActive}>Leaderboard</Text>
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
    loadingContainer: { flex: 1, justifyContent: 'center' },
    mainScroll: { paddingTop: 110, paddingBottom: 110 },
    headerWrapper: { backgroundColor: 'rgba(243, 240, 233, 0.9)', zIndex: 1000, position: 'absolute', top: 0, width: '100%', paddingBottom: 10, borderBottomWidth: 0.5, borderColor: 'rgba(0,0,0,0.05)' },
    topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: Platform.OS === 'android' ? 10 : 0 },
    iconCircle: { backgroundColor: 'white', width: 45, height: 45, borderRadius: 22.5, justifyContent: 'center', alignItems: 'center', elevation: 4 },
    portalBadgeContainer: { backgroundColor: '#FFFFFF', height: 45, borderRadius: 25, width: width * 0.55, justifyContent: 'center', alignItems: 'center', elevation: 4 },
    portalBadgeText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 13, color: '#00E5FF', letterSpacing: 1 },
    
    rankGoalsCard: {
        backgroundColor: 'white', marginHorizontal: 20, marginTop: 20, padding: 15,
        borderRadius: 20, borderWidth: 1.5, borderColor: '#000',
    },
    cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 5 },
    cardHeaderTitle: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 15, fontStyle: 'italic', flex: 1 },
    userIdBadge: { backgroundColor: '#E0E0E0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
    userIdText: { fontSize: 10, fontFamily: 'BalsamiqSans_700Bold', color: '#333' },
    statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
    statLabel: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14 },
    rankHighlight: { backgroundColor: '#00E5FF', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
    rankHighlightText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 14, color: 'white' },
    goalText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, marginTop: 15, fontStyle: 'italic' },
    
    sectionTitle: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 24, marginHorizontal: 20, marginTop: 25, textDecorationLine: 'underline' },
    leaderboardMainCard: {
        backgroundColor: 'white', marginHorizontal: 20, marginTop: 15, padding: 20,
        borderRadius: 24, borderWidth: 1.5, borderColor: '#000', height: 380,
    },
    leaderboardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    medalIcon: { width: 30, height: 30, marginRight: 10 },
    leaderboardTitle: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 16 },
    listContainer: { flex: 1, flexDirection: 'row' },
    customScrollTrack: {
        width: 6,
        backgroundColor: '#F0F0F0',
        borderRadius: 3,
        marginLeft: 10,
        height: '100%',
    },
    customScrollThumb: {
        width: 6,
        backgroundColor: '#00E5FF', 
        borderRadius: 3,
    },
    leaderboardRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
    rowRank: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 20, width: 50 },
    rowName: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, flex: 1.1 },
    rowGrade: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, color: '#666', fontStyle: 'italic', flex: 0.9, textAlign: 'right', paddingRight: 10 },
    verticalDivider: { width: 1, height: '100%', backgroundColor: '#000' },
    rowPoints: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, width: 60, textAlign: 'right' },
    
    summaryCard: {
        backgroundColor: 'white', marginHorizontal: 20, marginTop: 20,
        borderRadius: 24, borderWidth: 1.5, borderColor: '#000', flexDirection: 'row',
        minHeight: 140, overflow: 'hidden',
    },
    cyanRankBox: { backgroundColor: '#4FC3F7', width: 95, justifyContent: 'center', alignItems: 'center', borderRightWidth: 1.5, padding: 5 },
    velocityIndicatorSubtext: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 10, textAlign: 'center', marginTop: 4, color: '#000', textTransform: 'uppercase' },
    summaryContent: { flex: 1, padding: 12, justifyContent: 'center' },
    summaryTeamName: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 14 },
    summarySuggestions: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 11, marginTop: 2, fontStyle: 'italic', color: '#333' },
    suggestionItem: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 11, marginLeft: 2, color: '#555', marginTop: 4, lineHeight: 14 },
    
    bottomTabs: { position: 'absolute', bottom: 0, flexDirection: 'row', backgroundColor: '#FFFFFF', height: 90, width: '100%', justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderColor: '#EEEEEE', paddingBottom: 15 },
    tabItem: { alignItems: 'center', marginHorizontal: 40 },
    tabIcon: { width: 26, height: 26, tintColor: '#A0A0A0' },
    tabIconActive: { width: 30, height: 30 },
    tabText: { fontSize: 11, color: '#A0A0A0', marginTop: 5, fontFamily: 'BalsamiqSans_400Regular' },
    tabTextActive: { fontSize: 11, color: '#00E5FF', marginTop: 5, fontFamily: 'BalsamiqSans_700Bold' },
});