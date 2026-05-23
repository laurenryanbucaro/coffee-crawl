import { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, View, Text, FlatList, ActivityIndicator,
  TouchableOpacity, Modal, TextInput, Alert, ScrollView
} from 'react-native';
import MapView, { Marker, Callout } from 'react-native-maps';
import * as Location from 'expo-location';

const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY;

export default function MapScreen() {
  const [location, setLocation] = useState(null);
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('distance');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newShopName, setNewShopName] = useState('');
  const [newShopAddress, setNewShopAddress] = useState('');
  const [region, setRegion] = useState(null);
  const mapRef = useRef(null);

  useEffect(() => {
    getUserLocation();
  }, []);

  async function getUserLocation() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission denied');
        setLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      setLocation(loc.coords);
      const initialRegion = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      };
      setRegion(initialRegion);
      fetchNearbyShops(loc.coords.latitude, loc.coords.longitude, 12000);
    } catch (e) {
      setError('Could not get location');
      setLoading(false);
    }
  }

  function getRadiusFromRegion(reg) {
    // Convert map delta to meters approximately
    const kmPerDegree = 111;
    const radiusKm = (reg.latitudeDelta / 2) * kmPerDegree;
    return Math.min(Math.round(radiusKm * 1000), 50000);
  }

  async function fetchNearbyShops(lat, lng, radius) {
    setLoading(true);
    try {
      const [r1, r2, r3] = await Promise.all([
        fetch('https://places.googleapis.com/v1/places:searchNearby', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_KEY,
            'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating',
          },
          body: JSON.stringify({
            includedTypes: ['coffee_shop'],
            maxResultCount: 20,
            locationRestriction: {
              circle: { center: { latitude: lat, longitude: lng }, radius },
            },
          }),
        }),
        fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_KEY,
            'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating',
          },
          body: JSON.stringify({
            textQuery: 'coffee',
            maxResultCount: 20,
            locationBias: {
              circle: { center: { latitude: lat, longitude: lng }, radius },
            },
          }),
        }),
        fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_KEY,
            'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating',
          },
          body: JSON.stringify({
            textQuery: 'cafe',
            maxResultCount: 20,
            locationBias: {
              circle: { center: { latitude: lat, longitude: lng }, radius },
            },
          }),
        }),
      ]);

      const [d1, d2, d3] = await Promise.all([r1.json(), r2.json(), r3.json()]);
      const all = [...(d1.places || []), ...(d2.places || []), ...(d3.places || [])];

      const seen = new Set();
      const unique = all.filter(p => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });

      const filtered = unique.filter(p => {
        const name = p.displayName?.text?.toLowerCase() || '';
        return !name.includes('mcdonald') &&
               !name.includes('burger') &&
               !name.includes('taco') &&
               !name.includes('subway') &&
               !name.includes('7-eleven') &&
               !name.includes('chevron') &&
               !name.includes('shell') &&
               !name.includes('circle k') &&
               !name.includes('walmart') &&
               !name.includes('target') &&
               !name.includes('grocery') &&
               !name.includes('safeway') &&
               !name.includes('vons') &&
               !name.includes('jack in the box') &&
               !name.includes('wendy') &&
               !name.includes('pizza');
      });

      setShops(filtered);
    } catch (e) {
      console.error('Fetch error:', e);
      setError('Could not fetch coffee shops');
    } finally {
      setLoading(false);
    }
  }

  function handleRegionChangeComplete(newRegion) {
    setRegion(newRegion);
    const radius = getRadiusFromRegion(newRegion);
    fetchNearbyShops(newRegion.latitude, newRegion.longitude, radius);
  }

  function getDistance(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  function getSortedShops() {
    const center = region || location;
    if (!center) return shops;
    return [...shops].sort((a, b) => {
      if (sortBy === 'rating') {
        return (b.rating || 0) - (a.rating || 0);
      }
      const distA = getDistance(center.latitude, center.longitude, a.location.latitude, a.location.longitude);
      const distB = getDistance(center.latitude, center.longitude, b.location.latitude, b.location.longitude);
      return distA - distB;
    });
  }

  function handleAddShop() {
    if (!newShopName.trim() || !newShopAddress.trim()) {
      Alert.alert('Missing info', 'Please enter both a name and address.');
      return;
    }
    Alert.alert(
      'Thanks!',
      `We've noted "${newShopName}" at ${newShopAddress}. Our team will review and add it soon.`,
      [{ text: 'OK', onPress: () => { setShowAddModal(false); setNewShopName(''); setNewShopAddress(''); } }]
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  const sortedShops = getSortedShops();

  return (
    <View style={styles.container}>
      {location && (
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={{
            latitude: location.latitude,
            longitude: location.longitude,
            latitudeDelta: 0.04,
            longitudeDelta: 0.04,
          }}
          showsUserLocation={true}
          onRegionChangeComplete={handleRegionChangeComplete}
        >
          {sortedShops.map((shop) => (
            <Marker
              key={shop.id}
              coordinate={{
                latitude: shop.location.latitude,
                longitude: shop.location.longitude,
              }}
            >
              <View style={styles.pin}>
                <Text style={styles.pinEmoji}>☕</Text>
              </View>
              <Callout>
                <View style={styles.callout}>
                  <Text style={styles.calloutName}>{shop.displayName?.text}</Text>
                  {shop.rating && <Text style={styles.calloutRating}>⭐ {shop.rating}</Text>}
                </View>
              </Callout>
            </Marker>
          ))}
        </MapView>
      )}

      {/* Controls row */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.sortButton} onPress={() => setShowSortMenu(!showSortMenu)}>
          <Text style={styles.sortButtonText}>
            {sortBy === 'distance' ? 'Distance' : 'Rating'} ▾
          </Text>
        </TouchableOpacity>
        {loading && <ActivityIndicator size="small" color="#FFF8F9" style={{ marginLeft: 10 }} />}
        <TouchableOpacity style={styles.addButton} onPress={() => setShowAddModal(true)}>
          <Text style={styles.addButtonText}>+ Add Shop</Text>
        </TouchableOpacity>
      </View>

      {/* Sort dropdown */}
      {showSortMenu && (
        <View style={styles.dropdown}>
          <TouchableOpacity style={styles.dropdownItem} onPress={() => { setSortBy('distance'); setShowSortMenu(false); }}>
            <Text style={[styles.dropdownText, sortBy === 'distance' && styles.dropdownActive]}>📍 Distance</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dropdownItem} onPress={() => { setSortBy('rating'); setShowSortMenu(false); }}>
            <Text style={[styles.dropdownText, sortBy === 'rating' && styles.dropdownActive]}>⭐ Rating</Text>
          </TouchableOpacity>
        </View>
      )}

      {sortedShops.length === 0 && !loading ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No coffee shops found in this area</Text>
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={sortedShops}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const dist = location ? getDistance(
              region?.latitude || location.latitude,
              region?.longitude || location.longitude,
              item.location.latitude,
              item.location.longitude
            ).toFixed(1) : null;
            return (
              <TouchableOpacity style={styles.card}>
                <View style={styles.cardLeft}>
                  <Text style={styles.cardName}>{item.displayName?.text}</Text>
                  <Text style={styles.cardAddress} numberOfLines={1}>{item.formattedAddress}</Text>
                  {dist && <Text style={styles.cardDist}>{dist} km away</Text>}
                </View>
                {item.rating && (
                  <View style={styles.ratingBadge}>
                    <Text style={styles.ratingText}>{item.rating}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Add Shop Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Add a Coffee Shop</Text>
            <Text style={styles.modalSub}>Don't see your favorite spot? Let us know!</Text>
            <TextInput
              style={styles.input}
              placeholder="Shop name"
              placeholderTextColor="#C4B09A"
              value={newShopName}
              onChangeText={setNewShopName}
            />
            <TextInput
              style={styles.input}
              placeholder="Address"
              placeholderTextColor="#C4B09A"
              value={newShopAddress}
              onChangeText={setNewShopAddress}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowAddModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmit} onPress={handleAddShop}>
                <Text style={styles.modalSubmitText}>Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#A89880' },
  map: { height: '45%' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#A89880' },
  errorText: { color: '#FFF8F9', fontSize: 14 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#FFF8F9', fontSize: 14 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#9A8870',
  },
  sortButton: {
    backgroundColor: '#FFF0F2',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  sortButtonText: { fontSize: 13, color: '#A89880', fontWeight: '600' },
  addButton: {
    backgroundColor: '#FFF0F2',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  addButtonText: { fontSize: 13, color: '#A89880', fontWeight: '600' },
  dropdown: {
    position: 'absolute',
    top: '47%',
    left: 14,
    backgroundColor: '#FFF8F9',
    borderRadius: 10,
    zIndex: 999,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  dropdownItem: { padding: 12, borderBottomWidth: 0.5, borderBottomColor: '#F0E0E4' },
  dropdownText: { fontSize: 14, color: '#A89880' },
  dropdownActive: { fontWeight: '700', color: '#3D2B1F' },
  list: { flex: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#C4B09A',
    backgroundColor: '#A89880',
  },
  cardLeft: { flex: 1, marginRight: 10 },
  cardName: { fontSize: 14, fontWeight: '600', color: '#FFF8F9' },
  cardAddress: { fontSize: 12, color: '#F0E8E0', marginTop: 2 },
  cardDist: { fontSize: 11, color: '#FFE8EC', marginTop: 2 },
  ratingBadge: {
    backgroundColor: '#FFF0F2',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  ratingText: { fontSize: 13, fontWeight: '700', color: '#A89880' },
  pin: {
    backgroundColor: '#FFF0F2',
    borderRadius: 20,
    padding: 5,
    borderWidth: 1.5,
    borderColor: '#FFF8F9',
  },
  pinEmoji: { fontSize: 18 },
  callout: { width: 160, padding: 6 },
  calloutName: { fontSize: 12, fontWeight: '600', color: '#3D2B1F' },
  calloutRating: { fontSize: 11, color: '#A89880', marginTop: 2 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBox: {
    backgroundColor: '#FFF8F9',
    borderRadius: 16,
    padding: 24,
    width: '85%',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#3D2B1F', marginBottom: 6 },
  modalSub: { fontSize: 13, color: '#A89880', marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderColor: '#D8C4B8',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#3D2B1F',
    marginBottom: 12,
    backgroundColor: '#FFF0F2',
  },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  modalCancel: {
    flex: 1,
    marginRight: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#F0E8E0',
    alignItems: 'center',
  },
  modalCancelText: { color: '#A89880', fontWeight: '600' },
  modalSubmit: {
    flex: 1,
    marginLeft: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#A89880',
    alignItems: 'center',
  },
  modalSubmitText: { color: '#FFF8F9', fontWeight: '600' },
});