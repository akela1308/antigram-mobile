import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { getFocusedRouteNameFromRoute } from '@react-navigation/native'
import { C } from '../theme'

import FeedStack        from './FeedStack'
import CollectionStack  from './CollectionStack'
import CameraStack      from './CameraStack'
import ReactionsScreen  from '../screens/ReactionsScreen'
import ProfileStack     from './ProfileStack'

const Tab = createBottomTabNavigator()

const DEFAULT_TAB_BAR = {
  backgroundColor: C.TAB_BG,
  borderTopColor: C.TAB_BORDER,
  borderTopWidth: 1,
  height: 85,
  paddingBottom: 20,
}

function cameraTabBarStyle(route: any) {
  const name = getFocusedRouteNameFromRoute(route) ?? 'FilmSelect'
  return name === 'CameraCapture' ? { display: 'none' as const } : DEFAULT_TAB_BAR
}

function CameraButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.camWrap} activeOpacity={0.82}>
      <View style={styles.camBtn}>
        <View style={styles.camBtnInner}>
          <View style={styles.camBtnGlow} pointerEvents="none" />
          <Text style={styles.camBtnText} allowFontScaling={false}>[A]</Text>
        </View>
      </View>
    </TouchableOpacity>
  )
}

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: DEFAULT_TAB_BAR,
        tabBarActiveTintColor: C.TAB_ACTIVE,
        tabBarInactiveTintColor: C.TAB_INACTIVE,
        tabBarShowLabel: false,
      }}
    >
      <Tab.Screen
        name="Feed"
        component={FeedStack}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Search"
        component={CollectionStack}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Camera"
        component={CameraStack}
        options={({ navigation, route }) => ({
          tabBarStyle: cameraTabBarStyle(route),
          tabBarButton: () => (
            <CameraButton
              onPress={() => navigation.navigate('Camera', { screen: 'FilmSelect' })}
            />
          ),
        })}
      />
      <Tab.Screen
        name="Reactions"
        component={ReactionsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="notifications-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  )
}

const styles = StyleSheet.create({
  camWrap: {
    top: -18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  camBtn: {
    width: 66, height: 66, borderRadius: 33,
    backgroundColor: '#2E1A0A',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#2E1A0A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 10,
    elevation: 7,
  },
  camBtnInner: {
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: '#C4A882',
    justifyContent: 'center', alignItems: 'center',
  },
  camBtnGlow: {
    position: 'absolute',
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#D4B99A', opacity: 0.45,
  },
  camBtnText: {
    color: '#1A0F05',
    fontFamily: 'JetBrainsMono_800ExtraBold',
    fontSize: 30, letterSpacing: -0.6, textAlign: 'center',
  },
})
