import { describe, expect, it } from 'vitest';
import {
  editableProposalFields,
  revisedProposalBody,
  reviewValues,
  revisionMessage,
} from '../../shared/mobile-domain/proposal-review';
describe('native proposal review and edits', () => {
  it('renders nested content as named human values, including false, unknown and zero', () => {
    expect(
      reviewValues({ meals: [{ mealType: 'dinner', servings: 0, note: null, optional: false }] }),
    ).toEqual([
      { label: 'meals 1 · meal Type', value: 'dinner' },
      { label: 'meals 1 · servings', value: '0' },
      { label: 'meals 1 · note', value: 'Not set' },
      { label: 'meals 1 · optional', value: 'No' },
    ]);
  });
  it('shows equipment facts while hiding transport identities and revision guards', () => {
    expect(
      reviewValues({
        operationId: 'private-operation',
        expectedRevision: 3,
        itemId: 'private-item',
        item: {
          name: 'Large saucepan',
          measurements: [{ value: 3, unit: 'l', basis: 'nominal-volume' }],
        },
        phase: { stepRefs: ['private-step'], resourceIds: ['private-base'] },
      }),
    ).toEqual([
      { label: 'item · name', value: 'Large saucepan' },
      { label: 'item · measurements 1 · value', value: '3' },
      { label: 'item · measurements 1 · unit', value: 'l' },
      { label: 'item · measurements 1 · basis', value: 'nominal-volume' },
    ]);
  });
  it('prepares editable scalar values without changing identities, versions or nested content', () => {
    const original = {
      mealId: 'original',
      expectedUpdatedAt: 'version',
      servings: 2,
      note: 'old',
      optional: false,
      meals: [{ id: 'nested' }],
    };
    expect(editableProposalFields(original).map(([key]) => key)).toEqual([
      'servings',
      'note',
      'optional',
    ]);
    expect(
      revisedProposalBody(original, {
        mealId: 'changed',
        expectedUpdatedAt: 'wrong',
        servings: '4',
        note: 'reviewed',
        optional: true,
      }),
    ).toEqual({ ...original, servings: 4, note: 'reviewed', optional: true });
    expect(original.servings).toBe(2);
    expect(() => revisedProposalBody(original, { servings: '' })).toThrow('number');
    expect(revisedProposalBody(null, {})).toBeNull();
  });
  it('preserves an existing composer draft and requires deliberate sending', () => {
    expect(revisionMessage('Already entered', 'Dinner plan')).toBe(
      'Already entered\n\nPlease revise the proposal “Dinner plan”. Changes: ',
    );
  });
});
