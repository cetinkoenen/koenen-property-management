export type BookingTemplate = {
  id: string;
  name: string;
  objectId: string;
  kind: "income" | "expense";
  category: string;
  note: string;
  taxRelevant: boolean;
  nkRelevant: boolean;
};

type AssistantState = { recent: string[]; favorites: string[]; templates: BookingTemplate[] };
const KEY = "koenen:booking-assistant:v1";
const empty = (): AssistantState => ({ recent: [], favorites: [], templates: [] });

function load(): AssistantState {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<AssistantState>;
    return { recent: Array.isArray(value.recent) ? value.recent : [], favorites: Array.isArray(value.favorites) ? value.favorites : [], templates: Array.isArray(value.templates) ? value.templates : [] };
  } catch { return empty(); }
}
function save(value: AssistantState) { localStorage.setItem(KEY, JSON.stringify(value)); }
export const bookingCategoryKey = (kind: string, category: string) => `${kind}:${category}`;
export function loadBookingAssistant() { return load(); }
export function recordRecentCategory(kind: string, category: string) { const state = load(); const key = bookingCategoryKey(kind, category); state.recent = [key, ...state.recent.filter(item => item !== key)].slice(0, 6); save(state); return state; }
export function toggleFavoriteCategory(kind: string, category: string) { const state = load(); const key = bookingCategoryKey(kind, category); state.favorites = state.favorites.includes(key) ? state.favorites.filter(item => item !== key) : [...state.favorites, key]; save(state); return state; }
export function saveBookingTemplate(template: Omit<BookingTemplate, "id">) { const state = load(); const item = { ...template, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }; state.templates = [item, ...state.templates].slice(0, 20); save(state); return state; }
export function deleteBookingTemplate(id: string) { const state = load(); state.templates = state.templates.filter(item => item.id !== id); save(state); return state; }
