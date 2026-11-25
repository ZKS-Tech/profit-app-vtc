// Pavé de saisie du montant (€ avec centimes). Remplace le clavier du téléphone : sur certains claviers
// Android en français, la virgule ou le point ne sont pas proposés dans le clavier numérique.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Delete } from 'lucide-react-native';
import { colors, font, radius, spacing } from '../theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'];

/** Applique une touche au texte saisi : une seule virgule, deux décimales au plus, 4 chiffres avant. */
export function pressKey(text: string, key: string) {
  if (key === '⌫') return text.slice(0, -1);
  if (key === ',') return text.includes(',') ? text : `${text || '0'},`;
  const [int, frac] = text.split(',');
  if (frac !== undefined) return frac.length >= 2 ? text : text + key;
  if (int === '0') return key;
  return int.length >= 4 ? text : text + key;
}

export function AmountPad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.display} accessibilityLabel={`Montant saisi : ${value || 'aucun'} euros`}>
        <Text style={[font.h1, { color: value ? colors.text : colors.textFaint }]}>{value ? `${value} €` : 'Montant (facultatif)'}</Text>
      </View>
      <View style={styles.grid}>
        {KEYS.map((k) => (
          <Pressable
            key={k}
            onPress={() => onChange(pressKey(value, k))}
            accessibilityRole="button"
            accessibilityLabel={k === '⌫' ? 'Effacer un chiffre' : k === ',' ? 'Virgule' : k}
            style={({ pressed }) => [styles.key, pressed && { backgroundColor: colors.border }]}
          >
            {k === '⌫' ? <Delete size={22} color={colors.text} /> : <Text style={styles.keyText}>{k}</Text>}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  display: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  key: {
    flexBasis: '31%',
    flexGrow: 1,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: { color: colors.text, fontSize: 22, fontWeight: '700' },
});
