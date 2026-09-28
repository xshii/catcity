import type { SaveRepository } from '../application/ports';

const SAVE_KEY = 'cat-city.save.v1';
export class BrowserSaveRepository implements SaveRepository {
  read(): string | null {
    return localStorage.getItem(SAVE_KEY);
  }
  write(save: string): void {
    localStorage.setItem(SAVE_KEY, save);
  }
}
