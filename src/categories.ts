export const EXPENSE_CATEGORIES = [
  { id: 'gas',   label: 'Gasolina', icon: '⛽' },
  { id: 'charge', label: 'Carga',   icon: '⚡' },
  { id: 'uber_pass', label: 'Uber Pass', icon: '🎫' },
  { id: 'food',  label: 'Comida',   icon: '🍽️' },
  { id: 'maint', label: 'Mecánico', icon: '🔧' },
  { id: 'wash',  label: 'Lavado',   icon: '🚿' },
  { id: 'toll',  label: 'Peajes',   icon: '🛣️' },
  { id: 'phone', label: 'Celular',  icon: '📱' },
  { id: 'other', label: 'Otro',     icon: '📦' },
] as const;

export const INCOME_CATEGORIES = [
  { id: 'uber',  label: 'Uber',     icon: '🚗' },
  { id: 'cash',  label: 'Efectivo', icon: '💵' },
  { id: 'bonus', label: 'Bono',     icon: '⭐' },
  { id: 'other', label: 'Otro',     icon: '💰' },
] as const;

// Ingreso que crea la app sola (pagos del arriendo en 🚙 Carros): no sale en el selector de Hoy
// y no cuenta como día trabajado ni como ingreso de Uber
export const RENT_CATEGORY = 'rent';
const SYSTEM_INCOME = [{ id: RENT_CATEGORY, label: 'Arriendo del carro', icon: '🔑' }];

// Gasto de energía del carro que maneja: con carro eléctrico se muestra ⚡ Carga y no ⛽ Gasolina
export const CHARGE_CATEGORY = 'charge';

export type TransactionType = 'income' | 'expense';

function allCategories(type: TransactionType): readonly { id: string; label: string; icon: string }[] {
  return type === 'income' ? [...INCOME_CATEGORIES, ...SYSTEM_INCOME] : EXPENSE_CATEGORIES;
}

export function getCategoryLabel(type: TransactionType, id: string): string {
  return allCategories(type).find(c => c.id === id)?.label ?? id;
}

export function getCategoryIcon(type: TransactionType, id: string): string {
  return allCategories(type).find(c => c.id === id)?.icon ?? '💰';
}
