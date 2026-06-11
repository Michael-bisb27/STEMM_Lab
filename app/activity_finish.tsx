import {
    BalsamiqSans_400Regular,
    BalsamiqSans_700Bold,
    useFonts,
} from '@expo-google-fonts/balsamiq-sans';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    ImageBackground,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    UIManager,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// --- FIREBASE IMPORTS ---
import { getAuth } from 'firebase/auth';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    orderBy,
    query,
    updateDoc,
    where
} from 'firebase/firestore';
import { db_cloud } from '../services/firebase_config';

// --- LOCAL SQLITE UTILITIES DAO IMPORTS ---
import {
    breathingOps,
    earthquakeOps,
    fanOps,
    humanOps,
    parachuteOps,
    reactionOps,
    soundOps
} from '../database/db';

// --- THEME IMPORTS ---
import { themes } from '../theme/theme';
import { useTheme } from '../theme/theme_context';

const { width } = Dimensions.get('window');

// --- CLOUDINARY CONFIGURATION CREDENTIALS ---
const CLOUDINARY_CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

// --- PROFANITY BLOCKLIST ---
const BANNED_WORDS = [
    'fuck', 'shit', 'asshole', 'bitch', 'dick',
    'anjing', 'babi', 'bangsat', 'tolol', 'goblok', 'kontol', 'memek'
];

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Helper to map Activity Names to Assets
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

