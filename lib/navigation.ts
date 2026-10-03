import { router, type Href } from 'expo-router';

export function push(path: string): void {
  router.push(path as Href);
}

export function replace(path: string): void {
  router.replace(path as Href);
}
