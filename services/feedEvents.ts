type Subscriber = (item: any) => void;

const subs: Set<Subscriber> = new Set();

export function publishCheckin(item: any) {
  subs.forEach((s) => s(item));
}

export function subscribeCheckinEvents(cb: Subscriber) {
  subs.add(cb);
  return () => subs.delete(cb);
}

export default { publishCheckin, subscribeCheckinEvents };
