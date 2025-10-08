/**
 * Hook for managing scroll shadows on scrollable containers
 */
export function useScrollShadows() {
  function calculateShadows(element: HTMLElement | undefined): {
    showTop: boolean;
    showBottom: boolean;
  } {
    if (!element) {
      return { showTop: false, showBottom: false };
    }

    const { scrollTop, scrollHeight, clientHeight } = element;
    const showTop = scrollTop > 0;
    const showBottom = scrollTop < scrollHeight - clientHeight - 1;

    return { showTop, showBottom };
  }

  function createScrollHandler(
    onShadowsChange: (shadows: { showTop: boolean; showBottom: boolean }) => void
  ) {
    return function handleScroll(element: HTMLElement | undefined) {
      const shadows = calculateShadows(element);
      onShadowsChange(shadows);
    };
  }

  return {
    calculateShadows,
    createScrollHandler,
  };
}
