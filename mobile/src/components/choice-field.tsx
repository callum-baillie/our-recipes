import * as React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Body, Button, FormField } from '@/components/ui';
import { tokens } from '@/theme/tokens';
export function ChoiceField({
  label,
  value,
  onChange,
  choices,
  searchable = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  choices: { value: string; label: string }[];
  searchable?: boolean;
  disabled?: boolean;
}) {
  const [query, setQuery] = React.useState('');
  const [limit, setLimit] = React.useState(60);
  const search = React.useDeferredValue(query.toLowerCase().trim());
  React.useEffect(() => setLimit(60), [search]);
  const filtered = choices.filter(
    (choice) => !search || choice.label.toLowerCase().includes(search),
  );
  return (
    <View style={{ gap: 8 }}>
      <Body>{label}</Body>
      {searchable ? (
        <FormField
          label={`Search ${label.toLowerCase()}`}
          value={query}
          onChangeText={setQuery}
          editable={!disabled}
        />
      ) : null}
      <ScrollView
        horizontal={!searchable}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        style={searchable ? { maxHeight: 220 } : undefined}
        contentContainerStyle={{ gap: 8 }}
      >
        {filtered.slice(0, searchable ? limit : filtered.length).map((choice) => (
          <Pressable
            key={choice.value}
            accessibilityRole="button"
            accessibilityLabel={choice.label}
            accessibilityState={{ selected: value === choice.value, disabled }}
            disabled={disabled}
            onPress={() => onChange(choice.value)}
            style={{
              padding: 12,
              minHeight: 44,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: value === choice.value ? tokens.color.olive : tokens.color.separator,
              backgroundColor: value === choice.value ? tokens.color.sage : tokens.color.surface,
            }}
          >
            <Text style={{ color: tokens.color.ink }}>
              {value === choice.value ? '✓ ' : ''}
              {choice.label}
            </Text>
          </Pressable>
        ))}
        {searchable && filtered.length > limit ? (
          <Button
            label={`Show more (${filtered.length - limit} remaining)`}
            tone="secondary"
            onPress={() => setLimit((value) => value + 60)}
          />
        ) : null}
        {!filtered.length ? <Body muted>No matching choices.</Body> : null}
      </ScrollView>
    </View>
  );
}
