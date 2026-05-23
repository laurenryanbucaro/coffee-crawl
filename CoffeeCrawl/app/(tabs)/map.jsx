import { useState, useEffect } from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import MapView, { Marker, Callout } from 'react-native-maps';
import * as Location from 'expo-location';

const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY;

export default function MapScreen() {
  const [location, setLocation] = useState(null);
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
      fetchNearbyShops(loc.coords.latitude, loc.coords.longitude);
    } catch (e) {
      setError('Could not get location');
      setLoading(false);
    }
  }

  async function fetchNearbyShops(lat, lng) {
    try {
      const response = await fetch(
        'https://places.googleapis.com/v1/places:searchNearby',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_KEY,
            'X-Goog-FieldMask':
              'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.priceLevel,places.photos',
          },
          body: JSON.stringify({
            includedTypes: ['coffee_shop', 'cafe'],
            maxResultCount: 20,
            locationRestriction: {
              circle: {
                center: { latitude: lat, longitude: lng },
                radius: 3000,
              },
            },
          }),
        }
      );

      const data = await response.json();
      setShops(data.places || []);
    } catch (e) {
      setError('Could not fetch coffee shops');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#BA7517" />
        <Text style={styles.loadingText}>Finding coffee near you...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        showsUserLocation={true}
      >
        {shops.map((shop) => (
          <Marker
            key={shop.id}
            coordinate={{
              latitude: shop.location.latitude,
              longitude: shop.location.longitude,
            }}
            pinColor="#BA7517"
          >
            <Callout>
              <View style={styles.callout}>
                <Text style={styles.calloutName}>{shop.displayName?.text}</Text>
                <Text style={styles.calloutAddress}>{shop.formattedAddress}</Text>
                {shop.rating && (
                  <Text style={styles.calloutRating}>⭐ {shop.rating} Google</Text>
                )}
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      <FlatList
        style={styles.list}
        data={shops}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.shopCard}>
            <View style={styles.shopInfo}>
              <Text style={styles.shopName}>{item.displayName?.text}</Text>
              <Text style={styles.shopAddress} numberOfLines={1}>
                {item.formattedAddress}
              </Text>
            </View>
            {item.rating && (
              <Text style={styles.shopRating}>{item.rating}</Text>
            )}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  map: { height: '55%' },
  list: { flex: 1, backgroundColor: '#f9f9f9' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#BA7517', fontSize: 14 },
  errorText: { color: 'red', fontSize: 14 },
  callout: { width: 180, padding: 4 },
  calloutName: { fontWeight: '600', fontSize: 13 },
  calloutAddress: { fontSize: 11, color: '#666', marginTop: 2 },
  calloutRating: { fontSize: 11, marginTop: 4 },
  shopCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
  },
  shopInfo: { flex: 1, marginRight: 10 },
  shopName: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  shopAddress: { fontSize: 12, color: '#888', marginTop: 2 },
  shopRating: { fontSize: 16, fontWeight: '700', color: '#BA7517' },
});