import { useEffect, useState } from 'react';
import { formatCents, parseMoneyToCents } from '@/domain/money';
import { TextField, type TextFieldProps } from './TextField';

interface Props extends Omit<TextFieldProps, 'value' | 'onChangeText'> {
  cents: number | null;
  onChangeCents: (cents: number | null) => void;
  allowNegative?: boolean;
}

/** Edits text freely, commits integer cents on blur. Shows "$64.99" when not focused. */
export function MoneyField({ cents, onChangeCents, allowNegative, ...rest }: Props) {
  const [text, setText] = useState(cents === null ? '' : (cents / 100).toFixed(2));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(cents === null ? '' : (cents / 100).toFixed(2));
  }, [cents, focused]);

  return (
    <TextField
      keyboardType={allowNegative ? 'numbers-and-punctuation' : 'decimal-pad'}
      inputMode="decimal"
      value={focused ? text : cents === null ? '' : formatCents(cents)}
      onFocus={() => setFocused(true)}
      onChangeText={setText}
      onBlur={() => {
        setFocused(false);
        const parsed = text.trim() === '' ? null : parseMoneyToCents(text);
        onChangeCents(parsed !== null && !allowNegative ? Math.abs(parsed) : parsed);
      }}
      placeholder="$0.00"
      {...rest}
    />
  );
}
