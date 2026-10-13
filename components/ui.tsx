// Piezas comunes de la interfaz (Material 3 oscuro). Las pantallas se arman con esto.
import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, T, S, R, TOUCH } from '../src/theme';
import { formatCurrency } from '../src/format';

export type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
export type Tone = 'primary' | 'money' | 'spend' | 'warn' | 'neutral';

const TONE: Record<Tone, { fg: string; bg: string }> = {
  primary: { fg: C.primary, bg: C.primaryContainer },
  money:   { fg: C.money,   bg: C.moneyContainer },
  spend:   { fg: C.spend,   bg: C.spendContainer },
  warn:    { fg: C.warn,    bg: C.warnContainer },
  neutral: { fg: C.textMuted, bg: C.surfaceHigh },
};

export function Icon({ name, size = 22, color = C.text }: { name: IconName; size?: number; color?: string }) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}

// Ícono dentro de un círculo tonal (inicio de las filas)
export function IconBadge({ name, tone = 'neutral', size = 40 }: { name: IconName; tone?: Tone; size?: number }) {
  return (
    <View style={[u.badge, { width: size, height: size, borderRadius: size / 2, backgroundColor: TONE[tone].bg }]}>
      <Icon name={name} size={size * 0.55} color={TONE[tone].fg} />
    </View>
  );
}

