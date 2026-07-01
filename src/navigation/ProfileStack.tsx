import { createNativeStackNavigator } from '@react-navigation/native-stack'
import ProfileScreen from '../screens/ProfileScreen'
import OtherProfileScreen from '../screens/OtherProfileScreen'
import EditProfileScreen from '../screens/EditProfileScreen'
import CreateAlbumScreen from '../screens/CreateAlbumScreen'
import AlbumDetailScreen from '../screens/AlbumDetailScreen'
import MomentDetailScreen from '../screens/MomentDetailScreen'
import ShotsScrollFeed from '../screens/ShotsScrollFeed'
import SavedScreen from '../screens/SavedScreen'
import PrivacyPolicyScreen from '../screens/PrivacyPolicyScreen'

const Stack = createNativeStackNavigator()

export default function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="ProfileMain" component={ProfileScreen} />
      <Stack.Screen name="OtherProfile" component={OtherProfileScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="CreateAlbum" component={CreateAlbumScreen} />
      <Stack.Screen name="AlbumDetail" component={AlbumDetailScreen} />
      <Stack.Screen name="MomentDetail" component={MomentDetailScreen} />
      <Stack.Screen name="ShotsScrollFeed" component={ShotsScrollFeed} />
      <Stack.Screen name="SavedScreen" component={SavedScreen} />
      <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
    </Stack.Navigator>
  )
}
