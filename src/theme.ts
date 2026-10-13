// Sistema visual: Material 3 oscuro de alto contraste (ver .impeccable/surfaces/app-tsx.md).
// Toda pantalla usa estos roles; nada de colores sueltos.
import { TextStyle } from 'react-native';

export const C = {
  bg:            '#0E0E0F',  // fondo de la app
  surface:       '#1A1A1C',  // tarjetas y listas
  surfaceHigh:   '#242427',  // campos, chips, superficies elevadas
  surfaceHigher: '#2E2E32',  // pulsado, separadores fuertes
  outline:       '#3A3A3F',
  text:          '#F4F4F5',  // texto principal (16:1 sobre bg)
  textMuted:     '#C2C2C8',  // texto secundario (10:1)
  textFaint:     '#9A9AA2',  // pistas (6,6:1); nunca más oscuro que esto
  primary:       '#8AB4F8',  // acciones neutras (azul de Google en oscuro)
  onPrimary:     '#06213F',
  primaryContainer: '#1D3557',
  money:         '#4ADE80',  // entra plata
  moneyContainer:'#12321F',
  spend:         '#FF7A70',  // sale plata o se debe
  spendContainer:'#3A1715',
  warn:          '#FFC24D',  // aviso
  warnContainer: '#3A2A08',
  onAccent:      '#0E0E0F',  // texto sobre verde, rojo o ámbar sólidos
} as const;

// Escala tipográfica Material 3 (los tamaños escalan con la letra del sistema)
const t = (fontSize: number, lineHeight: number, fontWeight: TextStyle['fontWeight'], extra: TextStyle = {}): TextStyle =>
  ({ fontSize, lineHeight, fontWeight, color: C.text, ...extra });

export const T = {
  display:  t(44, 52, '700', { fontVariant: ['tabular-nums'], letterSpacing: -0.5 }),
  headline: t(28, 36, '700', { fontVariant: ['tabular-nums'] }),
  title:    t(20, 28, '700'),
  titleSm:  t(17, 24, '600'),
  body:     t(16, 24, '400'),
  bodySm:   t(14, 20, '400', { color: C.textMuted }),
  label:    t(14, 20, '600'),
  labelSm:  t(13, 18, '500', { color: C.textMuted }),
  amount:   t(17, 24, '700', { fontVariant: ['tabular-nums'] }),
} as const;

export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const R = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

// Alto mínimo de cualquier cosa tocable (Material: 48 dp)
export const TOUCH = 48;
