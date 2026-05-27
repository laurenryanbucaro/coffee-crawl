import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, TextInput, Alert, ActivityIndicator, Modal, Image
} from 'react-native';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

export default function ProfileScreen() {
  const [profile, setProfile] = useState(null);
  const [ratings, setRatings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingDrink, setEditingDrink] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [newDrink, setNewDrink] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const router = useRouter();

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profileData } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      const { data: ratingsData } = await supabase
        .from('ratings')
        .select('*, shops(name, address)')
        .eq('user_id', user.id)
        .order('score', { ascending: false });

      setProfile(profileData);
      setRatings(ratingsData || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handlePickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (result.canceled) return;

    setUploadingPhoto(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const uri = result.assets[0].uri;
      const fileName = `${profile.id}-${Date.now()}.jpg`;

      const formData = new FormData();
      formData.append('file', {
        uri,
        name: fileName,
        type: 'image/jpeg',
      });

      const uploadResponse = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/avatar/${fileName}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'x-upsert': 'true',
          },
          body: formData,
        }
      );

      if (!uploadResponse.ok) {
        const err = await uploadResponse.text();
        Alert.alert('Upload failed', err);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('avatar')
        .getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from('users')
        .update({ avatar_url: publicUrl })
        .eq('id', profile.id);

      if (updateError) {
        Alert.alert('Error', updateError.message);
        return;
      }

      setProfile({ ...profile, avatar_url: publicUrl });
      Alert.alert('Photo updated!', 'Your profile photo has been saved.');
    } catch (e) {
      Alert.alert('Error', 'Could not upload photo. Please try again.');
      console.error(e);
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function updateSignatureDrink() {
    if (!newDrink.trim()) return;
    const { error } = await supabase
      .from('users')
      .update({ signature_drink: newDrink })
      .eq('id', profile.id);
    if (error) { Alert.alert('Error', error.message); return; }
    setProfile({ ...profile, signature_drink: newDrink });
    setNewDrink('');
    setEditingDrink(false);
  }

  async function updateProfile() {
    if (!newDisplayName.trim() || !newUsername.trim()) {
      Alert.alert('Missing fields', 'Please fill in both fields.');
      return;
    }
    const { error } = await supabase
      .from('users')
      .update({ display_name: newDisplayName, username: newUsername })
      .eq('id', profile.id);
    if (error) { Alert.alert('Error', error.message); return; }
    setProfile({ ...profile, display_name: newDisplayName, username: newUsername });
    setEditingProfile(false);
  }

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out', style: 'destructive', onPress: async () => {
          await supabase.auth.signOut();
        }
      }
    ]);
  }

function getCrawlLevel(count) {
    if (count >= 100) return { title: 'Crawl Legend', color: '#FFB6C1' };
    if (count >= 50) return { title: 'Head Roaster', color: '#FFB6C1' };
    if (count >= 30) return { title: 'Coffee Snob', color: '#FFB6C1' };
    if (count >= 15) return { title: 'Buzz Chaser', color: '#FFB6C1' };
    if (count >= 5) return { title: 'First Sip', color: '#FFB6C1' };
    return { title: 'Coffee Virgin', color: '#FFB6C1' };
  }
