import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, ActivityIndicator, Image, Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';

const RUST = '#8C3235';
const RUST_DARK = '#672427';
const TAN = '#DCCAB4';
const ESPRESSO = '#A36054';
const TEXT_LIGHT = '#E8DCC6';

export default function FriendsScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState(null);
  const [following, setFollowing] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('following');

  useEffect(() => {
    loadFriends();
  }, []);

  async function loadFriends() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: followingData } = await supabase
        .from('follows')
        .select('following_id, users!follows_following_id_fkey(id, display_name, username, avatar_url, signature_drink)')
        .eq('follower_id', user.id);

      const { data: followersData } = await supabase
        .from('follows')
        .select('follower_id, users!follows_follower_id_fkey(id, display_name, username, avatar_url, signature_drink)')
        .eq('following_id', user.id);

      setFollowing((followingData || []).map(f => f.users));
      setFollowers((followersData || []).map(f => f.users));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(query) {
    setSearchQuery(query);
    if (query.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const { data } = await supabase
        .from('users')
        .select('id, display_name, username, avatar_url, signature_drink')
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .neq('id', userId)
        .limit(10);
      setSearchResults(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setSearching(false);
    }
  }

  async function handleFollow(targetId) {
    try {
      const isFollowing = following.some(f => f.id === targetId);
      if (isFollowing) {
        await supabase.from('follows').delete()
          .eq('follower_id', userId).eq('following_id', targetId);
        setFollowing(following.filter(f => f.id !== targetId));
      } else {
        await supabase.from('follows').insert({ follower_id: userId, following_id: targetId });
        const { data } = await supabase
          .from('users')
          .select('id, display_name, username, avatar_url, signature_drink')
          .eq('id', targetId)
          .single();
        setFollowing([...following, data]);
      }
    } catch (e) {
      Alert.alert('Error', 'Could not update follow status.');
    }
  }

  function isFollowing(id) {
    return following.some(f => f?.id === id);
  }

  function UserCard({ user, showFollow = true }) {
    if (!user) return null;
    return (
      <TouchableOpacity style={styles.userCard} onPress={() => router.push(`/user/${user.id}`)}>
        <View style={styles.userLeft}>
          {user.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {user.display_name?.[0]?.toUpperCase() || '?'}
              </Text>
            </View>
          )}
          <View style={styles.userInfo}>
            <Text style={styles.displayName}>{user.display_name}</Text>
            <Text style={styles.username}>@{user.username}</Text>
            {user.signature_drink && (
              <Text style={styles.signatureDrink}>{user.signature_drink}</Text>
            )}
          </View>
        </View>
        {showFollow && user.id !== userId && (
          <TouchableOpacity
            style={[styles.followBtn, isFollowing(user.id) && styles.followingBtn]}
            onPress={(e) => { e.stopPropagation(); handleFollow(user.id); }}
          >
            <Text style={[styles.followBtnText, isFollowing(user.id) && styles.followingBtnText]}>
              {isFollowing(user.id) ? 'Following' : 'Follow'}
            </Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={TAN} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or username..."
          placeholderTextColor={ESPRESSO}
          value={searchQuery}
          onChangeText={handleSearch}
          autoCapitalize="none"
        />
        {searching && <ActivityIndicator size="small" color={RUST} style={styles.searchSpinner} />}
      </View>

      {searchQuery.length > 1 && (
        <View style={styles.searchResults}>
          {searchResults.length === 0 && !searching ? (
            <Text style={styles.noResults}>No users found</Text>
          ) : (
            searchResults.map(user => (
              <UserCard key={user.id} user={user} showFollow={true} />
            ))
          )}
        </View>
      )}

      {searchQuery.length === 0 && (
        <>
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, tab === 'following' && styles.tabActive]}
              onPress={() => setTab('following')}
            >
              <Text style={[styles.tabText, tab === 'following' && styles.tabTextActive]}>
                Following ({following.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, tab === 'followers' && styles.tabActive]}
              onPress={() => setTab('followers')}
            >
              <Text style={[styles.tabText, tab === 'followers' && styles.tabTextActive]}>
                Followers ({followers.length})
              </Text>
            </TouchableOpacity>
          </View>

          {tab === 'following' && (
            following.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>You're not following anyone yet</Text>
                <Text style={styles.emptySubtext}>Search for friends above!</Text>
              </View>
            ) : (
              <FlatList
                data={following}
                keyExtractor={(item) => item?.id}
                renderItem={({ item }) => <UserCard user={item} showFollow={true} />}
              />
            )
          )}

          {tab === 'followers' && (
            followers.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No followers yet</Text>
                <Text style={styles.emptySubtext}>Share your profile to get followers!</Text>
              </View>
            ) : (
              <FlatList
                data={followers}
                keyExtractor={(item) => item?.id}
                renderItem={({ item }) => <UserCard user={item} showFollow={true} />}
              />
            )
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: RUST },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: RUST },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    backgroundColor: TAN,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontFamily: 'Lexend_400Regular',
    fontSize: 14,
    color: RUST_DARK,
  },
  searchSpinner: { marginLeft: 8 },
  searchResults: {
    marginHorizontal: 16,
    backgroundColor: RUST_DARK,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
  },
  noResults: { fontFamily: 'Lexend_400Regular', padding: 16, color: TAN, fontSize: 14 },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: RUST_DARK,
    borderRadius: 12,
    padding: 4,
  },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  tabActive: { backgroundColor: TAN },
  tabText: { fontFamily: 'Lexend_600SemiBold', fontSize: 13, color: TAN },
  tabTextActive: { color: RUST_DARK },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: ESPRESSO,
  },
  userLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22, marginRight: 10 },
  avatarPlaceholder: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: TAN,
    justifyContent: 'center', alignItems: 'center',
    marginRight: 10,
  },
  avatarText: { fontFamily: 'Modak_400Regular', fontSize: 16, color: RUST },
  userInfo: { flex: 1 },
  displayName: { fontFamily: 'Lexend_700Bold', fontSize: 14, color: TEXT_LIGHT },
  username: { fontFamily: 'Lexend_400Regular', fontSize: 12, color: TAN, marginTop: 1 },
  signatureDrink: { fontFamily: 'Lexend_400Regular', fontSize: 11, color: TAN, marginTop: 2, fontStyle: 'italic' },
  followBtn: {
    backgroundColor: TAN,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  followingBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: TAN,
  },
  followBtnText: { fontFamily: 'Lexend_700Bold', fontSize: 13, color: RUST_DARK },
  followingBtnText: { color: TAN },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { fontFamily: 'Modak_400Regular', fontSize: 18, color: TEXT_LIGHT, marginBottom: 8 },
  emptySubtext: { fontFamily: 'Lexend_400Regular', fontSize: 13, color: TAN },
});