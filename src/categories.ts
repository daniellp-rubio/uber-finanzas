export const EXPENSE_CATEGORIES = [
  { id: 'gas',   label: 'Gasolina', icon: '⛽' },
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

export type TransactionType = 'income' | 'expense';

export function getCategoryLabel(type: TransactionType, id: string): string {
  const cats = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return (cats as readonly { id: string; label: string }[]).find(c => c.id === id)?.label ?? id;
}

export function getCategoryIcon(type: TransactionType, id: string): string {
  const cats = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return (cats as readonly { id: string; icon: string }[]).find(c => c.id === id)?.icon ?? '💰';
}
