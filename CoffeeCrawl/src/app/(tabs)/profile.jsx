import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, TextInput, Alert, ActivityIndicator, Modal, Image, FlatList
} from 'react-native';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

export default function ProfileScreen() {
  const [profile, setProfile] = useState(null);
  const [ratings, setRatings] = useState([]);
  const [wantToTry, setWantToTry] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingDrink, setEditingDrink] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showAllRatings, setShowAllRatings] = useState(false);
  const [showWantToTry, setShowWantToTry] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [showAddWantToTry, setShowAddWantToTry] = useState(false);
  const [supportMessage, setSupportMessage] = useState('');
  const [newShopName, setNewShopName] = useState('');
  const [newShopAddress, setNewShopAddress] = useState('');
  const [newDrink, setNewDrink] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [activeTab, setActiveTab] = useState('top');
  const router = useRouter();

  useEffect(() => {
    loadProfile();
    loadWantToTry();
  }, []);

  async function loadProfile() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profileData } = await supabase
        .from('users').select('*').eq('id', user.id).single();
      const { data: ratingsData } = await supabase
        .from('ratings')
        .select('*, shops(name, address, google_place_id)')
        .eq('user_id', user.id)
        .order('score', { ascending: false });
      setProfile(profileData);
      setRatings(ratingsData || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function loadWantToTry() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('want_to_try')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      setWantToTry(data || []);
    } catch (e) { console.error(e); }
  }

  async function handlePickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow access to your photo library.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5 });
    if (result.canceled) return;
    setUploadingPhoto(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const uri = result.assets[0].uri;
      const fileName = `${profile.id}-${Date.now()}.jpg`;
      const formData = new FormData();
      formData.append('file', { uri, name: fileName, type: 'image/jpeg' });
      const uploadResponse = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/avatar/${fileName}`,
        { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'x-upsert': 'true' }, body: formData }
      );
      if (!uploadResponse.ok) { Alert.alert('Upload failed', await uploadResponse.text()); return; }
      const { data: { publicUrl } } = supabase.storage.from('avatar').getPublicUrl(fileName);
      await supabase.from('users').update({ avatar_url: publicUrl }).eq('id', profile.id);
      setProfile({ ...profile, avatar_url: publicUrl });
      Alert.alert('Photo updated!', 'Your profile photo has been saved.');
    } catch (e) { Alert.alert('Error', 'Could not upload photo. Please try again.'); }
    finally { setUploadingPhoto(false); }
  }

  async function updateSignatureDrink() {
    if (!newDrink.trim()) return;
    const { error } = await supabase.from('users').update({ signature_drink: newDrink }).eq('id', profile.id);
    if (error) { Alert.alert('Error', error.message); return; }
    setProfile({ ...profile, signature_drink: newDrink });
    setNewDrink(''); setEditingDrink(false);
  }

  async function updateProfile() {
    if (!newDisplayName.trim() || !newUsername.trim()) { Alert.alert('Missing fields', 'Please fill in both fields.'); return; }
    const { error } = await supabase.from('users').update({ display_name: newDisplayName, username: newUsername }).eq('id', profile.id);
    if (error) { Alert.alert('Error', error.message); return; }
    setProfile({ ...profile, display_name: newDisplayName, username: newUsername });
    setEditingProfile(false);
  }

  async function handleAddWantToTry() {
    if (!newShopName.trim()) { Alert.alert('Missing info', 'Please enter a shop name.'); return; }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('want_to_try').insert({
        user_id: user.id, shop_name: newShopName.trim(), shop_address: newShopAddress.trim() || null
      });
      if (error) throw error;
      setNewShopName(''); setNewShopAddress(''); setShowAddWantToTry(false);
      loadWantToTry();
    } catch (e) { Alert.alert('Error', 'Could not save. Please try again.'); }
  }

  async function handleRemoveWantToTry(id) {
    await supabase.from('want_to_try').delete().eq('id', id);
    setWantToTry(wantToTry.filter(w => w.id !== id));
  }

  async function handleSubmitSupport() {
    if (!supportMessage.trim()) { Alert.alert('Missing message', 'Please describe your issue.'); return; }
    setSupportMessage('');
    setShowSupport(false);
    Alert.alert('Message sent!', 'You will be contacted about this inquiry by coffeecrawl@gmail.com');
  }

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: async () => { await supabase.auth.signOut(); } }
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

  function getBestRating() { return ratings.length === 0 ? null : ratings[0]; }
  function getTopShops() { return ratings.slice(0, 5); }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#D8AA84" /></View>;
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
            <View style={styles.avatar}><ActivityIndicator color="#A89880" /></View>
          ) : profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{profile?.display_name?.[0]?.toUpperCase() || '?'}</Text>
            </View>
          )}
          <Text style={styles.editAvatarHint}>Tap to change photo</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => { setNewDisplayName(profile?.display_name || ''); setNewUsername(profile?.username || ''); setEditingProfile(true); }}>
          <Text style={styles.displayName}>{profile?.display_name || 'Tap to set name'}</Text>
          <Text style={styles.username}>@{profile?.username || 'set username'}</Text>
          <Text style={styles.editNameHint}>Tap to edit</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.signaturePill} onPress={() => { setNewDrink(profile?.signature_drink || ''); setEditingDrink(true); }}>
          <Text style={styles.signatureLabel}>Current order</Text>
          <Text style={styles.signatureDrink}>{profile?.signature_drink || 'Tap to set your signature drink'}</Text>
        </TouchableOpacity>
      </View>

      {/* Crawl Level */}
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
              id: bestRating.shops?.google_place_id || bestRating.shop_id,
              name: bestRating.shops?.name,
              address: bestRating.shops?.address
            }
          })}>
            <Text style={styles.statNum}>{bestRating ? bestRating.score : '—'}</Text>
            <Text style={styles.statLabel}>Best score</Text>
            {bestRating && <Text style={styles.statShop} numberOfLines={1}>{bestRating.shops?.name}</Text>}
          </TouchableOpacity>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statNum}>{wantToTry.length}</Text>
          <Text style={styles.statLabel}>Want to try</Text>
        </View>
      </View>

      {/* Tab selector */}
      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tabBtn, activeTab === 'top' && styles.tabBtnActive]} onPress={() => setActiveTab('top')}>
          <Text style={[styles.tabBtnText, activeTab === 'top' && styles.tabBtnTextActive]}>Top 5</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, activeTab === 'all' && styles.tabBtnActive]} onPress={() => setActiveTab('all')}>
          <Text style={[styles.tabBtnText, activeTab === 'all' && styles.tabBtnTextActive]}>All Rated ({ratings.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, activeTab === 'wtt' && styles.tabBtnActive]} onPress={() => setActiveTab('wtt')}>
          <Text style={[styles.tabBtnText, activeTab === 'wtt' && styles.tabBtnTextActive]}>Want to Try</Text>
        </TouchableOpacity>
      </View>

      {/* Top 5 tab */}
      {activeTab === 'top' && (
        <View style={styles.section}>
          {topShops.length > 0 ? topShops.map((r, i) => (
            <TouchableOpacity key={r.id} style={styles.shopRow} onPress={() => router.push({
              pathname: '/shop/[id]',
              params: {
                id: r.shops?.google_place_id || r.shop_id,
                name: r.shops?.name,
                address: r.shops?.address
              }
            })}>
              <Text style={styles.shopRank}>#{i + 1}</Text>
              <View style={styles.shopInfo}>
                <Text style={styles.shopName}>{r.shops?.name}</Text>
                {r.drink_ordered && <Text style={styles.shopDrink}>{r.drink_ordered}</Text>}
                {r.note && <Text style={styles.ratingNote}>"{r.note}"</Text>}
              </View>
              <View style={styles.scoreBadge}><Text style={styles.scoreText}>{r.score}</Text></View>
            </TouchableOpacity>
          )) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No ratings yet — start crawling!</Text>
              <TouchableOpacity style={styles.mapButton} onPress={() => router.push('/(tabs)/map')}>
                <Text style={styles.mapButtonText}>Find coffee shops</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* All rated tab */}
      {activeTab === 'all' && (
        <View style={styles.section}>
          {ratings.length > 0 ? ratings.map((r, i) => (
            <TouchableOpacity key={r.id} style={styles.shopRow} onPress={() => router.push({
              pathname: '/shop/[id]',
              params: {
                id: r.shops?.google_place_id || r.shop_id,
                name: r.shops?.name,
                address: r.shops?.address
              }
            })}>
              <Text style={styles.shopRank}>#{i + 1}</Text>
              <View style={styles.shopInfo}>
                <Text style={styles.shopName}>{r.shops?.name}</Text>
                {r.drink_ordered && <Text style={styles.shopDrink}>{r.drink_ordered}</Text>}
                {r.note && <Text style={styles.ratingNote}>"{r.note}"</Text>}
              </View>
              <View style={styles.scoreBadge}><Text style={styles.scoreText}>{r.score}</Text></View>
            </TouchableOpacity>
          )) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No ratings yet — start crawling!</Text>
              <TouchableOpacity style={styles.mapButton} onPress={() => router.push('/(tabs)/map')}>
                <Text style={styles.mapButtonText}>Find coffee shops</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Want to try tab */}
      {activeTab === 'wtt' && (
        <View style={styles.section}>
          <TouchableOpacity style={styles.addWttButton} onPress={() => setShowAddWantToTry(true)}>
            <Text style={styles.addWttText}>+ Add a shop</Text>
          </TouchableOpacity>
          {wantToTry.length > 0 ? wantToTry.map((w) => (
            <View key={w.id} style={styles.wttRow}>
              <View style={styles.shopInfo}>
                <Text style={styles.shopName}>{w.shop_name}</Text>
                {w.shop_address && <Text style={styles.shopDrink}>{w.shop_address}</Text>}
              </View>
              <TouchableOpacity style={styles.removeBtn} onPress={() => handleRemoveWantToTry(w.id)}>
                <Text style={styles.removeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          )) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No shops on your list yet!</Text>
              <Text style={styles.emptySubText}>Add coffee shops you want to visit.</Text>
            </View>
          )}
        </View>
      )}

      {/* Sign out */}
      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      {/* Customer support */}
      <TouchableOpacity style={styles.supportButton} onPress={() => setShowSupport(true)}>
        <Text style={styles.supportText}>Contact Support</Text>
      </TouchableOpacity>

      {/* Edit drink modal */}
      <Modal visible={editingDrink} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Your signature drink</Text>
            <Text style={styles.modalSub}>What are you ordering right now?</Text>
            <TextInput style={styles.input} placeholder="e.g. Iced brown sugar oat latte" placeholderTextColor="#C4B09A" value={newDrink} onChangeText={setNewDrink} autoFocus />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setEditingDrink(false)}><Text style={styles.modalCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmit} onPress={updateSignatureDrink}><Text style={styles.modalSubmitText}>Save</Text></TouchableOpacity>
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
            <TextInput style={styles.input} placeholder="Your name" placeholderTextColor="#C4B09A" value={newDisplayName} onChangeText={setNewDisplayName} />
            <Text style={styles.modalLabel}>Username</Text>
            <TextInput style={styles.input} placeholder="username" placeholderTextColor="#C4B09A" value={newUsername} onChangeText={setNewUsername} autoCapitalize="none" />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setEditingProfile(false)}><Text style={styles.modalCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmit} onPress={updateProfile}><Text style={styles.modalSubmitText}>Save</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add want to try modal */}
      <Modal visible={showAddWantToTry} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Add to Want to Try</Text>
            <Text style={styles.modalLabel}>Shop name</Text>
            <TextInput style={styles.input} placeholder="e.g. Blue Bottle Coffee" placeholderTextColor="#C4B09A" value={newShopName} onChangeText={setNewShopName} />
            <Text style={styles.modalLabel}>Address (optional)</Text>
            <TextInput style={styles.input} placeholder="e.g. 123 Main St" placeholderTextColor="#C4B09A" value={newShopAddress} onChangeText={setNewShopAddress} />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowAddWantToTry(false)}><Text style={styles.modalCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmit} onPress={handleAddWantToTry}><Text style={styles.modalSubmitText}>Add</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Support modal */}
      <Modal visible={showSupport} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Contact Support</Text>
            <Text style={styles.modalSub}>Tell us how we can help!</Text>
            <TextInput
              style={[styles.input, { height: 120, textAlignVertical: 'top' }]}
              placeholder="Describe your issue or feedback..."
              placeholderTextColor="#C4B09A"
              value={supportMessage}
              onChangeText={setSupportMessage}
              multiline
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowSupport(false)}><Text style={styles.modalCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmit} onPress={handleSubmitSupport}><Text style={styles.modalSubmitText}>Send</Text></TouchableOpacity>
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
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#FFB6C1', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  avatarImage: { width: 80, height: 80, borderRadius: 40, marginBottom: 4 },
  avatarText: { fontSize: 28, fontWeight: '700', color: '#3D2B1F' },
  editAvatarHint: { fontSize: 11, color: '#F0E8E0' },
  displayName: { fontSize: 22, fontWeight: '700', color: '#FFF8F9', marginBottom: 2, textAlign: 'center' },
  username: { fontSize: 14, color: '#F0E8E0', textAlign: 'center' },
  editNameHint: { fontSize: 11, color: '#FFE8EC', textAlign: 'center', marginBottom: 16, marginTop: 2 },
  signaturePill: { backgroundColor: '#FFB6C1', borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10, alignItems: 'center' },
  signatureLabel: { fontSize: 11, color: '#3D2B1F', marginBottom: 2 },
  signatureDrink: { fontSize: 14, fontWeight: '600', color: '#3D2B1F' },
  levelBadge: { alignSelf: 'center', borderRadius: 20, paddingHorizontal: 24, paddingVertical: 10, marginBottom: 16, alignItems: 'center' },
  levelTitle: { fontSize: 15, fontWeight: '700', color: '#3D2B1F' },
  levelCount: { fontSize: 11, color: '#3D2B1F', marginTop: 2 },
  statsRow: { flexDirection: 'row', backgroundColor: '#9A8870', marginHorizontal: 16, borderRadius: 16, padding: 16, marginBottom: 16 },
  stat: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '700', color: '#FFF8F9', textAlign: 'center' },
  statLabel: { fontSize: 11, color: '#F0E8E0', marginTop: 2, textAlign: 'center' },
  statShop: { fontSize: 10, color: '#FFE8EC', marginTop: 2, textAlign: 'center' },
  statDivider: { width: 1, backgroundColor: '#C4B09A' },
  tabRow: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 12, backgroundColor: '#9A8870', borderRadius: 12, padding: 4 },
  tabBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  tabBtnActive: { backgroundColor: '#FFB6C1' },
  tabBtnText: { fontSize: 12, fontWeight: '600', color: '#F0E8E0' },
  tabBtnTextActive: { color: '#3D2B1F' },
  section: { marginHorizontal: 16, marginBottom: 24 },
  shopRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#9A8870', borderRadius: 12, padding: 12, marginBottom: 8 },
  shopRank: { fontSize: 13, fontWeight: '700', color: '#F0E8E0', width: 28 },
  shopInfo: { flex: 1 },
  shopName: { fontSize: 14, fontWeight: '600', color: '#FFF8F9' },
  shopDrink: { fontSize: 12, color: '#F0E8E0', marginTop: 2 },
  ratingNote: { fontSize: 11, color: '#FFE8EC', fontStyle: 'italic', marginTop: 2 },
  scoreBadge: { backgroundColor: '#FFB6C1', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  scoreText: { fontSize: 14, fontWeight: '700', color: '#3D2B1F' },
  wttRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#9A8870', borderRadius: 12, padding: 12, marginBottom: 8 },
  removeBtn: { backgroundColor: '#3D2B1F', borderRadius: 8, width: 28, height: 28, justifyContent: 'center', alignItems: 'center' },
  removeBtnText: { color: '#FFB6C1', fontSize: 12, fontWeight: '700' },
  addWttButton: { backgroundColor: '#FFB6C1', borderRadius: 12, padding: 12, alignItems: 'center', marginBottom: 12 },
  addWttText: { fontSize: 14, fontWeight: '600', color: '#3D2B1F' },
  emptyState: { alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 15, color: '#F0E8E0', marginBottom: 8, textAlign: 'center' },
  emptySubText: { fontSize: 12, color: '#F0E8E0', textAlign: 'center' },
  mapButton: { backgroundColor: '#FFB6C1', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  mapButtonText: { fontSize: 14, fontWeight: '600', color: '#3D2B1F' },
  signOutButton: { margin: 16, marginBottom: 8, padding: 14, borderRadius: 12, backgroundColor: '#9A8870', alignItems: 'center' },
  signOutText: { fontSize: 14, fontWeight: '600', color: '#FFE8EC' },
  supportButton: { marginHorizontal: 16, marginBottom: 40, padding: 14, borderRadius: 12, backgroundColor: '#3D2B1F', alignItems: 'center' },
  supportText: { fontSize: 14, fontWeight: '600', color: '#FFB6C1' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#FFF8F9', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#3D2B1F', marginBottom: 6 },
  modalSub: { fontSize: 13, color: '#A89880', marginBottom: 16 },
  modalLabel: { fontSize: 13, fontWeight: '600', color: '#A89880', marginBottom: 6, marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#D8C4B8', borderRadius: 10, padding: 12, fontSize: 14, color: '#3D2B1F', backgroundColor: '#FFF0F2', marginBottom: 8 },
  modalButtons: { flexDirection: 'row', marginTop: 12 },
  modalCancel: { flex: 1, marginRight: 8, padding: 14, borderRadius: 12, backgroundColor: '#F0E8E0', alignItems: 'center' },
  modalCancelText: { color: '#A89880', fontWeight: '600' },
  modalSubmit: { flex: 1, marginLeft: 8, padding: 14, borderRadius: 12, backgroundColor: '#A89880', alignItems: 'center' },
  modalSubmitText: { color: '#FFF8F9', fontWeight: '600' },
});