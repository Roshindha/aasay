import { clamp } from "./utils";

export const PAGE_SIZE = 50;

export function applyDiscount(price: number, percent: number, floor: number): number {
  const discounted = price - (price * clamp(percent, 0, 100)) / 100;
  return Math.max(floor, discounted);
}

export function calculateTax(amount: number, rate: number): number {
  return Math.round(amount * rate);
}
