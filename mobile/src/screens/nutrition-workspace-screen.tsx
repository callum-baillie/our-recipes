import { NutritionRecommendationsWorkspace } from '@/components/nutrition-recommendations-workspace';
import { NutritionProfileWorkspace } from '@/components/nutrition-profile-workspace';
import { NutritionGoalsWorkspace } from '@/components/nutrition-goals-workspace';
import * as React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { AppHeader, Body, Button, EditorialText, Screen } from '@/components/ui';
import { ChoiceField } from '@/components/choice-field';
import {
  NutritionDiaryWorkspace,
  type FullDiaryEntry,
} from '@/components/nutrition-diary-workspace';
import { NutritionLogWorkspace } from '@/components/nutrition-log-workspace';
import { NutritionMeasurementsWorkspace } from '@/components/nutrition-measurements-workspace';
import { NutritionPreparedWorkspace } from '@/components/nutrition-prepared-workspace';
import { TaskError } from '@/components/nutrition-workspace-common';
import { useBord } from '@/state/bord-store';
import { useAuth } from '@/auth/auth-context';
import { useTask } from '@/hooks/use-task';
import { presentDocument } from '@/exports/document';
export function NutritionWorkspaceScreen() {
  const params = useLocalSearchParams<{ profileId?: string; tab?: string }>();
  const { state } = useBord();
  const { requestDocument } = useAuth();
  const task = useTask();
  const profiles = state.nutrition.profiles.flatMap((item) => {
    const profile = item as { id?: string; displayName?: string };
    return profile?.id
      ? [{ value: profile.id, label: profile.displayName ?? 'Household profile' }]
      : [];
  });
  const [profileId, setProfileId] = React.useState(params.profileId ?? profiles[0]?.value ?? '');
  const [tab, setTab] = React.useState(params.tab ?? 'diary');
  const [correction, setCorrection] = React.useState<FullDiaryEntry | null>(null);
  React.useEffect(() => {
    if (!profileId && profiles[0]) setProfileId(profiles[0].value);
  }, [profileId, profiles]);
  return (
    <Screen>
      <AppHeader back />
      <EditorialText variant="title">Nutrition workspace</EditorialText>
      <Button
        label="Product nutrition records"
        tone="secondary"
        onPress={() => router.push('/(app)/(nutrition)/products')}
      />
      <ChoiceField
        label="Profile"
        value={profileId}
        choices={profiles}
        onChange={(value) => {
          setProfileId(value);
          setCorrection(null);
        }}
      />
      {!profileId ? (
        <Body muted>Create a household profile and refresh to load Nutrition.</Body>
      ) : (
        <>
          <ChoiceField
            label="Workspace"
            value={tab}
            choices={[
              { value: 'diary', label: 'Diary' },
              { value: 'log', label: 'Record food' },
              { value: 'prepared', label: 'Prepared meals' },
              { value: 'measurements', label: 'Measurements' },
              { value: 'goals', label: 'Goals' },
              { value: 'suggestions', label: 'Suggestions' },
              { value: 'profile', label: 'Profile settings' },
            ]}
            onChange={(value) => {
              setTab(value);
              setCorrection(null);
            }}
          />
          {tab === 'diary' ? (
            <NutritionDiaryWorkspace
              key={profileId}
              profileId={profileId}
              profiles={profiles}
              onCorrect={(entry) => {
                setCorrection(entry);
                setTab('log');
              }}
            />
          ) : null}
          {tab === 'log' ? (
            <NutritionLogWorkspace
              key={`${profileId}:${correction?.id ?? 'new'}`}
              profileId={profileId}
              correction={correction}
              onSaved={() => {
                setCorrection(null);
                setTab('diary');
              }}
            />
          ) : null}
          {tab === 'prepared' ? (
            <NutritionPreparedWorkspace key={profileId} profileId={profileId} />
          ) : null}
          {tab === 'profile' ? (
            <NutritionProfileWorkspace key={profileId} profileId={profileId} />
          ) : null}
          {tab === 'suggestions' ? (
            <NutritionRecommendationsWorkspace key={profileId} profileId={profileId} />
          ) : null}
          {tab === 'goals' ? (
            <NutritionGoalsWorkspace key={profileId} profileId={profileId} />
          ) : null}
          {tab === 'measurements' ? (
            <NutritionMeasurementsWorkspace key={profileId} profileId={profileId} />
          ) : null}
          <Button
            label="Nutrition goals & settings"
            tone="secondary"
            onPress={() => router.push('/settings/nutrition')}
          />
          <Button
            label={task.busy ? 'Exporting…' : 'Export profile data'}
            tone="secondary"
            disabled={task.busy}
            onPress={() =>
              void task.run(async () => {
                const document = await requestDocument(
                  `/api/v1/nutrition/profiles/${profileId}/export`,
                );
                await presentDocument(document.bytes, 'nutrition-profile.json', document.mimeType);
              })
            }
          />
          <TaskError error={task.error} />
        </>
      )}
    </Screen>
  );
}
