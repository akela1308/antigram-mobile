import { createNativeStackNavigator } from '@react-navigation/native-stack'
import FeedScreen from '../screens/FeedScreen'
import MomentDetailScreen from '../screens/MomentDetailScreen'
import OtherProfileScreen from '../screens/OtherProfileScreen'
import ShotsScrollFeed from '../screens/ShotsScrollFeed'
import AlbumDetailScreen from '../screens/AlbumDetailScreen'

const Stack = createNativeStackNavigator()

export default function FeedStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="FeedMain" component={FeedScreen} />
      <Stack.Screen name="MomentDetail" component={MomentDetailScreen} />
      <Stack.Screen name="OtherProfile" component={OtherProfileScreen} />
      <Stack.Screen name="ShotsScrollFeed" component={ShotsScrollFeed} />
      <Stack.Screen name="AlbumDetail" component={AlbumDetailScreen} />
    </Stack.Navigator>
  )
}
