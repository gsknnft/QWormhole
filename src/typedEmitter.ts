import { EventEmitter } from "node:events";

type ListenerArgs<T> = T extends void ? [] : [T];
type TypedListener<T> = (...args: ListenerArgs<T>) => void;

export class TypedEventEmitter<
  Events extends { [K in keyof Events]: unknown },
> extends EventEmitter {
  declare on: EventEmitter["on"] &
    (<K extends keyof Events>(
      event: K,
      listener: TypedListener<Events[K]>,
    ) => this);
  declare once: EventEmitter["once"] &
    (<K extends keyof Events>(
      event: K,
      listener: TypedListener<Events[K]>,
    ) => this);
  declare off: EventEmitter["off"] &
    (<K extends keyof Events>(
      event: K,
      listener: TypedListener<Events[K]>,
    ) => this);
  declare emit: EventEmitter["emit"] &
    (<K extends keyof Events>(
      event: K,
      ...args: ListenerArgs<Events[K]>
    ) => boolean);
}
