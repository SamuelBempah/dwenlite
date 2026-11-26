// Tappable follow-up questions shown under the latest AI answer.
export default function FollowUpChips({ items = [], onPick, disabled }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {items.map((q) => (
        <button
          key={q}
          type="button"
          disabled={disabled}
          onClick={() => onPick(q)}
          className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-left text-xs text-purple-200 hover:bg-purple-500/20 disabled:opacity-40 transition-colors"
        >
          {q}
        </button>
      ))}
    </div>
  );
}
