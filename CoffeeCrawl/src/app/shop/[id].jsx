import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ScrollView, Alert, Modal, ActivityIndicator
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';

export default function ShopDetailScreen() {
  const { id, name, address, rating } = useLocalSearchParams();
  const router = useRouter();

  const [userScore, setUserScore] = useState(null);
  const [drinkOrdered, setDrinkOrdered] = useState('');
  const [note, setNote] = useState('');
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

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

      // Check if shop exists in our database
      const { data: existingShop } = await supabase
        .from('shops')
        .select('id')
        .eq('google_place_id', id)
        .maybeSingle();

      let shopId;
      if (!existingShop) {
        // Create the shop
        const { data: newShop, error: shopError } = await supabase
          .from('shops')
          .insert({
            name: name,
            address: address,
            google_place_id: id,
          })
          .select('id')
          .single();
        if (shopError) throw shopError;
        shopId = newShop.id;
      } else {
        shopId = existingShop.id;
      }

      // Save the rating
      const { error: ratingError } = await supabase
        .from('ratings')
        .upsert({
          user_id: user.id,
          shop_id: shopId,
          score: userScore,
          drink_ordered: drinkOrdered || null,
          note: note || null,
          visited_at: new Date().toISOString(),
        }, { onConflict: 'user_id,shop_id' });

      if (ratingError) throw ratingError;

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

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </View>

      {/* Shop Info */}
      <View style={styles.shopCard}>
        <Text style={styles.shopName}>{name}</Text>
        <Text style={styles.shopAddress}>{address}</Text>
        {rating && (
          <View style={styles.googleRating}>
            <Text style={styles.googleRatingText}>Google {rating} / 5</Text>
          </View>
        )}
      </View>

      {/* User Rating */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Rating</Text>
        {submitted ? (
          <View style={styles.submittedBox}>
            <Text style={styles.submittedScore}>{userScore} / 5</Text>
            {drinkOrdered ? <Text style={styles.submittedDrink}>{drinkOrdered}</Text> : null}
            {note ? <Text style={styles.submittedNote}>"{note}"</Text> : null}
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => { setSubmitted(false); setShowRatingModal(true); }}
            >
              <Text style={styles.editButtonText}>Edit Rating</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.rateButton} onPress={() => setShowRatingModal(true)}>
            <Text style={styles.rateButtonText}>Rate this shop</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Rating Modal */}
      <Modal visible={showRatingModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
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
          </View>
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
  googleRating: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF0F2',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  googleRatingText: { fontSize: 13, color: '#A89880', fontWeight: '600' },
  section: { margin: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#FFF8F9', marginBottom: 12 },
  rateButton: {
    backgroundColor: '#FFF0F2',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  rateButtonText: { fontSize: 15, fontWeight: '600', color: '#A89880' },
  submittedBox: {
    backgroundColor: '#9A8870',
    borderRadius: 12,
    padding: 16,
  },
  submittedScore: { fontSize: 32, fontWeight: '700', color: '#FFF8F9', marginBottom: 4 },
  submittedDrink: { fontSize: 14, color: '#F0E8E0', marginBottom: 4 },
  submittedNote: { fontSize: 13, color: '#FFE8EC', fontStyle: 'italic', marginBottom: 12 },
  editButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF0F2',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  editButtonText: { fontSize: 13, color: '#A89880', fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: '#FFF8F9',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#3D2B1F', marginBottom: 16 },
  modalLabel: { fontSize: 13, fontWeight: '600', color: '#A89880', marginBottom: 8, marginTop: 12 },
  scoreRow: { flexDirection: 'row', gap: 12 },
  scoreBtn: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#D8C4B8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF0F2',
  },
  scoreBtnActive: { backgroundColor: '#A89880', borderColor: '#A89880' },
  scoreBtnText: { fontSize: 16, fontWeight: '600', color: '#A89880' },
  scoreBtnTextActive: { color: '#FFF8F9' },
  input: {
    borderWidth: 1,
    borderColor: '#D8C4B8',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#3D2B1F',
    backgroundColor: '#FFF0F2',
  },
  inputMulti: { height: 80, textAlignVertical: 'top' },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 },
  modalCancel: {
    flex: 1,
    marginRight: 8,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#F0E8E0',
    alignItems: 'center',
  },
  modalCancelText: { color: '#A89880', fontWeight: '600' },
  modalSubmit: {
    flex: 1,
    marginLeft: 8,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#A89880',
    alignItems: 'center',
  },
  modalSubmitText: { color: '#FFF8F9', fontWeight: '600' },
});