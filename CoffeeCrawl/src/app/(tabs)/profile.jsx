import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, TextInput, Alert, ActivityIndicator, Modal, Image, FlatList
} from 'react-native';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

const RUST = '#8C3235';
const RUST_DARK = '#672427';
const TAN = '#DCCAB4';
const ESPRESSO = '#A36054';
const TEXT_LIGHT = '#E8DCC6';

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
  const [showAccountInfo, setShowAccountInfo] = useState(false);
  const [accountEmail, setAccountEmail] = useState('');
  const [joinDate, setJoinDate] = useState('');
  const router = useRouter();

  useEffect(() => {
    loadProfile();
    loadWantToTry();
  }, []);

  async function loadProfile() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setAccountEmail(user.email || '');
      setJoinDate(user.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '');
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
    if (count >= 100) return { title: 'Crawl Legend' };
    if (count >= 50) return { title: 'Head Roaster' };
    if (count >= 30) return { title: 'Coffee Snob' };
    if (count >= 15) return { title: 'Buzz Chaser' };
    if (count >= 5) return { title: 'First Sip' };
    return { title: 'Coffee Virgin' };
  }

  function getBestRating() { return ratings.length === 0 ? null : ratings[0]; }
  function getTopShops() { return ratings.slice(0, 5); }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={TAN} /></View>;
  }

  const topShops = getTopShops();
  const bestRating = getBestRating();
  const level = getCrawlLevel(ratings.length);

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.menuIcon} onPress={() => setShowAccountInfo(!showAccountInfo)}>
          <View style={styles.menuLine} />
          <View style={styles.menuLine} />
          <View style={styles.menuLine} />
        </TouchableOpacity>

        {showAccountInfo && (
          <View style={styles.accountInfoBox}>
            <Text style={styles.accountInfoLabel}>Email</Text>
            <Text style={styles.accountInfoValue}>{accountEmail}</Text>
            <Text style={styles.accountInfoLabel}>Member since</Text>
            <Text style={styles.accountInfoValue}>{joinDate}</Text>
            <Text style={styles.accountInfoLabel}>User ID</Text>
            <Text style={styles.accountInfoValue} numberOfLines={1}>{profile?.id}</Text>
          </View>
        )}

        <TouchableOpacity style={styles.avatarWrap} onPress={handlePickPhoto} disabled={uploadingPhoto}>
          {uploadingPhoto ? (
            <View style={styles.avatar}><ActivityIndicator color={RUST} /></View>
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
      <View style={styles.levelBadge}>
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
            <TextInput style={styles.input} placeholder="e.g. Iced brown sugar oat latte" placeholderTextColor={ESPRESSO} value={newDrink} onChangeText={setNewDrink} autoFocus />
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
            <TextInput style={styles.input} placeholder="Your name" placeholderTextColor={ESPRESSO} value={newDisplayName} onChangeText={setNewDisplayName} />
            <Text style={styles.modalLabel}>Username</Text>
            <TextInput style={styles.input} placeholder="username" placeholderTextColor={ESPRESSO} value={newUsername} onChangeText={setNewUsername} autoCapitalize="none" />
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
            <TextInput style={styles.input} placeholder="e.g. Blue Bottle Coffee" placeholderTextColor={ESPRESSO} value={newShopName} onChangeText={setNewShopName} />
            <Text style={styles.modalLabel}>Address (optional)</Text>
            <TextInput style={styles.input} placeholder="e.g. 123 Main St" placeholderTextColor={ESPRESSO} value={newShopAddress} onChangeText={setNewShopAddress} />
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
              placeholderTextColor={ESPRESSO}
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
  container: { flex: 1, backgroundColor: RUST },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: RUST },
header: { alignItems: 'center', padding: 24, paddingTop: 40, position: 'relative' },
  menuIcon: {
    position: 'absolute',
    top: 44,
    right: 20,
    zIndex: 10,
    padding: 8,
    gap: 4,
  },
  menuLine: { width: 22, height: 2.5, backgroundColor: TEXT_LIGHT, borderRadius: 2 },
  accountInfoBox: {
    position: 'absolute',
    top: 80,
    right: 16,
    backgroundColor: RUST_DARK,
    borderRadius: 12,
    padding: 16,
    width: 220,
    zIndex: 20,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  accountInfoLabel: { fontFamily: 'Lexend_600SemiBold', fontSize: 11, color: TAN, marginTop: 8 },
  accountInfoValue: { fontFamily: 'Lexend_400Regular', fontSize: 13, color: TEXT_LIGHT, marginTop: 2 },  avatarWrap: { alignItems: 'center', marginBottom: 12 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: TAN, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  avatarImage: { width: 80, height: 80, borderRadius: 40, marginBottom: 4 },
  avatarText: { fontFamily: 'Modak_400Regular', fontSize: 28, color: RUST },
  editAvatarHint: { fontFamily: 'Lexend_400Regular', fontSize: 11, color: TEXT_LIGHT },
  displayName: { fontFamily: 'Modak_400Regular', fontSize: 24, color: TEXT_LIGHT, marginBottom: 2, textAlign: 'center' },
  username: { fontFamily: 'Lexend_500Medium', fontSize: 14, color: TAN, textAlign: 'center' },
  editNameHint: { fontFamily: 'Lexend_400Regular', fontSize: 11, color: TAN, textAlign: 'center', marginBottom: 16, marginTop: 2 },
  signaturePill: { backgroundColor: TAN, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10, alignItems: 'center' },
  signatureLabel: { fontFamily: 'Lexend_400Regular', fontSize: 11, color: RUST_DARK, marginBottom: 2 },
  signatureDrink: { fontFamily: 'Lexend_700Bold', fontSize: 14, color: RUST_DARK },
  levelBadge: { alignSelf: 'center', backgroundColor: TAN, borderRadius: 20, paddingHorizontal: 24, paddingVertical: 10, marginBottom: 16, alignItems: 'center' },
  levelTitle: { fontFamily: 'Modak_400Regular', fontSize: 16, color: RUST },
  levelCount: { fontFamily: 'Lexend_500Medium', fontSize: 11, color: RUST_DARK, marginTop: 2 },
  statsRow: { flexDirection: 'row', backgroundColor: RUST_DARK, marginHorizontal: 16, borderRadius: 16, padding: 16, marginBottom: 16 },
  stat: { flex: 1, alignItems: 'center' },
  statNum: { fontFamily: 'Modak_400Regular', fontSize: 22, color: TEXT_LIGHT, textAlign: 'center' },
  statLabel: { fontFamily: 'Lexend_400Regular', fontSize: 11, color: TAN, marginTop: 2, textAlign: 'center' },
  statShop: { fontFamily: 'Lexend_400Regular', fontSize: 10, color: TAN, marginTop: 2, textAlign: 'center' },
  statDivider: { width: 1, backgroundColor: ESPRESSO },
  tabRow: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 12, backgroundColor: RUST_DARK, borderRadius: 12, padding: 4 },
  tabBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  tabBtnActive: { backgroundColor: TAN },
  tabBtnText: { fontFamily: 'Lexend_600SemiBold', fontSize: 12, color: TAN },
  tabBtnTextActive: { color: RUST_DARK },
  section: { marginHorizontal: 16, marginBottom: 24 },
  shopRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: RUST_DARK, borderRadius: 12, padding: 12, marginBottom: 8 },
  shopRank: { fontFamily: 'Lexend_700Bold', fontSize: 13, color: TAN, width: 28 },
  shopInfo: { flex: 1 },
  shopName: { fontFamily: 'Lexend_700Bold', fontSize: 14, color: TEXT_LIGHT },
  shopDrink: { fontFamily: 'Lexend_400Regular', fontSize: 12, color: TAN, marginTop: 2 },
  ratingNote: { fontFamily: 'Lexend_400Regular', fontSize: 11, color: TAN, fontStyle: 'italic', marginTop: 2 },
  scoreBadge: { backgroundColor: TAN, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  scoreText: { fontFamily: 'Lexend_700Bold', fontSize: 14, color: RUST_DARK },
  wttRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: RUST_DARK, borderRadius: 12, padding: 12, marginBottom: 8 },
  removeBtn: { backgroundColor: ESPRESSO, borderRadius: 8, width: 28, height: 28, justifyContent: 'center', alignItems: 'center' },
  removeBtnText: { color: TEXT_LIGHT, fontSize: 12, fontFamily: 'Lexend_700Bold' },
  addWttButton: { backgroundColor: TAN, borderRadius: 12, padding: 12, alignItems: 'center', marginBottom: 12 },
  addWttText: { fontFamily: 'Lexend_700Bold', fontSize: 14, color: RUST_DARK },
  emptyState: { alignItems: 'center', padding: 24 },
  emptyText: { fontFamily: 'Lexend_500Medium', fontSize: 15, color: TAN, marginBottom: 8, textAlign: 'center' },
  emptySubText: { fontFamily: 'Lexend_400Regular', fontSize: 12, color: TAN, textAlign: 'center' },
  mapButton: { backgroundColor: TAN, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  mapButtonText: { fontFamily: 'Lexend_700Bold', fontSize: 14, color: RUST_DARK },
  signOutButton: { margin: 16, marginBottom: 8, padding: 14, borderRadius: 12, backgroundColor: RUST_DARK, alignItems: 'center' },
  signOutText: { fontFamily: 'Lexend_700Bold', fontSize: 14, color: TAN },
  supportButton: { marginHorizontal: 16, marginBottom: 40, padding: 14, borderRadius: 12, backgroundColor: ESPRESSO, alignItems: 'center' },
  supportText: { fontFamily: 'Lexend_700Bold', fontSize: 14, color: TEXT_LIGHT },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: TAN, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { fontFamily: 'Modak_400Regular', fontSize: 20, color: RUST, marginBottom: 6 },
  modalSub: { fontFamily: 'Lexend_400Regular', fontSize: 13, color: ESPRESSO, marginBottom: 16 },
  modalLabel: { fontFamily: 'Lexend_600SemiBold', fontSize: 13, color: RUST_DARK, marginBottom: 6, marginTop: 8 },
  input: { borderWidth: 1, borderColor: ESPRESSO, borderRadius: 10, padding: 12, fontFamily: 'Lexend_400Regular', fontSize: 14, color: RUST_DARK, backgroundColor: '#FFFBF2', marginBottom: 8 },
  modalButtons: { flexDirection: 'row', marginTop: 12 },
  modalCancel: { flex: 1, marginRight: 8, padding: 14, borderRadius: 12, backgroundColor: '#C9AD7E', alignItems: 'center' },
  modalCancelText: { fontFamily: 'Lexend_700Bold', color: RUST_DARK },
  modalSubmit: { flex: 1, marginLeft: 8, padding: 14, borderRadius: 12, backgroundColor: RUST, alignItems: 'center' },
  modalSubmitText: { fontFamily: 'Lexend_700Bold', color: TEXT_LIGHT },
});