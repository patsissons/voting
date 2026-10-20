import PocketBase from 'pocketbase'

// In production the app is served from pb_public by PocketBase itself, so the
// page origin IS the backend. During development, point VITE_POCKETBASE_URL
// (see .env.example) at your instance or a local `pocketbase serve`.
const url = import.meta.env.VITE_POCKETBASE_URL || window.location.origin

export const pb = new PocketBase(url)
