# Recipe summary cards

`RecipeSummaryCard` has standard and compact variants. Both keep the recipe link separate from reaction and collection controls.

- Standard cards use a 4:3 image at desktop widths and 16:10 at phone widths. The body owns one gap scale; its metadata group moves together to the bottom of desktop grid rows. Cards have no fixed content height.
- Compact cards use an 88px square thumbnail beside the title and essential metadata at every viewport. Actions occupy a separate row; they cannot cover taxonomy or titles. The compact variant omits the visual summary so the meal stays brief; the full summary remains on the recipe.
- Action rows use 44px controls without floating capsule shadows. Reactions remain mutually exclusive Dislike, Like and Staple choices. Staple has a visible label; each control also has an accessible name and native hover description and an accessible focus name. Collection membership is a separate action.
- Recipe time fields store unprovided times as zero. There is no separate explicit-zero flag. `formatRecipeDuration` omits an all-zero total and formats positive prep + cook + rest totals exactly, such as `4h 5m`.
- Pantry state uses `PantryAvailabilityPill`. A wholly unknown result shows one status. Mixed results retain nonzero covered, short and unknown counts. Detailed ingredient reasons remain on the recipe's pantry surface.
- Nutrition remains factual per-serving data, with nutrition-data completeness named explicitly. No review badge is inferred from recipe prose.

Home requests six library preview results and four recent recipes. Recent recipes form a keyboard-focusable scrolling strip on phones, with the next card partly visible. Filtered totals and the library link describe the entire matching collection; the preview limit does not alter saved recipes.
