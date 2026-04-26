import styles from "./Footer.module.css";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <span className={styles.brassRule} aria-hidden="true" />
      <p className={styles.line}>
        <span>Reagan Brooks LLC</span>
        <span className={styles.dot} aria-hidden="true">
          ·
        </span>
        <span>Richfield, Ohio</span>
        <span className={styles.dot} aria-hidden="true">
          ·
        </span>
        <span>&copy; 2026</span>
      </p>
    </footer>
  );
}
