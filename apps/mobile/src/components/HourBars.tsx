// Histogramme « heures d'affluence » : une barre par heure, touchable pour afficher le détail.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';
import { colors, font, spacing } from '../theme';

export type Bar = { hour: number; value: number; rain?: boolean };

const H = 120;
const LABEL_H = 16;

/** Couleur selon le niveau relatif (calme → chargé). */
export const busyColor = (v: number) => (v >= 0.8 ? '#7BD88F' : v >= 0.6 ? '#2FA77A' : v >= 0.4 ? '#1F7A7A' : '#1F4D6B');

export function HourBars({
  bars,
  nowHour,
  detail,
}: {
  bars: Bar[];
  /** Heure actuelle (si le jour affiché est aujourd'hui). */
  nowHour?: number;
  detail: (hour: number) => string;
}) {
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const n = bars.length;
  const step = width / Math.max(1, n);
  const bw = Math.max(4, step - 3);
  const sel = picked ?? nowHour ?? null;
  return (
    <View style={{ gap: spacing.sm }}>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: H + LABEL_H }}>
        {width > 0 && (
          <Svg width={width} height={H + LABEL_H}>
            {[0.25, 0.5, 0.75].map((g) => (
              <Line key={g} x1={0} x2={width} y1={H - g * H} y2={H - g * H} stroke={colors.border} strokeWidth={1} />
            ))}
            {bars.map((b, i) => {
              const h = Math.max(3, b.value * (H - 6));
              const x = i * step + (step - bw) / 2;
              const active = sel === b.hour;
              return (
                <Rect
                  key={b.hour}
                  x={x}
                  y={H - h}
                  width={bw}
                  height={h}
                  rx={2}
                  fill={busyColor(b.value)}
                  opacity={sel === null || active ? 1 : 0.55}
                  stroke={active ? colors.text : 'none'}
                  strokeWidth={active ? 1.5 : 0}
                />
              );
            })}
            {nowHour !== undefined && bars.some((b) => b.hour === nowHour) && (
              <Line
                x1={bars.findIndex((b) => b.hour === nowHour) * step + step / 2}
                x2={bars.findIndex((b) => b.hour === nowHour) * step + step / 2}
                y1={0}
                y2={H}
                stroke={colors.text}
                strokeDasharray="3 3"
                strokeWidth={1}
              />
            )}
            {bars.map((b, i) =>
              b.hour % 3 === 0 ? (
                <SvgText key={`l${b.hour}`} x={i * step + step / 2} y={H + 12} fontSize={10} fill={colors.textMuted} textAnchor="middle">
                  {`${b.hour}h`}
                </SvgText>
              ) : null,
            )}
          </Svg>
        )}
        {/* Zones touchables par-dessus le dessin (une par heure). */}
        <View style={[StyleSheet.absoluteFill, { flexDirection: 'row' }]}>
          {bars.map((b) => (
            <Pressable
              key={b.hour}
              style={{ flex: 1 }}
              onPress={() => setPicked(b.hour)}
              accessibilityRole="button"
              accessibilityLabel={`${b.hour} heures : ${detail(b.hour)}`}
            />
          ))}
        </View>
      </View>
      {sel !== null && (
        <Text style={font.small}>
          <Text style={{ fontWeight: '800', color: colors.text }}>
            {sel} h–{sel + 1} h{sel === nowHour && picked === null ? ' (maintenant)' : ''} :{' '}
          </Text>
          {detail(sel)}
        </Text>
      )}
    </View>
  );
}
