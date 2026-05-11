import { useState, useEffect, useRef } from 'react';

// Returns the first `count` items and a sentinel ref.
// When the sentinel enters the viewport, count grows by batchSize.
// root: IntersectionObserver root element (null = viewport, undefined = auto-detect .admin-main)
export function useLazyItems(items, batchSize = 24, root = undefined) {
  const [count, setCount]   = useState(batchSize);
  const sentinelRef         = useRef(null);

  // Reset when source list changes (filter / search)
  useEffect(() => { setCount(batchSize); }, [items, batchSize]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const rootEl = root !== undefined ? root : (document.querySelector('.admin-main') || null);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setCount(c => Math.min(c + batchSize, items.length));
      },
      { root: rootEl, rootMargin: '400px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [items.length, batchSize, root]);

  return {
    visible:  items.slice(0, count),
    sentinelRef,
    hasMore:  count < items.length,
    total:    items.length,
  };
}
