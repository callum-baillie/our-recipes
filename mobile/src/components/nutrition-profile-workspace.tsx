import * as React from 'react';
import { View } from 'react-native';
import { Body, Button, EditorialText, FormField, NativeToggle, Surface } from '@/components/ui';
import { ChoiceField } from '@/components/choice-field';
import { ResourceState, TaskError } from '@/components/nutrition-workspace-common';
import { useResource } from '@/hooks/use-resource';
import { useTask } from '@/hooks/use-task';
import { useAuth } from '@/auth/auth-context';
import { useSync } from '@/sync/sync-context';
import { nutrientCatalog } from '@/data/nutrient-catalog';
import { validDate } from '@/data/meal-entry';
const textFields = [
  ['dateOfBirth', 'Date of birth (YYYY-MM-DD)'],
  ['heightCentimeters', 'Height (cm)'],
  ['currentWeightKilograms', 'Current weight (kg)'],
  ['targetWeightKilograms', 'Target weight (kg)'],
  ['targetDate', 'Target date (YYYY-MM-DD)'],
  ['dailyResetTimezone', 'Daily reset timezone'],
  ['referenceJurisdiction', 'Reference jurisdiction'],
] as const;
const listFields = [
  ['dietaryPreferences', 'Dietary preferences'],
  ['foodAllergies', 'Food allergies'],
  ['dietaryExclusions', 'Dietary exclusions'],
] as const;
const toggles = [
  ['weightTrackingEnabled', 'Track weight'],
  ['estimatedTargetsEnabled', 'Enable estimated targets'],
  ['estimatedTargetConsent', 'I consent to using my profile to estimate targets'],
  ['showPlannedNutrition', 'Show planned nutrition'],
  ['showRecipeCardNutrition', 'Show recipe card nutrition'],
  ['showMealPlanNutrition', 'Show meal plan nutrition'],
] as const;
const selections = [
  ['measurementSystem', 'Measurements', ['metric', 'imperial']],
  ['referenceSexCategory', 'Reference source sex category', ['', 'female', 'male']],
  ['activityLevel', 'Activity', ['', 'sedentary', 'light', 'moderate', 'active', 'very_active']],
  ['nutritionGoalType', 'Goal', ['none', 'maintain', 'gain', 'loss', 'custom']],
  ['explicitlyEnteredLifeStage', 'Life stage', ['', 'pregnant', 'breastfeeding']],
  ['preferredEnergyUnit', 'Energy unit', ['kcal', 'kJ']],
  ['weekStartsOn', 'Week starts on (0 = Sunday)', ['0', '1', '2', '3', '4', '5', '6']],
  ['trendRangeDays', 'Trend range in days', ['7', '14', '30']],
] as const;
type Profile = Record<string, unknown> & { id: string; version: number };
export function NutritionProfileWorkspace({ profileId }: { profileId: string }) {
  const resource = useResource<{ profile: Profile }>(`/api/v1/nutrition/profiles/${profileId}`);
  return (
    <View style={{ gap: 14 }}>
      <EditorialText>Nutrition profile</EditorialText>
      <ResourceState resource={resource} />
      {resource.data ? (
        <ProfileEditor
          key={`${profileId}:${resource.data.profile.version}`}
          profile={resource.data.profile}
          reload={resource.reload}
        />
      ) : null}
    </View>
  );
}
function ProfileEditor({ profile, reload }: { profile: Profile; reload: () => void }) {
  const { request } = useAuth();
  const { refresh } = useSync();
  const task = useTask();
  const parseList = (value: unknown): string[] => {
    if (Array.isArray(value))
      return value.filter((entry): entry is string => typeof entry === 'string');
    if (typeof value === 'string') {
      try {
        return parseList(JSON.parse(value));
      } catch {
        return [];
      }
    }
    return [];
  };
  const [fields, setFields] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(
      [...textFields, ...selections].map(([key]) => [key, String(profile[key] ?? '')]),
    ),
  );
  const [lists, setLists] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(listFields.map(([key]) => [key, parseList(profile[key]).join(', ')])),
  );
  const [flags, setFlags] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(toggles.map(([key]) => [key, Boolean(profile[key])])),
  );
  const [visible, setVisible] = React.useState(parseList(profile.visibleNutrientCodes));
  const [cards, setCards] = React.useState(parseList(profile.recipeCardNutrientCodes));
  const save = () =>
    task.run(async () => {
      const settings: Record<string, unknown> = { ...fields, ...flags };
      for (const key of ['heightCentimeters', 'currentWeightKilograms', 'targetWeightKilograms']) {
        const raw = fields[key];
        const value = Number(raw);
        if (raw && (!Number.isFinite(value) || value <= 0))
          throw new Error('Height and weight must be positive numbers, or blank.');
        settings[key] = raw ? value : null;
      }
      for (const key of ['dateOfBirth', 'targetDate']) {
        if (fields[key] && !validDate(fields[key])) throw new Error('Use valid calendar dates.');
        settings[key] = fields[key] || null;
      }
      for (const key of ['referenceSexCategory', 'activityLevel', 'explicitlyEnteredLifeStage'])
        settings[key] = fields[key] || null;
      settings.weekStartsOn = Number(fields.weekStartsOn);
      settings.trendRangeDays = Number(fields.trendRangeDays);
      for (const [key] of listFields)
        settings[key] = lists[key]
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean);
      settings.visibleNutrientCodes = visible;
      settings.recipeCardNutrientCodes = cards;
      try {
        new Intl.DateTimeFormat('en', { timeZone: fields.dailyResetTimezone }).format();
      } catch {
        throw new Error('Enter a valid timezone such as America/Chicago.');
      }
      await request(`/api/v1/nutrition/profiles/${profile.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ expectedVersion: profile.version, settings }),
      });
      reload();
      await refresh();
    });
  const toggleCode = (codes: string[], code: string, max: number) =>
    codes.includes(code)
      ? codes.filter((item) => item !== code)
      : codes.length < max
        ? [...codes, code]
        : codes;
  return (
    <>
      <TaskError error={task.error} />
      <Surface style={{ gap: 12 }}>
        {textFields.map(([key, label]) => (
          <FormField
            key={key}
            label={label}
            value={fields[key]}
            onChangeText={(value) => setFields((current) => ({ ...current, [key]: value }))}
          />
        ))}
        {selections.map(([key, label, choices]) => (
          <ChoiceField
            key={key}
            label={label}
            value={fields[key]}
            onChange={(value) => setFields((current) => ({ ...current, [key]: value }))}
            choices={choices.map((value) => ({
              value,
              label: value ? value.replaceAll('_', ' ') : 'Not specified',
            }))}
          />
        ))}
        {listFields.map(([key, label]) => (
          <FormField
            key={key}
            label={`${label} (comma separated)`}
            value={lists[key]}
            onChangeText={(value) => setLists((current) => ({ ...current, [key]: value }))}
          />
        ))}
        {toggles.map(([key, label]) => (
          <NativeToggle
            key={key}
            label={label}
            value={flags[key]}
            onChange={(value) => setFlags((current) => ({ ...current, [key]: value }))}
          />
        ))}
      </Surface>
      <Surface style={{ gap: 10 }}>
        <EditorialText>Visible nutrients</EditorialText>
        <Body muted>Select 1–12 nutrients.</Body>
        {nutrientCatalog.map((item) => (
          <NativeToggle
            key={item.code}
            label={item.name}
            value={visible.includes(item.code)}
            onChange={() => setVisible(toggleCode(visible, item.code, 12))}
          />
        ))}
      </Surface>
      <Surface style={{ gap: 10 }}>
        <EditorialText>Recipe card nutrients</EditorialText>
        <Body muted>Select 1–5 nutrients.</Body>
        {nutrientCatalog
          .filter((item) =>
            ['energy_kcal', 'protein', 'carbohydrate', 'total_fat', 'fiber', 'sodium'].includes(
              item.code,
            ),
          )
          .map((item) => (
            <NativeToggle
              key={item.code}
              label={item.name}
              value={cards.includes(item.code)}
              onChange={() => setCards(toggleCode(cards, item.code, 5))}
            />
          ))}
      </Surface>
      <Button label="Save Nutrition profile" disabled={task.busy} onPress={() => void save()} />
    </>
  );
}
