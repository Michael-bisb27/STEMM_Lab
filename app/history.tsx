import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
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

import { getAuth } from 'firebase/auth';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    orderBy,
    query,
    where
} from 'firebase/firestore';
import { db_cloud } from '../services/firebase_config';

import { themes } from '../theme/theme';
import { useTheme } from '../theme/theme_context';

const { width } = Dimensions.get('window');

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const IMAGE_MAP: { [key: string]: any } = {
    'Parachute': require('../assets/images/parachute_snippet.png'),
    'Sound': require('../assets/images/sound_snippet.png'),
    'Fan': require('../assets/images/fan_snippet.png'),
    'Earthquake': require('../assets/images/earthquake_snippet.png'),
    'Human': require('../assets/images/human_snippet.png'),
    'Reaction': require('../assets/images/reaction_snippet.png'),
    'Breathing': require('../assets/images/breathing_snippet.png'),
    'Default': require('../assets/images/reaction_snippet.png'),
};

// ─── Per-screen content ───────────────────────────────────────────────────────

export default function ActivityScreen() {
    const router = useRouter();

    const { isDarkMode } = useTheme();
    const currentTheme = isDarkMode ? themes.dark : themes.light;

    const [userData, setUserData] = useState<any>(null);
    const [attempts, setAttempts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        const auth = getAuth();
        const user = auth.currentUser;
        if (!user) return;

        let unsubscribeAttempts: () => void;

        const syncData = async () => {
            try {
                const studentDoc = await getDoc(doc(db_cloud, "MS_Student", user.uid));
                if (!isMounted) return;

                if (studentDoc.exists()) {
                    const sData = studentDoc.data();
                    let teamName = "No Team";
                    let discriminator = "0000";

                    if (sData.teamID) {
                        const teamDoc = await getDoc(doc(db_cloud, "MS_Team", sData.teamID));
                        if (teamDoc.exists() && isMounted) {
                            const tData = teamDoc.data();
                            teamName = tData.teamName;
                            discriminator = tData.teamDiscriminator || "0000";
                        }

                        const q = query(
                            collection(db_cloud, "FC_Attempt"),
                            where("TeamID", "==", sData.teamID),
                            orderBy("attemptAt", "desc")
                        );

                        // real-time subscriber for specific team's attempt rows
                        unsubscribeAttempts = onSnapshot(q, async (snapshot) => {
                            try {
                                const attemptList = await Promise.all(
                                    snapshot.docs.map(async (d) => {
                                        const attemptData = d.data();
                                        const attemptId = d.id;

                                        // sequential sub-fetches to map activity name & details
                                        const actDoc = await getDoc(doc(db_cloud, "MS_Activity", attemptData.ActivityID));
                                        const actData = actDoc.exists() ? actDoc.data() : { activityName: "Unknown Activity", subjectArea: "General" };

                                        const scoringQuery = query(
                                            collection(db_cloud, "FC_Scoring_Result"),
                                            where("AttemptID", "==", attemptId)
                                        );
                                        const scoringSnapshot = await getDocs(scoringQuery);
                                        
                                        let scoringData = {
                                            accuracyScore: 0,
                                            workScore: 0,
                                            pointsEarned: 0,
                                        };

                                        if (!scoringSnapshot.empty) {
                                            const sData = scoringSnapshot.docs[0].data();
                                            scoringData = {
                                                accuracyScore: sData.accuracyScore ?? 0,
                                                workScore: sData.workScore ?? 0,
                                                pointsEarned: sData.pointsEarned ?? 0,
                                            };
                                        }

                                        return {
                                            id: attemptId,
                                            ...attemptData,
                                            activityName: actData.activityName,
                                            subjectArea: actData.subjectArea,
                                            ...scoringData
                                        };
                                    })
                                );

                                if (isMounted) {
                                    setAttempts(attemptList);
                                    setLoading(false);
                                }
                            } catch (err) {
                                console.error("Error formatting snapshot maps:", err);
                            }
                        });
                    } else {
                        if (isMounted) setLoading(false);
                    }

                    if (isMounted) {
                        setUserData({
                            name: sData.studentName,
                            grade: sData.gradeLevel,
                            teamName: teamName,
                            teamDiscriminator: discriminator
                        });
                    }
                }
            } catch (error) {
                console.error("History Sync Error:", error);
                if (isMounted) setLoading(false);
            }
        };

        syncData();
        
        return () => {
            isMounted = false;
            if (unsubscribeAttempts) unsubscribeAttempts();
        };
    }, []);

    const toggleExpand = (id: string) => {
        // trigger spring transition on layout bounding changes
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpandedId(expandedId === id ? null : id);
    };

    const getSnippetImage = (name: string) => {
        const key = Object.keys(IMAGE_MAP).find(k => name.includes(k));
        return key ? IMAGE_MAP[key] : IMAGE_MAP['Default'];
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
                        <TouchableOpacity style={[styles.iconCircle, styles.activeIconCircle]}>
                            <Ionicons name="timer-outline" size={24} color="#00E5FF" />
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            </View>

            <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.mainScroll}>

                    <View style={styles.titleContainer}>
                        <Text style={[styles.sectionTitle, { color: currentTheme.textColor }]}>Activity Log</Text>
                        <View style={[styles.titleUnderline, { backgroundColor: currentTheme.textColor }]} />
                    </View>

                    <View style={styles.listContainer}>
                        {attempts.length > 0 ? (
                            attempts.map((item) => {
                                const isExpanded = expandedId === item.id;
                                const date = item.attemptAt?.toDate()?.toLocaleDateString() || "Recent";

                                return (
                                    <TouchableOpacity 
                                        key={item.id} 
                                        activeOpacity={0.9} 
                                        onPress={() => toggleExpand(item.id)}
                                        style={styles.activityCard}
                                    >
                                        <View style={styles.cardContent}>
                                            <View style={styles.imageContainer}>
                                                <Image 
                                                    source={getSnippetImage(item.activityName)} 
                                                    style={styles.snippetImage} 
                                                    resizeMode="contain" 
                                                />
                                            </View>
                                            
                                            <View style={styles.textContainer}>
                                                <Text style={styles.categoryText}>{item.subjectArea}</Text>
                                                <Text style={styles.challengeTitle}>{item.activityName}</Text>
                                                <Text style={styles.detailsText}>+{item.pointsEarned || 0} pts | {date}</Text>
                                            </View>

                                            <View style={[styles.goButton, isExpanded && { transform: [{ rotate: '90deg' }] }]}>
                                                <Image source={require('../assets/images/Go.png')} style={styles.goIcon} />
                                            </View>
                                        </View>

                                        {isExpanded && (
                                            <View style={styles.expandedSection}>
                                                <View style={styles.divider} />
                                                <Text style={styles.statsHeader}>Attempt Results:</Text>
                                                
                                                <Text style={styles.progressLabel}>Accuracy (Score: {item.accuracyScore}/100)</Text>
                                                <View style={styles.miniProgressBar}>
                                                    <View style={[styles.miniProgressFill, { width: `${Math.min(item.accuracyScore || 0, 100)}%` }]} />
                                                </View>

                                                <Text style={styles.progressLabel}>Work (Score: {item.workScore}/100)</Text>
                                                <View style={styles.miniProgressBar}>
                                                    <View style={[styles.miniProgressFill, { width: `${Math.min(item.workScore || 0, 100)}%` }]} />
                                                </View>
                                            </View>
                                        )}
                                    </TouchableOpacity>
                                );
                            })
                        ) : (
                            <View style={styles.emptyContainer}>
                                <Text style={[styles.emptyText, { color: currentTheme.textColor }]}>No activities done yet</Text>
                            </View>
                        )}
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
    loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    
    headerWrapper: { backgroundColor: 'rgba(243, 240, 233, 0.8)', zIndex: 1000, position: 'absolute', top: 0, width: '100%', paddingBottom: 10, borderBottomWidth: 0.5, borderColor: 'rgba(0,0,0,0.05)' },
    topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: Platform.OS === 'android' ? 10 : 0 },
    iconCircle: { backgroundColor: 'white', width: 45, height: 45, borderRadius: 22.5, justifyContent: 'center', alignItems: 'center', elevation: 4 },
    activeIconCircle: { borderWidth: 2, borderColor: '#00E5FF' }, 

    userInfoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 15, marginBottom: 10 },
    welcomeLabel: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14 },
    userName: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 16 },
    gradeContainer: { alignItems: 'flex-end', justifyContent: 'center' },
    idBadge: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 10, color: '#666', backgroundColor: '#E0E0E0', paddingHorizontal: 6, borderRadius: 8 },
    gradeText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, marginTop: 2 },

    titleContainer: { marginHorizontal: 20, marginTop: 20, marginBottom: 20, alignSelf: 'flex-start' },
    sectionTitle: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 24 },
    titleUnderline: { height: 2, width: '100%', marginTop: -2 },
    
    listContainer: { paddingHorizontal: 20 },
    activityCard: { backgroundColor: 'white', borderRadius: 24, borderWidth: 1.5, borderColor: '#000', padding: 15, marginBottom: 15, elevation: 3 },
    cardContent: { flexDirection: 'row', alignItems: 'center' },
    imageContainer: { width: 80, height: 60, justifyContent: 'center', alignItems: 'center' },
    snippetImage: { width: '100%', height: '100%' },
    textContainer: { flex: 1, marginLeft: 15 },
    categoryText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, fontStyle: 'italic', color: '#666' },
    challengeTitle: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 15, color: '#000', marginVertical: 2 },
    detailsText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, color: '#000' },
    goButton: { padding: 5 },
    goIcon: { width: 24, height: 24 },

    expandedSection: { marginTop: 15, paddingHorizontal: 5 },
    divider: { height: 1, backgroundColor: '#EEE', marginBottom: 15 },
    statsHeader: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 14, marginBottom: 10 },
    progressLabel: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, marginBottom: 5, fontStyle: 'italic' },
    miniProgressBar: { height: 10, backgroundColor: '#F0F0F0', borderRadius: 5, marginBottom: 12, borderWidth: 0.5, borderColor: '#CCC' },
    miniProgressFill: { height: '100%', backgroundColor: '#00E5FF', borderRadius: 5 },

    emptyContainer: { alignItems: 'center', marginTop: 50 },
    emptyText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 16 },

    bottomTabs: { position: 'absolute', bottom: 0, flexDirection: 'row', backgroundColor: '#FFFFFF', height: 90, width: '100%', justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderColor: '#EEEEEE', paddingBottom: 15 },
    tabItem: { alignItems: 'center', marginHorizontal: 40 },
    tabIcon: { width: 26, height: 26, tintColor: '#A0A0A0' },
    tabText: { fontSize: 11, color: '#A0A0A0', marginTop: 5, fontFamily: 'BalsamiqSans_400Regular' },
});