import { createNativeStackNavigator } from '@react-navigation/native-stack'
import FilmSelectionScreen from '../screens/FilmSelectionScreen'
import CameraScreen from '../screens/CameraScreen'

const Stack = createNativeStackNavigator()

export default function CameraStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="FilmSelect"     component={FilmSelectionScreen} />
      <Stack.Screen name="CameraCapture"  component={CameraScreen} />
    </Stack.Navigator>
  )
}
