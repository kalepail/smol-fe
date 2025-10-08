/**
 * Hook for tracking element visibility using IntersectionObserver
 */
export function useVisibilityTracking() {
  function createVisibilityObserver(
    onVisible: (id: string) => void,
    onHidden: (id: string) => void,
    options: IntersectionObserverInit = {}
  ) {
    return function observeVisibility(node: HTMLElement, id: string) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              onVisible(id);
            } else {
              onHidden(id);
            }
          });
        },
        {
          rootMargin: '200px',
          threshold: 0.01,
          ...options,
        }
      );

      observer.observe(node);

      return {
        destroy() {
          observer.disconnect();
        },
      };
    };
  }

  return {
    createVisibilityObserver,
  };
}
