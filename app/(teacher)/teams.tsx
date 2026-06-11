import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { addDoc, collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
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
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db_cloud } from '../../services/firebase_config';
import { themes } from '../../theme/theme';
import { useTheme } from '../../theme/theme_context';

const { width, height } = Dimensions.get('window');

const BANNED_WORDS = ['crap', 'damn', 'hell', 'ass', 'inappropriate1', 'inappropriate2']; 
const MIN_NAME_LENGTH = 3;
const MAX_NAME_LENGTH = 24;
const ALLOWED_CHARS_REGEX = /^[a-zA-Z0-9\s_-]+$/; 

interface TeamItem {
    id: string;
    name: string;
    classSection: string;
    discriminator: string;
    attemptsMade: number; 
    teamScore: number;
}

interface StudentItem {
    id: string;
    createdAt: string;
    gradeLevel: string;
    schoolEmail: string;
    studentName: string;
    teamID: string;
}

// ─── Per-screen content ───────────────────────────────────────────────────────
export default function TeacherTeamsScreen() {
    const router = useRouter();

    const { isDarkMode } = useTheme();
    const currentTheme = isDarkMode ? themes.dark : themes.light;

    const [teams, setTeams] = useState<TeamItem[]>([]);
    const [filteredTeams, setFilteredTeams] = useState<TeamItem[]>([]);
    const [classList, setClassList] = useState<string[]>([]);
    const [selectedClass, setSelectedClass] = useState<string>('All');
    const [loading, setLoading] = useState<boolean>(true);

    const [isSearchModalVisible, setIsSearchModalVisible] = useState<boolean>(false);
    const [students, setStudents] = useState<StudentItem[]>([]);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [editingStudent, setEditingStudent] = useState<StudentItem | null>(null);

    const [editName, setEditName] = useState<string>('');
    const [editEmail, setEditEmail] = useState<string>('');
    const [editGrade, setEditGrade] = useState<string>('');
    const [editTeamID, setEditTeamID] = useState<string>('');

    const [isCreateModalVisible, setIsCreateModalVisible] = useState<boolean>(false);
    const [newTeamName, setNewTeamName] = useState<string>('');
    const [newTeamCategory, setNewTeamCategory] = useState<string>('Primary');

    useEffect(() => {
        let teamsData: any[] = [];
        let attemptsData: any[] = [];
        let teamsLoaded = false;
        let attemptsLoaded = false;

        // wait for both snapshot streams to resolve before merging data metrics
        const combineAndProcessData = () => {
            if (!teamsLoaded || !attemptsLoaded) return;

            const attemptCounts: Record<string, number> = {};
            attemptsData.forEach((attempt) => {
                const teamId = attempt.TeamID;
                if (teamId) {
                    attemptCounts[teamId] = (attemptCounts[teamId] || 0) + 1;
                }
            });

            const uniqueClasses = new Set<string>();
            const fetchedTeams: TeamItem[] = teamsData.map((team) => {
                let section = team.classSection || team.gradeLevel || team.category || "5a";
                const lowerSection = section.toLowerCase();
                
                // standard fallback normalization pattern for legacy category terms
                if (lowerSection === "primary" || lowerSection === "junior high") {
                    section = "5a";
                } else {
                    section = lowerSection;
                }
                
                uniqueClasses.add(section);

                return {
                    id: team.id,
                    name: team.teamName || "Unnamed Team",
                    classSection: section,
                    discriminator: team.teamDiscriminator || "0000",
                    attemptsMade: attemptCounts[team.id] || 0, 
                    teamScore: team.teamScore || 0
                };
            });

            const sortedClasses = Array.from(uniqueClasses).sort();
            setClassList(['All', ...sortedClasses]);
            
            fetchedTeams.sort((a, b) => a.name.localeCompare(b.name));
            setTeams(fetchedTeams);
            setLoading(false);
        };

        const unsubscribeTeams = onSnapshot(collection(db_cloud, "MS_Team"), (snapshot) => {
            teamsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            teamsLoaded = true;
            combineAndProcessData();
        }, (error) => {
            console.error("Error streaming active project groups:", error);
            setLoading(false);
        });

        const unsubscribeAttempts = onSnapshot(collection(db_cloud, "FC_Attempt"), (snapshot) => {
            attemptsData = snapshot.docs.map(doc => doc.data());
            attemptsLoaded = true;
            combineAndProcessData();
        }, (error) => {
            console.error("Error streaming activity attempts:", error);
        });

        return () => {
            unsubscribeTeams();
            unsubscribeAttempts();
        };
    }, []);

    useEffect(() => {
        const unsubscribeStudents = onSnapshot(collection(db_cloud, "MS_Student"), (snapshot) => {
            const fetchedStudents: StudentItem[] = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as StudentItem));
            setStudents(fetchedStudents);
        }, (error) => {
            console.error("Error streaming dynamic roster information:", error);
        });

        return () => unsubscribeStudents();
    }, []);

    useEffect(() => {
        if (selectedClass === 'All') {
            setFilteredTeams(teams);
        } else {
            setFilteredTeams(teams.filter(t => t.classSection === selectedClass));
        }
    }, [selectedClass, teams]);

    const handleOpenEditPanel = (student: StudentItem) => {
        setEditingStudent(student);
        setEditName(student.studentName || '');
        setEditEmail(student.schoolEmail || '');
        setEditGrade(student.gradeLevel || '');
        setEditTeamID(student.teamID || '');
    };

    const handleSaveStudentMutation = async () => {
        if (!editingStudent) return;
        if (!editName.trim() || !editEmail.trim() || !editGrade.trim()) {
            Alert.alert("Missing Fields", "Please make sure name, email, and grade assignments are valid.");
            return;
        }

        try {
            const studentDocRef = doc(db_cloud, "MS_Student", editingStudent.id);
            await updateDoc(studentDocRef, {
                studentName: editName.trim(),
                schoolEmail: editEmail.trim(),
                gradeLevel: editGrade.trim(),
                teamID: editTeamID 
            });

            Alert.alert("Success", `${editName} configuration updated successfully.`);
            setEditingStudent(null);
        } catch (error) {
            console.error("Critical error performing Firestore mutation: ", error);
            Alert.alert("Error", "Could not synchronize record updates to database.");
        }
    };

    const handleCreateTeamSubmit = async () => {
        const cleanedName = newTeamName.trim();
        const cleanedCategory = newTeamCategory.trim();

        if (!cleanedName || !cleanedCategory) {
            Alert.alert("Missing Information", "Please fill out both the Team Name and Category fields.");
            return;
        }

        // apply safety boundaries and character set validation constraints
        if (cleanedName.length < MIN_NAME_LENGTH) {
            Alert.alert("Invalid Name", `Team names must be at least ${MIN_NAME_LENGTH} characters long.`);
            return;
        }
        if (cleanedName.length > MAX_NAME_LENGTH) {
            Alert.alert("Invalid Name", `Team names cannot exceed ${MAX_NAME_LENGTH} characters.`);
            return;
        }

        if (!ALLOWED_CHARS_REGEX.test(cleanedName)) {
            Alert.alert("Invalid Format", "Team names can only contain letters, numbers, spaces, hyphens, and underscores.");
            return;
        }

        // check structural name blocks for filtered profanity strings
        const nameLower = cleanedName.toLowerCase();
        const containsProfanity = BANNED_WORDS.some(badWord => nameLower.includes(badWord.toLowerCase()));
        
        if (containsProfanity) {
            Alert.alert("Content Alert", "This team name contains language or terms restricted by school guidelines. Please choose a different name.");
            return;
        }

        // guard against identical duplicate team profile layouts
        const nameExists = teams.some(t => t.name.toLowerCase() === nameLower);
        if (nameExists) {
            Alert.alert("Duplicate Found", "A team with this configuration layout or identical name already exists.");
            return;
        }

        try {
            const generatedDiscriminator = Math.floor(1000 + Math.random() * 9000).toString();
            
            await addDoc(collection(db_cloud, "MS_Team"), {
                category: cleanedCategory,
                createdAt: new Date().toISOString(),
                createdBy: "2EKqM2ZTFVgm52nYzjEQ3d9IIte2", 
                teamDiscriminator: generatedDiscriminator,
                teamLeader: "2EKqM2ZTFVgm52nYzjEQ3d9IIte2",
                teamName: cleanedName,
                teamScore: 0
            });

            Alert.alert("Success", `Project room "${cleanedName}" created successfully!`);
            setNewTeamName('');
            setIsCreateModalVisible(false);
        } catch (error) {
            console.error("Firestore creation anomaly detected: ", error);
            Alert.alert("Database Error", "Failed to compile and send new cluster profile documents.");
        }
    };

    const filteredStudents = students.filter(student => {
        const query = searchQuery.toLowerCase();
        return (
            (student.studentName || '').toLowerCase().includes(query) ||
            (student.schoolEmail || '').toLowerCase().includes(query) ||
            (student.gradeLevel || '').toLowerCase().includes(query)
        );
    });

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
                        <TouchableOpacity style={styles.iconCircle} onPress={() => router.push('/(teacher)/settings')}>
                            <Ionicons name="settings-outline" size={24} color="#666" />
                        </TouchableOpacity>
                        
                        <View style={styles.portalBadgeContainer}>
                            <Text style={styles.portalBadgeText}>TEACHER CONSOLE</Text>
                        </View>

                        <TouchableOpacity style={styles.iconCircle} onPress={() => setIsSearchModalVisible(true)}>
                            <Ionicons name="people-outline" size={24} color="#00E5FF" />
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            </View>

            <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.mainScroll}>
                    
                    <Text style={[styles.sectionTitle, { color: currentTheme.textColor }]}>Classroom Roster Filters</Text>

                    <ScrollView 
                        horizontal 
                        showsHorizontalScrollIndicator={false} 
                        contentContainerStyle={styles.filterBarScrollTrack}
                    >
                        {classList.map((cls) => {
                            const isSelected = selectedClass === cls;
                            return (
                                <TouchableOpacity
                                    key={cls}
                                    style={[styles.filterChip, isSelected && styles.filterChipActive]}
                                    onPress={() => setSelectedClass(cls)}
                                    activeOpacity={0.8}
                                >
                                    <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                                        {cls === 'All' ? 'All Classes' : `grade ${cls}`}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    <View style={styles.subtitleRowContainer}>
                        <Text style={[styles.sectionSubtitleOverride, { color: currentTheme.textColor }]}>
                            Project Teams ({filteredTeams.length})
                        </Text>
                        <TouchableOpacity 
                            style={styles.headerCreateActionBtn} 
                            onPress={() => setIsCreateModalVisible(true)}
                        >
                            <Ionicons name="add-circle-outline" size={16} color="#000" />
                            <Text style={styles.headerCreateActionBtnText}>Create Team</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.teamsListContainer}>
                        {filteredTeams.length === 0 ? (
                            <View style={styles.emptyContainerCard}>
                                <Ionicons name="alert-circle-outline" size={36} color="#999" />
                                <Text style={styles.emptyContainerText}>No active lab groups match this selector filter criteria.</Text>
                            </View>
                        ) : (
                            filteredTeams.map((item) => (
                                <TouchableOpacity
                                    key={item.id}
                                    style={styles.teamCardWrapper}
                                    activeOpacity={0.9}
                                    onPress={() => router.push({
                                        pathname: '/(teacher)/teams_detail',
                                        params: { teamId: item.id }
                                    })}
                                >
                                    <Image source={require('../../assets/images/User.png')} style={styles.teamAvatarIcon} />
                                    
                                    <View style={styles.teamMetadataBlock}>
                                        <Text style={styles.teamNameText} numberOfLines={1}>{item.name}</Text>
                                        <Text style={styles.teamSubText}>ID Badge: #{item.discriminator} • grade {item.classSection}</Text>
                                        <Text style={styles.teamTelemetryText}>Attempts Made: {item.attemptsMade}</Text>
                                    </View>

                                    <View style={styles.scoreContainerSide}>
                                        <Text style={styles.scoreNumberLabel}>{item.teamScore}</Text>
                                        <Text style={styles.scoreSubLabel}>Rating</Text>
                                        <Ionicons name="chevron-forward" size={18} color="#000" style={styles.arrowIcon} />
                                    </View>
                                </TouchableOpacity>
                            ))
                        )}
                    </View>

                </ScrollView>

                <View style={styles.bottomTabs}>
                    <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/(teacher)/home')}>
                        <Image source={require('../../assets/images/Home.png')} style={styles.tabIcon} />
                        <Text style={styles.tabText}>Home</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/(teacher)/leaderboard')}>
                        <Image source={require('../../assets/images/Leaderboard.png')} style={styles.tabIcon} />
                        <Text style={styles.tabText}>Leaderboard</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.tabItem}>
                        <Image source={require('../../assets/images/MembersB.png')} style={styles.tabIconActive} />
                        <Text style={styles.tabTextActive}>Teams</Text>
                    </TouchableOpacity>
                </View>

            </SafeAreaView>

            <Modal
                animationType="slide"
                transparent={true}
                visible={isSearchModalVisible}
                onRequestClose={() => setIsSearchModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContentCard, { backgroundColor: isDarkMode ? '#1E1E1E' : '#F8F6F0' }]}>
                        
                        <View style={styles.modalHeaderRow}>
                            <Text style={styles.modalHeaderTitle}>Roster Management</Text>
                            <TouchableOpacity 
                                style={styles.closeButtonBadge}
                                onPress={() => {
                                    setIsSearchModalVisible(false);
                                    setSearchQuery('');
                                }}
                            >
                                <Ionicons name="close" size={22} color="#000" />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.searchContainerBox}>
                            <Ionicons name="search-outline" size={18} color="#888" style={{ marginLeft: 12 }} />
                            <TextInput 
                                style={styles.searchTextInput}
                                placeholder="Search student name, email, grade..."
                                placeholderTextColor="#888"
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                autoCorrect={false}
                            />
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                            {filteredStudents.length === 0 ? (
                                <Text style={styles.modalEmptyStateText}>No student entries match keyword query.</Text>
                            ) : (
                                filteredStudents.map((student) => {
                                    const matchingTeam = teams.find(t => t.id === student.teamID);
                                    return (
                                        <View key={student.id} style={styles.studentListItemCard}>
                                            <View style={{ flex: 1, paddingRight: 8 }}>
                                                <Text style={styles.studentEntryName}>{student.studentName || 'Unknown Student'}</Text>
                                                <Text style={styles.studentEntryMeta}>{student.schoolEmail} • Class {student.gradeLevel}</Text>
                                                <Text style={styles.studentEntryTeamBadge}>
                                                    Group: {matchingTeam ? matchingTeam.name : 'Unassigned / Clear'}
                                                </Text>
                                            </View>
                                            <TouchableOpacity 
                                                style={styles.actionEditBtn} 
                                                onPress={() => handleOpenEditPanel(student)}
                                            >
                                                <Ionicons name="create-outline" size={16} color="#000" />
                                                <Text style={styles.actionEditBtnText}>Edit</Text>
                                            </TouchableOpacity>
                                        </View>
                                    );
                                })
                            )}
                        </ScrollView>
                    </View>
                </View>

                {editingStudent && (
                    <Modal
                        animationType="fade"
                        transparent={true}
                        visible={!!editingStudent}
                        onRequestClose={() => setEditingStudent(null)}
                    >
                        <View style={styles.modalSubOverlay}>
                            <View style={styles.mutationFormCard}>
                                <Text style={styles.mutationFormTitle}>Edit Student File</Text>

                                <Text style={styles.inputLabelField}>Full Student Name</Text>
                                <TextInput 
                                    style={styles.formInputBox}
                                    value={editName}
                                    onChangeText={setEditName}
                                />

                                <Text style={styles.inputLabelField}>School Registry Email</Text>
                                <TextInput 
                                    style={styles.formInputBox}
                                    value={editEmail}
                                    onChangeText={setEditEmail}
                                    autoCapitalize="none"
                                    keyboardType="email-address"
                                />

                                <Text style={styles.inputLabelField}>Grade / Level Section</Text>
                                <TextInput 
                                    style={styles.formInputBox}
                                    value={editGrade}
                                    onChangeText={setEditGrade}
                                />

                                <Text style={styles.inputLabelField}>Assign Group / Project Team</Text>
                                <ScrollView style={styles.teamSelectionContainer} nestedScrollEnabled={true}>
                                    <TouchableOpacity 
                                        style={[styles.teamSelectOptionRow, editTeamID === "" && styles.teamSelectOptionRowActive]}
                                        onPress={() => setEditTeamID("")}
                                    >
                                        <Text style={[styles.teamSelectOptionText, editTeamID === "" && styles.teamSelectOptionTextActive]}>
                                            ❌ Leave Unassigned (Remove from Team)
                                        </Text>
                                    </TouchableOpacity>

                                    {teams.map((t) => (
                                        <TouchableOpacity 
                                            key={t.id}
                                            style={[styles.teamSelectOptionRow, editTeamID === t.id && styles.teamSelectOptionRowActive]}
                                            onPress={() => setEditTeamID(t.id)}
                                        >
                                            <Text style={[styles.teamSelectOptionText, editTeamID === t.id && styles.teamSelectOptionTextActive]}>
                                                🤝 {t.name} (Grade {t.classSection})
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>

                                <View style={styles.formActionsRow}>
                                    <TouchableOpacity style={styles.cancelFormBtn} onPress={() => setEditingStudent(null)}>
                                        <Text style={styles.cancelFormBtnText}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.saveFormBtn} onPress={handleSaveStudentMutation}>
                                        <Text style={styles.saveFormBtnText}>Save Profile</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </Modal>
                )}
            </Modal>

            <Modal
                animationType="fade"
                transparent={true}
                visible={isCreateModalVisible}
                onRequestClose={() => setIsCreateModalVisible(false)}
            >
                <View style={styles.modalSubOverlay}>
                    <View style={styles.mutationFormCard}>
                        <Text style={styles.mutationFormTitle}>Create New Project Team</Text>

                        <Text style={styles.inputLabelField}>Team Name</Text>
                        <TextInput 
                            style={styles.formInputBox}
                            placeholder="e.g. Team Alpha"
                            placeholderTextColor="#999"
                            value={newTeamName}
                            maxLength={MAX_NAME_LENGTH} 
                            onChangeText={setNewTeamName}
                        />

                        <Text style={styles.inputLabelField}>Category / Class Section</Text>
                        <TextInput 
                            style={styles.formInputBox}
                            placeholder="e.g. Primary, Junior High, 5b"
                            placeholderTextColor="#999"
                            value={newTeamCategory}
                            onChangeText={setNewTeamCategory}
                        />

                        <View style={styles.formActionsRow}>
                            <TouchableOpacity 
                                style={styles.cancelFormBtn} 
                                onPress={() => {
                                    setIsCreateModalVisible(false);
                                    setNewTeamName('');
                                }}
                            >
                                <Text style={styles.cancelFormBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={[styles.saveFormBtn, { backgroundColor: '#B9F6CA' }]} 
                                onPress={handleCreateTeamSubmit}
                            >
                                <Text style={styles.saveFormBtnText}>Build Team</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
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
    iconCircle: { backgroundColor: 'white', width: 45, height: 45, borderRadius: 22.5, justifyContent: 'center', alignItems: 'center', elevation: 4, borderWidth: 1, borderColor: '#DDD' },
    portalBadgeContainer: { backgroundColor: '#FFFFFF', height: 45, borderRadius: 25, width: width * 0.55, justifyContent: 'center', alignItems: 'center', elevation: 4, borderWidth: 1, borderColor: '#DDD' },
    portalBadgeText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 13, color: '#00E5FF', letterSpacing: 1 },
    
    sectionTitle: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 22, textDecorationLine: 'underline', marginHorizontal: 20, marginTop: 20 },
    filterBarScrollTrack: { paddingHorizontal: 15, paddingVertical: 12, gap: 10, alignItems: 'center' },
    filterChip: { backgroundColor: 'white', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#000', elevation: 2 },
    filterChipActive: { backgroundColor: '#00E5FF' },
    filterChipText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 13, color: '#000' },
    filterChipTextActive: { fontFamily: 'BalsamiqSans_700Bold', color: '#000' },

    subtitleRowContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 20, marginTop: 10, marginBottom: 12 },
    sectionSubtitleOverride: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 16 },
    headerCreateActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#B9F6CA', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, borderWidth: 1.5, borderColor: '#000', elevation: 2 },
    headerCreateActionBtnText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 12, color: '#000' },

    teamsListContainer: { paddingHorizontal: 20, gap: 14 },
    teamCardWrapper: { backgroundColor: 'white', borderRadius: 22, borderWidth: 1.5, borderColor: '#000', padding: 16, flexDirection: 'row', alignItems: 'center', elevation: 3 },
    teamAvatarIcon: { width: 55, height: 55, marginRight: 15, resizeMode: 'contain' },
    teamMetadataBlock: { flex: 1, gap: 2 },
    teamNameText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 16, color: '#000' },
    teamSubText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, color: '#555' },
    teamTelemetryText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 11, color: '#00E5FF', fontStyle: 'italic', marginTop: 2 },
    
    scoreContainerSide: { alignItems: 'center', justifyContent: 'center', paddingLeft: 10, minWidth: 55 },
    scoreNumberLabel: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 20, color: '#000', lineHeight: 22 },
    scoreSubLabel: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 9, color: '#666', textTransform: 'uppercase' },
    arrowIcon: { marginTop: 4 },

    emptyContainerCard: { backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 22, borderWidth: 1.5, borderColor: '#BBB', borderStyle: 'dashed', padding: 40, alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 10 },
    emptyContainerText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 13, color: '#666', textAlign: 'center' },
    
    bottomTabs: { position: 'absolute', bottom: 0, flexDirection: 'row', backgroundColor: '#FFFFFF', height: 90, width: '100%', justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderColor: '#EEEEEE', paddingBottom: 15 },
    tabItem: { alignItems: 'center', marginHorizontal: 40 },
    tabIcon: { width: 26, height: 26, tintColor: '#A0A0A0' },
    tabIconActive: { width: 30, height: 30 },
    tabText: { fontSize: 11, color: '#A0A0A0', marginTop: 5, fontFamily: 'BalsamiqSans_400Regular' },
    tabTextActive: { fontSize: 11, color: '#00E5FF', marginTop: 5, fontFamily: 'BalsamiqSans_700Bold' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContentCard: { height: height * 0.85, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 20, paddingTop: 20, borderWidth: 2, borderColor: '#000' },
    modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    modalHeaderTitle: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 20, color: '#000' },
    closeButtonBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EAEAEA', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#000' },
    searchContainerBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 18, borderWidth: 1.5, borderColor: '#000', marginBottom: 15, height: 46 },
    searchTextInput: { flex: 1, fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, paddingHorizontal: 10, color: '#000' },
    modalEmptyStateText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, color: '#666', textAlign: 'center', marginTop: 30 },
    studentListItemCard: { backgroundColor: '#FFF', padding: 14, borderRadius: 18, borderWidth: 1.5, borderColor: '#000', marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    studentEntryName: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 15, color: '#000' },
    studentEntryMeta: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, color: '#555', marginTop: 2 },
    studentEntryTeamBadge: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 11, color: '#00E5FF', marginTop: 4, fontWeight: '600' },
    actionEditBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFE57F', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: '#000' },
    actionEditBtnText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 12, color: '#000' },

    modalSubOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
    mutationFormCard: { width: width * 0.9, backgroundColor: '#FFF', borderRadius: 24, padding: 20, borderWidth: 2, borderColor: '#000', elevation: 10 },
    mutationFormTitle: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 18, marginBottom: 15, color: '#000', textDecorationLine: 'underline' },
    inputLabelField: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 12, color: '#333', marginBottom: 4, marginTop: 8 },
    formInputBox: { backgroundColor: '#F9F9F9', borderWidth: 1.5, borderColor: '#000', borderRadius: 12, height: 40, paddingHorizontal: 10, fontFamily: 'BalsamiqSans_400Regular', fontSize: 13, color: '#000' },
    teamSelectionContainer: { maxHeight: 120, borderWidth: 1.5, borderColor: '#000', borderRadius: 12, backgroundColor: '#F9F9F9', marginTop: 4, padding: 5 },
    teamSelectOptionRow: { padding: 10, borderRadius: 8, marginBottom: 4 },
    teamSelectOptionRowActive: { backgroundColor: '#00E5FF' },
    teamSelectOptionText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, color: '#333' },
    teamSelectOptionTextActive: { fontFamily: 'BalsamiqSans_700Bold', color: '#000' },
    formActionsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 },
    cancelFormBtn: { backgroundColor: '#E0E0E0', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, borderWidth: 1.5, borderColor: '#000' },
    cancelFormBtnText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 13, color: '#333' },
    saveFormBtn: { backgroundColor: '#00E5FF', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, borderWidth: 1.5, borderColor: '#000' },
    saveFormBtnText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 13, color: '#000' },
});