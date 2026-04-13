import { cn } from "@/lib/utils";

interface AmbientBackgroundProps {
  /** Use subtle variant with less intensity */
  subtle?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Ambient gradient background with floating color orbs.
 * Creates depth and vibrancy for dark mode interfaces.
 *
 * Place this as a sibling to your main content, not as a wrapper.
 * The component uses fixed positioning and pointer-events: none.
 */
export function AmbientBackground({ subtle = false, className }: AmbientBackgroundProps) {
  return (
    <div
      className={cn(
        "ambient-gradient-container",
        subtle && "subtle",
        className
      )}
      aria-hidden="true"
    >
      <div className="ambient-orb ambient-orb-1" />
      <div className="ambient-orb ambient-orb-2" />
      <div className="ambient-orb ambient-orb-3" />
    </div>
  );
}
