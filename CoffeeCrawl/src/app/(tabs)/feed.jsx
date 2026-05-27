import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  ActivityIndicator, TouchableOpacity, RefreshControl, Image, ScrollView
} from 'react-native';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'expo-router';

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

      const { data: following } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id);

      const followingIds = (following || []).map(f => f.following_id);
      followingIds.push(user.id);

      // Get ratings with posts (photos) joined
      const { data: ratingsData } = await supabase
        .from('ratings')
        .select(`
          *,
          shops(name, address, google_place_id),
          users(display_name, username, avatar_url),
          posts(photo_urls, caption)
        `)
        .in('user_id', followingIds)
        .order('visited_at', { ascending: false })
        .limit(50);

      setPosts(ratingsData || []);
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
        <ActivityIndicator size="large" color="#D8AA84" />
      </View>
    );
  }

  if (posts.length === 0) {
    return (
      <View style={styles.centered}>
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
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#D8AA84" />
        }
        renderItem={({ item }) => {
          const photoUrls = item.posts?.[0]?.photo_urls || [];
          const hasPhotos = photoUrls.length > 0;

          return (
            <View style={styles.card}>
              {/* Header */}
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

              {/* Photos collage */}
              {hasPhotos && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.photoScroll}
                >
                  {photoUrls.map((url, i) => (
                    <Image key={i} source={{ uri: url }} style={styles.photo} />
                  ))}
                </ScrollView>
              )}

              {/* Shop info */}
              <TouchableOpacity
                style={styles.shopInfo}
                onPress={() => router.push({
                  pathname: '/shop/[id]',
                  params: {
                    id: item.shop_id,
                    name: item.shops?.name,
                    address: item.shops?.address,
                  }
                })}
              >
                <Text style={styles.shopName}>{item.shops?.name}</Text>
                <Text style={styles.shopAddress} numberOfLines={1}>{item.shops?.address}</Text>
              </TouchableOpacity>

              {/* Drink and note */}
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
  container: { flex: 1, backgroundColor: '#A89880' },
  centered: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#A89880', padding: 24,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#FFF8F9', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#F0E8E0', textAlign: 'center', marginBottom: 24 },
  findFriendsButton: {
    backgroundColor: '#FFF0F2',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  findFriendsText: { fontSize: 14, fontWeight: '600', color: '#A89880' },
  card: {
    backgroundColor: '#9A8870',
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
    backgroundColor: '#FFF0F2',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '700', color: '#A89880' },
  headerInfo: { flex: 1 },
  displayName: { fontSize: 14, fontWeight: '600', color: '#FFF8F9' },
  meta: { fontSize: 12, color: '#F0E8E0', marginTop: 1 },
  scoreBadge: {
    backgroundColor: '#FFF0F2',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  scoreText: { fontSize: 14, fontWeight: '700', color: '#A89880' },
  photoScroll: { marginBottom: 2 },
  photo: {
    width: 260,
    height: 200,
    marginRight: 2,
  },
  shopInfo: {
    backgroundColor: '#A89880',
    marginHorizontal: 14,
    marginVertical: 10,
    borderRadius: 10,
    padding: 10,
  },
  shopName: { fontSize: 14, fontWeight: '600', color: '#FFF8F9' },
  shopAddress: { fontSize: 12, color: '#F0E8E0', marginTop: 2 },
  drinkPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF0F2',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginHorizontal: 14,
    marginBottom: 10,
  },
  drinkText: { fontSize: 12, color: '#A89880', fontWeight: '500' },
  note: {
    fontSize: 13, color: '#FFE8EC',
    fontStyle: 'italic',
    marginHorizontal: 14,
    marginBottom: 14,
  },
});