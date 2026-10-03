/**
 * Decorative section-index annotation (e.g. "01 PRODUCTS") in the existing
 * Geist Mono. Purely schematic — screen readers get the real section heading,
 * so the annotation is hidden from assistive technology.
 */
export function SectionIndex({
  index,
  label,
  className = "",
}: {
  index: string;
  label: string;
  className?: string;
}) {
  return (
    <span className={`section-index ${className}`.trim()} aria-hidden="true">
      <span className="section-index__num">{index}</span>
      <span>{label}</span>
    </span>
  );
}

export default SectionIndex;
