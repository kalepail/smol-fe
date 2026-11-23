export type AuthSheetMode = 'signin' | 'signup';

export const authSheetState = $state<{
  open: boolean;
  mode: AuthSheetMode;
  reason: string | null;
}>({
  open: false,
  mode: 'signin',
  reason: null,
});

export const accountSheetState = $state<{ open: boolean }>({
  open: false,
});

export function openAuthSheet(mode: AuthSheetMode = 'signin', reason: string | null = null) {
  authSheetState.mode = mode;
  authSheetState.reason = reason;
  authSheetState.open = true;
}

export function closeAuthSheet() {
  authSheetState.open = false;
  authSheetState.reason = null;
}

export function openAccountSheet() {
  accountSheetState.open = true;
}

export function closeAccountSheet() {
  accountSheetState.open = false;
}
