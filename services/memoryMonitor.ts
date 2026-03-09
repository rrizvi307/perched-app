import { recordPerfMetric } from './perfMonitor';

const activeSubscriptions = new Set<() => void>();

export function registerSubscription(unsubscribe: () => void): () => void {
  let done = false;

  const trackedUnsubscribe = () => {
    if (done) return;
    done = true;
    activeSubscriptions.delete(trackedUnsubscribe);
    try {
      unsubscribe();
      void recordPerfMetric('subscriptions_unsubscribe', 0, true);
    } catch (error) {
      console.warn('Subscription cleanup failed:', error);
      void recordPerfMetric('subscriptions_unsubscribe', 0, false);
    }
  };

  activeSubscriptions.add(trackedUnsubscribe);
  void recordPerfMetric('subscriptions_register', 0, true);
  return trackedUnsubscribe;
}

export function unregisterSubscription(unsubscribe: () => void): void {
  activeSubscriptions.delete(unsubscribe);
}

export function unsubscribeAll(): void {
  const active = Array.from(activeSubscriptions);
  for (const unsubscribe of active) {
    try {
      unsubscribe();
    } catch (error) {
      console.warn('unsubscribeAll cleanup failed:', error);
    }
  }
  activeSubscriptions.clear();
  void recordPerfMetric('subscriptions_unsubscribe_all', 0, true);
}

export function getActiveSubscriptionCount(): number {
  return activeSubscriptions.size;
}
