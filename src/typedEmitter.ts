import { EventEmitter } from 'node:events';

type Listener<T> = T extends void ? () => void : (payload: T) => void;

export class TypedEventEmitter<Events extends Record<string, any>> extends EventEmitter {
  override on(event: string | symbol, listener: (...args: any[]) => void): this;
  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): this;
  override on(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.on(event, listener as any);
  }

  override once(event: string | symbol, listener: (...args: any[]) => void): this;
  once<K extends keyof Events>(event: K, listener: Listener<Events[K]>): this;
  override once(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.once(event, listener as any);
  }

  override off(event: string | symbol, listener: (...args: any[]) => void): this;
  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): this;
  override off(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.off(event, listener as any);
  }

  override emit(event: string | symbol, ...args: any[]): boolean;
  emit<K extends keyof Events>(event: K, payload?: Events[K]): boolean;
  override emit(event: string | symbol, ...args: any[]): boolean {
    return super.emit(event, ...args);
  }
}
