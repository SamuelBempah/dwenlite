// A glittering star that sheds sparks. Used as the writing cursor and in the thinking state.
const SPARKS = [
  [-16, -18, '#fde68a'], [14, -20, '#f9a8d4'], [20, -4, '#ffffff'], [-20, -6, '#c4b5fd'], [6, -26, '#fde68a'],
  [-9, -24, '#ffffff'], [24, -15, '#f9a8d4'], [-24, -16, '#fde68a'], [11, 10, '#c4b5fd'], [-13, 11, '#ffffff'],
];

export default function Sparkle() {
  return (
    <>
      <span className="spark-star" />
      {SPARKS.map(([x, y, c], i) => (
        <i key={i} className="spark" style={{ '--x': `${x}px`, '--y': `${y}px`, '--c': c, '--d': `${i * 0.11}s` }} />
      ))}
    </>
  );
}
