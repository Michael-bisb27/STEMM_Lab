import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
// import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
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
// import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getAuth } from 'firebase/auth';
import {
    addDoc,
    collection,
    doc,
    getDoc,
    getDocs,
    increment,
    onSnapshot,
    query,
    Timestamp,
    updateDoc,
    where
} from 'firebase/firestore';
import { db_cloud } from '../services/firebase_config';

import { themes } from '../theme/theme';
import { useTheme } from '../theme/theme_context';

const { width } = Dimensions.get('window');

// Production safety toggle constant
// const adUnitId = __DEV__ ? TestIds.BANNER : 'ca-app-pub-6302758879500147/5037542552';

let globalHasShownWelcome = false;

const engineeringChallenges = [
    { id: 'eng1', title: 'Parachute Drop...', fullTitle: 'Parachute Drop Challenge', image: require('../assets/images/parachute_snippet.png'), route: '/parachute' },
    { id: 'eng2', title: 'Sound Pollutio...', fullTitle: 'Sound Pollution Hunter', image: require('../assets/images/sound_snippet.png'), route: '/sound' },
    { id: 'eng3', title: 'Hand Fan...', fullTitle: 'Hand Fan Engineering', image: require('../assets/images/fan_snippet.png'), route: '/fan' },
    { id: 'eng4', title: 'Earthquake res...', fullTitle: 'Earthquake Resistant Structure', image: require('../assets/images/earthquake_snippet.png'), route: '/earthquake' },
];

const healthChallenges = [
    { id: 'heal1', title: 'Human Perfor...', fullTitle: 'Human Performance Lab', image: require('../assets/images/human_snippet.png'), route: '/human' },
    { id: 'heal2', title: 'Reaction board...', fullTitle: 'Reaction Board Challenge', image: require('../assets/images/reaction_snippet.png'), route: '/reaction' },
    { id: 'heal3', title: 'Breathing pac...', fullTitle: 'Breathing Pace Trainer', image: require('../assets/images/breathing_snippet.png'), route: '/breathing' },
];

const ChallengeCard = React.memo(({ item, isExpanded, onExpand, router }: any) => {
    const scaleValue = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.spring(scaleValue, { 
            toValue: isExpanded ? 1.15 : 1, 
            useNativeDriver: true, 
            friction: 4 
        }).start();
    }, [isExpanded]);

    const handleCardPress = () => {
        if (isExpanded) {
            if (item.route) {
                router.push(item.route);
            } else {
                Alert.alert("Coming Soon", `${item.fullTitle} will be available soon!`);
            }
        } else {
            onExpand(item.id);
        }
    };

    return (
        <TouchableOpacity 
            testID={`challenge-card-${item.id}`}
            activeOpacity={0.9} 
            onPress={handleCardPress}
        >
            <Animated.View style={[
                styles.cardContainer, 
                { transform: [{ scale: scaleValue }], zIndex: isExpanded ? 100 : 1 },
                isExpanded && styles.cardContainerActive
            ]}>
                <View style={styles.cardImageWrapper}>
                    <Image 
                        source={item.image} 
                        style={[styles.challengeImage, isExpanded && { height: '110%', width: '110%' }]} 
                        resizeMode="contain" 
                    />
                </View>
                <View style={styles.cardFooter}>
                    <Text style={styles.cardTitle} numberOfLines={isExpanded ? 0 : 1}>
                        {isExpanded ? item.fullTitle : item.title}
                    </Text>
                    
                    {isExpanded ? (
                        <View style={styles.startBadge}>
                            <Text style={styles.startBadgeText}>START</Text>
                        </View>
                    ) : (
                        <Image source={require('../assets/images/Go.png')} style={styles.goIcon} />
                    )}
                </View>
            </Animated.View>
        </TouchableOpacity>
    );
});

// ─── Per-screen content ───────────────────────────────────────────────────────

