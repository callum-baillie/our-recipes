import * as React from 'react';
import { Body, Button, FormField, NativeToggle, Surface } from '@/components/ui';
import { ChoiceField } from '@/components/choice-field';
import { ResourceState, TaskError } from '@/components/nutrition-workspace-common';
import { useResource } from '@/hooks/use-resource';
import { useTask } from '@/hooks/use-task';
import { useAuth } from '@/auth/auth-context';
export type AppPreferences = {
  recipes: { defaultSort: string; defaultServings: number };
  mealPlan: {
    weekStartsOn: 0 | 1;
    defaultDuration: 3 | 5 | 7 | 14;
    defaultMealTypes: string[];
    visibleMealTypes: string[];
    customMealTypes: { value: string; label: string }[];
  };
  pantry: { defaultView: string; defaultSort: string; defaultGroup: string };
};
export function ServerPreferences({ category }: { category: keyof AppPreferences }) {
  const resource = useResource<{ preferences: AppPreferences }>('/api/v1/settings/preferences');
  return (
    <Surface style={{ gap: 12 }}>
      <Body>Shared household defaults</Body>
      <ResourceState resource={resource} />
      {resource.data ? (
        <PreferencesEditor
          key={`${category}:${JSON.stringify(resource.data.preferences[category])}`}
          category={category}
          initial={resource.data.preferences}
          onSaved={resource.reload}
        />
      ) : null}
    </Surface>
  );
}
function PreferencesEditor({
  category,
  initial,
  onSaved,
}: {
  category: keyof AppPreferences;
  initial: AppPreferences;
  onSaved: () => void;
}) {
  const { request } = useAuth();
  const task = useTask();
  const [values, setValues] = React.useState(initial);
  const [servings, setServings] = React.useState(String(initial.recipes.defaultServings));
  const [customName, setCustomName] = React.useState('');
  const set = (field: string, value: unknown) =>
    setValues((current) => ({ ...current, [category]: { ...current[category], [field]: value } }));
  const choice = (field: string, label: string, options: string[], value: string) => (
    <ChoiceField
      key={field}
      label={label}
      value={value}
      choices={options.map((option) => ({
        value: option,
        label: option.replaceAll('_', ' ').replaceAll('-', ' '),
      }))}
      onChange={(next) => set(field, next)}
    />
  );
  const slots = [
    ...new Set([
      'breakfast',
      'brunch',
      'lunch',
      'dinner',
      'snack',
      'dessert',
      'supper',
      'tiffin',
      'suhoor',
      'iftar',
      ...values.mealPlan.customMealTypes.map((entry) => entry.value),
      ...values.mealPlan.visibleMealTypes,
    ]),
  ];
  return (
    <>
      <TaskError error={task.error} />
      {category === 'recipes' ? (
        <>
          {choice(
            'defaultSort',
            'Default recipe order',
            [
              'recently-added',
              'recently-updated',
              'alphabetical',
              'most-recently-cooked',
              'shortest-time',
              'highest-rated',
            ],
            values.recipes.defaultSort,
          )}
          <FormField
            label="Default servings"
            value={servings}
            onChangeText={setServings}
            keyboardType="number-pad"
          />
        </>
      ) : null}
      {category === 'pantry' ? (
        <>
          {choice(
            'defaultView',
            'Default view',
            [
              'all',
              'pantry',
              'refrigerator',
              'freezer',
              'low_stock',
              'opened',
              'unopened',
              'frozen',
              'recent',
            ],
            values.pantry.defaultView,
          )}
          {choice(
            'defaultSort',
            'Default order',
            ['expiry', 'name', 'quantity', 'location', 'updated', 'added'],
            values.pantry.defaultSort,
          )}
          {choice(
            'defaultGroup',
            'Group inventory by',
            ['none', 'location', 'category', 'expiry'],
            values.pantry.defaultGroup,
          )}
        </>
      ) : null}
      {category === 'mealPlan' ? (
        <>
          <ChoiceField
            label="Week starts"
            value={String(values.mealPlan.weekStartsOn)}
            choices={[
              { value: '1', label: 'Monday' },
              { value: '0', label: 'Sunday' },
            ]}
            onChange={(next) => set('weekStartsOn', Number(next))}
          />
          <ChoiceField
            label="Days shown"
            value={String(values.mealPlan.defaultDuration)}
            choices={['3', '5', '7', '14'].map((value) => ({ value, label: `${value} days` }))}
            onChange={(next) => set('defaultDuration', Number(next))}
          />
          {slots.map((slot) => (
            <React.Fragment key={slot}>
              <NativeToggle
                label={`Show ${values.mealPlan.customMealTypes.find((entry) => entry.value === slot)?.label ?? slot}`}
                value={values.mealPlan.visibleMealTypes.includes(slot)}
                onChange={(enabled) =>
                  set(
                    'visibleMealTypes',
                    enabled
                      ? [...values.mealPlan.visibleMealTypes, slot]
                      : values.mealPlan.visibleMealTypes.filter((value) => value !== slot),
                  )
                }
              />
              <NativeToggle
                label={`Include ${slot} by default`}
                value={values.mealPlan.defaultMealTypes.includes(slot)}
                onChange={(enabled) =>
                  set(
                    'defaultMealTypes',
                    enabled
                      ? [...values.mealPlan.defaultMealTypes, slot]
                      : values.mealPlan.defaultMealTypes.filter((value) => value !== slot),
                  )
                }
              />
            </React.Fragment>
          ))}
          <FormField label="Custom meal name" value={customName} onChangeText={setCustomName} />
          <Button
            label="Add custom meal type"
            tone="secondary"
            onPress={() => {
              const slug = customName
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '');
              if (!slug) return;
              const value = `custom-${slug}`;
              if (values.mealPlan.customMealTypes.some((entry) => entry.value === value)) return;
              setValues((current) => ({
                ...current,
                mealPlan: {
                  ...current.mealPlan,
                  customMealTypes: [
                    ...current.mealPlan.customMealTypes,
                    { value, label: customName.trim() },
                  ],
                  visibleMealTypes: [...current.mealPlan.visibleMealTypes, value],
                },
              }));
              setCustomName('');
            }}
          />
        </>
      ) : null}
      <Button
        label={task.busy ? 'Saving…' : 'Save household defaults'}
        disabled={task.busy}
        onPress={() =>
          void task.run(async () => {
            const input =
              category === 'recipes'
                ? { ...values.recipes, defaultServings: Number(servings) }
                : values[category];
            await request('/api/v1/settings/preferences', {
              method: 'PATCH',
              body: JSON.stringify({ category, values: input }),
            });
            onSaved();
          })
        }
      />
    </>
  );
}
