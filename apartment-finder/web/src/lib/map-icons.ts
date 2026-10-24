import L from 'leaflet';
import { scoreTier } from './utils';

export function scoreIcon(score: number): L.DivIcon {
  const tier = scoreTier(score);
  return L.divIcon({ className: '', html: `<div class="pin pin-${tier}"><span>${score}</span></div>`, iconSize: [0, 0] });
}
