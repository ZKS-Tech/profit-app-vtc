import { Redirect } from 'expo-router';

// Toute URL inconnue (ex. aperçu web hébergé sous un sous-chemin) renvoie vers l'accueil.
export default function NotFound() {
  return <Redirect href="/" />;
}