export default function HomeScreen() {
    const router = useRouter();

    const { isDarkMode } = useTheme();
    const currentTheme = isDarkMode ? themes.dark : themes.light;

    const [userData, setUserData] = useState<any>(null);
    const [trivia, setTrivia] = useState<any>(null);
    const [hasAnswered, setHasAnswered] = useState(false);
    const [answerStatus, setAnswerStatus] = useState<boolean | null>(null);
    const [loading, setLoading] = useState(true);
    const [timeLeft, setTimeLeft] = useState("");
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [attemptedCount, setAttemptedCount] = useState(0);
    // const [isAdReady, setIsAdReady] = useState(false);

    const notificationY = useRef(new Animated.Value(-120)).current;
    const notificationOpacity = useRef(new Animated.Value(0)).current;

    // Combined tracking prompt handling and layout buffer sequence
    // useEffect(() => {
    //     const requestTracking = async () => {
    //         if (Platform.OS === 'ios') {
    //             setTimeout(async () => {
    //                 try {
    //                     const { status } = await requestTrackingPermissionsAsync();
    //                     console.log('App Tracking Transparency Status:', status);
    //                 } catch (error) {
    //                     console.error('Error requesting App Tracking Transparency context:', error);
    //                 } finally {
    //                     // Safely activate the ad component structure after native layout settles
    //                     setIsAdReady(true);
    //                 }
    //             }, 1500);
    //         } else {
    //             setIsAdReady(true);
    //         }
    //     };
    //     requestTracking();
    // }, []);

    useEffect(() => {
        const fetchFullProfile = async () => {
            try {
                const auth = getAuth();
                const user = auth.currentUser;

                if (user) {
                    const studentDocRef = doc(db_cloud, "MS_Student", user.uid);
                    const studentSnap = await getDoc(studentDocRef);

                    if (studentSnap.exists()) {
                        const sData = studentSnap.data();
                        let teamName = "No Team";
                        let discriminator = "0000";

                        // resolve linked team identifier profile metadata dynamically
                        if (sData.teamID && sData.teamID !== "WAITING_FOR_ASSIGNMENT") {
                            const teamDocRef = doc(db_cloud, "MS_Team", sData.teamID);
                            const teamSnap = await getDoc(teamDocRef);
                            
                            if (teamSnap.exists()) {
                                const tData = teamSnap.data();
                                teamName = tData.teamName;
                                discriminator = tData.teamDiscriminator || "0000";
                            }
                        }

                        setUserData({
                            uid: user.uid,
                            name: sData.studentName || "Student",
                            teamId: sData.teamID || null,
                            teamName: teamName,
                            grade: sData.gradeLevel || "--",
                            teamDiscriminator: discriminator
                        });
                    }
                }
            } catch (error) {
                console.error("Error fetching home profile data:", error);
            }
        };

        fetchFullProfile();
    }, []);

    useEffect(() => {
        if (!userData?.teamId) return;

        let unsubscribe: (() => void) | undefined;

        const fetchTrivia = async () => {
            const triviaQuery = query(
                collection(db_cloud, "MS_Trivia"),
                where("startDate", "<=", Timestamp.now())
            );

            unsubscribe = onSnapshot(triviaQuery, async (snapshot) => {
                let activeDoc = null;
                const now = new Date();
                
                // loop snapshot rows to filter active timeframe window on client side
                for (const docSnap of snapshot.docs) {
                    const data = docSnap.data();
                    if (now <= data.endDate.toDate()) {
                        activeDoc = { id: docSnap.id, ...data };
                        break;
                    }
                }

                if (activeDoc) {
                    const submissionQuery = query(
                        collection(db_cloud, "FC_Trivia_Submission"),
                        where("TriviaID", "==", activeDoc.id),
                        where("TeamID", "==", userData.teamId)
                    );
                    const subSnapshot = await getDocs(submissionQuery);
                    
                    if (!subSnapshot.empty) {
                        setHasAnswered(true);
                        setAnswerStatus(subSnapshot.docs[0].data().IsCorrect);
                    } else {
                        setHasAnswered(false);
                        setAnswerStatus(null);
                    }
                    setTrivia(activeDoc);
                } else {
                    setTrivia(null);
                }
                setLoading(false);
            });
        };

        fetchTrivia();

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [userData]);

    useEffect(() => {
        if (!trivia || hasAnswered) return;

        const updateTimer = () => {
            const now = new Date().getTime();
            const end = trivia.endDate.toDate().getTime();
            const diff = end - now;

            if (diff <= 0) {
                setTrivia(null);
                return;
            }

            const hours = Math.floor(diff / (1000 * 60 * 60));
            const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            setTimeLeft(hours > 0 ? `${hours}h ${mins}m left !` : `${mins}m left !`);
        };

        const interval = setInterval(updateTimer, 60000);
        updateTimer();
        return () => clearInterval(interval);
    }, [trivia, hasAnswered]);

    useEffect(() => {
        if (!userData) return;

        const attemptsQuery = userData.teamId
            ? query(collection(db_cloud, "FC_Attempt"), where("TeamID", "==", userData.teamId))
            : query(collection(db_cloud, "FC_Attempt"), where("createdBy", "==", userData.uid));

        const unsubscribe = onSnapshot(attemptsQuery, (snapshot) => {
            const uniqueActivities = new Set<string>();

            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                if (data.ActivityID) {
                    uniqueActivities.add(data.ActivityID);
                }
            });

            // cap total unique task completions to fixed progress ceiling
            setAttemptedCount(Math.min(uniqueActivities.size, 7));
        }, (error) => {
            console.error("Error monitoring activity progress: ", error);
        });

        return unsubscribe;
    }, [userData?.teamId, userData?.uid]);

    useEffect(() => {
        if (userData && !globalHasShownWelcome) {
            globalHasShownWelcome = true;

            // slide toast overlay down using parallel native transforms
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
    }, [userData]);

    const handleAnswer = async (selectedOption: string) => {
        if (!trivia || !userData) return;

        const isCorrect = selectedOption === trivia.CorrectOption;

        try {
            await addDoc(collection(db_cloud, "FC_Trivia_Submission"), {
                TriviaID: trivia.id,
                TeamID: userData.teamId,
                StudentID: userData.uid,
                SelectedOption: selectedOption,
                IsCorrect: isCorrect,
                SubmittedAt: Timestamp.now()
            });

            // increment global scoreboard atomically on firestore side
            if (isCorrect && userData.teamId) {
                const teamRef = doc(db_cloud, "MS_Team", userData.teamId);
                await updateDoc(teamRef, {
                    TotalPoints: increment(trivia.Points || 5)
                });
                Alert.alert("Correct!", `Your team earned ${trivia.Points} points!`);
            } else if (!isCorrect) {
                Alert.alert("Incorrect", `The correct answer was ${trivia.CorrectOption}.`);
            }

            setAnswerStatus(isCorrect);
            setHasAnswered(true);
        } catch (error) {
            console.error("Submission Error:", error);
            Alert.alert("Error", "Could not submit answer.");
        }
    };

    return (
        <ImageBackground source={currentTheme.backgroundImage} style={styles.background}>
            <Animated.View style={[
                styles.notificationToast, 
                { transform: [{ translateY: notificationY }], opacity: notificationOpacity }
            ]}>
                <View style={styles.notificationBadge}>
                    <Ionicons name="sparkles" size={16} color="#FFF" />
                    <Text style={styles.notificationBadgeText}>NEW</Text>
                </View>
                <Text style={styles.notificationText}>Welcome back! Let's complete more activities today! 🚀</Text>
            </Animated.View>
            
            <View style={styles.headerWrapper}>
                <SafeAreaView edges={['top']}>
                    <View style={styles.topBar}>
                        <TouchableOpacity 
                            style={styles.iconCircle} 
                            onPress={() => router.push('../settings')}
                        >
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
                <ScrollView 
                    testID="homeScrollView"
                    showsVerticalScrollIndicator={false} 
                    contentContainerStyle={styles.mainScroll}
                    keyboardShouldPersistTaps="handled"
                >
                    
                    <View style={styles.userInfoRow}>
                        <View>
                            <Text style={[styles.welcomeText, { color: currentTheme.textColor }]}>Welcome,</Text>
                            <Text style={[styles.userName, { color: currentTheme.textColor }]}>
                                {userData 
                                    ? `${userData.name} (${userData.teamName})` 
                                    : "Syncing..."}
                            </Text>
                        </View>
                        <View style={styles.gradeContainer}>
                            <Text style={styles.userId}>ID: #{userData?.teamDiscriminator || "0000"}</Text>
                            <Text style={[styles.gradeText, { color: currentTheme.textColor }]}>Grade {userData?.grade || "--"}</Text>
                        </View>
                    </View>

                    <Text style={[styles.sectionTitle, { color: currentTheme.textColor }]}>Trivia Challenge</Text>
                    {loading ? (
                        <ActivityIndicator size="large" color="#4FC3F7" style={{ marginTop: 20 }} />
                    ) : (trivia && !hasAnswered) ? (
                        <View style={styles.triviaCard}>
                            <View style={styles.triviaHeader}>
                                <View style={styles.triviaTitleRow}>
                                    <Ionicons name="timer-outline" size={18} color="black" />
                                    <Text style={styles.triviaTitle}> Trivia Question ({trivia.Points} points)</Text>
                                </View>
                                <Text style={styles.timeLeft}>{timeLeft}</Text>
                            </View>
                            <Text style={styles.questionText}>{trivia.QuestionText}</Text>
                            <Text style={styles.clickChoice}>*Click on the choice</Text>
                            <View style={styles.optionsGrid}>
                                {['A', 'B', 'C', 'D'].map((opt) => (
                                    <TouchableOpacity key={opt} style={styles.optionItem} onPress={() => handleAnswer(opt)}>
                                        <Text style={styles.optionText}>{opt}. {trivia[`Option${opt}`]}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    ) : (
                        <View style={styles.triviaCard}>
                            <Text style={styles.completedText}>
                                {hasAnswered 
                                    ? (answerStatus 
                                        ? "✅ Brilliant! That was correct." 
                                        : "❌ Incorrect. Keep trying tomorrow!") 
                                    : "No new Trivia available."
                                }
                            </Text>
                            {hasAnswered && <Text style={styles.subCompletedText}>See you at the next challenge!</Text>}
                        </View>
                    )}

                    <Text style={[styles.sectionTitle, { color: currentTheme.textColor }]}>Engineering Challenges</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScrollContent}>
                        {engineeringChallenges.map(item => (
                            <ChallengeCard key={item.id} item={item} isExpanded={expandedId === item.id} onExpand={setExpandedId} router={router} />
                        ))}
                    </ScrollView>

                    <Text style={[styles.sectionTitle, { color: currentTheme.textColor }]}>Health & Medical Challenges</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScrollContent}>
                        {healthChallenges.map(item => (
                            <ChallengeCard key={item.id} item={item} isExpanded={expandedId === item.id} onExpand={setExpandedId} router={router} />
                        ))}
                    </ScrollView>

                    {/* {isAdReady && (
                        <View style={styles.adContainer}>
                            <BannerAd
                                unitId={adUnitId}
                                size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
                                requestOptions={{
                                    requestNonPersonalizedAdsOnly: true,
                                }}
                                onAdFailedToLoad={(error) => console.log('Ad banner load failure: ', error)}
                            />
                        </View>
                    )} */}
                </ScrollView>

                <View style={styles.bottomTabs}>
                    <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/')}>
                        <Image source={require('../assets/images/HomeB.png')} style={styles.tabIconActive} />
                        <Text style={styles.tabTextActive}>Home</Text>
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
    headerWrapper: { backgroundColor: 'rgba(243, 240, 233, 0.8)', zIndex: 1000, position: 'absolute', top: 0, width: '100%', paddingBottom: 10, borderBottomWidth: 0.5, borderColor: 'rgba(0,0,0,0.05)' },
    topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: Platform.OS === 'android' ? 10 : 0 },
    iconCircle: { backgroundColor: 'white', width: 45, height: 45, borderRadius: 22.5, justifyContent: 'center', alignItems: 'center', elevation: 4 },
    progressContainer: { backgroundColor: 'white', height: 45, borderRadius: 25, width: width * 0.6, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 5, elevation: 4 },
    progressBarBase: { flex: 1, height: 35, backgroundColor: '#F0F0F0', borderRadius: 20, overflow: 'hidden', justifyContent: 'center' },
    progressFill: { height: '100%', backgroundColor: '#4FC3F7', borderRadius: 20 },
    progressText: { position: 'absolute', width: '100%', textAlign: 'center', fontFamily: 'BalsamiqSans_400Regular', fontSize: 16 },
    userInfoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 15, marginBottom: 10 },
    welcomeText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 16 },
    userName: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 16 },
    gradeContainer: { alignItems: 'flex-end', justifyContent: 'center' },
    userId: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, color: '#666' },
    gradeText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14 },
    sectionTitle: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 20, marginHorizontal: 20, marginTop: 20, marginBottom: 15 },
    horizontalScrollContent: { paddingLeft: 20, paddingRight: 5, paddingVertical: 20 },
    cardContainer: { backgroundColor: 'white', width: 160, height: 160, borderRadius: 20, marginRight: 15, borderWidth: 1.5, borderColor: '#000', padding: 12, justifyContent: 'space-between' },
    cardContainerActive: { borderColor: '#4FC3F7', shadowColor: '#4FC3F7', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 6 },
    cardImageWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    challengeImage: { width: '100%', height: '100%' },
    cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 },
    cardTitle: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, flex: 1 },
    goIcon: { width: 24, height: 24 },
    startBadge: { backgroundColor: '#4FC3F7', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3 },
    startBadgeText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 10, color: '#FFF' },
    triviaCard: { backgroundColor: 'white', margin: 20, paddingVertical: 15, paddingHorizontal: 25, borderRadius: 20, borderWidth: 1.5, borderColor: '#000' },
    triviaHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    triviaTitleRow: { flexDirection: 'row', alignItems: 'center' },
    triviaTitle: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14 },
    timeLeft: { color: '#FF5252', fontSize: 12, fontFamily: 'BalsamiqSans_400Regular' },
    questionText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 15, marginBottom: 8 },
    completedText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 14, textAlign: 'center', color: '#333' },
    subCompletedText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, textAlign: 'center', color: '#666', marginTop: 4 },
    clickChoice: { fontSize: 10, fontStyle: 'italic', textAlign: 'right', marginBottom: 12, color: '#888' },
    optionsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    optionItem: { width: '48%', marginBottom: 12 },
    optionText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14 },
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
    // adContainer: { alignItems: 'center', marginVertical: 10, width: '100%' },
});