export function ScreenTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <View style={u.screenTitle}>
      <View style={{ flex: 1 }}>
        <Text style={T.headline} accessibilityRole="header">{title}</Text>
        {subtitle ? <Text style={[T.bodySm, { marginTop: 2 }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

// Superficie con título de sección opcional y una acción a la derecha
export function Section({ title, right, children, style }: {
  title?: string; right?: React.ReactNode; children: React.ReactNode; style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[u.section, style]}>
      {title ? (
        <View style={u.sectionHead}>
          <Text style={T.titleSm} accessibilityRole="header">{title}</Text>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

// Fila de lista: ícono, título, detalle y algo a la derecha. Si se puede tocar, muestra la flecha.
export function Row({ icon, tone, title, subtitle, right, onPress, chevron, last }: {
  icon?: IconName; tone?: Tone; title: string; subtitle?: string | null; right?: React.ReactNode;
  onPress?: () => void; chevron?: boolean; last?: boolean;
}) {
  const body = (
    <>
      {icon ? <IconBadge name={icon} tone={tone} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={T.body} numberOfLines={2}>{title}</Text>
        {subtitle ? <Text style={T.labelSm} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {right}
      {onPress && chevron !== false ? <Icon name="chevron-right" size={22} color={C.textFaint} /> : null}
    </>
  );
  const style = [u.row, !last && u.rowDivider];
  return onPress
    ? <Pressable style={({ pressed }) => [...style, pressed && u.pressed]} onPress={onPress} android_ripple={{ color: C.surfaceHigher }} accessibilityRole="button">{body}</Pressable>
    : <View style={style}>{body}</View>;
}

// Monto con signo y color según si entra o sale plata
export function Amount({ value, kind, style }: { value: number; kind: 'in' | 'out' | 'neutral'; style?: StyleProp<any> }) {
  const color = kind === 'in' ? C.money : kind === 'out' ? C.spend : C.text;
  const sign = kind === 'in' ? '+' : kind === 'out' ? '−' : value < 0 ? '−' : '';
  return <Text style={[T.amount, { color }, style]}>{sign}{formatCurrency(value)}</Text>;
}

export function Button({ label, icon, onPress, variant = 'filled', tone = 'primary', big, style, disabled }: {
  label: string; icon?: IconName; onPress: () => void; variant?: 'filled' | 'tonal' | 'outlined' | 'text';
  tone?: Tone; big?: boolean; style?: StyleProp<ViewStyle>; disabled?: boolean;
}) {
  const c = TONE[tone];
  const bg = variant === 'filled' ? c.fg : variant === 'tonal' ? c.bg : 'transparent';
  const fg = variant === 'filled' ? (tone === 'primary' ? C.onPrimary : C.onAccent) : c.fg;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
      style={({ pressed }) => [
        u.button, big && u.buttonBig, { backgroundColor: bg },
        variant === 'outlined' && { borderWidth: 1, borderColor: C.outline },
        (pressed || disabled) && { opacity: disabled ? 0.4 : 0.85 }, style,
      ]}
    >
      {icon ? <Icon name={icon} size={big ? 24 : 20} color={fg} /> : null}
      <Text style={[T.label, { color: fg }, big && { fontSize: 17 }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, icon, selected, onPress, tone = 'primary' }: {
  label: string; icon?: IconName; selected: boolean; onPress: () => void; tone?: Tone;
}) {
  const c = TONE[tone];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[u.chip, selected ? { backgroundColor: c.bg, borderColor: c.fg } : { borderColor: C.outline }]}
    >
      {selected ? <Icon name="check" size={18} color={c.fg} /> : icon ? <Icon name={icon} size={18} color={C.textMuted} /> : null}
      <Text style={[T.label, { color: selected ? c.fg : C.textMuted }]}>{label}</Text>
    </Pressable>
  );
}

// Aviso de una línea; si se toca, lleva a donde se resuelve
export function Banner({ tone, icon, text, onPress, detail }: {
  tone: Tone; icon: IconName; text: string; onPress?: () => void; detail?: string;
}) {
  const c = TONE[tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [u.banner, { backgroundColor: c.bg }, pressed && u.pressed]}
    >
      <Icon name={icon} size={22} color={c.fg} />
      <View style={{ flex: 1 }}>
        <Text style={[T.label, { color: c.fg }]}>{text}</Text>
        {detail ? <Text style={[T.labelSm, { color: C.text }]}>{detail}</Text> : null}
      </View>
      {onPress ? <Icon name="chevron-right" size={22} color={c.fg} /> : null}
    </Pressable>
  );
}

// Etiqueta corta de estado (al lado de un título)
export function Pill({ text, tone }: { text: string; tone: Tone }) {
  return (
    <View style={[u.pill, { backgroundColor: TONE[tone].bg }]}>
      <Text style={[T.labelSm, { color: TONE[tone].fg, fontWeight: '700' }]}>{text}</Text>
    </View>
  );
}

// Sección que se abre y se cierra; cerrada muestra un resumen de una línea
export function Collapsible({ title, summary, summaryTone, initiallyOpen = false, children }: {
  title: string; summary?: string; summaryTone?: Tone; initiallyOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(initiallyOpen);
  return (
    <View style={u.section}>
      <Pressable
        onPress={() => setOpen(o => !o)}
        style={u.collapseHead}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View style={{ flex: 1 }}>
          <Text style={T.titleSm} accessibilityRole="header">{title}</Text>
          {!open && summary ? (
            <Text style={[T.labelSm, summaryTone && summaryTone !== 'neutral' && { color: TONE[summaryTone].fg }]} numberOfLines={2}>{summary}</Text>
          ) : null}
        </View>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={24} color={C.textMuted} />
      </Pressable>
      {open ? <View style={{ marginTop: S.sm }}>{children}</View> : null}
    </View>
  );
}

// Botón de solo ícono (48 dp), para borrar o editar una fila
export function IconButton({ name, onPress, label, color = C.textFaint }: {
  name: IconName; onPress: () => void; label: string; color?: string;
}) {
  return (
    <Pressable onPress={onPress} style={u.iconBtn} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}>
      <Icon name={name} size={22} color={color} />
    </Pressable>
  );
}

// Interruptor Material (solo el dibujo; la fila que lo contiene es la que se toca)
export function SwitchMark({ on, tone = 'primary' }: { on: boolean; tone?: Tone }) {
  const fg = TONE[tone].fg;
  return (
    <View style={[u.track, on && { backgroundColor: fg, borderColor: fg }]}>
      <View style={[u.thumb, on && u.thumbOn]} />
    </View>
  );
}

export function Hint({ children }: { children: React.ReactNode }) {
  return <Text style={[T.labelSm, { color: C.textFaint, marginTop: S.sm }]}>{children}</Text>;
}

const u = StyleSheet.create({
  badge:       { alignItems: 'center', justifyContent: 'center' },
  screenTitle: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingHorizontal: S.lg, paddingTop: S.lg, paddingBottom: S.md },
  section:     { backgroundColor: C.surface, borderRadius: R.lg, padding: S.lg, marginBottom: S.md },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: S.sm, minHeight: 28 },
  row:         { flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 64, paddingVertical: S.sm },
  rowDivider:  { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.outline },
  pressed:     { opacity: 0.85 },
  button:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: S.sm, minHeight: TOUCH, borderRadius: R.pill, paddingHorizontal: S.xl },
  buttonBig:   { minHeight: 56 },
  chip:        { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, borderRadius: R.sm, borderWidth: 1, paddingHorizontal: S.md },
  banner:      { flexDirection: 'row', alignItems: 'center', gap: S.md, borderRadius: R.md, paddingHorizontal: S.lg, paddingVertical: S.md, minHeight: TOUCH, marginBottom: S.sm },
  pill:        { borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  collapseHead:{ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: TOUCH },
  iconBtn:     { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
  track:       { width: 52, height: 32, borderRadius: 16, backgroundColor: C.surfaceHigher, borderWidth: 2, borderColor: C.textFaint, justifyContent: 'center', paddingHorizontal: 4 },
  thumb:       { width: 16, height: 16, borderRadius: 8, backgroundColor: C.textFaint },
  thumbOn:     { width: 24, height: 24, borderRadius: 12, backgroundColor: C.onAccent, alignSelf: 'flex-end' },
});
