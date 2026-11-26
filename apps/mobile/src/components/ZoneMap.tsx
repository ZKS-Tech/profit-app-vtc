// Carte des zones avec zoom à deux doigts, déplacement à un doigt (une fois zoomé) et boutons +/−.
// Gestes gérés avec PanResponder (React Native de base) : aucune dépendance native supplémentaire.
import React, { useMemo, useRef, useState, type ReactNode } from 'react';
import { PanResponder, Pressable, StyleSheet, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';
import { Maximize2, Minus, Plus, RotateCcw } from 'lucide-react-native';
import type { Zone } from '../domain/zoneScore';
import { colors, radius } from '../theme';

const FULL = 1000; // taille du repère de la carte
const MIN_W = 110; // zoom maximal ≈ ×9
const LABEL_W = 520; // en dessous de cette largeur de vue, on affiche les noms

type VB = { x: number; y: number; w: number };
type Pt = { x: number; y: number };

const clampVb = (v: VB): VB => {
  const w = Math.min(FULL, Math.max(MIN_W, v.w));
  const m = w * 0.3; // on autorise un peu de marge autour de la carte
  return { w, x: Math.min(FULL - w + m, Math.max(-m, v.x)), y: Math.min(FULL - w + m, Math.max(-m, v.y)) };
};

export function ZoneMap({
  zones,
  fillOf,
  excluded,
  selectedId,
  onSelect,
  topIds,
  airport,
  station,
  user,
  onExpand,
  style,
}: {
  zones: Zone[];
  fillOf: (id: string) => string;
  excluded: (id: string) => boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  topIds: string[];
  airport?: Pt;
  station?: Pt;
  user?: Pt | null;
  onExpand?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const [vb, setVb] = useState<VB>({ x: 0, y: 0, w: FULL });
  const vbRef = useRef(vb);
  vbRef.current = vb;
  const size = useRef({ w: 1, pageX: 0, pageY: 0 });
  const box = useRef<React.ComponentRef<typeof View>>(null);
  const gesture = useRef<{ start: VB; n: number; d: number; mid: Pt } | null>(null);

  const k = vb.w / FULL; // facteur d'échelle pour garder traits et repères à taille constante

  // Un seul rafraîchissement par image pendant un geste (sinon des dizaines de rendus par seconde).
  const pending = useRef<VB | null>(null);
  const frame = useRef<number | null>(null);
  const setVbThrottled = (v: VB) => {
    pending.current = v;
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (pending.current) setVb(pending.current);
    });
  };

  // Les tracés des 90 zones ne dépendent ni du zoom ni de la position : ils ne sont recalculés que si les
  // couleurs ou la sélection changent (traits à épaisseur fixe à l'écran grâce à non-scaling-stroke).
  const latest = useRef({ excluded, onSelect });
  latest.current = { excluded, onSelect };
  const fills = zones.map((z) => fillOf(z.id));
  const fillKey = fills.join();
  const paths = useMemo(
    () =>
      zones.map((z, i) => {
        const isSel = z.id === selectedId;
        return (
          <Path
            key={z.id}
            d={z.path}
            fill={fills[i]}
            stroke={isSel ? '#FFFFFF' : '#0A111F'}
            strokeWidth={isSel ? 2.5 : 0.8}
            vectorEffect="non-scaling-stroke"
            onPress={() => !latest.current.excluded(z.id) && latest.current.onSelect(z.id)}
          />
        );
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zones, fillKey, selectedId],
  );

  const zoomBy = (factor: number, center?: Pt) => {
    const v = vbRef.current;
    const c = center ?? { x: v.x + v.w / 2, y: v.y + v.w / 2 };
    const w = Math.min(FULL, Math.max(MIN_W, v.w / factor));
    setVb(clampVb({ w, x: c.x - ((c.x - v.x) * w) / v.w, y: c.y - ((c.y - v.y) * w) / v.w }));
  };

  const responder = useMemo(() => {
    const touchesPx = (e: GestureResponderEvent) =>
      e.nativeEvent.touches.map((t) => ({ x: t.pageX - size.current.pageX, y: t.pageY - size.current.pageY }));
    const snapshot = (e: GestureResponderEvent) => {
      const t = touchesPx(e);
      const mid = t.length >= 2 ? { x: (t[0].x + t[1].x) / 2, y: (t[0].y + t[1].y) / 2 } : t[0] ?? { x: 0, y: 0 };
      const d = t.length >= 2 ? Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y) : 0;
      gesture.current = { start: vbRef.current, n: t.length, d, mid };
    };
    const wants = (e: GestureResponderEvent, dx: number, dy: number) =>
      e.nativeEvent.touches.length >= 2 || (vbRef.current.w < FULL - 1 && Math.abs(dx) + Math.abs(dy) > 6);
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false, // un simple appui reste un clic sur une zone
      onMoveShouldSetPanResponder: (e, g) => wants(e, g.dx, g.dy),
      onMoveShouldSetPanResponderCapture: (e, g) => wants(e, g.dx, g.dy),
      onPanResponderTerminationRequest: () => false, // la page ne vole pas le geste en cours
      onPanResponderGrant: (e) => {
        box.current?.measure((_x: number, _y: number, w: number, _h: number, px: number, py: number) => {
          size.current = { w: w || 1, pageX: px, pageY: py };
        });
        snapshot(e);
      },
      onPanResponderMove: (e) => {
        const g = gesture.current;
        const t = touchesPx(e);
        if (!g || t.length !== g.n) return snapshot(e); // un doigt ajouté ou retiré : on repart de là
        const upp = g.start.w / size.current.w; // unités de carte par pixel au début du geste
        if (t.length >= 2) {
          const d = Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y);
          const mid = { x: (t[0].x + t[1].x) / 2, y: (t[0].y + t[1].y) / 2 };
          const w = Math.min(FULL, Math.max(MIN_W, (g.start.w * g.d) / Math.max(d, 1)));
          const anchor = { x: g.start.x + g.mid.x * upp, y: g.start.y + g.mid.y * upp };
          const nupp = w / size.current.w;
          setVbThrottled(clampVb({ w, x: anchor.x - mid.x * nupp, y: anchor.y - mid.y * nupp }));
        } else if (t.length === 1) {
          setVbThrottled(clampVb({ w: g.start.w, x: g.start.x - (t[0].x - g.mid.x) * upp, y: g.start.y - (t[0].y - g.mid.y) * upp }));
        }
      },
      onPanResponderRelease: () => {
        gesture.current = null;
      },
    });
  }, []);

  const showLabels = vb.w < LABEL_W;
  const visible = (z: Zone) => z.cx > vb.x && z.cx < vb.x + vb.w && z.cy > vb.y && z.cy < vb.y + vb.w;

  return (
    <View
      ref={box}
      testID="zone-map"
      style={[styles.map, style]}
      onLayout={() =>
        box.current?.measure((_x: number, _y: number, w: number, _h: number, px: number, py: number) => {
          size.current = { w: w || 1, pageX: px, pageY: py };
        })
      }
      {...responder.panHandlers}
    >
      <Svg width="100%" height="100%" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.w}`}>
        <G>{paths}</G>
        {showLabels &&
          zones.filter(visible).map((z) => (
            <G key={`l-${z.id}`}>
              {/* Contour sombre dessiné d'abord, texte clair par-dessus : lisible sur toutes les couleurs. */}
              <SvgText x={z.cx} y={z.cy - 14 * k} fill="#0A111F" stroke="#0A111F" strokeWidth={3 * k}
                fontSize={14 * k} fontWeight="600" fontFamily="sans-serif" textAnchor="middle">
                {z.name}
              </SvgText>
              <SvgText x={z.cx} y={z.cy - 14 * k} fill="#EAF0F8" fontSize={14 * k} fontWeight="600" fontFamily="sans-serif" textAnchor="middle">
                {z.name}
              </SvgText>
            </G>
          ))}
        {airport && (
          <>
            <Circle cx={airport.x} cy={airport.y} r={11 * k} fill="#0A111F" stroke="#F5C451" strokeWidth={2 * k} />
            <SvgText x={airport.x} y={airport.y + 30 * k} fill="#F5C451" fontSize={17 * k} fontFamily="sans-serif" textAnchor="middle">
              Aéroport
            </SvgText>
          </>
        )}
        {topIds.slice(0, 3).map((id, i) => {
          const z = zones.find((x) => x.id === id);
          if (!z) return null;
          return (
            <G key={id}>
              <Circle cx={z.cx} cy={z.cy} r={14 * k} fill="#0A111F" stroke="#7BD88F" strokeWidth={2 * k} />
              <SvgText x={z.cx} y={z.cy + 6 * k} fill="#7BD88F" fontSize={16 * k} fontWeight="700" fontFamily="sans-serif" textAnchor="middle">
                {i + 1}
              </SvgText>
            </G>
          );
        })}
        {user && (
          <G>
            <Circle cx={user.x} cy={user.y} r={16 * k} fill={colors.primary} opacity={0.25} />
            <Circle cx={user.x} cy={user.y} r={8 * k} fill={colors.primary} stroke="#fff" strokeWidth={3 * k} />
          </G>
        )}
        {station && <Circle cx={station.x} cy={station.y} r={5 * k} fill="#fff" stroke="#0A111F" strokeWidth={2 * k} />}
      </Svg>

      <View style={styles.controls} pointerEvents="box-none">
        {onExpand && <MapButton label="Plein écran" onPress={onExpand} icon={<Maximize2 size={18} color={colors.text} />} />}
        <MapButton label="Zoomer" onPress={() => zoomBy(1.6)} icon={<Plus size={18} color={colors.text} />} />
        <MapButton label="Dézoomer" onPress={() => zoomBy(1 / 1.6)} icon={<Minus size={18} color={colors.text} />} />
        {vb.w < FULL - 1 && (
          <MapButton label="Vue d'ensemble" onPress={() => setVb({ x: 0, y: 0, w: FULL })} icon={<RotateCcw size={16} color={colors.text} />} />
        )}
      </View>
    </View>
  );
}

function MapButton({ label, onPress, icon }: { label: string; onPress: () => void; icon: ReactNode }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} style={styles.btn}>
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  map: {
    aspectRatio: 1,
    width: '100%',
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#0D1628',
    borderWidth: 1,
    borderColor: colors.border,
  },
  controls: { position: 'absolute', right: 8, top: 8, gap: 8 },
  btn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: 'rgba(17,27,46,0.92)',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
