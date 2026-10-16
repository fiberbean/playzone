// lib/types/game.ts

export interface Game {
  id: string;
  name: string;
  category: string;
  image_url: string | null;
  image_key: string | null;
  /** @deprecated use single_player_rate / multiplayer_rate */
  hourly_rate: number | null;
  single_player_rate: number;
  multiplayer_rate: number;
  display_order: number;
  is_active: boolean;
  created_at: string;
}

export interface Console {
  id: string;
  name: string;
  type: string;
  display_order: number;
  is_active: boolean;
  /** @deprecated — status is computed from bookings + maintenance */
  status: string | null;
  joysticks: number;
  created_at: string;
}

export interface GameConsoleMapping {
  id: string;
  game_id: string;
  console_id: string;
  created_at: string;
}