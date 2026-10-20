// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  email: vi.fn(),
  passkey: vi.fn(),
  request: vi.fn(),
  verification: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('@/lib/auth/client', () => ({
  authClient: {
    signIn: { email: mocks.email, passkey: mocks.passkey },
    requestPasswordReset: mocks.request,
    sendVerificationEmail: mocks.verification,
  },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
import { PrintWorkspace } from '@/components/print-workspace';
import {
  VerificationLinkForm,
  ForgotPasswordForm,
  ResetPasswordForm,
  SignInForm,
  safeCallbackUrl,
} from '@/components/auth-forms';
import { printedPantryDate, printedShoppingItem } from '@/lib/domain/print-presentation';
import { mealPlanPdfExportSchema } from '@/lib/domain/pdf-export';
const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
function print(initial: Record<string, string> = { kind: 'recipes', recipes: a }, extras = {}) {
  return render(
    createElement(PrintWorkspace, {
      initial,
      recipes: [
        { id: a, title: 'Recipe A', servings: '2' },
        { id: b, title: 'Recipe B', servings: '4' },
      ],
      lists: [],
      stores: [],
      locations: [],
      ...extras,
    }),
  );
}
function prepared() {
  return Promise.resolve(
    new Response(new Blob(['fixture PDF']), {
      headers: { 'Content-Disposition': 'attachment; filename="fixture.pdf"' },
    }),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:fixture'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0),
  );
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('prepared export scope', () => {
  it('never carries a hidden yield override into a second or different card', async () => {
    const fetch =
      vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(prepared);
    vi.stubGlobal('fetch', fetch);
    print();
    await screen.findByText('PDF prepared · matches these options.');
    fireEvent.change(screen.getByLabelText('Yield for this exported card'), {
      target: { value: '7' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Recipe B' }));
    fireEvent.click(screen.getByRole('button', { name: 'Update preview' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetch.mock.calls[1]![1]!.body as string)).not.toHaveProperty('servings');
    await screen.findByText('PDF prepared · matches these options.');
    fireEvent.click(screen.getByRole('button', { name: 'Clear all selections' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Recipe B' }));
    expect((screen.getByLabelText('Yield for this exported card') as HTMLInputElement).value).toBe(
      '',
    );
  });
  it('keeps an earlier response stale if options change while it is being prepared', async () => {
    let resolve!: (r: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          }),
      ),
    );
    print();
    await screen.findByText(/Preparing PDF ·/);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cooking method (numbered)' }));
    resolve(new Response(new Blob(['fixture'])));
    await screen.findByText(/Previous PDF · options changed/);
    expect(screen.getByRole('link', { name: 'Open previous PDF' })).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Download PDF' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
  it('does not obscure or relabel the prepared PDF during ZIP work or failed refresh', async () => {
    let resolve!: (r: Response) => void;
    const fetch = vi
      .fn()
      .mockImplementationOnce(prepared)
      .mockImplementationOnce(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          }),
      )
      .mockResolvedValueOnce(
        Response.json(
          { error: { message: 'Print queue busy. Try again shortly.' } },
          { status: 429 },
        ),
      );
    vi.stubGlobal('fetch', fetch);
    print();
    await screen.findByText('PDF prepared · matches these options.');
    fireEvent.click(screen.getByRole('button', { name: 'Build & download ZIP' }));
    await screen.findByText('Preparing ZIP…');
    expect(screen.queryByLabelText('Preparing PDF')).toBeNull();
    expect(screen.getByText('PDF prepared · matches these options.')).toBeTruthy();
    resolve(new Response(new Blob(['zip'])));
    await screen.findByText(/ZIP prepared; download started/);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cooking method (numbered)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Update preview' }));
    await screen.findByText('Print queue busy. Try again shortly.');
    expect(screen.getByRole('link', { name: 'Open previous PDF' })).toBeTruthy();
  });
  it('keeps unavailable list sources explicit and validates range/yield/store controls locally', async () => {
    const fetch = vi.fn(prepared);
    vi.stubGlobal('fetch', fetch);
    print({ kind: 'shopping-list', list: a });
    expect(
      screen.getByRole('option', { name: 'Requested list unavailable or archived' }),
    ).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Update preview' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Meal plans' }));
    fireEvent.change(screen.getByLabelText('First day'), { target: { value: '2026-12-01' } });
    fireEvent.change(screen.getByLabelText('Last day'), { target: { value: '2027-01-26' } });
    expect(
      (screen.getByRole('button', { name: 'Update preview' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByRole('link', { name: 'Download calendar (.ics)' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Last day'), { target: { value: '2026-11-30' } });
    expect(screen.queryByRole('link', { name: 'Download calendar (.ics)' })).toBeNull();
  });
  it('preserves selection outside a no-match search and clears it explicitly', async () => {
    vi.stubGlobal('fetch', vi.fn(prepared));
    print();
    await screen.findByText('PDF prepared · matches these options.');
    fireEvent.change(screen.getByLabelText('Find recipes to print'), {
      target: { value: 'no match' },
    });
    expect(screen.getByText(/1 selected outside this search/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear all selections' }));
    expect(screen.queryByText(/selected outside this search/)).toBeNull();
  });
});
describe('export selection limits', () => {
  it('explains the 100-card limit and retains a useful selected collection', async () => {
    vi.stubGlobal('fetch', vi.fn(prepared));
    print(
      { kind: 'recipes' },
      {
        recipes: Array.from({ length: 101 }, (_, i) => ({
          id: `fixture-${i}`,
          title: `Item ${i + 1}`,
        })),
      },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add matching recipes' }));
    expect(screen.getByText('100 recipes selected · up to 100')).toBeTruthy();
    expect((screen.getByRole('checkbox', { name: 'Item 101' }) as HTMLInputElement).disabled).toBe(
      true,
    );
    expect(screen.getByText(/100-card limit reached/)).toBeTruthy();
    await screen.findByText('PDF prepared · matches these options.');
  });
  it('blocks invalid yield and missing route evidence before a request', async () => {
    const fetch = vi.fn(prepared);
    vi.stubGlobal('fetch', fetch);
    print();
    await screen.findByText('PDF prepared · matches these options.');
    fireEvent.change(screen.getByLabelText('Yield for this exported card'), {
      target: { value: '-1' },
    });
    expect(
      (screen.getByRole('button', { name: 'Update preview' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText('Yield for this exported card'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Group ingredients by store aisle' }));
    expect(
      (screen.getByRole('button', { name: 'Update preview' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getAllByText(/No saved stores are available/).length).toBeGreaterThan(0);
  });
});
describe('auth request and recovery ownership', () => {
  it('shows passkey pending only on that method, freezes input and guards rapid attempts', async () => {
    let finish!: (result: { error: { code: string } }) => void;
    mocks.passkey.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(createElement(SignInForm));
    fireEvent.click(screen.getByRole('button', { name: 'Use a passkey' }));
    fireEvent.click(screen.getByRole('button', { name: /Waiting for your passkey/ }));
    expect(mocks.passkey).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect((screen.getByLabelText('Email') as HTMLInputElement).closest('fieldset')?.disabled).toBe(
      true,
    );
    finish({ error: { code: 'AUTH_CANCELLED' } });
    await screen.findByText(/Passkey sign-in was not completed/);
    expect((screen.getByRole('button', { name: 'Sign in' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
  it('ties accepted requests to their submitted email and removes old success on failed retry', async () => {
    mocks.request
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ error: { message: 'fixture' } });
    render(createElement(ForgotPasswordForm));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'first@example.test' } });
    fireEvent.submit(screen.getByLabelText('Email').closest('form')!);
    await screen.findByText('Requested for first@example.test');
    fireEvent.click(screen.getByRole('button', { name: 'Request again' }));
    await screen.findByText(/could not be accepted/);
    expect(screen.queryByText('Request received.')).toBeNull();
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('first@example.test');
  });
  it('keeps local-code recovery on a plain visit and only retires confirmed invalid token links', async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(
        Response.json({ code: 'INVALID_TOKEN', message: 'invalid' }, { status: 400 }),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    const local = render(createElement(ResetPasswordForm));
    expect(screen.getByLabelText('Saved recovery code')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Request an email reset link' })).toBeTruthy();
    local.unmount();
    render(createElement(ResetPasswordForm, { token: 'fixture' }));
    const field = screen.getByLabelText('New passphrase');
    fireEvent.change(field, { target: { value: 'not-a-real-secret' } });
    fireEvent.submit(field.closest('form')!);
    await screen.findByRole('heading', { name: 'This reset link is unavailable.' });
    expect(screen.getByRole('link', { name: 'Request a new reset link' })).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('validates recovery code format without inventing separator normalization', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    render(createElement(ResetPasswordForm));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@example.test' } });
    fireEvent.change(screen.getByLabelText('Saved recovery code'), {
      target: { value: 'BORD XXXX XXXX XXXX' },
    });
    fireEvent.change(screen.getByLabelText('New passphrase'), {
      target: { value: 'not-a-real-secret' },
    });
    fireEvent.submit(screen.getByLabelText('Email').closest('form')!);
    await screen.findByText('Enter a valid recovery code.');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('reveals only the chosen passphrase without submitting and rejects external callback forms', () => {
    render(createElement(SignInForm));
    const button = screen.getByRole('button', { name: 'Show passphrase' });
    fireEvent.click(button);
    expect((screen.getByLabelText('Passphrase') as HTMLInputElement).type).toBe('text');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(mocks.email).not.toHaveBeenCalled();
    expect(safeCallbackUrl('//elsewhere.test')).toBe('/');
    expect(safeCallbackUrl('/\\elsewhere.test')).toBe('/');
    expect(safeCallbackUrl('/recipes?q=soup')).toBe('/recipes?q=soup');
  });
});
describe('printed record meaning', () => {
  it('retains purchase/cart/completion meanings, fractions, zero and unknown units', () => {
    const row = {
      item: 'Flour',
      quantity: 0.5,
      unit: 'cup',
      checked: false,
      shoppingState: 'in_cart',
      cartQuantity: 0,
      cartUnit: 'cup',
      cartLabel: 'Alternative flour',
      note: 'User note',
    };
    expect(printedShoppingItem(row)).toMatchObject({
      quantity: '½ cup to buy',
      state: 'in_cart',
      detail: 'Cart: Alternative flour · 0 cup',
    });
    expect(
      printedShoppingItem({ ...row, cartQuantity: 500, cartUnit: 'g', unit: 'each' }).detail,
    ).toContain('500 g');
    expect(printedShoppingItem({ ...row, cartUnit: null }).detail).toContain(
      'Purchase unit needs review',
    );
    expect(printedShoppingItem({ ...row, quantity: null, checked: true })).toMatchObject({
      quantity: 'To buy: not recorded (cup)',
      state: 'sourced',
    });
    expect(printedShoppingItem({ ...row, quantity: 0 })).toMatchObject({
      quantity: '0 cup to buy',
    });
  });
  it('retains effective date kind/precision and calculated-after-opening meaning', () => {
    expect(
      printedPantryDate({
        expiry: { kind: 'best_before', date: '2026-12-31' },
        expiryPrecision: 'month_only',
      }),
    ).toBe('Best before: 2026-12 (month only)');
    expect(
      printedPantryDate({
        expiry: { kind: 'use_by', date: '2026-12-31' },
        expiryPrecision: 'estimated',
      }),
    ).toContain('(estimated)');
    expect(
      printedPantryDate({
        expiry: { kind: 'opened_shelf_life', date: '2026-12-31' },
        expiryPrecision: 'unknown',
      }),
    ).toBe('Calculated after opening: 2026-12-31');
  });
  it('accepts exactly 1–56 inclusive days and rejects reversed/malformed/57-day schedules', () => {
    expect(
      mealPlanPdfExportSchema.safeParse({ start: '2026-12-01', end: '2026-12-01' }).success,
    ).toBe(true);
    expect(
      mealPlanPdfExportSchema.safeParse({ start: '2026-12-01', end: '2027-01-25' }).success,
    ).toBe(true);
    expect(
      mealPlanPdfExportSchema.safeParse({ start: '2026-12-01', end: '2027-01-26' }).success,
    ).toBe(false);
    expect(
      mealPlanPdfExportSchema.safeParse({ start: '2026-12-01', end: '2026-11-30' }).success,
    ).toBe(false);
    expect(
      mealPlanPdfExportSchema.safeParse({ start: '2026-02-30', end: '2026-03-01' }).success,
    ).toBe(false);
  });
});

it('requests a new verification link without claiming delivery and clears accepted state on edit', async () => {
  mocks.verification.mockResolvedValue({ data: { status: true }, error: null });
  render(createElement(VerificationLinkForm, { invalid: true }));
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'synthetic@example.test' } });
  fireEvent.submit(
    screen.getByRole('button', { name: 'Request verification link' }).closest('form')!,
  );
  await screen.findByText(/Request received for synthetic@example.test/);
  expect(mocks.verification).toHaveBeenCalledWith({
    email: 'synthetic@example.test',
    callbackURL: '/sign-in?verified=1',
  });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'other@example.test' } });
  expect(screen.queryByText(/Request received for/)).toBeNull();
});
