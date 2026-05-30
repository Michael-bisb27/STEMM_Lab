import {
    BalsamiqSans_400Regular,
    BalsamiqSans_700Bold,
    useFonts,
} from '@expo-google-fonts/balsamiq-sans';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
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
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// --- FIREBASE IMPORTS ---
import { collection, doc, getDoc, getDocs, query, setDoc, Timestamp, where } from 'firebase/firestore';
import { db_cloud } from '../../services/firebase_config';

// --- THEME IMPORTS ---
import { themes } from '../../theme/theme';
import { useTheme } from '../../theme/theme_context';

const { width, height } = Dimensions.get('window');

const challengeSnippets: Record<string, any> = {
    'Qvn4OR5l7pf9pCXB2pkq': require('../../assets/images/parachute_snippet.png'),
    'eng1': require('../../assets/images/parachute_snippet.png'),
    'eng2': require('../../assets/images/sound_snippet.png'),
    'eng3': require('../../assets/images/fan_snippet.png'),
    'eng4': require('../../assets/images/earthquake_snippet.png'),
    'heal1': require('../../assets/images/human_snippet.png'),
    'heal2': require('../../assets/images/reaction_snippet.png'),
    'heal3': require('../../assets/images/breathing_snippet.png'),
};

export default function GradeSubmissionScreen() {
    const router = useRouter();
    const { attemptId } = useLocalSearchParams();
    const [fontsLoaded] = useFonts({ BalsamiqSans_400Regular, BalsamiqSans_700Bold });

    // --- CONSUME GLOBAL THEME CONTEXT ---
    const { isDarkMode } = useTheme();

    // --- RESOLVE ACTIVE CONFIG FROM THEME ---
    const currentTheme = isDarkMode ? themes.dark : themes.light;

    // --- DATA STATES ---
    const [loading, setLoading] = useState<boolean>(true);
    const [submitting, setSubmitting] = useState<boolean>(false);
    const [attempt, setAttempt] = useState<any>(null);
    const [team, setTeam] = useState<any>(null);
    
    // --- INPUT FORM STATES ---
    const [accuracyScore, setAccuracyScore] = useState<string>('');
    const [workScore, setWorkScore] = useState<string>('');
    const [teacherPin, setTeacherPin] = useState<string>(''); 

    // --- OVERLAY INTERACTIVE PREVIEW MODAL STATES ---
    const [isPreviewVisible, setIsPreviewVisible] = useState<boolean>(false);
    const [selectedImageUrl, setSelectedImageUrl] = useState<string>('');

    // --- 1. RELATIONAL FIREBASE DATA FETCH ---
    useEffect(() => {
        if (!attemptId) return;

        const fetchSubmissionData = async () => {
            try {
                setLoading(true);
                const attemptRef = doc(db_cloud, "FC_Attempt", attemptId as string);
                const attemptSnap = await getDoc(attemptRef);

                if (attemptSnap.exists()) {
                    const attemptData = attemptSnap.data();
                    setAttempt(attemptData);

                    if (attemptData.TeamID) {
                        const teamRef = doc(db_cloud, "MS_Team", attemptData.TeamID);
                        const teamSnap = await getDoc(teamRef);
                        if (teamSnap.exists()) {
                            setTeam(teamSnap.data());
                        }
                    }

                    // Pull existing evaluation data if this item has already been scored
                    const scoringResultCollection = collection(db_cloud, "FC_Scoring_Result");
                    const existingScoreQuery = query(scoringResultCollection, where("AttemptID", "==", attemptId));
                    const scoringSnapshot = await getDocs(existingScoreQuery);

                    if (!scoringSnapshot.empty) {
                        const scoreData = scoringSnapshot.docs[0].data();
                        if (scoreData.accuracyScore !== undefined) setAccuracyScore(scoreData.accuracyScore.toString());
                        if (scoreData.workScore !== undefined) setWorkScore(scoreData.workScore.toString());
                    }
                } else {
                    Alert.alert("Error", "The requested experiment submission record could not be found.");
                    router.back();
                }
            } catch (error) {
                console.error("Error reading evaluation profiles:", error);
                Alert.alert("Connection Failure", "Could not stream record from Firestore cloud schema.");
            } finally {
                setLoading(false);
            }
        };

        fetchSubmissionData();
    }, [attemptId]);

    // --- 2. EVALUATION FORM HANDLER ---
    const handleSubmitGrade = async () => {
        const accNum = parseInt(accuracyScore, 10);
        const workNum = parseInt(workScore, 10);
        const cleanedPin = teacherPin.trim();

        if (isNaN(accNum) || isNaN(workNum)) {
            Alert.alert("Incomplete Form", "Please fill in evaluation metrics before calculating scores.");
            return;
        }

        if (accNum < 0 || accNum > 50 || workNum < 0 || workNum > 50) {
            Alert.alert("Out of Bounds", "Accuracy and Execution scores must each be marked on a spectrum scale from 0 to 50.");
            return;
        }

        if (!cleanedPin) {
            Alert.alert("Security Verification Required", "Please fill in your valid Teacher PIN code to sign off on this grade.");
            return;
        }

        try {
            setSubmitting(true);

            // Verify Teacher PIN Identity
            const teacherRef = collection(db_cloud, "MS_Teacher");
            const pinQuery = query(teacherRef, where("teacherPin", "==", cleanedPin));
            const teacherSnapshot = await getDocs(pinQuery);

            if (teacherSnapshot.empty) {
                Alert.alert("Authorization Denied", "The entered Teacher PIN is unrecognized. Verification rejected.");
                setSubmitting(false);
                return;
            }

            const teacherDoc = teacherSnapshot.docs[0];

            // Compute current straightforward attempt score (0-50 Accuracy + 0-50 Work = Max 100)
            const currentTrialScore = accNum + workNum;

            // Find the EXISTING score record generated by the student submission
            const scoringResultCollection = collection(db_cloud, "FC_Scoring_Result");
            const existingScoreQuery = query(scoringResultCollection, where("AttemptID", "==", attemptId));
            const scoringSnapshot = await getDocs(existingScoreQuery);

            let targetDocRef;

            if (!scoringSnapshot.empty) {
                targetDocRef = doc(db_cloud, "FC_Scoring_Result", scoringSnapshot.docs[0].id);
            } else {
                targetDocRef = doc(collection(db_cloud, "FC_Scoring_Result"));
            }
            
            // Save this specific trial's result parameters safely
            await setDoc(targetDocRef, {
                AttemptID: attemptId,
                TeamID: attempt?.TeamID || "",
                ActivityID: attempt?.ActivityID || "unknown_activity",
                trialNumber: attempt?.trialNumber || 1,
                accuracyScore: accNum,
                finishedAt: Timestamp.now(),
                pointsEarned: currentTrialScore, 
                teacherID: teacherDoc.id, 
                workScore: workNum
            }, { merge: true });

            // --- RE-COUNT TOTALS FRESH FOR THE TEAM (Best-Effort Across 7 Activities + Option B Total Graded Attempts) ---
            if (attempt?.TeamID) {
                const allTeamScoresQuery = query(scoringResultCollection, where("TeamID", "==", attempt.TeamID));
                const allScoresSnapshot = await getDocs(allTeamScoresQuery);
                
                // Track absolute total graded attempts submitted by this team
                const totalAttemptsCount = allScoresSnapshot.size;

                // Isolate the highest score found for each unique activity
                const bestScoresPerActivity: Record<string, number> = {};

                allScoresSnapshot.forEach((scoreDoc) => {
                    const scoreData = scoreDoc.data();
                    const activityId = scoreData.ActivityID || "unknown_activity";
                    const points = scoreData.pointsEarned || 0;

                    if (!bestScoresPerActivity[activityId] || points > bestScoresPerActivity[activityId]) {
                        bestScoresPerActivity[activityId] = points;
                    }
                });

                // Sum up unique top scores together
                let finalLeaderboardScore = 0;
                Object.values(bestScoresPerActivity).forEach((bestScore) => {
                    finalLeaderboardScore += bestScore;
                });

                // Overwrite master team record metrics cleanly without increment drift errors
                const teamRef = doc(db_cloud, "MS_Team", attempt.TeamID);
                await setDoc(teamRef, {
                    teamScore: finalLeaderboardScore,
                    totalAttempts: totalAttemptsCount
                }, { merge: true });
            }

            Alert.alert("Success!", "Leaderboard score calculated and updated seamlessly.", [
                { text: "Dismiss", onPress: () => router.replace('/(teacher)/home') }
            ]);
        } catch (error) {
            console.error("Firestore update transaction exception:", error);
            Alert.alert("Save Error", "Failed to compile data updates onto the document reference.");
        } finally {
            setSubmitting(false);
        }
    };

    const getResolvedActivityName = (id: string) => {
        if (id === "Qvn4OR5l7pf9pCXB2pkq" || id === "eng1") return "Parachute Drop Challenge";
        if (id === "eng2") return "Sound Pollution Hunter";
        if (id === "eng3") return "Hand Fan Engineering";
        if (id === "eng4") return "Earthquake Resistant Design";
        if (id === "heal1") return "Human Performance Analysis";
        if (id === "heal3") return "Breathing Pace Trainer";
        return "STEMM Science Lab Assessment";
    };

    const handleOpenPreview = (url: string) => {
        setSelectedImageUrl(url);
        setIsPreviewVisible(true);
    };

    if (!fontsLoaded || loading) {
        return (
            <View style={[styles.loadingContainer, { backgroundColor: isDarkMode ? '#121212' : '#F3F0E9' }]}>
                <ActivityIndicator size="large" color="#00E5FF" />
                <Text style={[styles.loadingText, { color: currentTheme.textColor }]}>Streaming Submission Assets...</Text>
            </View>
        );
    }

    const resolvedImage = challengeSnippets[attempt?.ActivityID] || require('../../assets/images/parachute_snippet.png');

    return (
        <ImageBackground source={currentTheme.backgroundImage} style={styles.background}>
            <Stack.Screen options={{ headerShown: false }} />

            {/* --- FIXED TOP HEADER MENU BANNER --- */}
            <View style={styles.headerWrapper}>
                <SafeAreaView edges={['top']}>
                    <View style={styles.topBar}>
                        <TouchableOpacity style={styles.iconCircle} onPress={() => router.back()}>
                            <Ionicons name="arrow-back-outline" size={24} color="#666" />
                        </TouchableOpacity>

                        <View style={styles.portalBadgeContainer}>
                            <Text style={styles.portalBadgeText}>EVALUATION PORTAL</Text>
                        </View>

                        <View style={[styles.iconCircle, { opacity: 0 }]}>
                            <Ionicons name="lock-closed-outline" size={24} color="#666" />
                        </View>
                    </View>
                </SafeAreaView>
            </View>

            <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
                <ScrollView 
                    showsVerticalScrollIndicator={false} 
                    contentContainerStyle={styles.mainScroll}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* --- STUDENT TELEMETRY PROFILE HEADER --- */}
                    <View style={styles.whiteCard}>
                        <View style={styles.challengeMetaBlockRow}>
                            <Image source={resolvedImage} style={styles.snippetPreviewThumb} resizeMode="contain" />
                            <View style={styles.textMetadataColumn}>
                                <Text style={styles.activityTitleHeader}>{getResolvedActivityName(attempt?.ActivityID)}</Text>
                                <Text style={styles.teamDescriptorTag}>Group: {team?.teamName || "Syncing Team..."} • Trial #{attempt?.trialNumber || 1}</Text>
                                <Text style={styles.sectorBadgeText}>Sector Level: {team?.category || "General"}</Text>
                            </View>
                        </View>

                        <View style={styles.dividerDivider} />

                        {/* --- STUDENT TEXT REFLECTION FIELD DISPLAY --- */}
                        <Text style={styles.fieldBlockLabel}>💡 Team Observations & Reflections:</Text>
                        <View style={styles.reflectionContainerBox}>
                            <Text style={styles.reflectionTextBody}>
                                {attempt?.studentReflection ? `"${attempt.studentReflection}"` : "No descriptive logs typed by student for this run instance."}
                            </Text>
                        </View>

                        {/* --- EXPLOITS FILE PHOTO PREVIEW GRID --- */}
                        {attempt?.VideoURL && attempt.VideoURL.length > 0 ? (
                            <View style={styles.mediaGalleryWrapper}>
                                <Text style={styles.fieldBlockLabel}>🖼️ Captured Media Proof Logs ({attempt.VideoURL.length}):</Text>
                                <Text style={styles.helperSubtitleText}>*Tap a thumbnail photo block below to expand full-screen view</Text>
                                
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaFilmStripRow}>
                                    {attempt.VideoURL.map((url: string, idx: number) => (
                                        <TouchableOpacity 
                                            key={idx}
                                            onPress={() => handleOpenPreview(url)}
                                            activeOpacity={0.9}
                                            style={styles.imageTapTarget}
                                        >
                                            <Image 
                                                source={{ uri: url }} 
                                                style={styles.mediaGalleryPhotoItem} 
                                                resizeMode="cover"
                                            />
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        ) : null}
                    </View>

                    {/* --- CONSOLE INTERFACE SCORING SLOTS CONTROL CARD --- */}
                    <View style={styles.trialIndicatorBadge}>
                        <Ionicons name="flask-outline" size={16} color="#FFF" />
                        <Text style={styles.trialIndicatorText}>EVALUATING TRIAL RUN NUMBER: #{attempt?.trialNumber || 1}</Text>
                    </View>
                    
                    <Text style={[styles.sectionTitleHeader, { color: currentTheme.textColor }]}>📝 Performance Review Matrix</Text>
                    <View style={styles.whiteCard}>
                        
                        {/* Input Block: Calibration / Accuracy */}
                        <View style={styles.scoringInputContainer}>
                            <View style={styles.scoreLabelMetaBlock}>
                                <Text style={styles.scoringLabelHeader}>Target Accuracy Score</Text>
                                <Text style={styles.scoringSubtitleLabel}>Precision verification performance metric (0 - 50 max)</Text>
                            </View>
                            <TextInput 
                                style={styles.scoreNumericalInput}
                                placeholder="0"
                                placeholderTextColor="#9E9E9E"
                                keyboardType="number-pad"
                                maxLength={2}
                                value={accuracyScore}
                                onChangeText={setAccuracyScore}
                            />
                        </View>

                        <View style={styles.dividerDivider} />

                        {/* Input Block: Execution / Documentation */}
                        <View style={styles.scoringInputContainer}>
                            <View style={styles.scoreLabelMetaBlock}>
                                <Text style={styles.scoringLabelHeader}>Execution Workflow Score</Text>
                                <Text style={styles.scoringSubtitleLabel}>Methodology tracking structural assembly quality (0 - 50 max)</Text>
                            </View>
                            <TextInput 
                                style={styles.scoreNumericalInput}
                                placeholder="0"
                                placeholderTextColor="#9E9E9E"
                                keyboardType="number-pad"
                                maxLength={2}
                                value={workScore}
                                onChangeText={setWorkScore}
                            />
                        </View>

                        <View style={styles.dividerDivider} />

                        {/* Input Block: Teacher PIN Security Authorization */}
                        <View style={styles.scoringInputContainer}>
                            <View style={styles.scoreLabelMetaBlock}>
                                <Text style={styles.scoringLabelHeader}>Teacher Verification PIN</Text>
                                <Text style={styles.scoringSubtitleLabel}>Input your designated teacher code profile authorization</Text>
                            </View>
                            <TextInput 
                                style={styles.scoreNumericalInput}
                                placeholder="••••"
                                placeholderTextColor="#9E9E9E"
                                secureTextEntry={true}
                                autoCapitalize="none"
                                autoComplete="off"
                                autoCorrect={false}
                                maxLength={6}
                                value={teacherPin}
                                onChangeText={setTeacherPin}
                            />
                        </View>

                        {/* SUBMISSION PROCESSING BUTTON */}
                        <TouchableOpacity 
                            style={[styles.publishMetricsButton, submitting && styles.buttonActionDisabled]}
                            onPress={handleSubmitGrade}
                            disabled={submitting}
                            activeOpacity={0.8}
                        >
                            {submitting ? (
                                <ActivityIndicator color="#000" />
                            ) : (
                                <>
                                    <Ionicons name="cloud-upload-outline" size={20} color="#000" />
                                    <Text style={styles.publishMetricsButtonText}>Update Grade</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </ScrollView>

                {/* --- NAVIGATION FOOTER tabs --- */}
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

            {/* --- IMAGE OVERLAY PREVIEW MODAL --- */}
            <Modal
                visible={isPreviewVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setIsPreviewVisible(false)}
            >
                <View style={styles.modalOverlayContainer}>
                    <TouchableOpacity 
                        style={styles.modalDismissTrigger} 
                        onPress={() => setIsPreviewVisible(false)}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="close-circle-sharp" size={42} color="#FFFFFF" />
                        <Text style={styles.dismissLabelText}>Close Preview</Text>
                    </TouchableOpacity>

                    {selectedImageUrl ? (
                        <Image 
                            source={{ uri: selectedImageUrl }} 
                            style={styles.fullscreenRenderView} 
                            resizeMode="contain"
                        />
                    ) : null}
                </View>
            </Modal>

        </ImageBackground>
    );
}

const styles = StyleSheet.create({
    background: { flex: 1 },
    safeArea: { flex: 1 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 15, marginTop: 12 },
    mainScroll: { 
        paddingTop: Platform.OS === 'ios' ? 120 : 135, 
        paddingBottom: 110 
    },
    headerWrapper: { backgroundColor: 'rgba(243, 240, 233, 0.9)', zIndex: 1000, position: 'absolute', top: 0, width: '100%', paddingBottom: 10, borderBottomWidth: 0.5, borderColor: 'rgba(0,0,0,0.05)' },
    topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: Platform.OS === 'android' ? 10 : 0 },
    iconCircle: { backgroundColor: 'white', width: 45, height: 45, borderRadius: 22.5, justifyContent: 'center', alignItems: 'center', elevation: 4 },
    portalBadgeContainer: { backgroundColor: '#FFFFFF', height: 45, borderRadius: 25, width: width * 0.55, justifyContent: 'center', alignItems: 'center', elevation: 4 },
    portalBadgeText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 13, color: '#00E5FF', letterSpacing: 1 },
    whiteCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 22,
        marginHorizontal: 20,
        marginBottom: 15,
        padding: 20,
        borderWidth: 1.5,
        borderColor: '#000000',
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
    },
    challengeMetaBlockRow: { flexDirection: 'row', alignItems: 'center', gap: 15 },
    snippetPreviewThumb: { width: 65, height: 65 },
    textMetadataColumn: { flex: 1, gap: 2 },
    activityTitleHeader: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 18, color: '#000' },
    teamDescriptorTag: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 13, color: '#444' },
    sectorBadgeText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 12, color: '#00E5FF', marginTop: 2 },
    dividerDivider: { height: 1, backgroundColor: '#EAEAEA', width: '100%', marginVertical: 16 },
    fieldBlockLabel: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 14, color: '#000', marginBottom: 8 },
    reflectionContainerBox: { backgroundColor: '#F9F9F9', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#EEEEEE' },
    reflectionTextBody: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 13, color: '#444', fontStyle: 'italic', lineHeight: 18 },
    mediaGalleryWrapper: { marginTop: 15 },
    helperSubtitleText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 11, color: '#888', fontStyle: 'italic', marginBottom: 12 },
    mediaFilmStripRow: { gap: 14, paddingRight: 10, paddingVertical: 4 },
    imageTapTarget: {
        width: 110,
        height: 110,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: '#000000',
        overflow: 'hidden',
        backgroundColor: '#E0E0E0'
    },
    mediaGalleryPhotoItem: { width: '100%', height: '100%' },
    trialIndicatorBadge: {
        backgroundColor: '#000000',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 8,
        borderRadius: 12,
        marginHorizontal: 20,
        marginBottom: 5,
        borderWidth: 1.5,
        borderColor: '#00E5FF'
    },
    trialIndicatorText: {
        fontFamily: 'BalsamiqSans_700Bold',
        fontSize: 12,
        color: '#FFFFFF',
        letterSpacing: 0.5
    },
    sectionTitleHeader: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 16, marginHorizontal: 20, marginTop: 10, marginBottom: 10 },
    scoringInputContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 15 },
    scoreLabelMetaBlock: { flex: 0.78 },
    scoringLabelHeader: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 15, color: '#000' },
    scoringSubtitleLabel: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 11, color: '#777', marginTop: 2, lineHeight: 14 },
    scoreNumericalInput: { flex: 0.22, backgroundColor: '#F5F5F5', borderRadius: 12, borderWidth: 1.5, borderColor: '#000', height: 50, textAlign: 'center', fontSize: 18, fontFamily: 'BalsamiqSans_700Bold', color: '#000' },
    publishMetricsButton: { backgroundColor: '#00E5FF', flexDirection: 'row', height: 50, borderRadius: 25, borderWidth: 1.5, borderColor: '#000', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 24, elevation: 3 },
    buttonActionDisabled: { opacity: 0.5 },
    publishMetricsButtonText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 15, color: '#000' },
    bottomTabs: { position: 'absolute', bottom: 0, flexDirection: 'row', backgroundColor: '#FFFFFF', height: 90, width: '100%', justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderColor: '#EEEEEE', paddingBottom: 15 },
    tabItem: { alignItems: 'center', marginHorizontal: 40 },
    tabIcon: { width: 26, height: 26, tintColor: '#A0A0A0' },
    tabIconActive: { width: 30, height: 30 },
    tabText: { fontSize: 11, color: '#A0A0A0', marginTop: 5, fontFamily: 'BalsamiqSans_400Regular' },
    tabTextActive: { fontSize: 11, color: '#00E5FF', marginTop: 5, fontFamily: 'BalsamiqSans_700Bold' },
    modalOverlayContainer: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.95)', justifyContent: 'center', alignItems: 'center' },
    modalDismissTrigger: { position: 'absolute', top: Platform.OS === 'ios' ? 60 : 40, right: 25, alignItems: 'center', zIndex: 2000 },
    dismissLabelText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 10, color: '#FFFFFF', marginTop: 2 },
    fullscreenRenderView: { width: width * 0.92, height: height * 0.72 },
});