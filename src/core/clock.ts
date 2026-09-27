export class GameClock {
  constructor(public minute: number) {}

  advance(minutes: number, onMinute: (minute: number) => void): void {
    for (let step = 0; step < minutes; step++) onMinute(++this.minute);
  }
}
