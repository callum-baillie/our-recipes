import { Text, View } from 'react-native';
import { Body, Button, FormField } from '@/components/ui';
import { ChoiceField } from '@/components/choice-field';
import { tokens } from '@/theme/tokens';
export function ResourceState({
  resource,
}: {
  resource: { loading: boolean; error?: string; reload: () => void };
}) {
  return resource.loading ? (
    <Body muted>Loading…</Body>
  ) : resource.error ? (
    <View style={{ gap: 8 }}>
      <Text accessibilityRole="alert" style={{ color: tokens.color.danger }}>
        {resource.error}
      </Text>
      <Button label="Try again" tone="secondary" onPress={resource.reload} />
    </View>
  ) : null;
}
export function TaskError({ error }: { error: string | null }) {
  return error ? (
    <Text accessibilityRole="alert" style={{ color: tokens.color.danger }}>
      {error}
    </Text>
  ) : null;
}
export function IntakeTiming({
  date,
  time,
  meal,
  setDate,
  setTime,
  setMeal,
  disabled = false,
}: {
  date: string;
  time: string;
  meal: string;
  setDate: (value: string) => void;
  setTime: (value: string) => void;
  setMeal: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <FormField
        label="Date (YYYY-MM-DD)"
        value={date}
        onChangeText={setDate}
        editable={!disabled}
      />
      <FormField
        label="Time on this device (HH:MM)"
        value={time}
        onChangeText={setTime}
        editable={!disabled}
      />
      <ChoiceField
        label="Meal"
        disabled={disabled}
        value={meal}
        onChange={setMeal}
        choices={['breakfast', 'lunch', 'dinner', 'snack', 'other'].map((value) => ({
          value,
          label: value,
        }))}
      />
    </>
  );
}
