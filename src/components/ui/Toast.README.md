# Toast Notification System

A modern, non-blocking notification system for displaying temporary messages to users.

## Features

- 4 toast types: `info`, `success`, `error`, `warning`
- Auto-dismiss with configurable duration
- Manual dismiss capability
- Smooth slide-in animation
- Accessible with proper ARIA roles
- Stack multiple toasts vertically

## Usage

### Import the store

```typescript
import { toastState } from '../stores/toast.svelte';
```

### Show notifications

```typescript
// Basic usage (auto-dismisses after 5 seconds)
toastState.info("Song added to queue");
toastState.success("Mixtape published!");
toastState.error("Failed to connect wallet");
toastState.warning("This feature is experimental");

// Custom duration (in milliseconds)
toastState.success("Song minted successfully!", 8000); // 8 seconds

// Persistent toast (0 duration = never auto-dismiss)
toastState.error("Critical error occurred", 0);
```

### Advanced usage

```typescript
// Get the toast ID for manual dismissal
const toastId = toastState.info("Processing...", 0);

// Later, dismiss it manually
toastState.dismiss(toastId);

// Clear all toasts
toastState.clear();
```

## Styling

Each toast type has distinct styling:

- **Success**: Green border & background
- **Error**: Red border & background
- **Warning**: Yellow border & background
- **Info**: Blue border & background

## Examples

### Replacing alert() calls

**Before:**
```typescript
alert("Connect your wallet to mint");
```

**After:**
```typescript
toastState.warning("Connect your wallet to mint");
```

### Error handling

```typescript
try {
  await mintSong();
  toastState.success("Song minted successfully!");
} catch (error) {
  toastState.error(error.message, 10000);
}
```

### Multi-step operations

```typescript
const loadingToast = toastState.info("Processing transaction...", 0);

try {
  await processTransaction();
  toastState.dismiss(loadingToast);
  toastState.success("Transaction complete!");
} catch (error) {
  toastState.dismiss(loadingToast);
  toastState.error("Transaction failed");
}
```

## Integration

The Toast component is already integrated globally in `Layout.astro`, so it's available on all pages automatically. No additional setup required.
