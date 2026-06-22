import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Image
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';

const RUST = '#8C3235';
const RUST_DARK = '#672427';
const TAN = '#DCCAB4';
const ESPRESSO = '#A36054';
const TEXT_LIGHT = '#E8DCC6';

export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [ratings, setRatings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [myUserId, setMyUserId] = useState(null);

  useEffect(() => {
    loadPublicProfile();
  }, [id]);

  async function loadPublicProfile() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setMyUserId(user.id);

      const { data: profileData } = await supabase
        .from('users').select('*').eq('id', id).single();

      const { data: ratingsData } = await supabase
        .from('ratings')
        .select('*, shops(name, address, google_place_id)')
        .eq('user_id', id)
        .order('score', { ascending: false });

      setProfile(profileData);
      setRatings(ratingsData || []);

      if (user) {
        const { data: followData } = await supabase
          .from('follows')
          .select('follower_id')
          .eq('follower_id', user.id)
          .eq('following_id', id)
          .maybeSingle();
        setIsFollowing(!!followData);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleFollow() {
    if (!myUserId) return;
    setFollowLoading(true);
    try {
      if (isFollowing) {
        await supabase.from('follows').delete()
          .eq('follower_id', myUserId).eq('following_id', id);
        setIsFollowing(false);
      } else {
        await supabase.from('follows').insert({ follower_id: myUserId, following_id: id });
        setIsFollowing(true);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setFollowLoading(false);
    }
  }

  function getCrawlLevel(count) {
    if (count >= 100) return { title: 'Crawl Legend' };
    if (count >= 50) return { title: 'Head Roaster' };
    if (count >= 30) return { title: 'Coffee Snob' };
    if (count >= 15) return { title: 'Buzz Chaser' };
    if (count >= 5) return { title: 'First Sip' };
    return { title: 'Coffee Virgin' };
  }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={TAN} /></View>;
  }

  const level = getCrawlLevel(ratings.length);
  const bestRating = ratings.length > 0 ? ratings[0] : null;
  const isMe = myUserId === id;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.profileHeader}>
        {profile?.avatar_url ? (
          <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{profile?.display_name?.[0]?.toUpperCase() || '?'}</Text>
          </View>
        )}
        <Text style={styles.displayName}>{profile?.display_name}</Text>
        <Text style={styles.username}>@{profile?.username}</Text>

        {profile?.signature_drink && (
          <View style={styles.signaturePill}>
            <Text style={styles.signatureLabel}>Current order</Text>
            <Text style={styles.signatureDrink}>{profile.signature_drink}</Text>
          </View>
        )}

        {!isMe && myUserId && (
          <TouchableOpacity
            style={[styles.followBtn, isFollowing && styles.followingBtn]}
            onPress={handleToggleFollow}
            disabled={followLoading}
          >
            {followLoading ? (
              <ActivityIndicator color={isFollowing ? TAN : RUST_DARK} />
            ) : (
              <Text style={[styles.followBtnText, isFollowing && styles.followingBtnText]}>
                {isFollowing ? 'Following' : 'Follow'}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.levelBadge}>
        <Text style={styles.levelTitle}>{level.title}</Text>
        <Text style={styles.levelCount}>{ratings.length} ratings</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{ratings.length}</Text>
          <Text style={styles.statLabel}>Rated</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statNum}>{bestRating ? bestRating.score : '—'}</Text>
          <Text style={styles.statLabel}>Best score</Text>
          {bestRating && <Text style={styles.statShop} numberOfLines={1}>{bestRating.shops?.name}</Text>}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Coffee Shops Tried</Text>
        {ratings.length > 0 ? ratings.map((r, i) => (
          <TouchableOpacity
            key={r.id}
            style={styles.shopRow}
            onPress={() => router.push({
              pathname: '/shop/[id]',
              params: {
                id: r.shops?.google_place_id || r.shop_id,
                name: r.shops?.name,
                address: r.shops?.address,
              }
            })}
          >
            <Text style={styles.shopRank}>#{i + 1}</Text>
            <View style={styles.shopInfo}>
              <Text style={styles.shopName}>{r.shops?.name}</Text>
              {r.drink_ordered && <Text style={styles.shopDrink}>{r.drink_ordered}</Text>}
              {r.note && <Text style={styles.ratingNote}>"{r.note}"</Text>}
            </View>
            <View style={styles.scoreBadge}>
              <Text style={styles.scoreText}>{r.score}</Text>
            </View>
          </TouchableOpacity>
        )) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No ratings yet</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: RUST },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: RUST },
  header: { padding: 16, paddingTop: 56 },
  backButton: { alignSelf: 'flex-start' },
  backText: { fontFamily: 'Lexend_700Bold', color: TEXT_LIGHT, fontSize: 16 },
  profileHeader: { alignItems: 'center', padding: 24, paddingTop: 8 },
  avatar: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: TAN,
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  avatarImage: { width: 80, height: 80, borderRadius: 40, marginBottom: 8 },
  avatarText: { fontFamily: 'Modak_400Regular', fontSize: 28, color: RUST },
  displayName: { fontFamily: 'Modak_400Regular', fontSize: 24, color: TEXT_LIGHT, marginBottom: 2 },
  username: { fontFamily: 'Lexend_500Medium', fontSize: 14, color: TAN, marginBottom: 12 },
  signaturePill: {
    backgroundColor: TAN, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10,
    alignItems: 'center', marginBottom: 12,
  },
  signatureLabel: { fontFamily: 'Lexend_400Regular', fontSize: 11, color: RUST_DARK, marginBottom: 2 },
  signatureDrink: { fontFamily: 'Lexend_700Bold', fontSize: 14, color: RUST_DARK },
  followBtn: { backgroundColor: TAN, borderRadius: 20, paddingHorizontal: 24, paddingVertical: 8 },
  followingBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: TAN },
  followBtnText: { fontFamily: 'Lexend_700Bold', fontSize: 14, color: RUST_DARK },
  followingBtnText: { color: TAN },
  levelBadge: {
    alignSelf: 'center', backgroundColor: TAN, borderRadius: 20,
    paddingHorizontal: 24, paddingVertical: 10, marginBottom: 16, alignItems: 'center',
  },
  levelTitle: { fontFamily: 'Modak_400Regular', fontSize: 16, color: RUST },
  levelCount: { fontFamily: 'Lexend_500Medium', fontSize: 11, color: RUST_DARK, marginTop: 2 },
  statsRow: {
    flexDirection: 'row', backgroundColor: RUST_DARK, marginHorizontal: 16,
    borderRadius: 16, padding: 16, marginBottom: 16,
  },
  stat: { flex: 1, alignItems: 'center' },
  statNum: { fontFamily: 'Modak_400Regular', fontSize: 22, color: TEXT_LIGHT },
  statLabel: { fontFamily: 'Lexend_400Regular', fontSize: 11, color: TAN, marginTop: 2 },
  statShop: { fontFamily: 'Lexend_400Regular', fontSize: 10, color: TAN, marginTop: 2, textAlign: 'center' },
  statDivider: { width: 1, backgroundColor: ESPRESSO },
  section: { marginHorizontal: 16, marginBottom: 24 },
  sectionTitle: { fontFamily: 'Modak_400Regular', fontSize: 18, color: TEXT_LIGHT, marginBottom: 12 },
  shopRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: RUST_DARK,
    borderRadius: 12, padding: 12, marginBottom: 8,
  },
  shopRank: { fontFamily: 'Lexend_700Bold', fontSize: 13, color: TAN, width: 28 },
  shopInfo: { flex: 1 },
  shopName: { fontFamily: 'Lexend_700Bold', fontSize: 14, color: TEXT_LIGHT },
  shopDrink: { fontFamily: 'Lexend_400Regular', fontSize: 12, color: TAN, marginTop: 2 },
  ratingNote: { fontFamily: 'Lexend_400Regular', fontSize: 11, color: TAN, fontStyle: 'italic', marginTop: 2 },
  scoreBadge: { backgroundColor: TAN, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  scoreText: { fontFamily: 'Lexend_700Bold', fontSize: 14, color: RUST_DARK },
  emptyState: { alignItems: 'center', padding: 24 },
  emptyText: { fontFamily: 'Lexend_500Medium', fontSize: 14, color: TAN },
});