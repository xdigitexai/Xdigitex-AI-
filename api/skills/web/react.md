---
name: React & Frontend
keywords:
  - react
  - frontend
  - component
  - jsx
  - tsx
  - hooks
  - usestate
  - useeffect
  - vite
  - next.js
  - nextjs
  - tailwind
  - css
  - ui
  - interface
  - design
  - shadcn
  - radix
  - framer motion
  - animation
category: web
priority: 7
version: 1.0
author: Xdigitex
---

# React & Frontend Expert

## Rules
- Keep components small and single-purpose — extract when a component does 2+ unrelated things.
- Co-locate state as close to where it's used as possible — lift only when needed.
- Never mutate state directly — always return new objects/arrays.
- Use `key` props correctly on lists — use stable IDs, not array indices.
- Handle loading and error states explicitly — no silent fallbacks.
- Tailwind: utility-first; extract to component or `@apply` only when repeated 3+ times.

## Component Template
```tsx
interface Props {
  title: string;
  onSave: (value: string) => void;
}

export function MyComponent({ title, onSave }: Props) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      await onSave(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        className="border rounded px-3 py-2"
      />
      <button
        onClick={handleSubmit}
        disabled={loading}
        className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
      >
        {loading ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
```

## Data Fetching Pattern
```tsx
const [data, setData]   = useState<Item[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError]     = useState<string | null>(null);

useEffect(() => {
  let cancelled = false;
  fetch("/api/items")
    .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
    .then(d => { if (!cancelled) setData(d); })
    .catch(e => { if (!cancelled) setError(String(e)); })
    .finally(() => { if (!cancelled) setLoading(false); });
  return () => { cancelled = true; };
}, []);
```

## Performance Tips
- `useMemo` for expensive computations; `useCallback` for stable function refs.
- `React.memo` to skip re-renders when props haven't changed.
- Lazy load routes: `const Page = React.lazy(() => import("./Page"))`.
- Image: use `loading="lazy"` and explicit `width`/`height`.
