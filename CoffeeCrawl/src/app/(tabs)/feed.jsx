import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  ActivityIndicator, TouchableOpacity, RefreshControl, Image, ScrollView
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'expo-router';

const RUST = '#8C3235';
const RUST_DARK = '#672427';
const TAN = '#DCCAB4';
const ESPRESSO = '#A36054';
const TEXT_LIGHT = '#E8DCC6';

function FeedVideo({ url }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
  });
  return (
    <VideoView
      style={styles.photo}
      player={player}
      allowsFullscreen
      allowsPictureInPicture
      contentFit="cover"
    />
  );
}

export default function FeedScreen() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  useEffect(() => {
    loadFeed();
  }, []);

  async function loadFeed() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: following }, { data: followers }] = await Promise.all([
        supabase.from('follows').select('following_id').eq('follower_id', user.id),
        supabase.from('follows').select('follower_id').eq('following_id', user.id),
      ]);

      const followingIds = (following || []).map(f => f.following_id);
      const followerIds = (followers || []).map(f => f.follower_id);
      followingIds.push(user.id);

      const { data: ratingsData } = await supabase
        .from('ratings')
        .select(`
          *,
          shops(name, address, google_place_id),
          users(display_name, username, avatar_url),
          posts(photo_urls, media_types, caption)
        `)
        .in('user_id', followingIds)
        .order('visited_at', { ascending: false })
        .limit(50);

      const visible = (ratingsData || []).filter(r => {
        if (r.user_id === user.id) return true;
        const vis = r.visibility || 'public';
        if (vis === 'public') return true;
        if (vis === 'private') return false;
        if (vis === 'friends') return followerIds.includes(r.user_id);
        return false;
      });

      setPosts(visible);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadFeed();
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

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={TAN} />
      </View>
    );
  }

  if (posts.length === 0) {
    return (
      <View style={styles.centered}>
        <TouchableOpacity style={styles.postButton} onPress={() => router.push('/post')}>
          <Text style={styles.postButtonText}>+ New Post</Text>
        </TouchableOpacity>
        <Text style={styles.emptyTitle}>Your feed is empty</Text>
        <Text style={styles.emptySubtitle}>Rate a coffee shop or follow friends to see their crawls here</Text>
        <TouchableOpacity
          style={styles.findFriendsButton}
          onPress={() => router.push('/(tabs)/map')}
        >
          <Text style={styles.findFriendsText}>Find Coffee Shops</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.postButton} onPress={() => router.push('/post')}>
        <Text style={styles.postButtonText}>+ New Post</Text>
      </TouchableOpacity>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={TAN} />
        }
        renderItem={({ item }) => {
          const photoUrls = item.posts?.[0]?.photo_urls || [];
          const mediaTypes = item.posts?.[0]?.media_types || [];
          const hasMedia = photoUrls.length > 0;

          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.avatarWrap}>
                  {item.users?.avatar_url ? (
                    <Image source={{ uri: item.users.avatar_url }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Text style={styles.avatarText}>
                        {item.users?.display_name?.[0]?.toUpperCase() || '?'}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.headerInfo}>
                  <Text style={styles.displayName}>{item.users?.display_name}</Text>
                  <Text style={styles.meta}>
                    @{item.users?.username} · {timeAgo(item.visited_at)}
                  </Text>
                </View>
                <View style={styles.scoreBadge}>
                  <Text style={styles.scoreText}>{item.score}/5</Text>
                </View>
              </View>

              {hasMedia && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.photoScroll}
                >
                  {photoUrls.map((url, i) => {
                    const isVideo = mediaTypes[i] === 'video';
                    return isVideo ? (
                      <FeedVideo key={i} url={url} />
                    ) : (
                      <Image key={i} source={{ uri: url }} style={styles.photo} />
                    );
                  })}
                </ScrollView>
              )}

              <TouchableOpacity
                style={styles.shopInfo}
                onPress={() => router.push({
                  pathname: '/shop/[id]',
                  params: {
                    id: item.shops?.google_place_id || item.shop_id,
                    name: item.shops?.name,
                    address: item.shops?.address,
                  }
                })}
              >
                <Text style={styles.shopName}>{item.shops?.name}</Text>
                <Text style={styles.shopAddress} numberOfLines={1}>{item.shops?.address}</Text>
              </TouchableOpacity>

              {item.drink_ordered && (
                <View style={styles.drinkPill}>
                  <Text style={styles.drinkText}>{item.drink_ordered}</Text>
                </View>
              )}
              {item.note && (
                <Text style={styles.note}>"{item.note}"</Text>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: RUST },
  centered: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: RUST, padding: 24,
  },
  postButton: {
    backgroundColor: TAN,
    borderRadius: 14,
    margin: 16,
    marginBottom: 0,
    padding: 14,
    alignItems: 'center',
  },
  postButtonText: { fontFamily: 'Lexend_700Bold', fontSize: 15, color: RUST_DARK },
  emptyTitle: { fontFamily: 'Modak_400Regular', fontSize: 22, color: TEXT_LIGHT, marginBottom: 8, marginTop: 24 },
  emptySubtitle: { fontFamily: 'Lexend_400Regular', fontSize: 14, color: TAN, textAlign: 'center', marginBottom: 24 },
  findFriendsButton: {
    backgroundColor: TAN,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  findFriendsText: { fontFamily: 'Lexend_700Bold', fontSize: 14, color: RUST_DARK },
  card: {
    backgroundColor: RUST_DARK,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    paddingBottom: 10,
  },
  avatarWrap: { marginRight: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarPlaceholder: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: TAN,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontFamily: 'Modak_400Regular', fontSize: 16, color: RUST },
  headerInfo: { flex: 1 },
  displayName: { fontFamily: 'Lexend_700Bold', fontSize: 14, color: TEXT_LIGHT },
  meta: { fontFamily: 'Lexend_400Regular', fontSize: 12, color: TAN, marginTop: 1 },
  scoreBadge: {
    backgroundColor: TAN,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  scoreText: { fontFamily: 'Lexend_700Bold', fontSize: 14, color: RUST_DARK },
  photoScroll: { marginBottom: 2 },
  photo: {
    width: 260,
    height: 200,
    marginRight: 2,
  },
  shopInfo: {
    backgroundColor: RUST,
    marginHorizontal: 14,
    marginVertical: 10,
    borderRadius: 10,
    padding: 10,
  },
  shopName: { fontFamily: 'Lexend_700Bold', fontSize: 14, color: TEXT_LIGHT },
  shopAddress: { fontFamily: 'Lexend_400Regular', fontSize: 12, color: TAN, marginTop: 2 },
  drinkPill: {
    alignSelf: 'flex-start',
    backgroundColor: TAN,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginHorizontal: 14,
    marginBottom: 10,
  },
  drinkText: { fontFamily: 'Lexend_600SemiBold', fontSize: 12, color: RUST_DARK },
  note: {
    fontFamily: 'Lexend_400Regular',
    fontSize: 13, color: TAN,
    fontStyle: 'italic',
    marginHorizontal: 14,
    marginBottom: 14,
  },
});