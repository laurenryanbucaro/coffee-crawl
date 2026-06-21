import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert, ActivityIndicator, Image
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import * as ImagePicker from 'expo-image-picker';

const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY;

export default function ComposePostScreen() {
  const router = useRouter();
  const [step, setStep] = useState('shop');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedShop, setSelectedShop] = useState(null);

  const [userScore, setUserScore] = useState(null);
  const [drinkOrdered, setDrinkOrdered] = useState('');
  const [note, setNote] = useState('');
  const [media, setMedia] = useState([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [saving, setSaving] = useState(false);
  const searchTimer = useRef(null);

  function handleSearchChange(text) {
    setSearchQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (text.length < 2) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(() => searchShops(text), 400);
  }

  async function searchShops(query) {
    setSearching(true);
    try {
      const [supabaseRes, googleRes] = await Promise.all([
        supabase.from('shops').select('id, name, address, google_place_id').ilike('name', `%${query}%`).limit(10),
        fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_KEY,
            'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress',
          },
          body: JSON.stringify({ textQuery: `${query} coffee`, maxResultCount: 10 }),
        }).then(r => r.json()),
      ]);

      const supabaseShops = (supabaseRes.data || []).map(s => ({
        id: s.google_place_id || `supabase-${s.id}`,
        name: s.name,
        address: s.address,
        source: 'supabase',
      }));

      const googleShops = (googleRes.places || []).map(p => ({
        id: p.id,
        name: p.displayName?.text,
        address: p.formattedAddress,
        source: 'google',
      }));

      const seen = new Set();
      const combined = [...supabaseShops, ...googleShops].filter(s => {
        const key = s.name?.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      setSearchResults(combined);
    } catch (e) {
      console.error('Search error:', e);
    } finally {
      setSearching(false);
    }
  }

  function selectShop(shop) {
    setSelectedShop(shop);
    setStep('rate');
  }

  async function handlePickMedia() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      quality: 0.6,
      videoMaxDuration: 180,
    });
    if (result.canceled) return;

    setUploadingMedia(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const uploadedItems = [];

      for (const asset of result.assets) {
        const isVideo = asset.type === 'video';
        const ext = isVideo ? 'mp4' : 'jpg';
        const fileName = `${session.user.id}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const formData = new FormData();
        formData.append('file', {
          uri: asset.uri,
          name: fileName,
          type: isVideo ? 'video/mp4' : 'image/jpeg',
        });

        const uploadResponse = await fetch(
          `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/posts/${fileName}`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              'x-upsert': 'true',
            },
            body: formData,
          }
        );

        if (uploadResponse.ok) {
          const { data: { publicUrl } } = supabase.storage.from('posts').getPublicUrl(fileName);
          uploadedItems.push({ url: publicUrl, type: isVideo ? 'video' : 'image' });
        } else {
          console.error('Upload failed:', await uploadResponse.text());
        }
      }
      setMedia([...media, ...uploadedItems]);
    } catch (e) {
      Alert.alert('Error', 'Could not upload media. Please try again.');
    } finally {
      setUploadingMedia(false);
    }
  }

  async function handleSubmit() {
    if (!userScore) {
      Alert.alert('Score required', 'Please rate this shop before posting.');
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { Alert.alert('Not logged in'); setSaving(false); return; }

      let shopId;
      const { data: existingShop } = await supabase
        .from('shops')
        .select('id')
        .eq('google_place_id', selectedShop.id)
        .maybeSingle();

      if (!existingShop) {
        const { data: newShop, error: shopError } = await supabase
          .from('shops')
          .insert({
            name: selectedShop.name,
            address: selectedShop.address,
            google_place_id: selectedShop.id,
          })
          .select('id')
          .single();
        if (shopError) throw shopError;
        shopId = newShop.id;
      } else {
        shopId = existingShop.id;
      }

      const { data: ratingData, error: ratingError } = await supabase
        .from('ratings')
        .upsert({
          user_id: user.id,
          shop_id: shopId,
          score: userScore,
          drink_ordered: drinkOrdered || null,
          note: note || null,
          visited_at: new Date().toISOString(),
        }, { onConflict: 'user_id,shop_id' })
        .select('id')
        .single();

      if (ratingError) throw ratingError;

      await supabase.from('posts').insert({
        user_id: user.id,
        rating_id: ratingData.id,
        photo_urls: media.map(m => m.url),
        media_types: media.map(m => m.type),
        caption: note || null,
      });

      Alert.alert('Posted!', `Your post about ${selectedShop.name} is live.`, [
        { text: 'Great!', onPress: () => router.push('/(tabs)/feed') }
      ]);
    } catch (e) {
      console.error('Post error:', e);
      Alert.alert('Error', 'Could not create post. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => step === 'shop' ? router.back() : setStep('shop')}>
          <Text style={styles.backText}>← {step === 'shop' ? 'Cancel' : 'Change shop'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Post</Text>
        <View style={{ width: 60 }} />
      </View>

      {step === 'shop' && (
        <View style={styles.shopStep}>
          <Text style={styles.stepLabel}>Which coffee shop?</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search coffee shops..."
            placeholderTextColor="#C4B09A"
            value={searchQuery}
            onChangeText={handleSearchChange}
            autoFocus
          />
          {searching && <ActivityIndicator color="#FFB6C1" style={{ marginTop: 12 }} />}
          <ScrollView style={styles.resultsList}>
            {searchResults.map((shop) => (
              <TouchableOpacity key={shop.id} style={styles.resultRow} onPress={() => selectShop(shop)}>
                <Text style={styles.resultName}>{shop.name}</Text>
                <Text style={styles.resultAddress} numberOfLines={1}>{shop.address}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {step === 'rate' && selectedShop && (
        <ScrollView style={styles.rateStep} contentContainerStyle={{ paddingBottom: 60 }}>
          <View style={styles.selectedShopCard}>
            <Text style={styles.selectedShopName}>{selectedShop.name}</Text>
            <Text style={styles.selectedShopAddress}>{selectedShop.address}</Text>
          </View>

          <Text style={styles.modalLabel}>Score (1–5) *</Text>
          <View style={styles.scoreRow}>
            {[1, 2, 3, 4, 5].map(n => (
              <TouchableOpacity
                key={n}
                style={[styles.scoreBtn, userScore === n && styles.scoreBtnActive]}
                onPress={() => setUserScore(n)}
              >
                <Text style={[styles.scoreBtnText, userScore === n && styles.scoreBtnTextActive]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.modalLabel}>Drink ordered</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Iced oat latte"
            placeholderTextColor="#C4B09A"
            value={drinkOrdered}
            onChangeText={setDrinkOrdered}
          />

          <Text style={styles.modalLabel}>Caption</Text>
          <TextInput
            style={[styles.input, styles.inputMulti]}
            placeholder="Share your thoughts..."
            placeholderTextColor="#C4B09A"
            value={note}
            onChangeText={setNote}
            multiline
          />

          <Text style={styles.modalLabel}>Photos & Videos</Text>
          <TouchableOpacity style={styles.mediaPickerButton} onPress={handlePickMedia} disabled={uploadingMedia}>
            {uploadingMedia ? (
              <ActivityIndicator color="#A89880" />
            ) : (
              <Text style={styles.mediaPickerText}>
                {media.length > 0 ? `${media.length} item${media.length > 1 ? 's' : ''} added` : '+ Add photos or videos'}
              </Text>
            )}
          </TouchableOpacity>

          {media.length > 0 && (
            <ScrollView horizontal style={{ marginTop: 10 }}>
              {media.map((item, i) => (
                <View key={i} style={styles.mediaPreviewWrap}>
                  {item.type === 'video' ? (
                    <View style={styles.videoPreview}>
                      <Text style={styles.videoIcon}>▶</Text>
                    </View>
                  ) : (
                    <Image source={{ uri: item.url }} style={styles.mediaPreview} />
                  )}
                  <TouchableOpacity
                    style={styles.mediaRemove}
                    onPress={() => setMedia(media.filter((_, idx) => idx !== i))}
                  >
                    <Text style={styles.mediaRemoveText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}

          <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} disabled={saving}>
            {saving ? <ActivityIndicator color="#FFF8F9" /> : <Text style={styles.submitText}>Post</Text>}
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#A89880' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, paddingTop: 56,
  },
  backText: { color: '#FFF8F9', fontSize: 14, fontWeight: '600' },
  headerTitle: { color: '#FFF8F9', fontSize: 16, fontWeight: '700' },
  shopStep: { flex: 1, padding: 16 },
  stepLabel: { fontSize: 16, fontWeight: '700', color: '#FFF8F9', marginBottom: 12 },
  searchInput: {
    backgroundColor: '#FFF0F2', borderRadius: 12, padding: 14,
    fontSize: 14, color: '#3D2B1F',
  },
  resultsList: { marginTop: 12 },
  resultRow: {
    backgroundColor: '#9A8870', borderRadius: 12, padding: 14, marginBottom: 8,
  },
  resultName: { fontSize: 14, fontWeight: '600', color: '#FFF8F9' },
  resultAddress: { fontSize: 12, color: '#F0E8E0', marginTop: 2 },
  rateStep: { flex: 1, padding: 16 },
  selectedShopCard: {
    backgroundColor: '#9A8870', borderRadius: 16, padding: 16, marginBottom: 16,
  },
  selectedShopName: { fontSize: 18, fontWeight: '700', color: '#FFF8F9' },
  selectedShopAddress: { fontSize: 13, color: '#F0E8E0', marginTop: 4 },
  modalLabel: { fontSize: 13, fontWeight: '600', color: '#FFF8F9', marginBottom: 8, marginTop: 12 },
  scoreRow: { flexDirection: 'row', gap: 12 },
  scoreBtn: {
    flex: 1, height: 48, borderRadius: 10, borderWidth: 1.5, borderColor: '#D8C4B8',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFB6C1',
  },
  scoreBtnActive: { backgroundColor: '#3D2B1F', borderColor: '#3D2B1F' },
  scoreBtnText: { fontSize: 16, fontWeight: '600', color: '#3D2B1F' },
  scoreBtnTextActive: { color: '#FFB6C1' },
  input: {
    borderWidth: 1, borderColor: '#D8C4B8', borderRadius: 10, padding: 12,
    fontSize: 14, color: '#3D2B1F', backgroundColor: '#FFF0F2',
  },
  inputMulti: { height: 80, textAlignVertical: 'top' },
  mediaPickerButton: {
    borderWidth: 1.5, borderColor: '#D8C4B8', borderStyle: 'dashed', borderRadius: 10,
    padding: 14, alignItems: 'center', backgroundColor: '#FFF0F2',
  },
  mediaPickerText: { fontSize: 14, color: '#A89880', fontWeight: '500' },
  mediaPreviewWrap: { position: 'relative', marginRight: 8 },
  mediaPreview: { width: 80, height: 80, borderRadius: 10 },
  videoPreview: {
    width: 80, height: 80, borderRadius: 10, backgroundColor: '#3D2B1F',
    justifyContent: 'center', alignItems: 'center',
  },
  videoIcon: { color: '#FFB6C1', fontSize: 24 },
  mediaRemove: {
    position: 'absolute', top: -6, right: -6, backgroundColor: '#3D2B1F',
    borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center',
  },
  mediaRemoveText: { color: '#FFF8F9', fontSize: 10, fontWeight: '700' },
  submitButton: {
    backgroundColor: '#FFB6C1', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 24,
  },
  submitText: { fontSize: 16, fontWeight: '700', color: '#3D2B1F' },
});