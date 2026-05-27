import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ScrollView, Alert, Modal, ActivityIndicator, Image, Linking
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import * as ImagePicker from 'expo-image-picker';

const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY;

export default function ShopDetailScreen() {
  const { id, name, address, rating } = useLocalSearchParams();
  const router = useRouter();

  const [userScore, setUserScore] = useState(null);
  const [drinkOrdered, setDrinkOrdered] = useState('');
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState([]);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [shopDetails, setShopDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [existingRatingId, setExistingRatingId] = useState(null);

  useEffect(() => {
    fetchShopDetails();
    loadExistingRating();
  }, []);

  async function fetchShopDetails() {
    const isManual = !id || id.toString().startsWith('supabase-') ||
                     id.toString().startsWith('manual-') ||
                     id.toString().startsWith('golden-');
    if (isManual) { setLoadingDetails(false); return; }
    try {
      const response = await fetch(
        `https://places.googleapis.com/v1/places/${id}`,
        {
          headers: {
            'X-Goog-Api-Key': GOOGLE_KEY,
            'X-Goog-FieldMask': 'websiteUri,nationalPhoneNumber,regularOpeningHours,priceLevel',
          },
        }
      );
      const data = await response.json();
      setShopDetails(data);
    } catch (e) {
      console.error('Shop details error:', e);
    } finally {
      setLoadingDetails(false);
    }
  }

async function loadExistingRating() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Try finding shop by google_place_id first
      let shopData = null;
      const { data: byPlaceId } = await supabase
        .from('shops')
        .select('id')
        .eq('google_place_id', id)
        .maybeSingle();

      shopData = byPlaceId;

      // If not found, try by UUID directly
      if (!shopData) {
        const { data: byId } = await supabase
          .from('shops')
          .select('id')
          .eq('id', id)
          .maybeSingle();
        shopData = byId;
      }

      if (!shopData) return;

      const { data: ratingData } = await supabase
        .from('ratings')
        .select('*')
        .eq('user_id', user.id)
        .eq('shop_id', shopData.id)
        .maybeSingle();

      if (ratingData) {
        setUserScore(ratingData.score);
        setDrinkOrdered(ratingData.drink_ordered || '');
        setNote(ratingData.note || '');
        setExistingRatingId(ratingData.id);
        setSubmitted(true);
      }
    } catch (e) {
      console.error('Load rating error:', e);
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
      allowsMultipleSelection: true,
      quality: 0.6,
    });
    if (result.canceled) return;

    setUploadingPhoto(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const uploadedUrls = [];

      for (const asset of result.assets) {
        const fileName = `${session.user.id}-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
        const formData = new FormData();
        formData.append('file', {
          uri: asset.uri,
          name: fileName,
          type: 'image/jpeg',
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
          const { data: { publicUrl } } = supabase.storage
            .from('posts')
            .getPublicUrl(fileName);
          uploadedUrls.push(publicUrl);
        } else {
          const err = await uploadResponse.text();
          console.error('Upload failed:', err);
        }
      }
      setPhotos([...photos, ...uploadedUrls]);
    } catch (e) {
      Alert.alert('Error', 'Could not upload photos. Please try again.');
      console.error(e);
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSubmitRating() {
    if (!userScore) {
      Alert.alert('Score required', 'Please select a score before submitting.');
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Not logged in', 'Please log in to rate shops.');
        setSaving(false);
        return;
      }

      const { data: existingShop } = await supabase
        .from('shops')
        .select('id')
        .eq('google_place_id', id)
        .maybeSingle();

      let shopId;
      if (!existingShop) {
        const { data: newShop, error: shopError } = await supabase
          .from('shops')
          .insert({ name, address, google_place_id: id })
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
      setExistingRatingId(ratingData.id);

      if (photos.length > 0) {
        await supabase.from('posts').insert({
          user_id: user.id,
          rating_id: ratingData.id,
          photo_urls: photos,
          caption: note || null,
        });
      }

      setSubmitted(true);
      setShowRatingModal(false);
      Alert.alert(
        'Rating saved!',
        `You rated ${name} a ${userScore}/5${drinkOrdered ? ` for your ${drinkOrdered}` : ''}.`,
        [{ text: 'Great!' }]
      );
    } catch (e) {
      console.error('Rating error:', e);
      Alert.alert('Error', 'Could not save rating. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRating() {
    Alert.alert(
      'Delete Rating',
      `Are you sure you want to delete your rating for ${name}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (existingRatingId) {
                await supabase.from('posts').delete().eq('rating_id', existingRatingId);
                await supabase.from('ratings').delete().eq('id', existingRatingId);
              }
              setSubmitted(false);
              setUserScore(null);
              setDrinkOrdered('');
              setNote('');
              setPhotos([]);
              setExistingRatingId(null);
              Alert.alert('Deleted', 'Your rating has been removed.');
            } catch (e) {
              Alert.alert('Error', 'Could not delete rating. Please try again.');
            }
          }
        }
      ]
    );
  }

  function getPriceLevel(level) {
    const levels = {
      'PRICE_LEVEL_FREE': 'Free',
      'PRICE_LEVEL_INEXPENSIVE': '$',
      'PRICE_LEVEL_MODERATE': '$$',
      'PRICE_LEVEL_EXPENSIVE': '$$$',
      'PRICE_LEVEL_VERY_EXPENSIVE': '$$$$',
    };
    return levels[level] || null;
  }

  function getOpenStatus() {
    if (!shopDetails?.regularOpeningHours) return null;
    const now = new Date();
    const day = now.getDay();
    const periods = shopDetails.regularOpeningHours.periods || [];
    const todayPeriod = periods.find(p => p.open?.day === day);
    if (!todayPeriod) return null;
    const closeHour = todayPeriod.close?.hour;
    const closeMin = todayPeriod.close?.minute || 0;
    const openHour = todayPeriod.open?.hour;
    const openMin = todayPeriod.open?.minute || 0;
    const fmt = (h, m) => `${h > 12 ? h - 12 : h || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
    const currentMins = now.getHours() * 60 + now.getMinutes();
    const openMins = openHour * 60 + openMin;
    const closeMins = closeHour * 60 + closeMin;
    const isOpen = currentMins >= openMins && currentMins < closeMins;
    return { isOpen, closeTime: fmt(closeHour, closeMin), openTime: fmt(openHour, openMin) };
  }

  const openStatus = getOpenStatus();
  const priceLevel = getPriceLevel(shopDetails?.priceLevel);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.shopCard}>
        <Text style={styles.shopName}>{name}</Text>
        <Text style={styles.shopAddress}>{address}</Text>

        <View style={styles.badgeRow}>
          {rating && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Google {rating}/5</Text>
            </View>
          )}
          {priceLevel && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{priceLevel}</Text>
            </View>
          )}
          {openStatus && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {openStatus.isOpen ? `Open · Closes ${openStatus.closeTime}` : `Closed · Opens ${openStatus.openTime}`}
              </Text>
            </View>
          )}
        </View>

        {loadingDetails ? (
          <ActivityIndicator size="small" color="#FFB6C1" style={{ marginTop: 12 }} />
        ) : shopDetails?.websiteUri ? (
          <TouchableOpacity
            style={styles.websiteButton}
            onPress={() => Linking.openURL(shopDetails.websiteUri)}
          >
            <Text style={styles.websiteText}>Website</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Rating</Text>
        {submitted ? (
          <View style={styles.submittedBox}>
            <Text style={styles.submittedScore}>{userScore} / 5</Text>
            {drinkOrdered ? <Text style={styles.submittedDrink}>{drinkOrdered}</Text> : null}
            {note ? <Text style={styles.submittedNote}>"{note}"</Text> : null}
            {photos.length > 0 && (
              <ScrollView horizontal style={{ marginTop: 10 }}>
                {photos.map((uri, i) => (
                  <Image key={i} source={{ uri }} style={styles.photoThumb} />
                ))}
              </ScrollView>
            )}
            <View style={styles.ratingActions}>
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => { setSubmitted(false); setShowRatingModal(true); }}
              >
                <Text style={styles.editButtonText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={handleDeleteRating}
              >
                <Text style={styles.deleteButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.rateButton} onPress={() => setShowRatingModal(true)}>
            <Text style={styles.rateButtonText}>Rate this shop</Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={showRatingModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalBox}>
            <Text style={styles.modalTitle}>Rate {name}</Text>

            <Text style={styles.modalLabel}>Score (1–5)</Text>
            <View style={styles.scoreRow}>
              {[1, 2, 3, 4, 5].map(n => (
                <TouchableOpacity
                  key={n}
                  style={[styles.scoreBtn, userScore === n && styles.scoreBtnActive]}
                  onPress={() => setUserScore(n)}
                >
                  <Text style={[styles.scoreBtnText, userScore === n && styles.scoreBtnTextActive]}>
                    {n}
                  </Text>
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

            <Text style={styles.modalLabel}>Note (optional)</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              placeholder="What did you think?"
              placeholderTextColor="#C4B09A"
              value={note}
              onChangeText={setNote}
              multiline
            />

            <Text style={styles.modalLabel}>Photos (optional)</Text>
            <TouchableOpacity
              style={styles.photoPickerButton}
              onPress={handlePickPhoto}
              disabled={uploadingPhoto}
            >
              {uploadingPhoto ? (
                <ActivityIndicator color="#A89880" />
              ) : (
                <Text style={styles.photoPickerText}>
                  {photos.length > 0 ? `${photos.length} photo${photos.length > 1 ? 's' : ''} added` : '+ Add photos'}
                </Text>
              )}
            </TouchableOpacity>

            {photos.length > 0 && (
              <ScrollView horizontal style={{ marginTop: 10 }}>
                {photos.map((uri, i) => (
                  <View key={i} style={styles.photoPreviewWrap}>
                    <Image source={{ uri }} style={styles.photoPreview} />
                    <TouchableOpacity
                      style={styles.photoRemove}
                      onPress={() => setPhotos(photos.filter((_, idx) => idx !== i))}
                    >
                      <Text style={styles.photoRemoveText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setShowRatingModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmit}
                onPress={handleSubmitRating}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#FFF8F9" />
                ) : (
                  <Text style={styles.modalSubmitText}>Save Rating</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#A89880' },
  header: { padding: 16, paddingTop: 56 },
  backButton: { alignSelf: 'flex-start' },
  backText: { color: '#FFF8F9', fontSize: 16, fontWeight: '600' },
  shopCard: {
    margin: 16,
    backgroundColor: '#9A8870',
    borderRadius: 16,
    padding: 20,
  },
  shopName: { fontSize: 22, fontWeight: '700', color: '#FFF8F9', marginBottom: 6 },
  shopAddress: { fontSize: 14, color: '#F0E8E0', marginBottom: 12 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  badge: {
    backgroundColor: '#FFB6C1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 12, color: '#3D2B1F', fontWeight: '600' },
  websiteButton: {
    backgroundColor: '#3D2B1F',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  websiteText: { fontSize: 13, color: '#FFF8F9', fontWeight: '600' },
  section: { margin: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#FFF8F9', marginBottom: 12 },
  rateButton: {
    backgroundColor: '#FFB6C1',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  rateButtonText: { fontSize: 15, fontWeight: '600', color: '#3D2B1F' },
  submittedBox: {
    backgroundColor: '#9A8870',
    borderRadius: 12,
    padding: 16,
  },
  submittedScore: { fontSize: 32, fontWeight: '700', color: '#FFF8F9', marginBottom: 4 },
  submittedDrink: { fontSize: 14, color: '#F0E8E0', marginBottom: 4 },
  submittedNote: { fontSize: 13, color: '#FFE8EC', fontStyle: 'italic', marginBottom: 12 },
  photoThumb: { width: 70, height: 70, borderRadius: 8, marginRight: 8 },
  ratingActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  editButton: {
    backgroundColor: '#FFB6C1',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  editButtonText: { fontSize: 13, color: '#3D2B1F', fontWeight: '600' },
  deleteButton: {
    backgroundColor: '#3D2B1F',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  deleteButtonText: { fontSize: 13, color: '#FFB6C1', fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalScroll: {
    backgroundColor: '#FFF8F9',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalBox: { padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#3D2B1F', marginBottom: 16 },
  modalLabel: { fontSize: 13, fontWeight: '600', color: '#A89880', marginBottom: 8, marginTop: 12 },
  scoreRow: { flexDirection: 'row', gap: 12 },
  scoreBtn: {
    flex: 1, height: 48, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#D8C4B8',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFB6C1',
  },
  scoreBtnActive: { backgroundColor: '#A89880', borderColor: '#A89880' },
  scoreBtnText: { fontSize: 16, fontWeight: '600', color: '#3D2B1F' },
  scoreBtnTextActive: { color: '#FFF8F9' },
  input: {
    borderWidth: 1, borderColor: '#D8C4B8',
    borderRadius: 10, padding: 12,
    fontSize: 14, color: '#3D2B1F',
    backgroundColor: '#FFF0F2',
  },
  inputMulti: { height: 80, textAlignVertical: 'top' },
  photoPickerButton: {
    borderWidth: 1.5, borderColor: '#D8C4B8',
    borderStyle: 'dashed', borderRadius: 10,
    padding: 14, alignItems: 'center',
    backgroundColor: '#FFF0F2',
  },
  photoPickerText: { fontSize: 14, color: '#A89880', fontWeight: '500' },
  photoPreviewWrap: { position: 'relative', marginRight: 8 },
  photoPreview: { width: 80, height: 80, borderRadius: 10 },
  photoRemove: {
    position: 'absolute', top: -6, right: -6,
    backgroundColor: '#3D2B1F', borderRadius: 10,
    width: 20, height: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  photoRemoveText: { color: '#FFF8F9', fontSize: 10, fontWeight: '700' },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 },
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