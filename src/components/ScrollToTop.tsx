import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export function ScrollToTop() {
  const { pathname } = useLocation();

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // Also scroll to top on initial mount/reload
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return null;
}
