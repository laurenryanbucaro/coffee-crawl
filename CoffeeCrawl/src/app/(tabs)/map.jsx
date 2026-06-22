import { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, View, Text, FlatList, ActivityIndicator,
  TouchableOpacity, Modal, TextInput, Alert
} from 'react-native';
import MapView, { Marker, Callout } from 'react-native-maps';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';

const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY;
const RUST = '#8C3235';
const RUST_DARK = '#672427';
const TAN = '#DCCAB4';
const ESPRESSO = '#A36054';
const TEXT_LIGHT = '#E8DCC6';

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
  const [searchRegion, setSearchRegion] = useState(null);
  const [nameQuery, setNameQuery] = useState('');
  const [nameSearchResults, setNameSearchResults] = useState([]);
  const [nameSearching, setNameSearching] = useState(false);
  const mapRef = useRef(null);
  const fetchController = useRef(null);
  const nameSearchTimer = useRef(null);
  const router = useRouter();

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
    const kmPerDegree = 111;
    const radiusKm = (reg.latitudeDelta / 2) * kmPerDegree;
    return Math.min(Math.round(radiusKm * 1000), 20000);
  }

  function handleNameSearchChange(text) {
    setNameQuery(text);
    if (nameSearchTimer.current) clearTimeout(nameSearchTimer.current);
    if (text.length < 2) { setNameSearchResults([]); return; }
    nameSearchTimer.current = setTimeout(() => searchByName(text), 400);
  }

  async function searchByName(query) {
    setNameSearching(true);
    try {
      const center = region || location;
      const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_KEY,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating',
        },
        body: JSON.stringify({
          textQuery: `${query} coffee`,
          maxResultCount: 15,
          locationBias: center ? {
            circle: { center: { latitude: center.latitude, longitude: center.longitude }, radius: 50000 },
          } : undefined,
        }),
      });
      const data = await response.json();
      setNameSearchResults(data.places || []);
    } catch (e) {
      console.error('Name search error:', e);
    } finally {
      setNameSearching(false);
    }
  }

  function handleSelectNameResult(place) {
    setNameQuery('');
    setNameSearchResults([]);
    router.push({
      pathname: '/shop/[id]',
      params: {
        id: place.id,
        name: place.displayName?.text,
        address: place.formattedAddress,
        rating: place.rating,
      }
    });
  }

  async function fetchSupabaseShops() {
    try {
      const { data } = await supabase
        .from('shops')
        .select('*')
        .not('lat', 'is', null)
        .not('lng', 'is', null);
      return (data || []).map(s => ({
        id: `supabase-${s.id}`,
        supabaseId: s.id,
        displayName: { text: s.name },
        formattedAddress: s.address,
        location: { latitude: s.lat, longitude: s.lng },
        rating: s.avg_score || null,
        isManual: true,
      }));
    } catch (e) {
      console.error('Supabase shops error:', e);
      return [];
    }
  }

  async function fetchNearbyShops(lat, lng, radius) {
    if (fetchController.current) {
      fetchController.current.abort();
    }
    fetchController.current = new AbortController();
    const signal = fetchController.current.signal;

    setLoading(true);
    try {
      const [r1, r2, r3, supabaseShops] = await Promise.all([
        fetch('https://places.googleapis.com/v1/places:searchNearby', {
          method: 'POST',
          signal,
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
          signal,
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
          signal,
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
        fetchSupabaseShops(),
      ]);

      if (signal.aborted) return;

      const [d1, d2, d3] = await Promise.all([r1.json(), r2.json(), r3.json()]);

      if (signal.aborted) return;

      const googleShops = [...(d1.places || []), ...(d2.places || []), ...(d3.places || [])];

      const seen = new Set();
      const uniqueGoogle = googleShops.filter(p => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });

      const filteredGoogle = uniqueGoogle.filter(p => {
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

      const googleNames = new Set(filteredGoogle.map(s => s.displayName?.text?.toLowerCase()));
      const uniqueSupabase = supabaseShops.filter(s =>
        !googleNames.has(s.displayName?.text?.toLowerCase())
      );

      const all = [...filteredGoogle, ...uniqueSupabase].slice(0, 40);
      setShops(all);
    } catch (e) {
      if (e.name === 'AbortError') return;
      console.error('Fetch error:', e);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }

  function handleRegionChangeComplete(newRegion) {
    setSearchRegion(newRegion);
  }

  function getDistance(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

  async function handleAddShop() {
    if (!newShopName.trim() || !newShopAddress.trim()) {
      Alert.alert('Missing info', 'Please enter both a name and address.');
      return;
    }
    try {
      const { error } = await supabase
        .from('shops')
        .insert({
          name: newShopName.trim(),
          address: newShopAddress.trim(),
          google_place_id: `manual-${Date.now()}`,
        });
      if (error) throw error;
      Alert.alert(
        'Shop added!',
        `${newShopName} has been added to Coffee Crawl.`,
        [{ text: 'OK', onPress: () => { setShowAddModal(false); setNewShopName(''); setNewShopAddress(''); } }]
      );
    } catch (e) {
      Alert.alert('Error', 'Could not add shop. Please try again.');
    }
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
              onPress={() => router.push({
                pathname: '/shop/[id]',
                params: {
                  id: shop.supabaseId || shop.id,
                  name: shop.displayName?.text,
                  address: shop.formattedAddress,
                  rating: shop.rating,
                }
              })}
            >
              <View style={[styles.pin, shop.isManual && styles.pinManual]}>
                <Text style={styles.pinEmoji}>☕</Text>
              </View>
              <Callout tooltip>
                <View style={styles.callout}>
                  <Text style={styles.calloutName}>{shop.displayName?.text}</Text>
                  {shop.isManual && <Text style={styles.calloutManual}>Added by community</Text>}
                  {shop.rating && <Text style={styles.calloutRating}>{shop.rating} / 5</Text>}
                  <Text style={styles.calloutTap}>Tap to view</Text>
                </View>
              </Callout>
            </Marker>
          ))}
        </MapView>
      )}

      <View style={styles.nameSearchWrap}>
        <TextInput
          style={styles.nameSearchInput}
          placeholder="Search coffee shops by name..."
          placeholderTextColor="#B59A7C"
          value={nameQuery}
          onChangeText={handleNameSearchChange}
        />
        {nameSearching && <ActivityIndicator size="small" color={RUST} style={{ marginTop: 8 }} />}
        {nameSearchResults.length > 0 && (
          <View style={styles.nameSearchResults}>
            {nameSearchResults.map((place) => (
              <TouchableOpacity
                key={place.id}
                style={styles.nameSearchResultRow}
                onPress={() => handleSelectNameResult(place)}
              >
                <Text style={styles.nameSearchResultName}>{place.displayName?.text}</Text>
                <Text style={styles.nameSearchResultAddress} numberOfLines={1}>{place.formattedAddress}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <View style={styles.controls}>
        <TouchableOpacity style={styles.sortButton} onPress={() => setShowSortMenu(!showSortMenu)}>
          <Text style={styles.sortButtonText}>
            {sortBy === 'distance' ? 'Distance' : 'Rating'} ▾
          </Text>
        </TouchableOpacity>
        {loading ? (
          <ActivityIndicator size="small" color={TAN} />
        ) : (
          <TouchableOpacity
            style={styles.searchHereButton}
            onPress={() => {
              if (searchRegion) {
                setRegion(searchRegion);
                const radius = getRadiusFromRegion(searchRegion);
                fetchNearbyShops(searchRegion.latitude, searchRegion.longitude, radius);
              }
            }}
          >
            <Text style={styles.searchHereText}>Search here</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.addButton} onPress={() => setShowAddModal(true)}>
          <Text style={styles.addButtonText}>+ Add Shop</Text>
        </TouchableOpacity>
      </View>

      {showSortMenu && (
        <View style={styles.dropdown}>
          <TouchableOpacity style={styles.dropdownItem} onPress={() => { setSortBy('distance'); setShowSortMenu(false); }}>
            <Text style={[styles.dropdownText, sortBy === 'distance' && styles.dropdownActive]}>Distance</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dropdownItem} onPress={() => { setSortBy('rating'); setShowSortMenu(false); }}>
            <Text style={[styles.dropdownText, sortBy === 'rating' && styles.dropdownActive]}>Rating</Text>
          </TouchableOpacity>
        </View>
      )}

      {sortedShops.length === 0 && !loading ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No coffee shops found — tap "Search here" after moving the map</Text>
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={sortedShops}
          keyExtractor={(item) => item.id}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={5}
          renderItem={({ item }) => {
            const dist = location ? getDistance(
              region?.latitude || location.latitude,
              region?.longitude || location.longitude,
              item.location.latitude,
              item.location.longitude
            ).toFixed(1) : null;
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => router.push({
                  pathname: '/shop/[id]',
                  params: {
                    id: item.supabaseId || item.id,
                    name: item.displayName?.text,
                    address: item.formattedAddress,
                    rating: item.rating,
                  }
                })}
              >
                <View style={styles.cardLeft}>
                  <Text style={styles.cardName}>{item.displayName?.text}</Text>
                  <Text style={styles.cardAddress} numberOfLines={1}>{item.formattedAddress}</Text>
                  {dist && <Text style={styles.cardDist}>{dist} km away</Text>}
                  {item.isManual && <Text style={styles.cardManual}>Community added</Text>}
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

      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Add a Coffee Shop</Text>
            <Text style={styles.modalSub}>Don't see your favorite spot? Add it directly!</Text>
            <TextInput
              style={styles.input}
              placeholder="Shop name"
              placeholderTextColor="#A78355"
              value={newShopName}
              onChangeText={setNewShopName}
            />
            <TextInput
              style={styles.input}
              placeholder="Address"
              placeholderTextColor="#A78355"
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
  container: { flex: 1, backgroundColor: RUST },
  map: { height: '42%' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: RUST },
  errorText: { fontFamily: 'Lexend_500Medium', color: TEXT_LIGHT, fontSize: 14 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: RUST },
  emptyText: { fontFamily: 'Lexend_500Medium', color: TEXT_LIGHT, fontSize: 14, textAlign: 'center' },
  nameSearchWrap: {
    backgroundColor: TAN,
    margin: 12,
    marginBottom: 0,
    borderRadius: 12,
    padding: 10,
  },
  nameSearchInput: {
    fontFamily: 'Lexend_400Regular',
    fontSize: 14,
    color: RUST_DARK,
    padding: 4,
  },
  nameSearchResults: {
    marginTop: 6,
  },
  nameSearchResultRow: {
    backgroundColor: '#FFFBF2',
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
  },
  nameSearchResultName: { fontFamily: 'Lexend_700Bold', fontSize: 13, color: RUST_DARK },
  nameSearchResultAddress: { fontFamily: 'Lexend_400Regular', fontSize: 11, color: ESPRESSO, marginTop: 2 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: RUST,
  },
  sortButton: {
    backgroundColor: TAN,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  sortButtonText: { fontFamily: 'Lexend_700Bold', fontSize: 12, color: RUST },
  searchHereButton: {
    backgroundColor: RUST_DARK,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  searchHereText: { fontFamily: 'Lexend_700Bold', fontSize: 12, color: TEXT_LIGHT },
  addButton: {
    backgroundColor: TAN,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  addButtonText: { fontFamily: 'Lexend_700Bold', fontSize: 12, color: RUST },
  dropdown: {
    position: 'absolute',
    top: '44%',
    left: 14,
    backgroundColor: TAN,
    borderRadius: 12,
    zIndex: 999,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    overflow: 'hidden',
  },
  dropdownItem: { padding: 12, borderBottomWidth: 0.5, borderBottomColor: ESPRESSO },
  dropdownText: { fontFamily: 'Lexend_500Medium', fontSize: 14, color: RUST_DARK },
  dropdownActive: { fontFamily: 'Lexend_700Bold', color: RUST },
  list: { flex: 1, backgroundColor: RUST },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: TAN,
  },
  cardLeft: { flex: 1, marginRight: 10 },
  cardName: { fontFamily: 'Lexend_700Bold', fontSize: 14, color: RUST_DARK },
  cardAddress: { fontFamily: 'Lexend_400Regular', fontSize: 12, color: ESPRESSO, marginTop: 2 },
  cardDist: { fontFamily: 'Lexend_400Regular', fontSize: 11, color: ESPRESSO, marginTop: 2 },
  cardManual: { fontFamily: 'Lexend_600SemiBold', fontSize: 10, color: RUST, marginTop: 2, fontStyle: 'italic' },
  ratingBadge: {
    backgroundColor: RUST,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  ratingText: { fontFamily: 'Lexend_700Bold', fontSize: 13, color: TEXT_LIGHT },
  pin: {
    backgroundColor: TAN,
    borderRadius: 20,
    padding: 5,
    borderWidth: 1.5,
    borderColor: RUST,
  },
  pinManual: {
    backgroundColor: RUST_DARK,
    borderColor: TAN,
  },
  pinEmoji: { fontSize: 18 },
  callout: {
    backgroundColor: TAN,
    borderRadius: 10,
    padding: 10,
    width: 160,
  },
  calloutName: { fontFamily: 'Lexend_700Bold', fontSize: 12, color: RUST_DARK },
  calloutManual: { fontFamily: 'Lexend_500Medium', fontSize: 10, color: RUST, marginTop: 1, fontStyle: 'italic' },
  calloutRating: { fontFamily: 'Lexend_600SemiBold', fontSize: 11, color: RUST, marginTop: 2 },
  calloutTap: { fontFamily: 'Lexend_400Regular', fontSize: 10, color: ESPRESSO, marginTop: 4, fontStyle: 'italic' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBox: {
    backgroundColor: TAN,
    borderRadius: 18,
    padding: 24,
    width: '85%',
  },
  modalTitle: { fontFamily: 'Modak_400Regular', fontSize: 22, color: RUST, marginBottom: 6 },
  modalSub: { fontFamily: 'Lexend_400Regular', fontSize: 13, color: ESPRESSO, marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderColor: ESPRESSO,
    borderRadius: 10,
    padding: 12,
    fontFamily: 'Lexend_400Regular',
    fontSize: 14,
    color: RUST_DARK,
    marginBottom: 12,
    backgroundColor: '#FFFBF2',
  },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  modalCancel: {
    flex: 1,
    marginRight: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: ESPRESSO,
    alignItems: 'center',
  },
  modalCancelText: { fontFamily: 'Lexend_700Bold', color: TEXT_LIGHT },
  modalSubmit: {
    flex: 1,
    marginLeft: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: RUST,
    alignItems: 'center',
  },
  modalSubmitText: { fontFamily: 'Lexend_700Bold', color: TEXT_LIGHT },
});