function getBestRating() {
    if (ratings.length === 0) return null;
    return ratings[0];
  }

  function getTopShops() {
    return ratings.slice(0, 5);
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#D8AA84" />
      </View>
    );
  }

  const topShops = getTopShops();
  const bestRating = getBestRating();
  const level = getCrawlLevel(ratings.length);

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.avatarWrap} onPress={handlePickPhoto} disabled={uploadingPhoto}>
          {uploadingPhoto ? (
            <View style={styles.avatar}>
              <ActivityIndicator color="#A89880" />
            </View>
          ) : profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {profile?.display_name?.[0]?.toUpperCase() || '?'}
              </Text>
            </View>
          )}
          <Text style={styles.editAvatarHint}>Tap to change photo</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => {
          setNewDisplayName(profile?.display_name || '');
          setNewUsername(profile?.username || '');
          setEditingProfile(true);
        }}>
          <Text style={styles.displayName}>
            {profile?.display_name || 'Tap to set name'}
          </Text>
          <Text style={styles.username}>
            @{profile?.username || 'set username'}
          </Text>
          <Text style={styles.editNameHint}>Tap to edit</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.signaturePill}
          onPress={() => { setNewDrink(profile?.signature_drink || ''); setEditingDrink(true); }}
        >
          <Text style={styles.signatureLabel}>Current order</Text>
          <Text style={styles.signatureDrink}>
            {profile?.signature_drink || 'Tap to set your signature drink'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Crawl Level Badge */}
      <View style={[styles.levelBadge, { backgroundColor: level.color }]}>
        <Text style={styles.levelTitle}>{level.title}</Text>
        <Text style={styles.levelCount}>{ratings.length} ratings</Text>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{ratings.length}</Text>
          <Text style={styles.statLabel}>Rated</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <TouchableOpacity onPress={() => bestRating && router.push({
            pathname: '/shop/[id]',
            params: {
              id: bestRating.shop_id,
              name: bestRating.shops?.name,
              address: bestRating.shops?.address,
            }
          })}>
            <Text style={styles.statNum}>
              {bestRating ? bestRating.score : '—'}
            </Text>
            <Text style={styles.statLabel}>Best score</Text>
            {bestRating && (
              <Text style={styles.statShop} numberOfLines={1}>
                {bestRating.shops?.name}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Top shops or empty state */}
      {topShops.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Top Shops</Text>
          {topShops.map((r, i) => (
            <TouchableOpacity
              key={r.id}
              style={styles.shopRow}
              onPress={() => router.push({
                pathname: '/shop/[id]',
                params: {
                  id: r.shop_id,
                  name: r.shops?.name,
                  address: r.shops?.address,
                }
              })}
            >
              <Text style={styles.shopRank}>#{i + 1}</Text>
              <View style={styles.shopInfo}>
                <Text style={styles.shopName}>{r.shops?.name}</Text>
                {r.drink_ordered && (
                  <Text style={styles.shopDrink}>{r.drink_ordered}</Text>
                )}
                {r.note && <Text style={styles.ratingNote}>"{r.note}"</Text>}
              </View>
              <View style={styles.scoreBadge}>
                <Text style={styles.scoreText}>{r.score}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No ratings yet — start crawling!</Text>
          <TouchableOpacity style={styles.mapButton} onPress={() => router.push('/(tabs)/map')}>
            <Text style={styles.mapButtonText}>Find coffee shops</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Sign out */}
      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      {/* Edit signature drink modal */}
      <Modal visible={editingDrink} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Your signature drink</Text>
            <Text style={styles.modalSub}>What are you ordering right now?</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Iced brown sugar oat latte"
              placeholderTextColor="#C4B09A"
              value={newDrink}
              onChangeText={setNewDrink}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setEditingDrink(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmit} onPress={updateSignatureDrink}>
                <Text style={styles.modalSubmitText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit profile modal */}
      <Modal visible={editingProfile} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Edit Profile</Text>
            <Text style={styles.modalLabel}>Display name</Text>
            <TextInput
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor="#C4B09A"
              value={newDisplayName}
              onChangeText={setNewDisplayName}
            />
            <Text style={styles.modalLabel}>Username</Text>
            <TextInput
              style={styles.input}
              placeholder="username"
              placeholderTextColor="#C4B09A"
              value={newUsername}
              onChangeText={setNewUsername}
              autoCapitalize="none"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setEditingProfile(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmit} onPress={updateProfile}>
                <Text style={styles.modalSubmitText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#A89880' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#A89880' },
  header: { alignItems: 'center', padding: 24, paddingTop: 40 },
  avatarWrap: { alignItems: 'center', marginBottom: 12 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#FFB6C1',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 4,
  },
  avatarImage: {
    width: 80, height: 80, borderRadius: 40,
    marginBottom: 4,
  },
  avatarText: { fontSize: 28, fontWeight: '700', color: '#3D2B1F' },
  editAvatarHint: { fontSize: 11, color: '#F0E8E0' },
  displayName: { fontSize: 22, fontWeight: '700', color: '#FFF8F9', marginBottom: 2, textAlign: 'center' },
  username: { fontSize: 14, color: '#F0E8E0', textAlign: 'center' },
  editNameHint: { fontSize: 11, color: '#FFE8EC', textAlign: 'center', marginBottom: 16, marginTop: 2 },
  signaturePill: {
    backgroundColor: '#FFB6C1',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignItems: 'center',
  },
  signatureLabel: { fontSize: 11, color: '#3D2B1F', marginBottom: 2 },
  signatureDrink: { fontSize: 14, fontWeight: '600', color: '#3D2B1F' },
  levelBadge: {
    alignSelf: 'center',
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 10,
    marginBottom: 16,
    alignItems: 'center',
  },
  levelTitle: { fontSize: 15, fontWeight: '700', color: '#3D2B1F' },
  levelCount: { fontSize: 11, color: '#3D2B1F', marginTop: 2 },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#9A8870',
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  stat: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '700', color: '#FFF8F9', textAlign: 'center' },
  statLabel: { fontSize: 11, color: '#F0E8E0', marginTop: 2, textAlign: 'center' },
  statShop: { fontSize: 10, color: '#FFE8EC', marginTop: 2, textAlign: 'center' },
  statDivider: { width: 1, backgroundColor: '#C4B09A' },
  section: { marginHorizontal: 16, marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#FFF8F9', marginBottom: 12 },
  shopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#9A8870',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  shopRank: { fontSize: 13, fontWeight: '700', color: '#F0E8E0', width: 28 },
  shopInfo: { flex: 1 },
  shopName: { fontSize: 14, fontWeight: '600', color: '#FFF8F9' },
  shopDrink: { fontSize: 12, color: '#F0E8E0', marginTop: 2 },
  ratingNote: { fontSize: 11, color: '#FFE8EC', fontStyle: 'italic', marginTop: 2 },
  scoreBadge: {
    backgroundColor: '#FFB6C1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  scoreText: { fontSize: 14, fontWeight: '700', color: '#3D2B1F' },
  emptyState: { alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 15, color: '#F0E8E0', marginBottom: 16 },
  mapButton: {
    backgroundColor: '#FFB6C1',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  mapButtonText: { fontSize: 14, fontWeight: '600', color: '#3D2B1F' },
  signOutButton: {
    margin: 16, marginBottom: 40,
    padding: 14, borderRadius: 12,
    backgroundColor: '#9A8870', alignItems: 'center',
  },
  signOutText: { fontSize: 14, fontWeight: '600', color: '#FFE8EC' },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: '#FFF8F9',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#3D2B1F', marginBottom: 6 },
  modalSub: { fontSize: 13, color: '#A89880', marginBottom: 16 },
  modalLabel: { fontSize: 13, fontWeight: '600', color: '#A89880', marginBottom: 6, marginTop: 8 },
  input: {
    borderWidth: 1, borderColor: '#D8C4B8',
    borderRadius: 10, padding: 12,
    fontSize: 14, color: '#3D2B1F',
    backgroundColor: '#FFB6C1', marginBottom: 8,
  },
  modalButtons: { flexDirection: 'row', marginTop: 12 },
  modalCancel: {
    flex: 1, marginRight: 8, padding: 14,
    borderRadius: 12, backgroundColor: '#F0E8E0', alignItems: 'center',
  },
  modalCancelText: { color: '#A89880', fontWeight: '600' },
  modalSubmit: {
    flex: 1, marginLeft: 8, padding: 14,
    borderRadius: 12, backgroundColor: '#A89880', alignItems: 'center',
  },
  modalSubmitText: { color: '#FFF8F9', fontWeight: '600' },
});