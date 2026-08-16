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
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const router = useRouter();

  useEffect(() => {
    loadProfile();
    loadWantToTry();
    loadUnreadCount();
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

  async function loadUnreadCount() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profileData } = await supabase
        .from('users').select('last_checked_activity').eq('id', user.id).single();
      const lastChecked = profileData?.last_checked_activity || new Date(0).toISOString();
      const { data: following } = await supabase
        .from('follows').select('following_id').eq('follower_id', user.id);
      const followingIds = (following || []).map(f => f.following_id);
      if (followingIds.length === 0) { setUnreadCount(0); return; }
      const { count } = await supabase
        .from('ratings')
        .select('id', { count: 'exact', head: true })
        .in('user_id', followingIds)
        .gt('visited_at', lastChecked);
      setUnreadCount(count || 0);
    } catch (e) { console.error(e); }
  }

  async function loadNotifications() {
    setLoadingNotifications(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: following } = await supabase
        .from('follows').select('following_id').eq('follower_id', user.id);
      const followingIds = (following || []).map(f => f.following_id);
      if (followingIds.length === 0) { setNotifications([]); setLoadingNotifications(false); return; }
      const { data } = await supabase
        .from('ratings')
        .select('*, shops(name, address, google_place_id), users(display_name, username, avatar_url)')
        .in('user_id', followingIds)
        .order('visited_at', { ascending: false })
        .limit(30);
      setNotifications(data || []);
      await supabase.from('users')
        .update({ last_checked_activity: new Date().toISOString() })
        .eq('id', user.id);
      setUnreadCount(0);
    } catch (e) { console.error(e); }
    finally { setLoadingNotifications(false); }
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
    const cleanUsername = newUsername.trim().toLowerCase();
    if (cleanUsername !== profile.username) {
      const { data: existing } = await supabase
        .from('users').select('id').eq('username', cleanUsername).maybeSingle();
      if (existing) { Alert.alert('Username taken', 'Please choose a different username.'); return; }
    }
    const { error } = await supabase.from('users').update({ display_name: newDisplayName, username: cleanUsername }).eq('id', profile.id);
    if (error) { Alert.alert('Error', error.message); return; }
    setProfile({ ...profile, display_name: newDisplayName, username: cleanUsername });
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

  function timeAgo(dateStr) {
    const now = new Date();
    const date = new Date(dateStr);
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  function getBestRating() { return ratings.length === 0 ? null : ratings[0]; }

  function getTopShops() {
    const bestPerShop = {};
    for (const r of ratings) {
      if (!bestPerShop[r.shop_id] || r.score > bestPerShop[r.shop_id].score) {
        bestPerShop[r.shop_id] = r;
      }
    }
    return Object.values(bestPerShop).sort((a, b) => b.score - a.score).slice(0, 5);
  }

  function getUniqueRatedShops() {
    const bestPerShop = {};
    for (const r of ratings) {
      if (!bestPerShop[r.shop_id] || r.score > bestPerShop[r.shop_id].score) {
        bestPerShop[r.shop_id] = r;
      }
    }
    return Object.values(bestPerShop).sort((a, b) => b.score - a.score);
  }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={TAN} /></View>;
  }

  const uniqueRatedShops = getUniqueRatedShops();
  const uniqueShopCount = uniqueRatedShops.length;
  const topShops = getTopShops();
  const bestRating = getBestRating();
  const level = getCrawlLevel(uniqueShopCount);

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.menuIcon} onPress={() => setShowAccountInfo(!showAccountInfo)}>
          <View style={styles.menuLine} />
          <View style={styles.menuLine} />
          <View style={styles.menuLine} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.bellIcon}
          onPress={() => {
            setShowNotifications(true);
            loadNotifications();
          }}
        >
          <Text style={styles.bellEmoji}>🔔</Text>
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        {showAccountInfo && (
          <View style={styles.accountInfoBox}>
            <Text style={styles.accountInfoLabel}>Email</Text>
            <Text style={styles.accountInfoValue}>{accountEmail}</Text>
            <Text style={styles.accountInfoLabel}>Member since</Text>
            <Text style={styles.accountInfoValue}>{joinDate}</Text>
            <Text style={styles.accountInfoLabel}>User ID</Text>
            <Text style={styles.accountInfoValue} numberOfLines={1}>{profile?.id}</Text>
            <TouchableOpacity style={styles.mapPrefRow} onPress={() => setShowMapPicker(true)}>
              <Text style={styles.accountInfoLabel}>Default Maps App</Text>
              <Text style={styles.accountInfoValue}>
                {profile?.default_map_app === 'google' ? 'Google Maps' : profile?.default_map_app === 'waze' ? 'Waze' : 'Apple Maps'} ›
              </Text>
            </TouchableOpacity>
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
        <Text style={styles.levelCount}>{uniqueShopCount} {uniqueShopCount === 1 ? 'shop' : 'shops'} rated</Text>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{uniqueShopCount}</Text>
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
          <Text style={[styles.tabBtnText, activeTab === 'all' && styles.tabBtnTextActive]}>All Rated ({uniqueShopCount})</Text>
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
              params: { id: r.shops?.google_place_id || r.shop_id, name: r.shops?.name, address: r.shops?.address }
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
          {uniqueRatedShops.length > 0 ? uniqueRatedShops.map((r, i) => (
            <TouchableOpacity key={r.id} style={styles.shopRow} onPress={() => router.push({
              pathname: '/shop/[id]',
              params: { id: r.shops?.google_place_id || r.shop_id, name: r.shops?.name, address: r.shops?.address }
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

      {/* Notifications modal */}
      <Modal visible={showNotifications} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.notifBox}>
            <View style={styles.notifHeader}>
              <Text style={styles.modalTitle}>Activity</Text>
              <TouchableOpacity onPress={() => setShowNotifications(false)}>
                <Text style={styles.notifClose}>✕</Text>
              </TouchableOpacity>
            </View>
            {loadingNotifications ? (
              <ActivityIndicator color={RUST} style={{ margin: 24 }} />
            ) : notifications.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No activity yet</Text>
                <Text style={styles.emptySubText}>Follow friends to see their ratings here</Text>
              </View>
            ) : (
              <FlatList
                data={notifications}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.notifRow}
                    onPress={() => {
                      setShowNotifications(false);
                      router.push({
                        pathname: '/shop/[id]',
                        params: {
                          id: item.shops?.google_place_id || item.shop_id,
                          name: item.shops?.name,
                          address: item.shops?.address,
                        }
                      });
                    }}
                  >
                    {item.users?.avatar_url ? (
                      <Image source={{ uri: item.users.avatar_url }} style={styles.notifAvatar} />
                    ) : (
                      <View style={styles.notifAvatarPlaceholder}>
                        <Text style={styles.notifAvatarText}>{item.users?.display_name?.[0]?.toUpperCase() || '?'}</Text>
                      </View>
                    )}
                    <View style={styles.notifContent}>
                      <Text style={styles.notifText}>
                        <Text style={styles.notifName}>{item.users?.display_name}</Text>
                        {' rated '}
                        <Text style={styles.notifShop}>{item.shops?.name}</Text>
                      </Text>
                      {item.drink_ordered && (
                        <Text style={styles.notifDrink}>{item.drink_ordered}</Text>
                      )}
                      <Text style={styles.notifTime}>{timeAgo(item.visited_at)}</Text>
                    </View>
                    <View style={styles.notifScore}>
                      <Text style={styles.notifScoreText}>{item.score}</Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

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

      {/* Map preference modal */}
      <Modal visible={showMapPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Default Maps App</Text>
            <Text style={styles.modalSub}>Choose which app opens for directions</Text>
            {['apple', 'google', 'waze'].map(opt => (
              <TouchableOpacity
                key={opt}
                style={styles.mapOptionRow}
                onPress={async () => {
                  await supabase.from('users').update({ default_map_app: opt }).eq('id', profile.id);
                  setProfile({ ...profile, default_map_app: opt });
                  setShowMapPicker(false);
                }}
              >
                <Text style={styles.mapOptionText}>
                  {opt === 'apple' ? 'Apple Maps' : opt === 'google' ? 'Google Maps' : 'Waze'}
                </Text>
                {profile?.default_map_app === opt && <Text style={styles.mapOptionCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowMapPicker(false)}>
              <Text style={styles.modalCancelText}>Close</Text>
            </TouchableOpacity>
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
  menuIcon: { position: 'absolute', top: 44, left: 20, zIndex: 10, padding: 8, gap: 4 },
  menuLine: { width: 22, height: 2.5, backgroundColor: TEXT_LIGHT, borderRadius: 2 },
  bellIcon: { position: 'absolute', top: 44, right: 20, zIndex: 10, padding: 8 },
  bellEmoji: { fontSize: 22 },
  badge: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: TAN, borderRadius: 10,
    minWidth: 18, height: 18,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  badgeText: { fontFamily: 'Lexend_700Bold', fontSize: 10, color: RUST_DARK },
  accountInfoBox: {
    position: 'absolute', top: 80, left: 16,
    backgroundColor: RUST_DARK, borderRadius: 12, padding: 16,
    width: 220, zIndex: 20,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
  },
  accountInfoLabel: { fontFamily: 'Lexend_600SemiBold', fontSize: 11, color: TAN, marginTop: 8 },
  accountInfoValue: { fontFamily: 'Lexend_400Regular', fontSize: 13, color: TEXT_LIGHT, marginTop: 2 },
  mapPrefRow: { marginTop: 8 },
  mapOptionRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 14, backgroundColor: '#FFFBF2', borderRadius: 10, marginBottom: 8,
  },
  mapOptionText: { fontFamily: 'Lexend_600SemiBold', fontSize: 15, color: RUST_DARK },
  mapOptionCheck: { fontFamily: 'Lexend_700Bold', fontSize: 16, color: RUST },
  avatarWrap: { alignItems: 'center', marginBottom: 12 },
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
  notifBox: { backgroundColor: TAN, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%', marginTop: 'auto' },
  notifHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: ESPRESSO,
  },
  notifClose: { fontFamily: 'Lexend_700Bold', fontSize: 16, color: RUST_DARK },
  notifRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, borderBottomWidth: 0.5, borderBottomColor: '#C9AD7E',
  },
  notifAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 10 },
  notifAvatarPlaceholder: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: RUST,
    justifyContent: 'center', alignItems: 'center', marginRight: 10,
  },
  notifAvatarText: { fontFamily: 'Modak_400Regular', fontSize: 16, color: TAN },
  notifContent: { flex: 1 },
  notifText: { fontFamily: 'Lexend_400Regular', fontSize: 13, color: RUST_DARK },
  notifName: { fontFamily: 'Lexend_700Bold', color: RUST_DARK },
  notifShop: { fontFamily: 'Lexend_600SemiBold', color: RUST },
  notifDrink: { fontFamily: 'Lexend_400Regular', fontSize: 11, color: ESPRESSO, marginTop: 2, fontStyle: 'italic' },
  notifTime: { fontFamily: 'Lexend_400Regular', fontSize: 10, color: ESPRESSO, marginTop: 3 },
  notifScore: { backgroundColor: RUST, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8 },
  notifScoreText: { fontFamily: 'Lexend_700Bold', fontSize: 13, color: TEXT_LIGHT },
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