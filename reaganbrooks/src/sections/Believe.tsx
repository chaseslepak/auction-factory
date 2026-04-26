import styles from "./Believe.module.css";

const stanzas = [
  {
    title: "On ownership.",
    body: "We buy businesses we are willing to operate ourselves, and we operate them as if we will own them forever.",
  },
  {
    title: "On time.",
    body: "We measure progress in years, not quarters. The portfolio is built to compound, not to flip.",
  },
  {
    title: "On work.",
    body: "We prefer the plow horse to the show horse. The work that matters is rarely the work that is most visible.",
  },
];

export function Believe() {
  return (
    <section
      className={styles.section}
      id="believe"
      aria-labelledby="believe-h"
    >
      <h2 id="believe-h" className={styles.eyebrow}>
        What we believe
      </h2>
      <ol className={styles.stanzas}>
        {stanzas.map((s) => (
          <li key={s.title} className={styles.stanza}>
            <p className={styles.stanzaTitle}>{s.title}</p>
            <p className={styles.stanzaBody}>{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
