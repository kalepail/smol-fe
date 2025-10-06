/**
 * Hook for infinite scroll functionality using IntersectionObserver
 */
export function useInfiniteScroll() {
  function createScrollObserver(
    onTrigger: () => void | Promise<void>,
    options: IntersectionObserverInit = {}
  ) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            void onTrigger();
          }
        });
      },
      {
        rootMargin: '400px',
        threshold: 0,
        ...options,
      }
    );

    function observe(element: HTMLElement | null) {
      if (element) {
        observer.observe(element);
      }
    }

    function disconnect() {
      observer.disconnect();
    }

    return {
      observe,
      disconnect,
    };
  }

  return {
    createScrollObserver,
  };
}
