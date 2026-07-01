import { createNativeStackNavigator } from '@react-navigation/native-stack'
import ReactionsScreen from '../screens/ReactionsScreen'
import OtherProfileScreen from '../screens/OtherProfileScreen'
import MomentDetailScreen from '../screens/MomentDetailScreen'
import ShotsScrollFeed from '../screens/ShotsScrollFeed'
import FollowListScreen from '../screens/FollowListScreen'
import AlbumDetailScreen from '../screens/AlbumDetailScreen'

const Stack = createNativeStackNavigator()

export default function ReactionsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="ReactionsMain" component={ReactionsScreen} />
      <Stack.Screen name="MomentDetail" component={MomentDetailScreen} />
      <Stack.Screen name="OtherProfile" component={OtherProfileScreen} />
      <Stack.Screen name="ShotsScrollFeed" component={ShotsScrollFeed} />
      <Stack.Screen name="FollowList" component={FollowListScreen} />
      <Stack.Screen name="AlbumDetail" component={AlbumDetailScreen} />
    </Stack.Navigator>
  )
}
