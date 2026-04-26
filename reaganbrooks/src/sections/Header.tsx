import { Wordmark } from "@/components/Wordmark";
import styles from "./Header.module.css";

export function Header() {
  return (
    <header className={styles.header}>
      <a href="#top" className={styles.markLink} aria-label="Reagan Brooks">
        <Wordmark />
      </a>
    </header>
  );
}
