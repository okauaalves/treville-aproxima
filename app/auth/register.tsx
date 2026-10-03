import { Redirect } from 'expo-router';

export default function LegacyRegister() {
  return <Redirect href="/(auth)/register" />;
}
