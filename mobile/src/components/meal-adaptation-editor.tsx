import { View } from 'react-native';
import { Button, EditorialText, FormField, Surface } from '@/components/ui';
import type { MealAdaptation } from '@/data/meal-entry';
export function MealAdaptationEditor({
  value,
  onChange,
}: {
  value: MealAdaptation;
  onChange: (next: MealAdaptation) => void;
}) {
  return (
    <View style={{ gap: 12 }}>
      <FormField
        label="Variation title"
        value={value.title}
        onChangeText={(title) => onChange({ ...value, title })}
      />
      <FormField
        label="Variation summary"
        value={value.summary}
        onChangeText={(summary) => onChange({ ...value, summary })}
      />
      <FormField
        label="Base servings for these ingredients"
        value={value.servings}
        onChangeText={(servings) => onChange({ ...value, servings })}
      />
      {value.ingredientGroups.map((group, groupIndex) => (
        <Surface key={groupIndex} style={{ gap: 12 }}>
          <EditorialText>{group.name || 'Ingredients'}</EditorialText>
          {group.ingredients.map((ingredient, index) => (
            <View key={index} style={{ gap: 8 }}>
              {(['item', 'quantity', 'unit', 'note'] as const).map((field) => (
                <FormField
                  key={field}
                  label={`${index + 1}. ${field}`}
                  value={String(ingredient[field])}
                  keyboardType={field === 'quantity' ? 'decimal-pad' : undefined}
                  onChangeText={(text) =>
                    onChange({
                      ...value,
                      ingredientGroups: value.ingredientGroups.map((candidate, i) =>
                        i !== groupIndex
                          ? candidate
                          : {
                              ...candidate,
                              ingredients: candidate.ingredients.map((item, j) =>
                                j !== index
                                  ? item
                                  : {
                                      ...item,
                                      [field]: text,
                                    },
                              ),
                            },
                      ),
                    })
                  }
                />
              ))}
              <Button
                label="Remove ingredient"
                tone="quiet"
                disabled={group.ingredients.length <= 1}
                onPress={() =>
                  onChange({
                    ...value,
                    ingredientGroups: value.ingredientGroups.map((candidate, i) =>
                      i !== groupIndex
                        ? candidate
                        : {
                            ...candidate,
                            ingredients: candidate.ingredients.filter((_, j) => j !== index),
                          },
                    ),
                  })
                }
              />
            </View>
          ))}
          <Button
            label="Add ingredient"
            tone="secondary"
            onPress={() =>
              onChange({
                ...value,
                ingredientGroups: value.ingredientGroups.map((candidate, i) =>
                  i !== groupIndex
                    ? candidate
                    : {
                        ...candidate,
                        ingredients: [
                          ...candidate.ingredients,
                          { item: '', quantity: '', unit: '', note: '', shoppingCategory: 'Other' },
                        ],
                      },
                ),
              })
            }
          />
        </Surface>
      ))}
      {value.instructionSections.map((section, index) => (
        <FormField
          key={index}
          label={section.title || 'Method (one step per line)'}
          multiline
          value={section.steps.join('\n')}
          onChangeText={(text) =>
            onChange({
              ...value,
              instructionSections: value.instructionSections.map((candidate, i) =>
                i !== index ? candidate : { ...candidate, steps: text.split('\n') },
              ),
            })
          }
        />
      ))}
    </View>
  );
}
