import styles from "./Wordmark.module.css";

type WordmarkProps = {
  /** Optional id for aria-labelledby wiring. */
  titleId?: string;
};

/**
 * Stacked wordmark: REAGAN / rule / BROOKS.
 * Used as the only primary mark of the site (header, contact closing).
 */
export function Wordmark({ titleId }: WordmarkProps) {
  return (
    <span
      className={styles.wordmark}
      role="img"
      aria-labelledby={titleId}
      aria-label={titleId ? undefined : "Reagan Brooks"}
    >
      <span className={styles.line}>Reagan</span>
      <span className={styles.rule} aria-hidden="true" />
      <span className={styles.line}>Brooks</span>
    </span>
  );
}
