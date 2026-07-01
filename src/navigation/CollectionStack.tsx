import { createNativeStackNavigator } from '@react-navigation/native-stack'
import CollectionScreen from '../screens/CollectionScreen'
import OtherProfileScreen from '../screens/OtherProfileScreen'
import ShotsScrollFeed from '../screens/ShotsScrollFeed'
import AlbumDetailScreen from '../screens/AlbumDetailScreen'
import MomentDetailScreen from '../screens/MomentDetailScreen'

const Stack = createNativeStackNavigator()

export default function CollectionStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="CollectionMain" component={CollectionScreen} />
      <Stack.Screen name="OtherProfile" component={OtherProfileScreen} />
      <Stack.Screen name="ShotsScrollFeed" component={ShotsScrollFeed} />
      <Stack.Screen name="AlbumDetail" component={AlbumDetailScreen} />
      <Stack.Screen name="MomentDetail" component={MomentDetailScreen} />
    </Stack.Navigator>
  )
}
