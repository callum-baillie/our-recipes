# Kitchen assistant and planned meals

## In the app

- **Planner → Add a meal:** choose recipes, a single food/drink, takeout, or leftovers from an earlier meal (the picker includes the preceding 30 days).
- **Meal menu → Edit meal / adapt recipe:** change the meal or enable **Adapt the recipe for this meal only**. Edit ingredients and instructions without changing the library recipe. Turn it off to restore the current library recipe.
- Leftover portions are linked to their original meal. Include those portions in the source meal’s servings. Leftovers do not add another set of ingredients to shopping demand. Source meals cannot be removed or moved after their active leftovers.
- A single food’s quantity is **per serving**. Takeout creates no grocery demand. Neither has inferred nutrition.
- Temporary recipe adaptations follow the meal into grocery demand/provenance, cooking mode, and PDF recipe cards. Nutrition from the original recipe is not reused for adaptations.

## Chat examples

- “Plan breakfast, lunch and dinner for everyone next week.”
- “Keep our dinners; fill only the missing breakfasts and lunches.”
- “Add coffee to my shopping list.”
- “What recipes need the ground beef on this list? I can’t find it.”
- “Use ground turkey for Tuesday’s lasagne this time, and update the shopping item.”
- “Make a healthier copy of my lasagne, keeping the original.”

Parents and admins can ask for selected household members or everyone. Each member’s AI sharing preferences still govern the context provided. Actual account permissions authorize actions; a household profile alone does not grant access.

Read tools include household profiles, shopping provenance, planned meals, and the exact planned recipe revision/adaptation. Changes use review cards and existing authorized routes. A shopping substitution is a reviewed group: update the shopping item first, then the affected meal adaptations. Other list copies and unrelated planned meals are not rewritten. Groups report partial failure and stop on the first failure; they are not an atomic cross-resource transaction.

Generated plans show day-by-day previews. Occupied slots can be kept or replaced in the review when conflict review was requested. Filling missing slots preserves existing meals.

## Conversation and images

The newest conversation is restored after closing or navigation; **New chat** starts another conversation. Earlier conversations remain stored. Image attachments accept JPG, PNG, WebP and GIF, with at most four images, 5.5 MB per image and a combined encoded limit of 12 MB. The original image is sent for the initial turn; a resized WebP copy is retained with the message for display and follow-up context. No provider credentials are exposed to the browser.

On touch devices Enter inserts a new line. Use Send to submit. Desktop retains Enter to send and Shift+Enter for a new line. The mobile drawer follows the visual viewport when the keyboard opens.

## Upgrade

Migration `0062_planned_meal_variations` adds meal kinds, temporary recipe data, and stored chat images. Normal server startup applies it. No existing recipe revisions are rewritten.
