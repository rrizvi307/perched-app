import { devLog } from './logger';

export function trackEvent(name: string, props?: Record<string, unknown>) {
  // Placeholder analytics: replace with Segment/Amplitude/GA later
  // Keep calls lightweight for now.
  devLog('[analytics]', name, props ?? {});
}