export default function ActivityFinishScreen() {
    const router = useRouter();
    const [fontsLoaded] = useFonts({ BalsamiqSans_400Regular, BalsamiqSans_700Bold });

    // --- CONSUME GLOBAL THEME CONTEXT ---
    const { isDarkMode } = useTheme();
    const currentTheme = isDarkMode ? themes.dark : themes.light;

    // --- EXTRACT DYNAMIC SEARCH ROUTE PARAMS ---
    const { activityId, activityTitle, attemptId: routeAttemptId } = useLocalSearchParams<{ 
        activityId: string; 
        activityTitle: string;
        attemptId?: string;
    }>();

    // --- STATES ---
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [attemptId, setAttemptId] = useState<string | null>(null); 
    const [imageUris, setImageUris] = useState<string[]>([]); 
    const [reflectionText, setReflectionText] = useState('');
    const [activityDiscussion, setActivityDiscussion] = useState('');

    // --- SCIENTIST DASHBOARD METRICS STATE MATRIX ---
    const [cachedData, setCachedData] = useState<any[]>([]);

    // --- 1. DYNAMIC SESSION RETRIEVAL WITH DEFENSIVE GUARD ---
    useEffect(() => {
        const fetchCurrentSessionAttempt = async () => {
            if (!activityId) {
                console.warn("No dynamic activityId provided in routing parameters.");
                Alert.alert(
                    "Missing Session Data",
                    "Could not detect an active assignment module. Returning to Home.",
                    [{ text: "OK", onPress: () => router.push('/home') }]
                );
                setLoading(false);
                return;
            }

            try {
                const activityDocRef = doc(db_cloud, "MS_Activity", activityId);
                const activitySnap = await getDoc(activityDocRef);
                if (activitySnap.exists()) {
                    setActivityDiscussion(activitySnap.data().activityDiscussion || 'No discussion prompt provided for this module.');
                }

                let activeSessionId = routeAttemptId || null;

                if (!activeSessionId) {
                    const auth = getAuth();
                    const user = auth.currentUser;

                    if (user) {
                        const studentSnap = await getDoc(doc(db_cloud, "MS_Student", user.uid));
                        if (studentSnap.exists()) {
                            const teamId = studentSnap.data().teamID;
                            if (teamId) {
                                const q = query(
                                    collection(db_cloud, "FC_Attempt"),
                                    where("TeamID", "==", teamId),
                                    where("ActivityID", "==", activityId),
                                    orderBy("attemptAt", "desc"),
                                    limit(1)
                                );
                                const querySnapshot = await getDocs(q);
                                if (!querySnapshot.empty) {
                                    activeSessionId = querySnapshot.docs[0].id;
                                }
                            }
                        }
                    }
                }

                if (activeSessionId) {
                    setAttemptId(activeSessionId);
                    loadLocalTelemetryMetrics(activeSessionId);
                } else {
                    console.warn("No tracking active attempt document found for this session.");
                }

            } catch (error) {
                console.error("Error fetching live session variables:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchCurrentSessionAttempt();
    }, [activityId, routeAttemptId]);

    // --- INTERMEDIATE OFFLINE CACHE DATA ROUTER ---
    const loadLocalTelemetryMetrics = (targetId: string) => {
        try {
            let data: any[] = [];
            if (activityId === "Qvn4OR5l7pf9pCXB2pkq" || activityTitle?.includes("Parachute")) {
                data = parachuteOps.getTrialsByAttempt(targetId);
            } else if (activityId === "0clUTH6JFi8V2uuexn9k" || activityTitle?.includes("Sound")) {
                data = soundOps.getTrialsByAttempt(targetId);
            } else if (activityId === "9IWijzqyiclKNayBpFZ1" || activityTitle?.includes("Fan")) {
                data = fanOps.getTrialsByAttempt(targetId);
            } else if (activityId === "9QUEyTVnLCsuXBgWcCQs" || activityTitle?.includes("Earthquake")) {
                data = earthquakeOps.getTrialsByAttempt(targetId);
            } else if (activityId === "KXCsIyy3aDNUJWtcmbgy" || activityTitle?.includes("Human")) {
                data = humanOps.getTrialsByAttempt(targetId);
            } else if (activityId === "SD3h6F4QSqYpwFZiTI1Z" || activityTitle?.includes("Reaction")) {
                data = reactionOps.getTrialsByAttempt(targetId);
            } else if (activityId === "U2gkCfB3uS6Z8jjmo3Kp" || activityTitle?.includes("Breathing")) {
                data = breathingOps.getTrialsByAttempt(targetId);
            }
            setCachedData(data);
            console.log(`Successfully mapped ${data.length} telemetry data units from local disk vectors.`);
        } catch (e) {
            console.error("Failed to map tracking metrics array parameters:", e);
        }
    };

    // --- MULTI-IMAGE PICKER HANDLER ---
    const handlePickImages = async () => {
        if (imageUris.length >= 3) {
            Alert.alert("Limit Reached", "You can upload a maximum of 3 pictures total.");
            return;
        }

        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert("Permission Denied", "We need camera roll access to upload your sketches.");
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsMultipleSelection: true, 
            quality: 0.8,
        });

        if (!result.canceled) {
            const selectedUris = result.assets.map(asset => asset.uri);
            const combinedUris = [...imageUris, ...selectedUris];
            
            if (combinedUris.length > 3) {
                Alert.alert("Notice", "Only the first 3 images were added due to the layout maximum limit.");
                setImageUris(combinedUris.slice(0, 3));
            } else {
                setImageUris(combinedUris);
            }
        }
    };

    const handleRemoveImage = (indexToRemove: number) => {
        setImageUris(prev => prev.filter((_, index) => index !== indexToRemove));
    };

    // --- VALIDATION ENGINE ---
    const validateReflection = (text: string): boolean => {
        const cleanedText = text.trim().toLowerCase();

        if (cleanedText.length < 15) {
            Alert.alert("Reflection Too Short", "Please write a slightly more detailed explanation of what you learned (minimum 15 characters).");
            return false;
        }

        if (cleanedText.length > 500) {
            Alert.alert("Reflection Too Long", "Your reflection exceeds the 500-character limit. Please shorten it.");
            return false;
        }

        const containsBannedWord = BANNED_WORDS.some(word => {
            const regex = new RegExp(`\\b${word}\\b`, 'i');
            return regex.test(cleanedText);
        });

        if (containsBannedWord) {
            Alert.alert("Appropriate Language Required", "Your submission contains words that violate the school community guidelines. Please revise your entry.");
            return false;
        }

        return true;
    };

    // --- CLOUDINARY SUBMIT LOGIC ---
    const handleFinish = async () => {
        if (!attemptId) {
            return Alert.alert("Session Error", "Active tracking record missing. Cannot attach files to this experiment track.");
        }
        if (imageUris.length === 0) {
            return Alert.alert("Required", "Please upload at least one experiment sketch before finishing.");
        }
        if (!validateReflection(reflectionText)) {
            return; 
        }

        setIsSubmitting(true);
        const cloudUrls: string[] = [];

        try {
            console.log(`Processing multi-upload sequential pipeline to Cloudinary via HTTP Basic Auth...`);
            const basicAuthToken = btoa(`${CLOUDINARY_API_KEY}:${CLOUDINARY_API_SECRET}`);

            for (let i = 0; i < imageUris.length; i++) {
                const currentUri = imageUris[i];
                const formData = new FormData();
                
                formData.append('file', {
                    uri: currentUri,
                    type: 'image/jpeg',
                    name: `sketch_${attemptId}_slot${i}.jpg`,
                } as any);

                const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
                    method: 'POST',
                    body: formData,
                    headers: {
                        'Authorization': `Basic ${basicAuthToken}`,
                        'Content-Type': 'multipart/form-data',
                    },
                });

                const resultJson = await response.json();
                
                if (resultJson.secure_url) {
                    cloudUrls.push(resultJson.secure_url);
                } else {
                    console.error("Cloudinary Engine Rejected File:", resultJson);
                    throw new Error(resultJson.error?.message || "Cloudinary upload verification crash.");
                }
            }

            const targetAttemptRef = doc(db_cloud, "FC_Attempt", attemptId);
            await updateDoc(targetAttemptRef, {
                VideoURL: cloudUrls, 
                studentReflection: reflectionText.trim()
            });

            Alert.alert(
                "Submission Status", 
                "Will be submitted for grading, please wait for the result to come out",
                [{ text: "OK", onPress: () => router.push('/home') }]
            );

        } catch (error: any) {
            console.error("Pipeline failure updates dropped:", error);
            Alert.alert("Upload Error", error.message || "Failed to transfer image files or write data onto document reference logs.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- DYNAMIC DASHBOARD COMPONENT MATRIX GENERATOR ---
    const renderScientistDashboard = () => {
        if (!cachedData || cachedData.length === 0) {
            return (
                <View style={styles.dashboardPlaceholder}>
                    <Ionicons name="stats-chart-outline" size={18} color="#777" />
                    <Text style={styles.placeholderText}>Waiting for local laboratory data logs...</Text>
                </View>
            );
        }

        const isParachute = activityId === "Qvn4OR5l7pf9pCXB2pkq" || activityTitle?.includes("Parachute");
        const isSound = activityId === "0clUTH6JFi8V2uuexn9k" || activityTitle?.includes("Sound");
        const isFan = activityId === "9IWijzqyiclKNayBpFZ1" || activityTitle?.includes("Fan");
        const isEarthquake = activityId === "9QUEyTVnLCsuXBgWcCQs" || activityTitle?.includes("Earthquake");
        const isHuman = activityId === "KXCsIyy3aDNUJWtcmbgy" || activityTitle?.includes("Human");
        const isReaction = activityId === "SD3h6F4QSqYpwFZiTI1Z" || activityTitle?.includes("Reaction");
        const isBreathing = activityId === "U2gkCfB3uS6Z8jjmo3Kp" || activityTitle?.includes("Breathing");

        return (
            <View style={styles.dashboardCard}>
                <View style={styles.dashboardHeader}>
                    <Ionicons name="analytics-sharp" size={16} color="#00E5FF" />
                    <Text style={styles.dashboardTitle}>SCIENTIST'S ANALYTICS WORKSPACE</Text>
                </View>

                {/* ACTIVITY 1 SUMMARY CARD */}
                {isParachute && (
                    <View style={styles.tableBlock}>
                        <View style={[styles.tableRow, styles.thBg]}>
                            <Text style={[styles.tdText, styles.thFont, { flex: 1.5 }]}>Phase Condition</Text>
                            <Text style={[styles.tdText, styles.thFont]}>Avg Airtime</Text>
                            <Text style={[styles.tdText, styles.thFont]}>Peak G-Impact</Text>
                        </View>
                        {[1, 2, 3].map(p => {
                            const runs = cachedData.filter(r => r.action_phase === p);
                            const avgAir = runs.length ? runs.reduce((s, r) => s + r.air_time, 0) / runs.length : 0;
                            const maxG = runs.length ? Math.max(...runs.map(r => r.peak_g_force)) : 0;
                            const labels = ["1: No Canopy Baseline", "2: 4-Corner Matrix", "3: Custom Engineered"];
                            return (
                                <View key={p} style={styles.tableRow}>
                                    <Text style={[styles.tdText, styles.boldTd, { flex: 1.5 }]}>{labels[p-1]}</Text>
                                    <Text style={styles.tdText}>{avgAir.toFixed(2)}s</Text>
                                    <Text style={[styles.tdText, maxG > 15 ? styles.redAlert : styles.greenText]}>{maxG.toFixed(1)}g</Text>
                                </View>
                            );
                        })}
                    </View>
                )}

                {/* ACTIVITY 2 SUMMARY CARD */}
                {isSound && (
                    <View style={styles.tableBlock}>
                        <View style={[styles.tableRow, styles.thBg]}>
                            <Text style={[styles.tdText, styles.thFont]}>Investigator</Text>
                            <Text style={[styles.tdText, styles.thFont, { flex: 1.5 }]}>Acoustic Context</Text>
                            <Text style={[styles.tdText, styles.thFont]}>Peak Vol</Text>
                        </View>
                        {cachedData.map((row, idx) => (
                            <View key={idx} style={styles.tableRow}>
                                <Text style={[styles.tdText, styles.boldTd]}>Student {row.member_number}</Text>
                                <Text style={[styles.tdText, { flex: 1.5, textAlign: 'left', paddingLeft: 10 }]}>
                                    {row.action_phase === 1 ? "Object Dropping STUDY" : row.action_phase === 2 ? "Vocal Levels CHECK" : "Floor Stamping IMPACT"}
                                </Text>
                                <Text style={[styles.tdText, row.peak_db > 85 ? styles.redAlert : styles.blueText]}>{row.peak_db.toFixed(0)} dB</Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* ACTIVITY 3 SUMMARY CARD */}
                {isFan && (
                    <View style={styles.tableBlock}>
                        <View style={[styles.tableRow, styles.thBg]}>
                            <Text style={[styles.tdText, styles.thFont]}>Material Context</Text>
                            <Text style={[styles.tdText, styles.thFont]}>Spacing</Text>
                            <Text style={[styles.tdText, styles.thFont]}>Blade Config</Text>
                            <Text style={[styles.tdText, styles.thFont]}>Sustain</Text>
                        </View>
                        {cachedData.filter(r => r.is_challenge_entry === 0).slice(-3).map((row, idx) => (
                            <View key={idx} style={styles.tableRow}>
                                <Text style={[styles.tdText, styles.boldTd]}>{row.target_material}</Text>
                                <Text style={styles.tdText}>{row.distance_gap}</Text>
                                <Text style={styles.tdText}>Design {row.fan_design}</Text>
                                <Text style={styles.tdText}>{row.fanning_duration}s</Text>
                            </View>
                        ))}
                        {cachedData.some(r => r.is_challenge_entry === 1) && (
                            <View style={styles.bonusPanel}>
                                <Text style={styles.bonusBadgeTitle}>✦ COEFFICIENT STIFFNESS BONUS SUBMISSION</Text>
                                {cachedData.filter(r => r.is_challenge_entry === 1).map((r, i) => (
                                    <Text key={i} style={styles.bonusDataParagraph}>
                                        Rigid Material: <Text style={styles.whiteB}>{r.selected_material_spec}</Text> (k: {r.stiffness_k} N/rad) | Displacement: <Text style={styles.whiteB}>{r.observed_angle}°</Text> | Output Force: <Text style={styles.cyanB}>{r.calculated_force?.toFixed(4)} N</Text>
                                    </Text>
                                ))}
                            </View>
                        )}
                    </View>
                )}

                {/* ACTIVITY 4 SUMMARY CARD */}
                {isEarthquake && (
                    <View style={styles.tableBlock}>
                        <View style={[styles.tableRow, styles.thBg]}>
                            <Text style={[styles.tdText, styles.thFont]}>Investigator</Text>
                            <Text style={[styles.tdText, styles.thFont, { flex: 1.2 }]}>Framework Layout</Text>
                            <Text style={[styles.tdText, styles.thFont]}>Max Shift</Text>
                            <Text style={[styles.tdText, styles.thFont]}>Deflection</Text>
                        </View>
                        {cachedData.slice(-4).map((row, idx) => (
                            <View key={idx} style={styles.tableRow}>
                                <Text style={[styles.tdText, styles.boldTd]}>Student {row.member_number}</Text>
                                <Text style={[styles.tdText, { flex: 1.2, textAlign: 'left', paddingLeft: 8 }]}>Design {row.design_number}</Text>
                                <Text style={styles.tdText}>±{row.peak_displacement}cm</Text>
                                <Text style={[styles.tdText, row.angular_deflection > 15 ? styles.orangeText : styles.greenText]}>{row.angular_deflection}°</Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* ACTIVITY 5 SUMMARY CARD */}
                {isHuman && (
                    <View style={styles.tableBlock}>
                        <View style={[styles.tableRow, styles.thBg]}>
                            <Text style={[styles.tdText, styles.thFont]}>Student</Text>
                            <Text style={[styles.tdText, styles.thFont]}>Stretch Variant</Text>
                            <Text style={[styles.tdText, styles.thFont]}>Hold Duration</Text>
                            <Text style={[styles.tdText, styles.thFont]}>Stabilization</Text>
                        </View>
                        {cachedData.slice(-3).map((row, idx) => (
                            <View key={idx} style={styles.tableRow}>
                                <Text style={[styles.tdText, styles.boldTd]}>Role {row.member_number}</Text>
                                <Text style={styles.tdText}>Layout {row.movement_variant}</Text>
                                <Text style={styles.tdText}>{(row.duration_ms / 1000).toFixed(1)}s</Text>
                                <Text style={styles.tdText}>{row.peak_vibration.toFixed(2)} G</Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* ACTIVITY 6 SUMMARY CARD */}
                {isReaction && (
                    <View style={styles.tableBlock}>
                        <View style={[styles.tableRow, styles.thBg]}>
                            <Text style={[styles.tdText, styles.thFont]}>Investigator</Text>
                            <Text style={[styles.tdText, styles.thFont, { flex: 1.5 }]}>Neuromuscular Track</Text>
                            <Text style={[styles.tdText, styles.thFont]}>Latency</Text>
                        </View>
                        {[1, 2, 3].map(p => {
                            const items = cachedData.filter(r => r.phase_number === p);
                            const avgTime = items.length ? items.reduce((s, r) => s + r.recorded_time, 0) / items.length : 0;
                            const label = p === 1 ? "Dominant Hand Reflex" : p === 2 ? "Non-Dominant Reflex" : "Target Coordinate Trace";
                            return (
                                <View key={p} style={styles.tableRow}>
                                    <Text style={[styles.tdText, styles.boldTd, { flex: 1.5, textAlign: 'left', paddingLeft: 12 }]}>{label}</Text>
                                    <Text style={[styles.tdText, styles.cyanText, { fontFamily: 'BalsamiqSans_700Bold' }]}>{avgTime ? `${avgTime.toFixed(3)}s` : '--'}</Text>
                                </View>
                            );
                        })}
                    </View>
                )}

                {/* ACTIVITY 7 SUMMARY CARD */}
                {isBreathing && (
                    <View style={styles.tableBlock}>
                        <View style={[styles.tableRow, styles.thBg]}>
                            <Text style={[styles.tdText, styles.thFont]}>Investigator</Text>
                            <Text style={[styles.tdText, styles.thFont, { flex: 1.3 }]}>Biometric Context</Text>
                            <Text style={[styles.tdText, styles.thFont]}>Calculated Rate</Text>
                        </View>
                        {cachedData.map((row, idx) => (
                            <View key={idx} style={styles.tableRow}>
                                <Text style={[styles.tdText, styles.boldTd]}>Student {row.member_number}</Text>
                                <Text style={[styles.tdText, { flex: 1.3, textAlign: 'left', paddingLeft: 12 }]}>
                                    {row.phase_number === 1 ? "At Rest Baseline" : row.phase_number === 2 ? "Post-Jogging Stress" : "Post-Star Jumps Peak"}
                                </Text>
                                <Text style={[styles.tdText, styles.greenText, { fontFamily: 'BalsamiqSans_700Bold' }]}>{row.calculated_rpm.toFixed(0)} RPM</Text>
                            </View>
                        ))}
                    </View>
                )}

                <Text style={styles.dbHintText}>* Data parameters isolated successfully inside high-speed local device storage models.</Text>
            </View>
        );
    };

    if (!fontsLoaded || loading) {
        return (
            <View style={[styles.loader, { backgroundColor: isDarkMode ? '#141414' : '#F3F0E9' }]}>
                <ActivityIndicator size="large" color="#00E5FF" />
            </View>
        );
    }

    return (
        <ImageBackground source={currentTheme.backgroundImage} style={styles.background}>
            <Stack.Screen options={{ headerShown: false }} />
            
            {/* --- TOP MENU BAR --- */}
            <View style={styles.headerWrapper}>
                <SafeAreaView edges={['top']}>
                    <View style={styles.topBar}>
                        <View style={styles.iconCircle}><Ionicons name="settings-outline" size={24} color="#666" /></View>
                        <View style={styles.progressContainer}>
                            <View style={styles.progressBarBase}>
                                <View style={[styles.progressFill, { width: '100%' }]} />
                            </View>
                            <Text style={styles.progressText}>Result & Analysis</Text>
                        </View>
                        <View style={styles.iconCircle}><Ionicons name="timer-outline" size={24} color="#666" /></View>
                    </View>
                </SafeAreaView>
            </View>

            <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
                <KeyboardAvoidingView 
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
                    style={styles.keyboardContainer}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 20}
                >
                    <ScrollView 
                        contentContainerStyle={styles.contentContainer} 
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        
                        {/* Header Titles (Dynamic layout text styles applied) */}
                        <View style={styles.titleSection}>
                            <Text style={[styles.subLabel, { color: currentTheme.textColor }]}>Result & Analysis</Text>
                            <Text style={[styles.mainTitle, { color: currentTheme.textColor }]}>{activityTitle || "STEMM Lab Challenge"}</Text>
                            <Text style={[styles.sectionHeader, { color: currentTheme.textColor }]}>Section - Discussion</Text>
                            <Text style={styles.warningLabel}>
                                *Upload your formula working as well. maximum 3 pictures total
                            </Text>
                        </View>

                        {/* --- DISCUSSION MATERIAL BOX --- */}
                        {activityDiscussion ? (
                            <View style={styles.discussionContainer}>
                                <Text style={styles.discussionTitle}>Discussions:</Text>
                                <ScrollView nestedScrollEnabled={true} style={styles.discussionScroll}>
                                    <Text style={styles.discussionText}>{activityDiscussion}</Text>
                                </ScrollView>
                            </View>
                        ) : null}

                        {/* --- SCIENTIST LOCAL TELEMETRY DASHBOARD PANEL CONTAINER --- */}
                        {renderScientistDashboard()}

                        {/* --- GALLERY BOX --- */}
                        <View style={styles.galleryContainer}>
                            <ScrollView 
                                horizontal 
                                showsHorizontalScrollIndicator={false} 
                                contentContainerStyle={[
                                    styles.galleryScroll,
                                    imageUris.length === 0 && styles.galleryCentered 
                                ]}
                            >
                                {imageUris.map((uri, index) => (
                                    <View key={index} style={styles.imageWrapper}>
                                        <Image source={{ uri }} style={styles.previewImage} />
                                        <TouchableOpacity 
                                            style={styles.deleteBadge} 
                                            onPress={() => handleRemoveImage(index)}
                                        >
                                            <Ionicons name="close-circle" size={22} color="#FF5252" />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                                
                                {imageUris.length < 3 && (
                                    <TouchableOpacity style={styles.uploadCard} onPress={handlePickImages} activeOpacity={0.8}>
                                        <View style={styles.uploadInner}>
                                            <Ionicons name="camera-outline" size={32} color="#000" />
                                            <Text style={styles.uploadText}>
                                                {imageUris.length > 0 ? "[Add More]" : "[Upload\nSketches]"}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                )}
                            </ScrollView>
                        </View>

                        {/* --- NOTEBOOK STYLE REFLECTION BOX (Dynamic prompt text applied) --- */}
                        <View style={styles.reflectionSection}>
                            <Text style={[styles.promptText, { color: currentTheme.textColor }]}>What did you learn from this experiment?</Text>
                            
                            <View style={styles.notebookContainer}>
                                <View style={styles.notebookSpines}>
                                    {[...Array(6)].map((_, i) => (
                                        <View key={i} style={styles.spineLoop} />
                                    ))}
                                </View>
                                <View style={styles.notebookPaper}>
                                    <TextInput
                                        style={styles.notebookInput}
                                        multiline
                                        numberOfLines={4}
                                        maxLength={500}
                                        placeholder="Write down your observation notes..."
                                        placeholderTextColor="#999"
                                        value={reflectionText}
                                        onChangeText={setReflectionText}
                                    />
                                </View>
                            </View>
                            <Text style={[styles.charCounter, { color: currentTheme.textColor }]}>{reflectionText.length}/500</Text>
                        </View>

                        {/* --- FINISH ACTION BUTTON --- */}
                        <TouchableOpacity 
                            style={[styles.finishBtn, isSubmitting && { opacity: 0.6 }]} 
                            onPress={handleFinish}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? <ActivityIndicator color="#000" /> : <Text style={styles.finishBtnText}>Finish</Text>}
                        </TouchableOpacity>

                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </ImageBackground>
    );
}

const styles = StyleSheet.create({
    background: { flex: 1 },
    safeArea: { flex: 1 },
    keyboardContainer: { flex: 1, width: '100%' },
    loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    
    headerWrapper: { backgroundColor: 'rgba(243, 240, 233, 0.8)', zIndex: 1000, position: 'absolute', top: 0, width: '100%', paddingBottom: 10, borderBottomWidth: 0.5, borderColor: 'rgba(0,0,0,0.05)' },
    topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: Platform.OS === 'android' ? 10 : 0 },
    iconCircle: { backgroundColor: 'white', width: 45, height: 45, borderRadius: 22.5, justifyContent: 'center', alignItems: 'center', elevation: 4 },
    progressContainer: { backgroundColor: 'white', height: 45, borderRadius: 25, width: width * 0.6, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, elevation: 4 },
    progressBarBase: { flex: 1, height: 35, backgroundColor: '#F0F0F0', borderRadius: 20, overflow: 'hidden', justifyContent: 'center' },
    progressFill: { height: '100%', backgroundColor: '#4FC3F7', borderRadius: 20 },
    progressText: { position: 'absolute', width: '100%', textAlign: 'center', fontFamily: 'BalsamiqSans_400Regular', fontSize: 13 },

    contentContainer: { flexGrow: 1, paddingTop: 125, alignItems: 'center', paddingHorizontal: 25, justifyContent: 'space-between', paddingBottom: 25 },
    titleSection: { alignItems: 'center', width: '100%', zIndex: 5 },
    subLabel: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 13, fontStyle: 'italic' },
    mainTitle: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 18, marginBottom: 2 },
    sectionHeader: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 22, marginVertical: 2 },
    warningLabel: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 11, fontStyle: 'italic', color: '#FF5252', textAlign: 'center', marginTop: 2, paddingHorizontal: 10 },

    discussionContainer: { width: '100%', height:120, borderWidth: 1.5, borderColor: '#000', borderRadius: 12, backgroundColor: '#FFF', padding: 10, marginVertical: 5, zIndex: 5 },
    discussionTitle: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 13, color: '#000', marginBottom: 4 },
    discussionScroll: { flex: 1 },
    discussionText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 13, color: '#333', lineHeight: 17 },

    // --- SCIENTIST LOCAL TELEMETRY DASHBOARD STYLE ARCHITECTURE ---
    dashboardCard: { width: '100%', backgroundColor: '#000000', borderRadius: 14, padding: 12, marginVertical: 6, borderWidth: 1.5, borderColor: '#333', elevation: 4, zIndex: 5 },
    dashboardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    dashboardTitle: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 11, color: '#00E5FF', marginLeft: 6, letterSpacing: 0.5 },
    tableBlock: { width: '100%', backgroundColor: '#111', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#222' },
    tableRow: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#222', alignItems: 'center' },
    thBg: { backgroundColor: '#1A1A1A' },
    tdText: { flex: 1, fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, color: '#EEE', textAlign: 'center' },
    thFont: { fontFamily: 'BalsamiqSans_700Bold', color: '#888', fontSize: 11 },
    boldTd: { textAlign: 'left', fontFamily: 'BalsamiqSans_700Bold', color: '#FFF' },
    redAlert: { color: '#FF5252', fontFamily: 'BalsamiqSans_700Bold' },
    greenText: { color: '#00E676' },
    blueText: { color: '#29B6F6' },
    orangeText: { color: '#FFA726' },
    cyanText: { color: '#00E5FF' },
    dbHintText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 9, fontStyle: 'italic', color: '#666', textAlign: 'center', marginTop: 6 },
    dashboardPlaceholder: { width: '100%', height: 45, borderStyle: 'dashed', borderWidth: 1.5, borderColor: '#777', borderRadius: 10, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', marginVertical: 6, opacity: 0.6 },
    placeholderText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, color: '#555', marginLeft: 6 },
    
    bonusPanel: { backgroundColor: '#141E24', padding: 10, borderTopWidth: 1, borderColor: '#22323D' },
    bonusBadgeTitle: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 10, color: '#FFD700', marginBottom: 4 },
    bonusDataParagraph: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 11, color: '#B0BEC5', lineHeight: 14 },
    whiteB: { color: '#FFF', fontFamily: 'BalsamiqSans_700Bold' },
    cyanB: { color: '#00E5FF', fontFamily: 'BalsamiqSans_700Bold' },

    galleryContainer: { width: '100%', height: 135, marginVertical: 5, zIndex: 5 },
    galleryScroll: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 5, flexGrow: 1 },
    galleryCentered: { justifyContent: 'center' }, 
    imageWrapper: { width: 120, height: 120, marginRight: 15, position: 'relative', borderRadius: 15, borderWidth: 1.5, borderColor: '#000', overflow: 'visible', backgroundColor: '#FFF' },
    previewImage: { width: '100%', height: '100%', resizeMode: 'cover', borderRadius: 13 },
    deleteBadge: { position: 'absolute', top: -8, right: -8, zIndex: 10, backgroundColor: '#FFF', borderRadius: 11 },

    uploadCard: { width: 120, height: 120, borderWidth: 1.5, borderColor: '#000', borderRadius: 15, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', elevation: 2 },
    uploadInner: { alignItems: 'center', padding: 5 },
    uploadText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 11, textAlign: 'center', marginTop: 3, lineHeight: 12 },

    reflectionSection: { width: '100%', alignItems: 'center', marginVertical: 5, zIndex: 5 },
    promptText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 15, marginBottom: 8, textAlign: 'center' },
    notebookContainer: { flexDirection: 'row', width: '100%', height: 110, backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#000', borderRadius: 12, overflow: 'hidden', elevation: 2 },
    notebookSpines: { width: 25, backgroundColor: '#FAFAFA', borderRightWidth: 1, borderColor: '#DDD', justifyContent: 'space-around', alignItems: 'center', paddingVertical: 5 },
    spineLoop: { width: 14, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: '#444', backgroundColor: '#FFF' },
    notebookPaper: { flex: 1, paddingHorizontal: 12, paddingVertical: 8 },
    notebookInput: { flex: 1, fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, textAlignVertical: 'top', color: '#333' },
    charCounter: { width: '100%', textAlign: 'right', fontFamily: 'BalsamiqSans_400Regular', fontSize: 11, marginTop: 4, paddingRight: 5 },

    finishBtn: { backgroundColor: '#4FC3F7', width: '100%', height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#000', marginTop: 10, elevation: 3, zIndex: 5 },
    finishBtnText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 18, color: '#000' },
});