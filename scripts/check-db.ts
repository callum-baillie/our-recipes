import { getHouseholdState } from '@/lib/services/household-service';

const state = getHouseholdState();
console.log(JSON.stringify({ database: 'reachable', setupComplete: Boolean(state.household) }));
