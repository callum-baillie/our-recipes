import * as React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Body, Button, EditorialText, FormField, Surface } from '@/components/ui';
import { ResourceState, TaskError } from '@/components/nutrition-workspace-common';
import { useResource } from '@/hooks/use-resource';
import { useTask } from '@/hooks/use-task';
import { useAuth } from '@/auth/auth-context';
type Recommendation = {
  key: string;
  recipeId: string;
  recipeTitle: string;
  explanation: string;
  completeness: number;
  confidence: number;
  pantryState: string;
  pantryUnknownReasons: string[];
  feedback: { id: string; state: string; reason: string } | null;
};
export function NutritionRecommendationsWorkspace({ profileId }: { profileId: string }) {
  const path = `/api/v1/nutrition/profiles/${profileId}/recommendations`;
  const resource = useResource<{ recommendations: Recommendation[] }>(path);
  const { request } = useAuth();
  const task = useTask();
  const [reasons, setReasons] = React.useState<Record<string, string>>({});
  const feedback = (item: Recommendation, state: string) =>
    task.run(async () => {
      await request(`${path}/${item.key}/feedback`, {
        method: 'POST',
        body: JSON.stringify({
          state,
          reason: reasons[item.key] ?? '',
          supersedesFeedbackId: item.feedback?.id ?? null,
        }),
      });
      resource.reload();
    });
  return (
    <View style={{ gap: 12 }}>
      <EditorialText>Recipe suggestions</EditorialText>
      <ResourceState resource={resource} />
      <TaskError error={task.error} />
      {resource.data?.recommendations.map((item) => (
        <Surface key={item.key} style={{ gap: 10 }}>
          <EditorialText>{item.recipeTitle}</EditorialText>
          <Body>{item.explanation}</Body>
          <Body muted>
            {Math.round(item.completeness * 100)}% complete · {Math.round(item.confidence * 100)}%
            confidence · Pantry {item.pantryState}
          </Body>
          {item.pantryUnknownReasons.map((reason, index) => (
            <Body key={index} muted>
              {reason}
            </Body>
          ))}
          <Button
            label="Open recipe"
            onPress={() => router.push(`/(app)/(recipes)/${item.recipeId}`)}
          />
          <Button
            label="Plan this recipe"
            tone="secondary"
            onPress={() =>
              router.push({ pathname: '/(app)/(plan)/entry', params: { recipeId: item.recipeId } })
            }
          />
          {item.feedback ? (
            <Body muted>Feedback: {item.feedback.state.replaceAll('_', ' ')}</Body>
          ) : null}
          <FormField
            label="Feedback note (optional)"
            value={reasons[item.key] ?? ''}
            onChangeText={(value) => setReasons((current) => ({ ...current, [item.key]: value }))}
          />
          {['helpful', 'not_helpful', 'dismissed'].map((state) => (
            <Button
              key={state}
              label={state === 'dismissed' ? 'Dismiss suggestion' : state.replaceAll('_', ' ')}
              tone="secondary"
              disabled={task.busy}
              onPress={() => void feedback(item, state)}
            />
          ))}
        </Surface>
      ))}
      {resource.data && !resource.data.recommendations.length ? (
        <Body muted>No suggestions currently meet the server’s evidence requirements.</Body>
      ) : null}
    </View>
  );
}
