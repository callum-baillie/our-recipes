import type { RecipeInput } from '@/lib/domain/recipe';

export const SCOTTISH_STOVIES_IMAGE_PATH = '/examples/traditional-scottish-stovies.webp';

export const SCOTTISH_STOVIES_IMAGE_ALT =
  'Traditional Scottish Stovies with roast beef, potatoes, and onion in a dark stoneware bowl';

export const SCOTTISH_STOVIES_RECIPE: RecipeInput = {
  title: 'Traditional Scottish Stovies',
  summary:
    'A thrifty Scottish classic of floury potatoes, softened onion, and leftover roast beef, slowly simmered in stock until rich, tender, and spoonably thick.',
  status: 'active',
  servings: '6 servings',
  prepMinutes: 15,
  cookMinutes: 65,
  restMinutes: 5,
  difficulty: 'Easy',
  cuisine: 'Scottish, British',
  category: 'Dinner, Main dish',
  tips: 'Floury potatoes such as Maris Piper or King Edward give Stovies their characteristic soft edges. If you have leftover roast gravy, replace up to 100 ml of the stock with gravy. Add only enough liquid to keep the potatoes moist: Stovies should finish thick rather than soupy.',
  sharedNotes:
    'Nutrition is an estimate per serving and excludes oatcakes or bread. Stock and leftover roast beef vary considerably in salt and fat, so use reduced-sodium stock when possible and season at the end.',
  sourceName: 'Bòrd example recipe · researched from traditional Scottish methods',
  sourceUrl: 'https://scottishscran.com/how-to-make-stovies-recipe/',
  originalAuthor: 'Bòrd kitchen',
  cookingMethod: 'Stovetop',
  equipment: [
    'Large heavy-based pot or Dutch oven with lid',
    'Chopping board',
    "Chef's knife",
    'Vegetable peeler',
    'Wooden spoon',
    'Measuring jug',
    'Kitchen scale',
  ],
  nutritionCalories: 320,
  nutritionProteinGrams: 21,
  nutritionCarbohydrateGrams: 34,
  nutritionFatGrams: 11,
  nutritionSaturatedFatGrams: 5,
  nutritionFiberGrams: 4,
  nutritionSugarGrams: 4,
  nutritionSodiumMilligrams: 550,
  tags: ['scottish', 'comfort food', 'leftovers', 'one pot', 'family dinner'],
  ingredientGroups: [
    {
      name: 'Stovies',
      ingredients: [
        {
          quantity: 30,
          unit: 'g',
          item: 'beef dripping or unsalted butter',
          note: 'beef dripping is most traditional',
        },
        {
          quantity: 1,
          unit: '',
          item: 'large onion',
          note: 'about 200 g, peeled and finely chopped',
        },
        {
          quantity: 1000,
          unit: 'g',
          item: 'floury potatoes',
          note: 'peeled and cut into irregular 3 cm chunks',
        },
        {
          quantity: 300,
          unit: 'g',
          item: 'leftover cooked roast beef',
          note: 'roughly shredded or cut into bite-sized pieces',
        },
        {
          quantity: 400,
          unit: 'ml',
          item: 'hot reduced-sodium beef stock',
          note: 'or a mixture of stock and leftover roast gravy',
        },
      ],
    },
    {
      name: 'Season and serve',
      ingredients: [
        {
          quantity: 0.5,
          unit: 'tsp',
          item: 'fine sea salt',
          note: 'start with less if using gravy; adjust to taste',
        },
        {
          quantity: 0.5,
          unit: 'tsp',
          item: 'freshly ground black pepper',
          note: 'plus more to taste',
        },
        {
          quantity: 2,
          unit: 'tbsp',
          item: 'fresh flat-leaf parsley',
          note: 'roughly chopped, optional',
        },
        {
          quantity: '',
          unit: '',
          item: 'oatcakes or crusty bread',
          note: 'optional, to serve',
        },
      ],
    },
  ],
  instructionSections: [
    {
      title: 'Prepare the Stovies',
      steps: [
        'Prepare all of the ingredients before you begin. Keep the potato pieces irregular: their smaller edges will break down and naturally thicken the stock while the larger pieces stay tender.',
        'Melt the beef dripping or butter in a large heavy-based pot over medium-low heat. Add the onion with a small pinch of the measured salt and cook for 8–10 minutes, stirring occasionally, until soft and translucent but not browned.',
        'Add the potatoes and turn them through the onion and fat for 2–3 minutes so every piece is lightly coated.',
        'Fold in the cooked roast beef, then pour in 350 ml of the hot stock. Bring just to a gentle simmer; avoid a hard boil, which can make the meat tough.',
        'Cover, reduce the heat to low, and cook for 45–55 minutes. Stir gently every 10–15 minutes and scrape the base of the pot. Add the remaining stock a little at a time only if the potatoes begin to catch.',
        'When the potatoes are very tender, press a few pieces against the side of the pot and stir them back through the gravy. Simmer uncovered for 5–10 minutes, until the Stovies are moist and spoonable but no longer soupy.',
        'Season with the remaining salt and black pepper to taste. Check that the leftover beef is piping hot throughout, then take the pot off the heat and rest, covered, for 5 minutes.',
        'Spoon into warm bowls, scatter with parsley if using, and serve with oatcakes or crusty bread.',
      ],
    },
  ],
};
