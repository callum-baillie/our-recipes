import type { ProfileGoalContext } from './profile-goals';

export type KitchenInterviewAnswers = NonNullable<ProfileGoalContext['kitchenInterview']>;
export type KitchenInterviewTopic = keyof KitchenInterviewAnswers;

export const emptyKitchenInterview: KitchenInterviewAnswers = {
  taste: '',
  snacks: '',
  desserts: '',
  routine: '',
  favorites: '',
  avoid: '',
};

export const kitchenInterviewQuestions: Array<{
  key: KitchenInterviewTopic;
  title: string;
  help: string;
}> = [
  {
    key: 'taste',
    title: 'Do you lean sweet, savory, or a little of both?',
    help: 'Tell us about flavors you love. A sweet tooth is a preference, not a rule for every meal.',
  },
  {
    key: 'snacks',
    title: 'What do you like to snack on?',
    help: 'Do you snack during the day, at night, or both? Fruit, yogurt, crackers, something else?',
  },
  {
    key: 'desserts',
    title: 'Do you usually have dessert?',
    help: 'How often? Ice cream, cheesecake, pie, candy, or something else? It is fine to skip dessert.',
  },
  {
    key: 'routine',
    title: 'Which meals do you share with your household?',
    help: 'Perhaps everyone shares dinner but has their own breakfast or lunch. Include cooking time, equipment, budget and routine preferences.',
  },
  {
    key: 'favorites',
    title: 'What meals would you happily eat again?',
    help: 'Favorite cuisines, ingredients, comfort foods, and things you would like to try.',
  },
  {
    key: 'avoid',
    title: 'What should your assistant keep in mind?',
    help: 'Foods you dislike, textures, or practical needs. Record allergies in your nutrition profile too; they always take priority.',
  },
];

/** One-tap answers offered beside each question. They are plain suggestions, never defaults. */
export const kitchenInterviewSuggestions: Record<KitchenInterviewTopic, string[]> = {
  taste: ['Mostly savory', 'A little of both', 'Sweet flavors'],
  snacks: ['Fruit or yogurt', 'Savory snacks', 'I rarely snack'],
  desserts: ['Occasionally', 'Most evenings', 'I usually skip dessert'],
  routine: ['Shared dinners', 'Quick weekday meals', 'Flexible routines'],
  favorites: ['Comfort food', 'Simple seasonal meals', 'Trying new cuisines'],
  avoid: ['Short cooking time', 'A modest budget', 'Texture preferences'],
};

export const kitchenInterviewMaxLength = (topic: KitchenInterviewTopic): number =>
  topic === 'taste' ? 500 : 800;
