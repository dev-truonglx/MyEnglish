/**
 * Browser globals the services expect (localStorage, window events), recreated before each test.
 */
import { beforeEach } from "vitest";

class MemoryStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return Array.from(this.map.keys())[i] ?? null;
  }
  getItem(k: string) {
    return this.map.has(k) ? (this.map.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}

const g = globalThis as Record<string, unknown>;
const events = new EventTarget();
g.window = globalThis;
g.addEventListener = events.addEventListener.bind(events);
g.removeEventListener = events.removeEventListener.bind(events);
g.dispatchEvent = events.dispatchEvent.bind(events);

beforeEach(() => {
  g.localStorage = new MemoryStorage();
});
